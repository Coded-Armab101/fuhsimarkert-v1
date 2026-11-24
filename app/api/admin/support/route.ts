import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { notifyUsers } from '@/utils/notifications';
import { isSupportStatus } from '@/utils/support';
import { adminDateWindow, applyAdminRange, parseAdminRange } from '@/utils/admin/date-range';

/**
 * Operator support console.
 *
 * GET  -> all tickets (?status=open|pending|resolved|closed), with owner name /
 *         email and message counts.
 * POST -> { ticketId, action: 'reply'|'resolve'|'close', message? } appends a
 *         service-role admin message and advances the ticket status.
 *
 * The admin identity ALWAYS comes from the verified session; no client-supplied
 * actor id is accepted. Buyers cannot reach these handlers.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type AdminClient = ReturnType<typeof createAdminClient>;

type AdminContext =
  | { admin: AdminClient; user: { id: string } }
  | { error: string; status: number };

const textField = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

async function requireAdmin(): Promise<AdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { error: 'Unauthorized.', status: 401 };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.is_admin !== true) return { error: 'Forbidden.', status: 403 };
  return { admin, user: { id: user.id } };
}

/**
 * `notifyUsers` needs a UUID correlation id and de-duplicates on
 * (user, order_id, type). A fresh id per reply keeps every admin response in
 * the inbox; the URL is what deep-links the buyer back to the thread.
 * notifications.order_id has no FK, so this is safe.
 */
const notificationCorrelationId = (): string => globalThis.crypto.randomUUID();

export async function GET(request: Request) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const params = new URL(request.url).searchParams;
    const rawStatus = params.get('status');
    if (rawStatus && !isSupportStatus(rawStatus)) {
      return NextResponse.json({ error: 'Invalid status filter.' }, { status: 400 });
    }
    const range = parseAdminRange(params.get('range'));
    const window = adminDateWindow(range);

    let query = ctx.admin
      .from('support_tickets')
      .select('id, user_id, subject, category, message, status, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(200);
    query = applyAdminRange(query, window, 'created_at');
    if (rawStatus) query = query.eq('status', rawStatus);

    const { data, error } = await query;
    if (error) throw error;

    const tickets = (data ?? []) as Array<Record<string, unknown>>;
    const ids = tickets.map((ticket) => String(ticket.id));
    const userIds = Array.from(new Set(tickets.map((ticket) => String(ticket.user_id))));

    const [messageRows, profiles, emailEntries] = await Promise.all([
      ids.length > 0
        ? ctx.admin
            .from('support_ticket_messages')
            .select('ticket_id, message, created_at')
            .in('ticket_id', ids)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      userIds.length > 0
        ? ctx.admin.from('profiles').select('id, full_name').in('id', userIds)
        : Promise.resolve({ data: [], error: null }),
      Promise.all(
        userIds.map(async (userId): Promise<[string, string | null]> => {
          try {
            const { data } = await ctx.admin.auth.admin.getUserById(userId);
            return [userId, data.user?.email ?? null];
          } catch (error) {
            console.warn('[admin/support] could not read owner email', error);
            return [userId, null];
          }
        }),
      ),
    ]);

    if (messageRows.error) throw messageRows.error;
    if (profiles.error) throw profiles.error;

    const summaries = new Map<string, {
      message_count: number;
      last_message: string | null;
      last_message_at: string | null;
    }>();
    for (const row of (messageRows.data ?? []) as Array<Record<string, unknown>>) {
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

    const nameById = new Map(
      ((profiles.data ?? []) as Array<Record<string, unknown>>).map((row) => [
        String(row.id),
        typeof row.full_name === 'string' ? row.full_name : null,
      ]),
    );
    const emailById = new Map(emailEntries);

    return NextResponse.json({
      tickets: tickets.map((ticket) => ({
        id: String(ticket.id),
        user_id: String(ticket.user_id),
        user_email: emailById.get(String(ticket.user_id)) ?? null,
        user_name: nameById.get(String(ticket.user_id)) ?? null,
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
    console.error('[admin/support] GET failed', error);
    return NextResponse.json({ error: 'Could not load support tickets.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
    }

    const ticketId = textField(body.ticketId);
    const action = textField(body.action);
    const suppliedMessage = textField(body.message);

    if (!UUID_RE.test(ticketId) || !['reply', 'resolve', 'close'].includes(action)) {
      return NextResponse.json(
        { error: 'A valid ticket id and action are required.' },
        { status: 400 },
      );
    }
    if (suppliedMessage.length > 4000) {
      return NextResponse.json(
        { error: 'Message must be 4000 characters or fewer.' },
        { status: 400 },
      );
    }
    if (action === 'reply' && suppliedMessage.length < 1) {
      return NextResponse.json({ error: 'A reply message is required.' }, { status: 400 });
    }

    const { data: ticket, error: ticketError } = await ctx.admin
      .from('support_tickets')
      .select('id, user_id, subject, status')
      .eq('id', ticketId)
      .maybeSingle();
    if (ticketError) throw ticketError;
    if (!ticket) {
      return NextResponse.json({ error: 'Support ticket not found.' }, { status: 404 });
    }

    const status = action === 'reply' ? 'pending' : action === 'resolve' ? 'resolved' : 'closed';
    const message =
      suppliedMessage ||
      (action === 'resolve' ? 'Support marked this ticket as resolved.' : '');

    if (message) {
      const { error: messageError } = await ctx.admin
        .from('support_ticket_messages')
        .insert({
          ticket_id: ticketId,
          sender_id: ctx.user.id,
          sender_role: 'admin',
          message,
        });
      if (messageError) throw messageError;
    }

    const { data: updated, error: updateError } = await ctx.admin
      .from('support_tickets')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', ticketId)
      .select('id, status, updated_at')
      .single();
    if (updateError) throw updateError;

    if (action === 'reply' || action === 'resolve') {
      try {
        await notifyUsers(ctx.admin, {
          userIds: [String(ticket.user_id)],
          orderId: notificationCorrelationId(),
          // Notification `type` has no DB CHECK constraint; 'support_reply'
          // keeps support notices distinct in the buyer's inbox.
          type: 'support_reply',
          title: action === 'reply' ? 'Support replied to your ticket' : 'Support ticket resolved',
          message: `${String(ticket.subject).slice(0, 120)} — ${message.slice(0, 240)}`,
          url: `/buyer/support?ticket=${ticketId}`,
          tag: `support-${ticketId}-${action}`,
        });
      } catch (notifyError) {
        // Never roll back a saved support reply because a push failed.
        console.warn('[admin/support] buyer notification failed', notifyError);
      }
    }

    return NextResponse.json({ ok: true, ticket: updated });
  } catch (error) {
    console.error('[admin/support] POST failed', error);
    return NextResponse.json({ error: 'Could not update this support ticket.' }, { status: 500 });
  }
}
