import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { appLink, sendEmailToUsers } from '@/utils/email';

/**
 * Buyer confirms receipt of a WHOLE combined order (one order_ref, possibly from
 * several sellers) → completes every row and releases escrow to EACH seller.
 *
 * The transition is delegated to the SECURITY DEFINER function
 * `confirm_order_group`, which runs the whole thing in ONE transaction keyed on
 * `status='ready_for_pickup'`. That atomic guard makes the operation idempotent:
 * a second, concurrent Confirm (double-tap or replay) updates zero rows and
 * returns false, so the seller's wallet is credited exactly once.
 *
 * The caller's identity is established with the cookie client; the money write
 * goes through the service-role client invoking the (service-role-only) RPC.
 */
export async function POST(request: Request) {
  try {
    let orderRef: string | null = null;
    try {
      ({ orderRef } = await request.json());
    } catch {
      return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
    }
    if (!orderRef || typeof orderRef !== 'string') {
      return NextResponse.json({ error: 'Missing order reference.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized system access request.' }, { status: 401 });
    }

    // Prove the order(s) exist and belong to the caller before touching money.
    // (The RPC also re-scopes to buyer_id + ready_for_pickup, so this is an
    // early clear signal, not the security boundary.)
    const { data: rows, error: rowsError } = await supabase
      .from('orders')
      .select('id, status')
      .eq('order_ref', orderRef)
      .eq('buyer_id', user.id);
    if (rowsError) throw rowsError;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
    const notReady = rows.filter((r) => r.status !== 'ready_for_pickup');
    if (notReady.length > 0) {
      return NextResponse.json({
        error: 'This order is not ready to be confirmed yet.',
      }, { status: 409 });
    }

    const admin = createAdminClient();
    const { data: ok, error } = await admin.rpc('confirm_order_group', {
      p_order_ref: orderRef,
      p_buyer_id: user.id,
    });
    if (error) throw error;

    if (ok !== true) {
      // The atomic guard rejected the transition (e.g. already completed by a
      // concurrent request) — treat as already handled rather than an error.
      return NextResponse.json({ ok: false, reason: 'already-handed-off' }, { status: 409 });
    }

    // Money has been released. Let both sides know (best-effort, non-blocking).
    try {
      const { data: completed } = await admin
        .from('orders')
        .select('id, seller_id, product_id, amount_kobo')
        .eq('order_ref', orderRef)
        .eq('buyer_id', user.id);

      const rows = completed || [];
      const sellerIds = Array.from(
        new Set(rows.map((row) => row.seller_id).filter((id): id is string => Boolean(id))),
      );
      const productIds = rows
        .map((row) => row.product_id)
        .filter((id): id is string => Boolean(id));

      let label = orderRef;
      if (productIds.length > 0) {
        const { data: products } = await admin
          .from('products')
          .select('title')
          .in('id', productIds);
        const titles = (products || []).map((p) => p.title).filter(Boolean).slice(0, 3);
        if (titles.length > 0) label = titles.join(', ');
      }

      const notifications = rows
        .filter((row) => Boolean(row.seller_id))
        .map((row) => ({
          user_id: row.seller_id,
          order_id: row.id,
          type: 'order_completed',
          title: 'Order completed',
          message: 'The buyer confirmed receipt. Your wallet has been credited.',
        }));
      if (notifications.length > 0) {
        const { error: notificationError } = await admin
          .from('notifications')
          .upsert(notifications, {
            onConflict: 'user_id,order_id,type',
            ignoreDuplicates: true,
          });
        if (notificationError) {
          console.warn('[orders/complete-group] notification failed', notificationError);
        }
      }

      await sendEmailToUsers(admin, [user.id], {
        subject: 'Order completed — thank you!',
        heading: 'Order confirmed',
        lines: [
          `You confirmed receipt of ${label}.`,
          'The payment has been released to the seller. We hope everything arrived as expected.',
          'You can now leave a review to help other buyers.',
        ],
        cta: { label: 'Review your order', url: appLink('/buyer/orders') },
      });

      if (sellerIds.length > 0) {
        await sendEmailToUsers(admin, sellerIds, {
          subject: 'Your FuhsiMarket sale is complete',
          heading: 'Payment released',
          lines: [
            `The buyer confirmed receipt of ${label}.`,
            'Your earnings (minus the 3% platform commission) are now in your FuhsiMarket wallet.',
          ],
          cta: { label: 'Open your wallet', url: appLink('/seller/wallet') },
        });
      }
    } catch (emailError) {
      console.warn('[orders/complete-group] email failed', emailError);
    }

    return NextResponse.json({ ok: true, status: 'completed' });
  } catch (err) {
    console.error('[orders/complete-group] failed', err);
    return NextResponse.json({ error: 'Could not release this order.' }, { status: 500 });
  }
}
