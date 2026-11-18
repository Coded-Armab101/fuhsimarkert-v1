import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { notifyUsers } from '@/utils/notifications';
import { appLink, sendEmailToUsers } from '@/utils/email';
import { accountIsActive } from '@/utils/account';

/** Seller confirms that a disputed product has physically been returned. */
export async function POST(request: Request) {
  try {
    let orderId = '';
    try {
      const body = await request.json();
      orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    } catch {
      return NextResponse.json({ error: 'Malformed return confirmation.' }, { status: 400 });
    }
    if (!orderId) {
      return NextResponse.json({ error: 'Missing order id.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
    if (!(await accountIsActive(supabase, user.id))) {
      return NextResponse.json({ error: 'This account is suspended.' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, order_ref, seller_id, buyer_id, status, return_required, return_received_at')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    if (order.seller_id !== user.id) {
      return NextResponse.json({ error: 'This return does not belong to your seller account.' }, { status: 403 });
    }
    if (order.status !== 'disputed' || order.return_required !== true) {
      return NextResponse.json({ error: 'This order is not awaiting a returned item.' }, { status: 409 });
    }

    const { data: confirmed, error: confirmError } = await admin.rpc('confirm_order_return', {
      p_order_id: order.id,
      p_seller_id: user.id,
      p_confirmed_by: user.id,
      p_source: 'seller',
    });
    if (confirmError) throw confirmError;
    if (confirmed !== true) {
      return NextResponse.json({ error: 'Could not confirm this return.' }, { status: 409 });
    }

    const { error: eventError } = await admin.from('order_dispute_events').insert({
      order_id: order.id,
      actor_id: user.id,
      actor_role: 'seller',
      event_type: 'return_confirmed',
      note: 'Seller confirmed physical receipt of the returned item.',
    });
    if (eventError) console.error('[orders/return-received] audit insert failed', eventError);

    const { count: pendingReturns, error: countError } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('order_ref', order.order_ref)
      .eq('buyer_id', order.buyer_id)
      .eq('status', 'disputed')
      .eq('return_required', true)
      .is('return_received_at', null);
    if (countError) throw countError;
    const allReturnsConfirmed = (pendingReturns ?? 0) === 0;

    try {
      // Inbox row + push so the buyer knows the seller received the return.
      await notifyUsers(admin, {
        userIds: [order.buyer_id],
        orderId: order.id,
        type: 'order_return_received',
        title: allReturnsConfirmed ? 'Return confirmed' : 'One returned item confirmed',
        message: allReturnsConfirmed
          ? 'All affected sellers confirmed their returned items. Open the disputed order to finish the protected refund.'
          : 'A seller confirmed receipt of a returned item. Other return confirmations are still outstanding.',
        url: '/buyer/orders',
      });

      if (allReturnsConfirmed) {
        await sendEmailToUsers(admin, [order.buyer_id], {
          subject: 'Your FuhsiMarket return was confirmed',
          heading: 'Returned item received',
          lines: [
            `The seller confirmed the return for order ${order.order_ref}.`,
            'Open the disputed order and choose “Complete protected refund” to finish the refund through the original payment method and/or your wallet.',
          ],
          cta: { label: 'Complete refund', url: appLink('/buyer/orders') },
        });
      }
    } catch (notificationError) {
      console.warn('[orders/return-received] notification failed', notificationError);
    }

    return NextResponse.json({ ok: true, allReturnsConfirmed });
  } catch (error) {
    console.error('[orders/return-received] failed', error);
    return NextResponse.json({ error: 'Could not confirm the returned item.' }, { status: 500 });
  }
}
