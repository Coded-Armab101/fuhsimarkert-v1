import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { accountIsActive } from '@/utils/account';
import { isSupportCategory } from '@/utils/support';

/**
 * Buyer support tickets. Everything here uses the cookie client so RLS is the
 * authority: a signed-in user can only ever see or insert their own tickets.
 * Status changes are deliberately impossible from this route (no UPDATE grant).
 *
 * GET  -> { tickets: [...] } with last message, last message time and count.
 * POST -> { ticket } from { subject, category, message }.
 */

type TicketRow = Record<string, unknown>;

const stringField = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

async function authenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { error: 'Unauthorized.' as const, status: 401 as const };
  return { supabase, user };
}

export async function GET() {
  try {
    const auth = await authenticatedUser();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { data, error } = await auth.supabase
      .from('support_tickets')
      .select('id, subject, category, message, status, created_at, updated_at')
      .eq('user_id', auth.user.id)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const tickets = (data ?? []) as TicketRow[];
    const ids = tickets.map((ticket) => String(ticket.id));

    let messages: TicketRow[] = [];
    if (ids.length > 0) {
      // RLS on support_ticket_messages restricts this to the caller's threads.
      const { data: messageRows, error: messageError } = await auth.supabase
        .from('support_ticket_messages')
        .select('ticket_id, message, created_at')
        .in('ticket_id', ids)
        .order('created_at', { ascending: false });
      if (messageError) throw messageError;
      messages = (messageRows ?? []) as TicketRow[];
    }

    const summaries = new Map<string, {
      message_count: number;
      last_message: string | null;
      last_message_at: string | null;
    }>();
    for (const row of messages) {
      const ticketId = String(row.ticket_id);
      const summary = summaries.get(ticketId) ?? {
        message_count: 0,
        last_message: null,
        last_message_at: null,
      };
      summary.message_count += 1;
      if (!summary.last_message) {
        summary.last_message = typeof row.message === 'string' ? row.message : null;
        summary.last_message_at = typeof row.created_at === 'string' ? row.created_at : null;
      }
      summaries.set(ticketId, summary);
    }

    return NextResponse.json({
      tickets: tickets.map((ticket) => ({
        id: String(ticket.id),
        subject: String(ticket.subject),
        category: String(ticket.category),
        message: String(ticket.message),
        status: String(ticket.status),
        created_at: ticket.created_at ?? null,
        updated_at: ticket.updated_at ?? null,
        ...(summaries.get(String(ticket.id)) ?? {
          message_count: 0,
          last_message: null,
          last_message_at: null,
        }),
      })),
    });
  } catch (error) {
    console.error('[support/tickets] GET failed', error);
    return NextResponse.json({ error: 'Could not load your support tickets.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticatedUser();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    if (!(await accountIsActive(auth.supabase, auth.user.id))) {
      return NextResponse.json({ error: 'This account is suspended.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
    }

    const subject = stringField(body.subject);
    const message = stringField(body.message);
    const category = isSupportCategory(body.category) ? body.category : null;

    if (!category) {
      return NextResponse.json({ error: 'Choose a valid support category.' }, { status: 400 });
    }
    if (subject.length < 5 || subject.length > 160) {
      return NextResponse.json(
        { error: 'Subject must be between 5 and 160 characters.' },
        { status: 400 },
      );
    }
    if (message.length < 10 || message.length > 4000) {
      return NextResponse.json(
        { error: 'Message must be between 10 and 4000 characters.' },
        { status: 400 },
      );
    }

    const { data, error } = await auth.supabase
      .from('support_tickets')
      .insert({
        user_id: auth.user.id,
        subject,
        category,
        message,
      })
      .select('id, subject, category, message, status, created_at, updated_at')
      .single();
    if (error) throw error;

    return NextResponse.json({ ticket: data }, { status: 201 });
  } catch (error) {
    console.error('[support/tickets] POST failed', error);
    return NextResponse.json({ error: 'Could not create your support ticket.' }, { status: 500 });
  }
}
