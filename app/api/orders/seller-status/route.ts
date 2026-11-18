import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { notifyUsers } from '@/utils/notifications';
import { accountIsActive } from '@/utils/account';

const TRANSITIONS: Record<string, string[]> = {
  in_escrow: ['packing'],
  packing: ['ready_for_pickup'],
};

const TRACK_STEPS = ['in_escrow', 'packing', 'ready_for_pickup', 'confirmed', 'delivered', 'completed'];

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const orderRef = typeof body?.orderRef === 'string' ? body.orderRef.trim() : '';
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const status = typeof body?.status === 'string' ? body.status : '';
    if ((!orderRef && !orderId) || !['packing', 'ready_for_pickup'].includes(status)) {
      return NextResponse.json({ error: 'Invalid order status request.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    if (!(await accountIsActive(supabase, user.id))) return NextResponse.json({ error: 'This account is suspended.' }, { status: 403 });

    const admin = createAdminClient();
    // orderRef advances every product this seller packed for one checkout.
    // orderId is kept for older clients that still update a single row.
    let rows: Array<{ id: string; seller_id: string; buyer_id: string; status: string; order_ref: string | null }> = [];
    if (orderRef) {
      const { data, error } = await admin
        .from('orders')
        .select('id, seller_id, buyer_id, status, order_ref')
        .eq('order_ref', orderRef)
        .eq('seller_id', user.id);
      if (error) throw error;
      rows = data || [];
    } else {
      const { data, error } = await admin
        .from('orders')
        .select('id, seller_id, buyer_id, status, order_ref')
        .eq('id', orderId)
        .maybeSingle();
      if (error) throw error;
      rows = data ? [data] : [];
    }
    if (rows.length === 0) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    if (rows.some((row) => row.seller_id !== user.id)) {
      return NextResponse.json({ error: 'This order is not yours.' }, { status: 403 });
    }

    const actionable = new Set([...Object.keys(TRANSITIONS), 'ready_for_pickup', 'confirmed', 'delivered', 'completed']);
    if (rows.some((row) => !actionable.has(row.status))) {
      return NextResponse.json({ error: 'Some items in this bundle need support attention before they can be packed.' }, { status: 409 });
    }
    const groupStatus = rows.reduce((lowest, row) => {
      const rowRank = TRACK_STEPS.indexOf(row.status) < 0 ? 99 : TRACK_STEPS.indexOf(row.status);
      const lowestRank = TRACK_STEPS.indexOf(lowest) < 0 ? 99 : TRACK_STEPS.indexOf(lowest);
      return rowRank < lowestRank ? row.status : lowest;
    }, rows[0].status);
    if (!(TRANSITIONS[groupStatus] || []).includes(status)) {
      return NextResponse.json({ error: `Cannot move an order from ${groupStatus} to ${status}.` }, { status: 409 });
    }
    const mutableIds = rows.filter((row) => row.status === groupStatus).map((row) => row.id);
    if (mutableIds.length === 0) {
      return NextResponse.json({ error: 'This bundle has already been moved. Refresh and try again.' }, { status: 409 });
    }

    const { data: changed, error: updateError } = await admin
      .from('orders')
      .update({ status, status_changed_at: new Date().toISOString() })
      .in('id', mutableIds)
      .eq('seller_id', user.id)
      .eq('status', groupStatus)
      .select('id, status');
    if (updateError) throw updateError;
    if (!changed || changed.length !== mutableIds.length) {
      return NextResponse.json({ error: 'The order changed. Refresh and try again.' }, { status: 409 });
    }
    const order = rows[0];

    const title = status === 'ready_for_pickup' ? 'Order ready for pickup' : 'Order is being packed';
    const message = status === 'ready_for_pickup'
      ? 'Your seller has marked this order ready for pickup.'
      : 'Your seller has started preparing your order.';
    // Record the inbox row AND push this status change to the buyer's phone.
    // Previously this wrote a DB row only, so buyers with the tab closed never
    // learned that their order had moved to packing/ready for pickup. Distinct
    // types per stage keep both updates in the inbox instead of overwriting the
    // first one via the (user_id, order_id, type) unique key.
    await notifyUsers(admin, {
      userIds: [order.buyer_id],
      orderId: order.id,
      type: status === 'ready_for_pickup' ? 'order_ready_for_pickup' : 'order_packing',
      title,
      message,
      url: '/buyer/orders',
    });

    return NextResponse.json({ ok: true, status });
  } catch (err) {
    console.error('[orders/seller-status] failed', err);
    return NextResponse.json({ error: 'Could not update the order.' }, { status: 500 });
  }
}
