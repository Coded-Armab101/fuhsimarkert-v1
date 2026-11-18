import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * Admin fulfilment view: every combined order (one order_ref), grouped, with the
 * activity of EACH seller inside it so the admin can see who is slow vs fast.
 *
 * Slow flag: a seller is flagged when their item has been sitting in its current
 * stage (packing, ready_for_pickup, etc.) for longer than the stage deadline.
 * Deadlines are defined once here and are easy to tweak.
 *
 * Authorization: profiles.is_admin = true.
 */

// How long (hours) a seller may stay in each stage before the admin is warned
// that they are delaying. Lower = stricter.
const STAGE_DEADLINE_HOURS: Record<string, number> = {
  in_escrow: 48, // fresh order, seller hasn't started packing yet
  packing: 24, // seller started packing but hasn't marked ready
  ready_for_pickup: 999, // actually on the buyer's side now, not the seller's fault
};

const TRACK_STEPS = ['in_escrow', 'packing', 'ready_for_pickup', 'confirmed', 'delivered', 'completed'];
const rank = (s: string) => TRACK_STEPS.indexOf(s);

function statusTone(s: string): string {
  if (['completed', 'confirmed', 'delivered'].includes(s)) return 'emerald';
  if (s === 'ready_for_pickup') return 'sky';
  if (s === 'packing') return 'amber';
  if (s === 'in_escrow') return 'neutral';
  if (['disputed', 'cancelled'].includes(s)) return 'red';
  return 'neutral';
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: adminProfile } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (adminProfile?.is_admin !== true) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const { data: rows, error } = await admin
      .from('orders')
      .select(`
        id,
        seller_id,
        buyer_id,
        amount_kobo,
        delivery_fee_kobo,
        platform_fee_kobo,
        quantity,
        status,
        order_ref,
        size,
        color,
        variant_key,
        delivery_code,
        delivery_type,
        receiver_name,
        receiver_phone,
        matric_number,
        created_at,
        status_changed_at,
        dispute_reason,
        dispute_opened_at,
        return_required,
        return_received_at,
        return_confirmation_source,
        products ( id, title, image_url )
      `)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;

    const orders = rows || [];
    if (orders.length === 0) {
      return NextResponse.json({ groups: [], sellersById: {} });
    }

    // Load seller + buyer display names for all involved users.
    const userIds = new Set<string>();
    for (const o of orders) {
      userIds.add(o.seller_id);
      userIds.add(o.buyer_id);
    }
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', Array.from(userIds));
    const sellersById: Record<string, { full_name?: string }> = {};
    for (const p of profiles || []) {
      sellersById[p.id] = { full_name: p.full_name };
    }

    // Group by order_ref.
    type OrderRow = {
      id: string;
      seller_id: string;
      buyer_id: string;
      amount_kobo: number;
      delivery_fee_kobo: number | null;
      quantity: number;
      status: string;
      order_ref: string | null;
      size?: string | null;
      color?: string | null;
      variant_key?: string | null;
      delivery_code: string | null;
      created_at: string | null;
      status_changed_at: string | null;
      dispute_reason?: string | null;
      dispute_opened_at?: string | null;
      return_required?: boolean | null;
      return_received_at?: string | null;
      return_confirmation_source?: string | null;
      products?: { id: string; title: string; image_url?: string | null }[] | null;
    };
    // One product line inside a seller's packing group.
    type ProductLine = {
      orderId: string;
      product: { id: string; title: string; image_url?: string | null } | null;
      quantity: number;
      amountKobo: number;
      status: string;
      statusChangedAt: string | null;
      createdAt: string;
      slow: boolean;
      size: string | null;
      color: string | null;
      variantKey: string | null;
      disputeReason: string | null;
      disputeOpenedAt: string | null;
      returnRequired: boolean;
      returnReceivedAt: string | null;
      returnConfirmationSource: string | null;
    };
    // One packing group per (order, seller). A buyer order containing three
    // products from one seller is packed once, not three times.
    type GroupEntry = {
      order_ref: string;
      sellerId: string;
      sellerName: string;
      delivery_code: string;
      buyer: { name: string; id: string };
      createdAt: string;
      groupStatus: string;
      // Delivery is charged once for the whole order, not once per seller.
      deliveryFeeKobo: number;
      items: ProductLine[];
    };
    const groups = new Map<string, GroupEntry>();
    for (const raw of orders as OrderRow[]) {
      const ref = raw.order_ref || raw.id;
      const key = `${ref}::${raw.seller_id}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          order_ref: ref,
          sellerId: raw.seller_id,
          sellerName: sellersById[raw.seller_id]?.full_name || 'Seller',
          delivery_code: raw.delivery_code || ref.slice(0, 8).toUpperCase(),
          buyer: { name: sellersById[raw.buyer_id]?.full_name || 'Buyer', id: raw.buyer_id },
          createdAt: raw.created_at || '',
          groupStatus: raw.status,
          deliveryFeeKobo: raw.delivery_fee_kobo || 0,
          items: [],
        };
        groups.set(key, g);
      }
      g.items.push({
        orderId: raw.id,
        product: raw.products?.[0] || null,
        quantity: raw.quantity,
        amountKobo: raw.amount_kobo,
        status: raw.status,
        statusChangedAt: raw.status_changed_at,
        createdAt: raw.created_at || '',
        slow: isSlow(raw.status, raw.status_changed_at),
        size: raw.size || null,
        color: raw.color || null,
        variantKey: raw.variant_key || null,
        disputeReason: raw.dispute_reason || null,
        disputeOpenedAt: raw.dispute_opened_at || null,
        returnRequired: raw.return_required === true,
        returnReceivedAt: raw.return_received_at || null,
        returnConfirmationSource: raw.return_confirmation_source || null,
      });
      if (rank(raw.status) < rank(g.groupStatus)) g.groupStatus = raw.status;
      if ((raw.delivery_fee_kobo || 0) > g.deliveryFeeKobo) {
        g.deliveryFeeKobo = raw.delivery_fee_kobo || 0;
      }
    }

    return NextResponse.json({
      groups: Array.from(groups.values()),
      sellersById,
      deadlines: STAGE_DEADLINE_HOURS,
    });
  } catch (err) {
    console.error('[admin/orders] failed', err);
    return NextResponse.json({ error: 'Could not load orders.' }, { status: 500 });
  }
}

/** Administrator return override after reviewing offline handover evidence. */
export async function POST(request: Request) {
  try {
    let body: { action?: unknown; orderId?: unknown; reason?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Malformed order action.' }, { status: 400 });
    }
    const action = String(body.action ?? '');
    const orderId = String(body.orderId ?? '').trim();
    const reason = String(body.reason ?? '').trim().slice(0, 500);
    if (action !== 'confirm_return' || !orderId || reason.length < 10) {
      return NextResponse.json({
        error: 'A return override requires an order and an evidence note of at least 10 characters.',
      }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: adminProfile } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (adminProfile?.is_admin !== true) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, seller_id, buyer_id, status, return_required, return_received_at')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    if (order.status !== 'disputed' || order.return_required !== true) {
      return NextResponse.json({ error: 'This order is not awaiting a return.' }, { status: 409 });
    }

    const { data: confirmed, error: confirmError } = await admin.rpc('confirm_order_return', {
      p_order_id: order.id,
      p_seller_id: order.seller_id,
      p_confirmed_by: user.id,
      p_source: 'admin',
    });
    if (confirmError) throw confirmError;
    if (confirmed !== true) {
      return NextResponse.json({ error: 'The return could not be confirmed.' }, { status: 409 });
    }

    const { error: eventError } = await admin.from('order_dispute_events').insert({
      order_id: order.id,
      actor_id: user.id,
      actor_role: 'admin',
      event_type: 'return_overridden',
      note: reason,
    });
    if (eventError) console.error('[admin/orders] return override audit failed', eventError);

    await admin.from('notifications').upsert({
      user_id: order.buyer_id,
      order_id: order.id,
      type: 'order_return_received',
      title: 'Return confirmed by support',
      message: 'An administrator verified the return evidence. Open the disputed order to continue the protected refund.',
    }, {
      onConflict: 'user_id,order_id,type',
      ignoreDuplicates: true,
    });

    return NextResponse.json({ ok: true, returnReceivedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[admin/orders] action failed', error);
    return NextResponse.json({ error: 'Could not update the disputed return.' }, { status: 500 });
  }
}

function isSlow(status: string, statusChangedAt?: string | null): boolean {
  const deadline = STAGE_DEADLINE_HOURS[status];
  if (deadline === undefined || deadline === 999 || !statusChangedAt) return false;
  const elapsedMs = Date.now() - new Date(statusChangedAt).getTime();
  return elapsedMs > deadline * 60 * 60 * 1000;
}

export { statusTone };
