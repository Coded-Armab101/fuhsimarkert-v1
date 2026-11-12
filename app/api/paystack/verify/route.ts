import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { recordOrder } from '@/utils/paystack/recordOrder';
import { buyerServiceFeeKobo } from '@/utils/pricing';

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
export async function GET(request: Request) {
  try {
    const reference = new URL(request.url).searchParams.get('reference');
    if (!reference) {
      return NextResponse.json({ error: 'Missing transaction reference.' }, { status: 400 });
    }

    // Identify the buyer with the cookie (anon) client.
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized system access request.' }, { status: 401 });
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
    if (transaction.metadata?.buyer_id !== user.id) {
      return NextResponse.json({ error: 'Transaction does not belong to this account.' }, { status: 403 });
    }

    if (transaction.status === 'success') {
      const metadata = typeof transaction.metadata === 'string'
        ? JSON.parse(transaction.metadata || '{}')
        : transaction.metadata || {};
      const productIds: string[] = Array.isArray(metadata.product_ids) ? metadata.product_ids : [];
      type CheckoutItem = { productId: string; quantity: number; unitPriceKobo: number };
      const items: CheckoutItem[] = Array.isArray(metadata.checkout_items)
        ? metadata.checkout_items.map((raw: unknown): CheckoutItem => {
            const item = (raw ?? {}) as Record<string, unknown>;
            return {
              productId: String(item.product_id ?? item.productId ?? ''),
              quantity: Number(item.quantity),
              unitPriceKobo: Number(item.unit_price_kobo ?? item.unitPriceKobo),
            };
          })
        : [];
      const expectedTotalKobo = Number(metadata.expected_total_kobo);
      const walletKobo = Number(metadata.wallet_kobo) > 0 ? Number(metadata.wallet_kobo) : 0;

      if (metadata.purpose !== 'marketplace_checkout' || metadata.currency !== 'NGN' ||
          !Number.isSafeInteger(expectedTotalKobo) || expectedTotalKobo <= 0 ||
          items.length === 0 ||
          items.some((i) => !i.productId || !Number.isSafeInteger(i.quantity) || i.quantity < 1 ||
            !Number.isSafeInteger(i.unitPriceKobo) || i.unitPriceKobo < 0)) {
        return NextResponse.json({ error: 'Invalid payment checkout metadata.' }, { status: 400 });
      }

      const goodsKobo = items.reduce((sum, i) => sum + i.quantity * i.unitPriceKobo, 0);
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
          productIds.some((id) => !items.some((i) => i.productId === id))) {
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
        // Log structured fields: many log viewers render an Error object as {}
        // and lose the Postgres code/hint, which makes a paid-but-unrecorded
        // order impossible to diagnose.
        const recordError = err as {
          message?: string;
          code?: string;
          details?: string;
          hint?: string;
        };
        console.error('[paystack/verify] failed to record order', {
          reference,
          message: recordError?.message ?? String(err),
          code: recordError?.code,
          details: recordError?.details,
          hint: recordError?.hint,
        });

        // The webhook may have won the race, or a previous attempt may have
        // written the rows before a later step failed. If the order exists for
        // this buyer, the payment IS recorded — report success so the browser
        // clears the cart and shows the order instead of looping on "pending".
        let orderExists = false;
        try {
          const admin = createAdminClient();
          const { data: existingOrders, error: existingError } = await admin
            .from('orders')
            .select('id')
            .eq('order_ref', reference)
            .eq('buyer_id', user.id)
            .limit(1);
          orderExists = !existingError && Boolean(existingOrders?.length);
        } catch (lookupError) {
          console.error('[paystack/verify] order existence check failed', {
            reference,
            message: lookupError instanceof Error ? lookupError.message : String(lookupError),
          });
        }

        if (!orderExists) {
          // Surface the known, actionable causes to the buyer instead of a
          // generic dead end. Unknown database errors stay generic (and are in
          // the server log above).
          const reason = recordError?.message ?? '';
          let message = 'Payment confirmed but the order could not be recorded.';
          if (reason.includes('own product')) {
            message = 'You paid for your own product, so it cannot be recorded as an order. Please contact support for a refund.';
          } else if (reason.includes('unavailable')) {
            message = 'One of the products is no longer available. Please contact support for a refund.';
          } else if (reason.includes('insufficient') || reason.includes('balance')) {
            message = 'Your wallet balance could not cover the wallet portion of this payment. Please contact support.';
          } else if (reason.includes('SUPABASE_SERVICE_ROLE_KEY') || reason.includes('NEXT_PUBLIC_SUPABASE_URL')) {
            message = 'Payment recording is unavailable because the server is misconfigured. Please contact support.';
          }
          return NextResponse.json({ error: message }, { status: 500 });
        }
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