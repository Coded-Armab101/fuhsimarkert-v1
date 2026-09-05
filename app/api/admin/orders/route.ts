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
        delivery_code,
        delivery_type,
        receiver_name,
        receiver_phone,
        matric_number,
        created_at,
        status_changed_at,
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
      delivery_code: string | null;
      created_at: string | null;
      status_changed_at: string | null;
      products?: { id: string; title: string; image_url?: string | null }[] | null;
    };
    type SellerEntry = {
      orderId: string;
      sellerId: string;
      sellerName: string;
      product: { id: string; title: string; image_url?: string | null } | null;
      quantity: number;
      amountKobo: number;
      deliveryFeeKobo: number;
      status: string;
      statusChangedAt: string | null;
      createdAt: string;
      slow: boolean;
    };
    type GroupEntry = {
      order_ref: string;
      delivery_code: string;
      buyer: { name: string; id: string };
      createdAt: string;
      groupStatus: string;
      items: SellerEntry[];
    };
    const groups = new Map<string, GroupEntry>();
    for (const raw of orders as OrderRow[]) {
      const ref = raw.order_ref || raw.id;
      let g = groups.get(ref);
      if (!g) {
        g = {
          order_ref: ref,
          delivery_code: raw.delivery_code || ref.slice(0, 8).toUpperCase(),
          buyer: { name: sellersById[raw.buyer_id]?.full_name || 'Buyer', id: raw.buyer_id },
          createdAt: raw.created_at || '',
          groupStatus: raw.status,
          items: [],
        };
        groups.set(ref, g);
      }
      g.items.push({
        orderId: raw.id,
        sellerId: raw.seller_id,
        sellerName: sellersById[raw.seller_id]?.full_name || 'Seller',
        product: raw.products?.[0] || null,
        quantity: raw.quantity,
        amountKobo: raw.amount_kobo,
        deliveryFeeKobo: raw.delivery_fee_kobo || 0,
        status: raw.status,
        statusChangedAt: raw.status_changed_at,
        createdAt: raw.created_at || '',
        slow: isSlow(raw.status, raw.status_changed_at),
      });
      if (rank(raw.status) < rank(g.groupStatus)) g.groupStatus = raw.status;
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

function isSlow(status: string, statusChangedAt?: string | null): boolean {
  const deadline = STAGE_DEADLINE_HOURS[status];
  if (deadline === undefined || deadline === 999 || !statusChangedAt) return false;
  const elapsedMs = Date.now() - new Date(statusChangedAt).getTime();
  return elapsedMs > deadline * 60 * 60 * 1000;
}

export { statusTone };