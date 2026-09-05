import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

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
    const { data: ok, error } = await admin.rpc('confirm_order_group', {
      p_order_ref: order.order_ref,
      p_buyer_id: user.id,
    });
    if (error) throw error;

    if (ok !== true) {
      return NextResponse.json({ ok: false, reason: 'already-handed-off' }, { status: 409 });
    }

    return NextResponse.json({ ok: true, status: 'completed' });
  } catch (err) {
    console.error('[orders/complete] failed', err);
    return NextResponse.json({ error: 'Could not release this order.' }, { status: 500 });
  }
}