import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { accountIsActive } from '@/utils/account';

/**
 * Thread for one support ticket. Ownership is checked with the cookie client
 * (RLS), while the status bump after a user reply uses the service role because
 * authenticated users deliberately have no UPDATE grant on support_tickets.
 *
 * GET  -> { ticket, messages }
 * POST -> { message, ticket } from { message }
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { error: 'Unauthorized.' as const, status: 401 as const };
  return { supabase, user };
}

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid ticket id.' }, { status: 400 });
    }

    const auth = await authenticatedUser();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { data: ticket, error: ticketError } = await auth.supabase
      .from('support_tickets')
      .select('id, subject, category, status, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (ticketError) throw ticketError;
    if (!ticket) {
      return NextResponse.json({ error: 'Support ticket not found.' }, { status: 404 });
    }

    const { data: messages, error: messagesError } = await auth.supabase
      .from('support_ticket_messages')
      .select('id, sender_id, sender_role, message, created_at')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(500);
    if (messagesError) throw messagesError;

    return NextResponse.json({ ticket, messages: messages ?? [] });
  } catch (error) {
    console.error('[support/tickets/messages] GET failed', error);
    return NextResponse.json({ error: 'Could not load this conversation.' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid ticket id.' }, { status: 400 });
    }

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
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length < 1 || message.length > 4000) {
      return NextResponse.json(
        { error: 'Reply must be between 1 and 4000 characters.' },
        { status: 400 },
      );
    }

    const { data: ticket, error: ticketError } = await auth.supabase
      .from('support_tickets')
      .select('id, subject, status')
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (ticketError) throw ticketError;
    if (!ticket) {
      return NextResponse.json({ error: 'Support ticket not found.' }, { status: 404 });
    }

    // The role is derived from trusted profile data, never from the request.
    const { data: profile } = await auth.supabase
      .from('profiles')
      .select('is_approved_seller')
      .eq('id', auth.user.id)
      .maybeSingle<{ is_approved_seller: boolean | null }>();
    const senderRole = profile?.is_approved_seller === true ? 'seller' : 'buyer';

    const { data: inserted, error: insertError } = await auth.supabase
      .from('support_ticket_messages')
      .insert({
        ticket_id: id,
        sender_id: auth.user.id,
        sender_role: senderRole,
        message,
      })
      .select('id, sender_id, sender_role, message, created_at')
      .single();
    if (insertError) throw insertError;

    const admin = createAdminClient();
    const { error: bumpError } = await admin
      .from('support_tickets')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', auth.user.id);
    if (bumpError) throw bumpError;

    return NextResponse.json({
      message: inserted,
      ticket: { ...ticket, status: 'pending' },
    });
  } catch (error) {
    console.error('[support/tickets/messages] POST failed', error);
    return NextResponse.json({ error: 'Could not send your reply.' }, { status: 500 });
  }
}
