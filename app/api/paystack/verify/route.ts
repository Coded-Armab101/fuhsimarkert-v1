import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { recordOrder } from '@/utils/paystack/recordOrder';
import { buyerServiceFeeKobo } from '@/utils/pricing';
import { rateLimit, PAYMENT_INIT_LIMIT } from '@/utils/rate-limit';

/**
 * Verify a Paystack transaction by reference.
 *
 * Called by the buyer's browser when Paystack redirects back to /buyer/cart
 * with ?reference=.... Besides reporting the real status, on a successful
 * charge this route ALSO creates the escrow order server-side (via
 * utils/paystack/recordOrder) — so an order appears reliably even if the
 * Paystack → /api/webhooks push never arrives. The idempotent upsert means a
 * late webhook is a harmless no-op, not a duplicate.
 *
 * The caller's identity is established with the cookie (anon) client; the
 * actual orders INSERT runs under the service-role client, because RLS has no
 * policy that lets a buyer INSERT into `orders` directly (escrow rows are
 * written by server code, not by end users). The transaction is validated to
 * belong to this buyer before any write is attempted.
 */
export async function POST(request: Request) {
  try {
    const requestBody = await request.json().catch(() => null);
    const reference = typeof requestBody?.reference === 'string' ? requestBody.reference.trim() : '';
    if (reference.length > 200) {
      return NextResponse.json({ error: 'Invalid transaction reference.' }, { status: 400 });
    }
    if (!reference) {
      return NextResponse.json({ error: 'Missing transaction reference.' }, { status: 400 });
    }

    // Identify the buyer with the cookie (anon) client.
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized system access request.' }, { status: 401 });
    }

    const limit = rateLimit({ key: `payment-verify:${user.id}`, ...PAYMENT_INIT_LIMIT });
    if (!limit.ok) {
      return NextResponse.json({ error: 'Too many payment verification attempts. Please wait.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
    }

    const paystackReply = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      },
    );

    const body = await paystackReply.json();

    if (!body.status || !body.data) {
      return NextResponse.json({ status: 'unknown' });
    }

    const transaction = body.data;
    if (transaction.reference !== reference || transaction.metadata?.buyer_id !== user.id) {
      return NextResponse.json({ error: 'Transaction does not belong to this account.' }, { status: 403 });
    }

    if (transaction.status === 'success') {
      let metadata: Record<string, any>;
      try {
        metadata = typeof transaction.metadata === 'string'
          ? JSON.parse(transaction.metadata || '{}')
          : transaction.metadata || {};
      } catch {
        return NextResponse.json({ error: 'Invalid payment metadata.' }, { status: 400 });
      }
      const productIds = Array.isArray(metadata.product_ids) ? metadata.product_ids : [];
      const items = Array.isArray(metadata.checkout_items) ? metadata.checkout_items.map((item: any) => ({
        productId: item?.product_id,
        quantity: Number(item?.quantity),
        unitPriceKobo: Number(item?.unit_price_kobo),
      })) : [];
      const expectedTotalKobo = Number(metadata.expected_total_kobo);
      const walletKobo = Number(metadata.wallet_kobo) > 0 ? Number(metadata.wallet_kobo) : 0;

      if (metadata.purpose !== 'marketplace_checkout' || metadata.currency !== 'NGN' ||
          !Number.isSafeInteger(expectedTotalKobo) || expectedTotalKobo <= 0 ||
          !Array.isArray(items) || items.length === 0 ||
          items.some((i: any) => !i.productId || !Number.isSafeInteger(i.quantity) || i.quantity < 1 ||
            !Number.isSafeInteger(i.unitPriceKobo) || i.unitPriceKobo < 0)) {
        return NextResponse.json({ error: 'Invalid payment checkout metadata.' }, { status: 400 });
      }

      const goodsKobo = items.reduce((sum: number, i: any) => sum + i.quantity * i.unitPriceKobo, 0);
      const deliveryFeeKobo = Number(metadata.delivery_fee_kobo) > 0 ? Number(metadata.delivery_fee_kobo) : 0;
      const expectedBuyerFeeKobo = buyerServiceFeeKobo(goodsKobo);
      if (goodsKobo + deliveryFeeKobo + expectedBuyerFeeKobo !== expectedTotalKobo ||
          Number(transaction.amount) + walletKobo !== expectedTotalKobo ||
          transaction.currency !== 'NGN') {
        console.error('[paystack/verify] payment integrity mismatch', { reference });
        return NextResponse.json({ error: 'Payment amount could not be validated.' }, { status: 400 });
      }

      const uniqueProductIds = new Set(productIds);
      if (uniqueProductIds.size !== productIds.length ||
          productIds.length !== items.length ||
          productIds.some((id: string) => !items.some((i: any) => i.productId === id))) {
        return NextResponse.json({ error: 'Invalid payment item set.' }, { status: 400 });
      }

      try {
        await recordOrder(createAdminClient(), {
          buyerId: user.id,
          reference,
          productIds,
          items,
          deliveryType: metadata.delivery_type === 'delivery' ? 'delivery' : 'pickup',
          deliveryFeeKobo,
          receiverName: metadata.receiver_name ?? null,
          receiverPhone: metadata.receiver_phone ?? null,
          matricNumber: metadata.matric_number ?? null,
          deliveryAddress: metadata.delivery_address ?? null,
          walletKobo,
          gatewayAmountKobo: Number(transaction.amount),
        });
      } catch (err) {
        console.error('[paystack/verify] failed to record order', { reference, err });
        return NextResponse.json({ error: 'Payment confirmed but the order could not be recorded.' }, { status: 500 });
      }
    }

    return NextResponse.json({
      status: transaction.status,
      reference: transaction.reference,
      amount_kobo: transaction.amount,
    });
  } catch (err) {
    console.error('[paystack/verify] error:', err);
    return NextResponse.json({ error: 'Internal system gateway exception occurred.' }, { status: 500 });
  }
}