import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * Pickup-staff handover log.
 *
 * GET  -> the signed-in staff member's own recent events (newest first).
 * POST -> { orderRef, deliveryCode?, eventType, note? } appends a new event.
 *
 * The actor id always comes from the verified session; a client-supplied
 * staff_id is ignored. Admins may use these endpoints too.
 */

type Row = Record<string, unknown>;
type AdminClient = ReturnType<typeof createAdminClient>;

type StaffContext =
  | { admin: AdminClient; user: { id: string } }
  | { error: string; status: number };

const ORDER_REF_RE = /^[A-Za-z0-9_-]{1,200}$/;
const DELIVERY_CODE_RE = /^[A-Za-z0-9_-]{1,100}$/;
const EVENT_TYPES = new Set([
  'arrived',
  'picked_up',
  'handed_to_buyer',
  'returned',
  'missing',
  'issue',
]);

function text(value: unknown, max = 1000): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function createdAt(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

async function requireStaff(): Promise<StaffContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { error: 'Unauthorized.', status: 401 };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('is_pickup_staff, is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.is_pickup_staff !== true && profile?.is_admin !== true) {
    return { error: 'Forbidden.', status: 403 };
  }
  return { admin, user: { id: user.id } };
}

function mapEvent(row: Row) {
  return {
    id: String(row.id),
    orderRef: text(row.order_ref, 200),
    deliveryCode: text(row.delivery_code, 100),
    eventType: text(row.event_type, 50),
    note: text(row.note, 500),
    createdAt: createdAt(row.created_at),
  };
}

export async function GET() {
  const ctx = await requireStaff();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const { data, error } = await ctx.admin
      .from('pickup_events')
      .select('id, order_ref, delivery_code, event_type, note, created_at')
      .eq('staff_id', ctx.user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ events: ((data ?? []) as Row[]).map(mapEvent) });
  } catch (error) {
    console.error('[pickup/events] GET failed', error);
    return NextResponse.json({ error: 'Could not load pickup events.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ctx = await requireStaff();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad body');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const orderRef = text(body.orderRef, 200) ?? '';
  const deliveryCode = text(body.deliveryCode, 100);
  const eventType = text(body.eventType, 50) ?? '';
  const note = text(body.note, 500);

  if (
    (typeof body.orderRef === 'string' && body.orderRef.trim().length > 200) ||
    !ORDER_REF_RE.test(orderRef) ||
    !EVENT_TYPES.has(eventType)
  ) {
    return NextResponse.json(
      { error: 'A valid order reference and event type are required.' },
      { status: 400 },
    );
  }
  if (
    body.deliveryCode != null &&
    (typeof body.deliveryCode !== 'string' ||
      body.deliveryCode.trim().length > 100 ||
      !deliveryCode ||
      !DELIVERY_CODE_RE.test(deliveryCode))
  ) {
    return NextResponse.json({ error: 'Invalid delivery code.' }, { status: 400 });
  }
  if (typeof body.note === 'string' && body.note.length > 500) {
    return NextResponse.json({ error: 'Note must be 500 characters or fewer.' }, { status: 400 });
  }

  try {
    const { data: orderRows, error: orderError } = await ctx.admin
      .from('orders')
      .select('order_ref, delivery_code')
      .eq('order_ref', orderRef)
      .limit(1);
    if (orderError) throw orderError;

    const order = (orderRows ?? [])[0] as Row | undefined;
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (eventType === 'handed_to_buyer') {
      if (!deliveryCode) {
        return NextResponse.json({ error: 'A delivery code is required to hand over an order.' }, { status: 400 });
      }
      // One order_ref can cover several sellers' rows, each with its own code.
      const { data: codeRows, error: codeError } = await ctx.admin
        .from('orders')
        .select('order_ref, delivery_code')
        .eq('order_ref', orderRef)
        .limit(100);
      if (codeError) throw codeError;
      const matches = (codeRows ?? []).some((row) =>
        text((row as Row).delivery_code, 100) === deliveryCode,
      );
      if (!matches) {
        return NextResponse.json({ error: 'Delivery code does not match this order.' }, { status: 403 });
      }
    }

    const { data, error } = await ctx.admin
      .from('pickup_events')
      .insert({
        staff_id: ctx.user.id,
        order_ref: orderRef,
        delivery_code: deliveryCode,
        event_type: eventType,
        note,
      })
      .select('id, order_ref, delivery_code, event_type, note, created_at')
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, event: mapEvent(data as Row) });
  } catch (error) {
    console.error('[pickup/events] POST failed', error);
    return NextResponse.json({ error: 'Could not record this pickup event.' }, { status: 500 });
  }
}
