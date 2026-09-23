import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { cookies } from 'next/headers';
import { SESSION_NONCE_COOKIE, nonceValid } from '@/utils/single-session';

const ALLOWED = new Set(['packing', 'ready_for_pickup']);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    const status = typeof body?.status === 'string' ? body.status : '';
    if (!orderId || !ALLOWED.has(status)) {
      return NextResponse.json({ error: 'Invalid order status request.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const cookieStore = await cookies();
    const nonce = cookieStore.get(SESSION_NONCE_COOKIE)?.value ?? null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('session_nonce, is_seller, seller_active, is_approved_seller, subscription_expires_at')
      .eq('id', user.id)
      .maybeSingle();
    if (!nonceValid(nonce, profile?.session_nonce ?? null)) {
      return NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 403 });
    }
    if (profile?.is_seller !== true || profile?.seller_active !== true || profile?.is_approved_seller !== true ||
        !profile.subscription_expires_at || new Date(profile.subscription_expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Seller access is not active.' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: ok, error: rpcError } = await admin.rpc('advance_seller_order_status', {
      p_order_id: orderId,
      p_seller_id: user.id,
      p_new_status: status,
    });
    if (rpcError) throw rpcError;
    if (ok !== true) return NextResponse.json({ error: 'Invalid order state transition.' }, { status: 409 });

    if (status === 'ready_for_pickup') {
      const { data: order } = await admin
        .from('orders')
        .select('id, buyer_id, product_id, order_ref')
        .eq('id', orderId)
        .maybeSingle();

      if (order?.buyer_id) {
        const { data: product } = await admin
          .from('products')
          .select('title')
          .eq('id', order.product_id)
          .maybeSingle();

        const { error: notificationError } = await admin
          .from('notifications')
          .upsert({
            user_id: order.buyer_id,
            type: 'order_ready',
            title: 'Order ready for pickup',
            message: `${product?.title || 'Your product'} is ready for pickup.`,
            order_id: order.id,
          }, { onConflict: 'user_id,order_id,type', ignoreDuplicates: true });

        if (notificationError) {
          // Do not roll back a valid order transition because notification
          // delivery failed. The buyer can still see the live order status.
          console.error('[orders/status] notification insert failed', notificationError);
        }
      }
    }

    return NextResponse.json({ ok: true, status });
  } catch (err) {
    console.error('[orders/status] failed', err);
    return NextResponse.json({ error: 'Could not update the order status.' }, { status: 500 });
  }
}
