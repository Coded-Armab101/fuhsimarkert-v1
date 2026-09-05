import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * Buyer disputes an order → refunds the payment to the buyer's wallet.
 *
 * Delegates the money transition to the atomic SECURITY DEFINER function
 * `dispute_order`, which locks the order row and only flips escrow `held`→
 * `refunded` (and credits the wallet) if it is still in a disputable state.
 * A second concurrent dispute is a no-op, so the refund happens at most once.
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

    // Early, friendly gate: confirm it exists, is the buyer's, and is disputable.
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, status')
      .eq('id', orderId)
      .single();
    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
    if (order.buyer_id !== user.id) {
      return NextResponse.json({ error: 'This order is not yours.' }, { status: 403 });
    }
    const disputable = ['in_escrow', 'packing', 'ready_for_pickup', 'confirmed', 'delivered'];
    if (!disputable.includes(order.status)) {
      return NextResponse.json({
        error: `This order (${order.status}) can no longer be disputed.`,
      }, { status: 409 });
    }

    const admin = createAdminClient();
    const { data: ok, error } = await admin.rpc('dispute_order', {
      p_order_id: orderId,
      p_buyer_id: user.id,
    });
    if (error) throw error;

    if (ok !== true) {
      return NextResponse.json({ ok: false, reason: 'already-settled' }, { status: 409 });
    }

    return NextResponse.json({ ok: true, status: 'disputed' });
  } catch (err) {
    console.error('[orders/dispute] failed', err);
    return NextResponse.json({ error: 'Could not refund this order.' }, { status: 500 });
  }
}