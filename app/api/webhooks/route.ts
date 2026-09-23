import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/utils/supabase/admin';
import { recordOrder } from '@/utils/paystack/recordOrder';
import { buyerServiceFeeKobo } from '@/utils/pricing';
import { recordRoleSubscription } from '@/utils/paystack/recordSubscription';

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
      amount?: number;
      currency?: string;
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

  // Acknowledge anything we do not handle, so Paystack stops retrying it.
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
