import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/utils/supabase/admin';
import { recordOrder } from '@/utils/paystack/recordOrder';

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
      metadata?: {
        buyer_id?: string;
        product_ids?: string[];
        delivery_type?: string;
        delivery_fee_kobo?: number;
        receiver_name?: string;
        receiver_phone?: string;
        matric_number?: string;
        delivery_address?: string | null;
        wallet_kobo?: number;
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

  if (!reference || !buyerId || !Array.isArray(productIds) || productIds.length === 0) {
    console.error('[webhook] charge.success missing reference/buyer_id/product_ids', {
      reference,
    });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const supabase = createAdminClient();
    await recordOrder(supabase, {
      buyerId,
      reference,
      productIds,
      deliveryType,
      deliveryFeeKobo,
      receiverName,
      receiverPhone,
      matricNumber,
      deliveryAddress: receiverAddress,
      walletKobo,
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
