import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

const TRANSITIONS: Record<string, string[]> = {
  in_escrow: ['packing'],
  packing: ['ready_for_pickup'],
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const status = typeof body?.status === 'string' ? body.status : '';
    if (!orderId || !['packing', 'ready_for_pickup'].includes(status)) {
      return NextResponse.json({ error: 'Invalid order status request.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const admin = createAdminClient();
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, seller_id, buyer_id, status, product_id, order_ref')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    if (order.seller_id !== user.id) return NextResponse.json({ error: 'This order is not yours.' }, { status: 403 });
    if (!(TRANSITIONS[order.status] || []).includes(status)) {
      return NextResponse.json({ error: `Cannot move an order from ${order.status} to ${status}.` }, { status: 409 });
    }

    const { data: changed, error: updateError } = await admin
      .from('orders')
      .update({ status, status_changed_at: new Date().toISOString() })
      .eq('id', order.id)
      .eq('seller_id', user.id)
      .eq('status', order.status)
      .select('id, status')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!changed) return NextResponse.json({ error: 'The order changed. Refresh and try again.' }, { status: 409 });

    const title = status === 'ready_for_pickup' ? 'Order ready for pickup' : 'Order is being packed';
    const message = status === 'ready_for_pickup'
      ? 'Your seller has marked this order ready for pickup.'
      : 'Your seller has started preparing your order.';
    await admin.from('notifications').upsert({
      user_id: order.buyer_id,
      type: 'order_update',
      title,
      message,
      order_id: order.id,
    }, { onConflict: 'user_id,order_id,type' });

    return NextResponse.json({ ok: true, status });
  } catch (err) {
    console.error('[orders/seller-status] failed', err);
    return NextResponse.json({ error: 'Could not update the order.' }, { status: 500 });
  }
}
