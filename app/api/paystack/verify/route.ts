import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { recordOrder } from '@/utils/paystack/recordOrder';

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

    // On a confirmed success, create the escrow order right here. Guard on
    // metadata.product_ids so we only act on this app's transactions. Writes go
    // through the service-role client (RLS would reject a buyer INSERT).
    if (transaction.status === 'success') {
      const productIds = Array.isArray(transaction.metadata?.product_ids)
        ? transaction.metadata.product_ids
        : [];

      if (productIds.length > 0) {
        try {
          await recordOrder(createAdminClient(), {
            buyerId: user.id,
            reference,
            productIds,
            deliveryType:
              transaction.metadata?.delivery_type === 'delivery' ? 'delivery' : 'pickup',
            deliveryFeeKobo:
              Number(transaction.metadata?.delivery_fee_kobo) > 0
                ? Number(transaction.metadata?.delivery_fee_kobo)
                : 0,
            receiverName: transaction.metadata?.receiver_name ?? null,
            receiverPhone: transaction.metadata?.receiver_phone ?? null,
            matricNumber: transaction.metadata?.matric_number ?? null,
            deliveryAddress: transaction.metadata?.delivery_address ?? null,
            walletKobo:
              Number(transaction.metadata?.wallet_kobo) > 0
                ? Number(transaction.metadata?.wallet_kobo)
                : 0,
          });
        } catch (err) {
          // Do not fail the whole verify response — still report success so the
          // buyer isn't charged twice or confused; the seller page will reflect
          // the true state. Log for reconciliation.
          console.error('[paystack/verify] failed to record order', { reference, err });
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