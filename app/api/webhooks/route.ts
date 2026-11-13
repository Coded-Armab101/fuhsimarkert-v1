import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/utils/supabase/admin';
import { recordOrder } from '@/utils/paystack/recordOrder';
import { buyerServiceFeeKobo } from '@/utils/pricing';
import { recordRoleSubscription } from '@/utils/paystack/recordSubscription';
import { appLink, sendEmailToUsers } from '@/utils/email';
import { formatNaira } from '@/utils/money';

/**
 * Paystack webhook — `charge.success` → escrow orders.
 *
 * This is an inbound push from Paystack. It carries no cookies, so it must use
 * the service-role client; the cookie-based client would run as `anon` and RLS
 * would reject every write. The order-creation logic is shared with the active
 * verify path (`/api/paystack/verify`) via `utils/paystack/recordOrder`, so an
 * order is created whether or not this webhook ever fires.
 */

function isFromPaystack(rawBody: string, signature: string | null) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;

  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

  // timingSafeEqual throws on length mismatch, so compare lengths first. Both
  // sides are hex of a fixed-width digest, so this leaks nothing useful.
  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== receivedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  if (!isFromPaystack(rawBody, request.headers.get('x-paystack-signature'))) {
    // Deliberately vague: do not tell an attacker which check failed.
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let event: {
    event?: string;
    data?: {
      reference?: string;
      amount?: number | string;
      currency?: string;
      status?: string;
      transaction_reference?: string;
      refund_reference?: string | null;
      metadata?: {
        buyer_id?: string;
        user_id?: string;
        plan_type?: string;
        product_ids?: string[];
        delivery_type?: string;
        delivery_fee_kobo?: number;
        receiver_name?: string;
        receiver_phone?: string;
        matric_number?: string;
        delivery_address?: string | null;
        wallet_kobo?: number;
        checkout_items?: Array<{ product_id?: string; quantity?: number; unit_price_kobo?: number }>;
        expected_total_kobo?: number;
        purpose?: string;
        currency?: string;
      };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Malformed payload.' }, { status: 400 });
  }

  // Refunds are asynchronous. Pending/processing/processed update the local
  // audit state; a terminal failure credits the attempted card amount to the
  // buyer's wallet exactly once through a database ledger.
  if (event.event?.startsWith('refund.')) {
    const eventStatus = event.event.slice('refund.'.length);
    const status = eventStatus === 'needs_attention' ? 'needs-attention' : eventStatus;
    const orderRef = event.data?.transaction_reference;
    const refundReference = event.data?.refund_reference || null;
    const amountKobo = Math.floor(Number(event.data?.amount) || 0);

    if (
      !['pending', 'processing', 'processed', 'failed', 'needs-attention'].includes(status) ||
      !orderRef ||
      event.data?.currency !== 'NGN' ||
      amountKobo <= 0
    ) {
      console.error('[webhook] invalid refund event', {
        event: event.event,
        orderRef,
        refundReference,
      });
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const admin = createAdminClient();
    const { data: rows, error } = await admin.rpc('record_paystack_refund_event', {
      p_order_ref: orderRef,
      p_refund_reference: refundReference,
      p_status: status,
      p_amount_kobo: amountKobo,
    });

    if (error) {
      // The RPC is idempotent, so asking Paystack to retry is safe and avoids a
      // failed card refund being silently lost during a temporary DB outage.
      console.error('[webhook] failed to record refund event', {
        event: event.event,
        orderRef,
        refundReference,
        error: error.message,
      });
      return NextResponse.json({ error: 'Temporary refund processing failure.' }, { status: 500 });
    }

    const result = Array.isArray(rows) ? rows[0] : rows;
    if (status === 'failed' && result?.out_fallback_applied && result?.out_buyer_id) {
      await sendEmailToUsers(admin, [result.out_buyer_id], {
        subject: 'Your card refund moved to your FuhsiMarket wallet',
        heading: 'Refund credited to your wallet',
        lines: [
          'Paystack could not complete the refund to your original payment method.',
          `₦${formatNaira(Number(result.out_amount_kobo) || amountKobo)} has now been credited to your FuhsiMarket wallet instead.`,
        ],
        cta: { label: 'Open your wallet', url: appLink('/buyer/profile') },
      });
    }

    if (status === 'needs-attention') {
      console.warn('[webhook] refund needs attention in Paystack', {
        orderRef,
        refundReference,
      });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Acknowledge anything else we do not handle, so Paystack stops retrying it.
  if (event.event !== 'charge.success') {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const reference = event.data?.reference;

  // Role subscriptions have no marketplace product payload. Handle them from
  // the signed webhook as the server-side backstop for a browser that closes
  // immediately after payment. recordRoleSubscription is idempotent on the
  // Paystack reference, so webhook + browser verification can safely race.
  if (event.data?.metadata?.purpose === 'role_subscription') {
    if (!reference || event.data.currency !== 'NGN' || event.data?.metadata?.currency !== 'NGN') {
      return NextResponse.json({ received: true }, { status: 200 });
    }
    try {
      await recordRoleSubscription(createAdminClient(), {
        reference,
        amount: Number(event.data.amount),
        currency: event.data.currency,
        metadata: event.data.metadata,
      });
    } catch (err) {
      console.error('[webhook] failed to record role subscription', { reference, err });
    }
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const buyerId = event.data?.metadata?.buyer_id;
  const productIds = event.data?.metadata?.product_ids;
  const deliveryType = event.data?.metadata?.delivery_type === 'delivery' ? 'delivery' : 'pickup';
  const deliveryFeeKobo = Number(event.data?.metadata?.delivery_fee_kobo) > 0
    ? Number(event.data?.metadata?.delivery_fee_kobo)
    : 0;
  const receiverName = event.data?.metadata?.receiver_name ?? null;
  const receiverPhone = event.data?.metadata?.receiver_phone ?? null;
  const matricNumber = event.data?.metadata?.matric_number ?? null;
  const receiverAddress = event.data?.metadata?.delivery_address ?? null;
  const walletKobo = Number(event.data?.metadata?.wallet_kobo) > 0
    ? Number(event.data?.metadata?.wallet_kobo)
    : 0;
  const checkoutItems = Array.isArray(event.data?.metadata?.checkout_items)
    ? event.data!.metadata!.checkout_items.map((item) => ({
        productId: item?.product_id as string,
        quantity: Number(item?.quantity),
        unitPriceKobo: Number(item?.unit_price_kobo),
      }))
    : [];
  const expectedTotalKobo = Number(event.data?.metadata?.expected_total_kobo);
  const gatewayAmountKobo = Number(event.data?.amount);
  const currency = event.data?.currency;

  if (!reference || !buyerId || !Array.isArray(productIds) || productIds.length === 0) {
    console.error('[webhook] charge.success missing reference/buyer_id/product_ids', {
      reference,
    });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (event.data?.metadata?.purpose !== 'marketplace_checkout' ||
      event.data?.metadata?.currency !== 'NGN' || currency !== 'NGN' ||
      !Number.isSafeInteger(expectedTotalKobo) || expectedTotalKobo <= 0 ||
      !Number.isSafeInteger(gatewayAmountKobo) || gatewayAmountKobo < 0 ||
      new Set(productIds).size !== productIds.length ||
      checkoutItems.length !== productIds.length ||
      checkoutItems.some((i) => !i.productId || !Number.isSafeInteger(i.quantity) || i.quantity < 1 ||
        !Number.isSafeInteger(i.unitPriceKobo) || i.unitPriceKobo < 0)) {
    console.error('[webhook] payment integrity metadata mismatch', { reference });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const goodsKobo = checkoutItems.reduce((sum, i) => sum + i.unitPriceKobo * i.quantity, 0);
  const expectedDeliveryKobo = deliveryFeeKobo;
  const expectedFeeKobo = buyerServiceFeeKobo(goodsKobo);
  if (goodsKobo + expectedDeliveryKobo + expectedFeeKobo !== expectedTotalKobo ||
      gatewayAmountKobo + walletKobo !== expectedTotalKobo) {
    console.error('[webhook] payment amount mismatch', { reference });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const supabase = createAdminClient();
    await recordOrder(supabase, {
      buyerId,
      reference,
      productIds,
      items: checkoutItems,
      deliveryType,
      deliveryFeeKobo,
      receiverName,
      receiverPhone,
      matricNumber,
      deliveryAddress: receiverAddress,
      walletKobo,
      gatewayAmountKobo,
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    // Log server-side with the reference so it can be reconciled by hand; never
    // return the database error to the caller.
    console.error('[webhook] failed to record escrow order', { reference, err });

    // 200, not 500: the signature was valid and the payload was understood, so
    // Paystack retrying will not help. Reconcile from the log instead of
    // accumulating retries.
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
