import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { notifyUsers } from '@/utils/notifications';
import { accountIsActive } from '@/utils/account';

/**
 * Buyer confirms receipt → releases escrow to the seller.
 *
 * Delegates the actual money transition to the atomic SECURITY DEFINER function
 * `confirm_order_group`, keyed on the order's `order_ref` + buyer. This is
 * idempotent: a second concurrent confirm updates zero rows and returns false,
 * so the seller's wallet is credited exactly once.
 *
 * Identity is proven with the cookie client; the money write goes through the
 * service-role client invoking the (service-role-only) RPC.
 */
export async function POST(request: Request) {
  try {
    let orderId: string | null = null;
    try {
      ({ orderId } = await request.json());
    } catch {
      return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
    }
    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'Missing order id.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized system access request.' }, { status: 401 });
    }
    if (!(await accountIsActive(supabase, user.id))) {
      return NextResponse.json({ error: 'This account is suspended.' }, { status: 403 });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, order_ref, status')
      .eq('id', orderId)
      .single();
    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
    if (order.buyer_id !== user.id) {
      return NextResponse.json({ error: 'This order is not yours.' }, { status: 403 });
    }
    if (order.status !== 'ready_for_pickup') {
      return NextResponse.json({
        error: 'This order is not ready to be confirmed.',
      }, { status: 409 });
    }

    const admin = createAdminClient();

    // Read every seller row in this order group before confirming, so we can
    // tell each seller their escrow was released once the RPC succeeds.
    const { data: groupRows, error: groupError } = await admin
      .from('orders')
      .select('id, seller_id')
      .eq('order_ref', order.order_ref);
    if (groupError) throw groupError;

    const { data: ok, error } = await admin.rpc('confirm_order_group', {
      p_order_ref: order.order_ref,
      p_buyer_id: user.id,
    });
    if (error) throw error;

    if (ok !== true) {
      return NextResponse.json({ ok: false, reason: 'already-handed-off' }, { status: 409 });
    }

    // Best-effort completion notices for BOTH sides — this route previously
    // sent nothing, so nobody was told the order had finished and money moved.
    try {
      // One notice per seller for their own order row.
      const sellerRows = new Map<string, string>();
      for (const row of groupRows ?? []) {
        if (row.seller_id && !sellerRows.has(row.seller_id)) sellerRows.set(row.seller_id, row.id);
      }
      for (const [sellerId, orderRowId] of sellerRows) {
        await notifyUsers(admin, {
          userIds: [sellerId],
          orderId: orderRowId,
          type: 'order_completed',
          title: 'Sale completed',
          message: 'The buyer confirmed receipt. Your payout has been released to your wallet.',
          url: '/seller/wallet',
        });
      }
      await notifyUsers(admin, {
        userIds: [user.id],
        orderId: order.id,
        type: 'order_completed',
        title: 'Order completed',
        message: 'Receipt confirmed. Thank you for shopping on FuhsiMarket.',
        url: '/buyer/orders',
      });
    } catch (notifyError) {
      console.warn('[orders/complete] notification failed', notifyError);
    }

    return NextResponse.json({ ok: true, status: 'completed' });
  } catch (err) {
    console.error('[orders/complete] failed', err);
    return NextResponse.json({ error: 'Could not release this order.' }, { status: 500 });
  }
}
