import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getWalletPaidKobo, refundCardPortion } from '@/utils/paystack/refund';
import { sendEmailToUsers, appLink } from '@/utils/email';
import { formatNaira } from '@/utils/money';
import { accountIsActive } from '@/utils/account';

/**
 * Buyer reports a problem with a whole combined order → refund.
 *
 * Refund policy:
 *  1. The card/gateway portion goes back to the card through Paystack.
 *  2. The wallet portion (wallet-first checkout) is credited to the wallet.
 *  3. If Paystack refuses the card refund, the WHOLE amount is credited to the
 *     wallet so the buyer is never left without their money.
 *
 * The database transition is split in two atomic, service-role-only functions:
 *  - `claim_order_refund` locks the group, marks every row `disputed`, and
 *    returns the escrow still held (goods + delivery + buyer fee).
 *  - `finalize_order_refund` marks that escrow `refunded` and credits ONLY the
 *    wallet share. It is idempotent, so a webhook/retry cannot double-credit.
 *
 * Card refunds are not idempotent on Paystack's side, so the card amount is
 * written to `orders.refund_card_kobo` BEFORE finalizing. A retry then skips
 * the card call and only finishes the wallet credit.
 */

type OrderRow = {
  id: string;
  seller_id: string;
  product_id: string | null;
  status: string;
  refund_card_kobo?: number | string | null;
  refund_card_status?: string | null;
  refund_reference?: string | null;
  refunded_at?: string | null;
  dispute_reason?: string | null;
  dispute_opened_at?: string | null;
  return_required?: boolean | null;
  return_received_at?: string | null;
};

const DISPUTABLE = ['in_escrow', 'packing', 'ready_for_pickup', 'confirmed', 'delivered'];

export async function POST(request: Request) {
  try {
    let body: { orderRef?: string; orderId?: string; reason?: string; returnRequired?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
    }

    let orderRef = typeof body?.orderRef === 'string' ? body.orderRef.trim() : '';
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const disputeReason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 1000) : '';
    const requestedReturn = body?.returnRequired === true;

    if (!orderRef && !orderId) {
      return NextResponse.json({ error: 'Missing order reference.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized system access request.' }, { status: 401 });
    }
    if (!(await accountIsActive(supabase, user.id))) {
      return NextResponse.json({ error: 'This account is suspended.' }, { status: 403 });
    }

    // Resolve the legacy orderId form to the group reference first.
    if (!orderRef) {
      const { data: row, error } = await supabase
        .from('orders')
        .select('order_ref')
        .eq('id', orderId)
        .eq('buyer_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (!row?.order_ref) {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
      }
      orderRef = row.order_ref as string;
    }

    // Ownership + status gate: every row in the combined order must still be
    // refundable (or already claimed by a previous unfinished attempt).
    const { data: rows, error: rowsError } = await supabase
      .from('orders')
      .select('id, seller_id, product_id, status, refund_card_kobo, refund_card_status, refund_reference, refunded_at, dispute_reason, dispute_opened_at, return_required, return_received_at')
      .eq('order_ref', orderRef)
      .eq('buyer_id', user.id);
    if (rowsError) throw rowsError;

    const group = (rows || []) as OrderRow[];
    if (group.length === 0) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
    if (group.every((row) => Boolean(row.refunded_at))) {
      return NextResponse.json({ ok: true, alreadyRefunded: true, orderRef });
    }
    const blocked = group.find(
      (row) =>
        !DISPUTABLE.includes(row.status) &&
        !(row.status === 'disputed' && !row.refunded_at),
    );
    if (blocked) {
      return NextResponse.json({
        error: `This order (${blocked.status}) can no longer be refunded.`,
      }, { status: 409 });
    }

    const admin = createAdminClient();

    const alreadyDisputed = group.every((row) => row.status === 'disputed');
    if (!alreadyDisputed) {
      if (disputeReason.length < 10) {
        return NextResponse.json({
          error: 'Describe the problem in at least 10 characters so the seller and administrator can review it.',
        }, { status: 400 });
      }

      const { data: opened, error: openError } = await admin.rpc('open_order_dispute', {
        p_order_ref: orderRef,
        p_buyer_id: user.id,
        p_reason: disputeReason,
        p_return_required: requestedReturn,
      });
      if (openError) throw openError;
      if (opened !== true) {
        return NextResponse.json({ error: 'This order can no longer be disputed.' }, { status: 409 });
      }

      const { error: openEventError } = await admin.from('order_dispute_events').insert(
        group.map((row) => ({
          order_id: row.id,
          actor_id: user.id,
          actor_role: 'buyer',
          event_type: 'opened',
          note: disputeReason,
        })),
      );
      if (openEventError) console.error('[orders/dispute] open audit insert failed', openEventError);

      if (requestedReturn) {
        try {
          const sellerIds = Array.from(new Set(group.map((row) => row.seller_id)));
          const notifications = group.map((row) => ({
            user_id: row.seller_id,
            order_id: row.id,
            type: 'order_return_requested',
            title: 'Disputed item awaiting return',
            message: 'The buyer opened a dispute and says they have the item. Confirm in Sales only after the returned item is back with you.',
          }));
          await admin.from('notifications').upsert(notifications, {
            onConflict: 'user_id,order_id,type',
            ignoreDuplicates: true,
          });
          await sendEmailToUsers(admin, sellerIds, {
            subject: 'A disputed FuhsiMarket item is being returned',
            heading: 'Return confirmation required',
            lines: [
              `The buyer opened a dispute for order ${orderRef}.`,
              `Reason: ${disputeReason}`,
              'Do not confirm the return until the item is physically back with you. Escrow remains frozen in the meantime.',
            ],
            cta: { label: 'Open your sales', url: appLink('/seller/orders') },
          });
        } catch (notificationError) {
          console.warn('[orders/dispute] return notification failed', notificationError);
        }

        return NextResponse.json({
          ok: true,
          status: 'awaiting_return',
          orderRef,
          awaitingReturn: true,
          refunded: false,
        }, { status: 202 });
      }
    }

    // A retry after opening a return-required dispute may only move money once
    // every affected seller has confirmed that their item is back. The RPC
    // below enforces the same invariant under a row lock.
    if (
      alreadyDisputed &&
      group.some((row) => row.return_required === true && !row.return_received_at)
    ) {
      return NextResponse.json({
        ok: true,
        status: 'awaiting_return',
        orderRef,
        awaitingReturn: true,
        refunded: false,
      }, { status: 202 });
    }

    // 1) Atomically claim the refund. Returns the amount still held, or null if
    // the group is not refundable / was already finalized.
    const { data: claimed, error: claimError } = await admin.rpc('claim_order_refund', {
      p_order_ref: orderRef,
      p_buyer_id: user.id,
    });
    if (claimError) throw claimError;

    const heldKobo = Math.floor(Number(claimed) || 0);
    if (claimed === null || claimed === undefined) {
      return NextResponse.json({
        error: 'This refund is already being processed, or the order was already settled.',
        reason: 'in-progress',
      }, { status: 409 });
    }

    // 2) Reuse the card amount already refunded by a previous attempt, if any.
    const alreadyCardKobo = Math.max(
      0,
      ...group.map((row) => Math.floor(Number(row.refund_card_kobo) || 0)),
    );

    const walletPaidKobo = Math.min(await getWalletPaidKobo(admin, orderRef), heldKobo);
    const expectedCardKobo = Math.max(heldKobo - walletPaidKobo, 0);

    let cardKobo = alreadyCardKobo;
    let cardStatus =
      group.find((row) => row.refund_card_status)?.refund_card_status || null;
    let cardNote = '';
    let cardFailedReason = '';
    let refundReference =
      group.find((row) => row.refund_reference)?.refund_reference || orderRef;

    if (alreadyCardKobo === 0 && expectedCardKobo > 0) {
      const cardResult = await refundCardPortion(orderRef, expectedCardKobo);
      if (cardResult.ok) {
        cardKobo = cardResult.amountKobo;
        cardStatus = cardResult.status;
        cardNote = cardResult.note;
        refundReference = cardResult.reference || refundReference;
      } else {
        refundReference = cardResult.reference || refundReference;
        if (cardResult.uncertain) {
          // Do not add wallet credit while Paystack might already be processing
          // the card refund. The deterministic refund reference makes the next
          // retry safe; release the short claim lock so it can retry now.
          await admin
            .from('orders')
            .update({ refund_claimed_at: null })
            .eq('order_ref', orderRef)
            .eq('buyer_id', user.id)
            .is('refunded_at', null);

          return NextResponse.json({
            error: 'Paystack did not confirm whether the card refund was queued. No wallet credit was added, so the order cannot be refunded twice. Please retry shortly or check Paystack using the refund reference.',
            refundReference,
          }, { status: 502 });
        }
        cardFailedReason = cardResult.reason;
      }
    }

    // Record the card refund before touching the wallet, so a retry never asks
    // Paystack to refund the same charge twice.
    if (cardKobo > 0) {
      const { error: stampError } = await admin
        .from('orders')
        .update({
          refund_card_kobo: cardKobo,
          refund_card_status: cardStatus || 'pending',
          refund_method: cardKobo >= heldKobo ? 'card' : 'card+wallet',
          refund_reference: refundReference,
        })
        .eq('order_ref', orderRef)
        .eq('buyer_id', user.id);
      if (stampError) throw stampError;
    }

    // 3) Credit the remainder to the wallet. If the card refund failed, the
    // whole amount lands in the wallet.
    const walletKobo = Math.max(heldKobo - cardKobo, 0);
    const method =
      cardKobo > 0
        ? walletKobo > 0
          ? 'card+wallet'
          : 'card'
        : 'wallet';

    const { data: finalized, error: finalizeError } = await admin.rpc('finalize_order_refund', {
      p_order_ref: orderRef,
      p_buyer_id: user.id,
      p_wallet_refund_kobo: walletKobo,
      p_refund_method: method,
      p_refund_reference: refundReference,
    });
    if (finalizeError) throw finalizeError;

    if (finalized !== true) {
      // Another concurrent request finalized first. The money is settled.
      return NextResponse.json({ ok: true, alreadyRefunded: true, orderRef });
    }

    const { error: refundEventError } = await admin.from('order_dispute_events').insert(
      group.map((row) => ({
        order_id: row.id,
        actor_id: user.id,
        actor_role: 'buyer',
        event_type: 'refunded',
        note: `Refund finalized by ${method}.`,
      })),
    );
    if (refundEventError) console.error('[orders/dispute] refund audit insert failed', refundEventError);

    // 4) Tell both sides what happened. Best-effort, never blocks the refund.
    try {
      const sellerIds = Array.from(
        new Set(group.map((row) => row.seller_id).filter(Boolean)),
      );

      const notifications = group.map((row) => ({
        user_id: row.seller_id,
        order_id: row.id,
        type: 'order_refunded',
        title: 'Order refunded',
        message: 'The buyer reported a problem and the payment was refunded.',
      }));
      const { error: notificationError } = await admin
        .from('notifications')
        .upsert(notifications, {
          onConflict: 'user_id,order_id,type',
          ignoreDuplicates: true,
        });
      if (notificationError) {
        console.warn('[orders/dispute] notification failed', notificationError);
      }

      const productIds = group
        .map((row) => row.product_id)
        .filter((id): id is string => Boolean(id));
      let orderLabel = orderRef;
      if (productIds.length > 0) {
        const { data: products } = await admin
          .from('products')
          .select('title')
          .in('id', productIds);
        const titles = (products || [])
          .map((p) => p.title)
          .filter(Boolean)
          .slice(0, 3);
        if (titles.length) orderLabel = titles.join(', ');
      }

      const lines = cardKobo > 0
        ? [
            `Your refund for "${orderLabel}" has been processed.`,
            `₦${formatNaira(cardKobo)} has been sent back to your card.`,
            ...(walletKobo > 0
              ? [`₦${formatNaira(walletKobo)} was credited to your FuhsiMarket wallet.`]
              : []),
          ]
        : [
            `Your refund for "${orderLabel}" has been processed.`,
            `₦${formatNaira(walletKobo)} was credited to your FuhsiMarket wallet.`,
          ];

      if (cardFailedReason) {
        lines.push(
          `The card refund could not be completed automatically (${cardFailedReason}), so the full amount was credited to your wallet.`,
        );
      }

      await sendEmailToUsers(admin, [user.id], {
        subject: 'Your FuhsiMarket refund is on its way',
        heading: 'Refund processed',
        lines,
        cta: { label: 'Open your wallet', url: appLink('/buyer/profile') },
        footnote: 'Card refunds usually settle within 5–10 business days, depending on your bank.',
      });

      if (sellerIds.length > 0) {
        await sendEmailToUsers(admin, sellerIds, {
          subject: 'A FuhsiMarket order was refunded',
          heading: 'Order refunded',
          lines: [
            `The buyer reported a problem with "${orderLabel}".`,
            'The payment has been returned to the buyer and the escrow for this order is closed.',
            'You do not need to fulfil this order.',
          ],
          cta: { label: 'Open your sales', url: appLink('/seller/orders') },
        });
      }
    } catch (emailError) {
      console.warn('[orders/dispute] email failed', emailError);
    }

    return NextResponse.json({
      ok: true,
      status: 'refunded',
      orderRef,
      cardKobo,
      walletKobo,
      method,
      cardFailedReason: cardFailedReason || undefined,
      note: cardNote || undefined,
    });
  } catch (err) {
    console.error('[orders/dispute] failed', err);
    return NextResponse.json({ error: 'Could not refund this order.' }, { status: 500 });
  }
}
