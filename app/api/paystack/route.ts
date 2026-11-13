import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { rateLimit, PAYMENT_INIT_LIMIT } from '@/utils/rate-limit';
import { buyerServiceFeeKobo, deliveryFeeForSellers } from '@/utils/pricing';
import { checkoutDatabaseReady } from '@/utils/paystack/checkoutReady';

type CartRow = {
  product_id: string;
  quantity: number;
};

export async function POST(request: Request) {
  try {
    // 0. Read delivery choices from the client. These are non-financial
    //    fulfilment details; the amount is still recomputed server-side and the
    //    delivery fee is a fixed constant, never taken from the client.
    let delivery;
    let walletFirst = false;
    let buyNow = false;
    try {
      const body = await request.json();
      delivery = body?.delivery ?? {};
      walletFirst = body?.walletFirst === true;
      buyNow = body?.buyNow === true;
    } catch {
      delivery = {};
    }
    const deliveryType = delivery.type === 'delivery' ? 'delivery' : 'pickup';
    const receiverName = String(delivery.name || '').trim();
    const receiverPhone = String(delivery.phone || '').trim();
    const matricNumber = String(delivery.matric || '').trim();
    const deliveryAddress = deliveryType === 'delivery' ? String(delivery.address || '').trim() : null;
    const isPaidDelivery = deliveryType === 'delivery';

    // 1. Establish secure, authenticated server-side session context
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized system access request.' }, { status: 401 });
    }

    // Never take a Paystack payment when the database still has the legacy
    // one-product constraints or is missing the reliability migration.
    const checkoutReady = await checkoutDatabaseReady(createAdminClient());
    if (!checkoutReady.ready) {
      console.error('[paystack] checkout database is not ready', checkoutReady.reason);
      return NextResponse.json({
        error: 'Checkout is temporarily unavailable while the order database is being updated. No payment was taken.',
      }, { status: 503 });
    }

    const limit = rateLimit({ key: `cart-checkout:${user.id}`, ...PAYMENT_INIT_LIMIT });
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many checkout attempts. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    // 2.a. Fetch the user's cart rows (which product, how many). We do NOT
    //       embed `products` here — the embedded relationship can resolve
    //       differently under the anon role's RLS, so we price items with a
    //       separate explicit query (step 2.b) that is guaranteed to go through
    //       the buyer's SELECT rights on products.
    const { data: cartItems, error: cartError } = await supabase
      .from('carts')
      .select('product_id, quantity')
      .eq('user_id', user.id);

    if (cartError || !cartItems || cartItems.length === 0) {
      console.error('[paystack] empty/error cart', { userId: user.id, cartError: cartError?.message });
      return NextResponse.json({ error: 'Shopping cart ledger is empty.' }, { status: 400 });
    }

    const productIds = (cartItems as CartRow[]).map((item) => item.product_id);
    if (new Set(productIds).size !== productIds.length) {
      return NextResponse.json({
        error: 'Your cart contains duplicate product rows. Remove the affected item and add it again.',
      }, { status: 409 });
    }

    // 2.b. Prices come from the database, never from the client. Fetch the
    //       authoritative unit price AND availability/stock for each product
    //       with an explicit query.
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .in('id', productIds);

    if (productsError || !products) {
      console.error('[paystack] products query failed', { userId: user.id, productsError: productsError?.message });
      return NextResponse.json({ error: 'Internal system pricing error.' }, { status: 500 });
    }

    // RLS may hide a product that was removed or made unavailable after the
    // cart was opened. Never price that missing line as ₦0 and charge the rest:
    // the immutable checkout snapshot must contain every visible cart product.
    if (products.length !== productIds.length || products.some((product) => product.is_available === false)) {
      return NextResponse.json({
        error: 'One or more products are no longer available. Refresh your cart before paying.',
      }, { status: 409 });
    }

    // Block paying for your own listing BEFORE money leaves the buyer. Otherwise
    // the charge succeeds, but recordOrder refuses to escrow it ("seller cannot
    // purchase their own product") and the buyer is left with a confirmed
    // payment and no order.
    const ownProducts = products.filter((product) => product.seller_id === user.id);
    if (ownProducts.length > 0) {
      const names = ownProducts.map((product) => `“${product.title}”`).join(', ');
      console.error('[paystack] self-purchase blocked', {
        userId: user.id,
        productIds: ownProducts.map((product) => product.id),
      });
      return NextResponse.json(
        {
          error: `You cannot buy your own product${ownProducts.length > 1 ? 's' : ''} (${names}). Remove ${ownProducts.length > 1 ? 'them' : 'it'} from your cart to continue.`,
        },
        { status: 400 },
      );
    }

    const productById = new Map(
      (products ?? []).map((p) => [p.id, p]),
    );

    // 2.c. Stock guard: never let a buyer pay for more units than are in stock,
    //       or for an item that has gone out of stock since they browsed.
    for (const item of cartItems as CartRow[]) {
      const product = productById.get(item.product_id);
      if (!product) continue; // queried above, should not happen
      const stock = product.stock === null || product.stock === undefined
        ? null // untracked → unlimited
        : Number(product.stock);
      const rawQty = Number(item.quantity);
      if (!Number.isSafeInteger(rawQty) || rawQty < 1) {
        return NextResponse.json({ error: 'Invalid cart quantity.' }, { status: 400 });
      }
      const qty = rawQty;
      if (stock !== null && (!Number.isSafeInteger(stock) || stock < 1 || qty > stock)) {
        return NextResponse.json({
          error: `One of your items is out of stock or exceeds available quantity. Please update your cart.`,
        }, { status: 409 });
      }
    }

    const priceById = new Map(
      (products ?? []).map((p) => [p.id, Number(p.price) || 0]),
    );

    // 3. Compute absolute pricing metrics in Kobo on the server side.
    // products.price is stored as bigint (kobo, see utils/money.ts), which
    // supabase-js returns as a string to avoid numeric overflow — always coerce
    // with Number() before multiplying. Quantity is multiplied so the charge
    // matches exactly what the buyer ordered — a cart row for quantity 5 must
    // cost 5 × price, never 1 × price.
    //
    // Delivery is charged per seller (one fee per seller, not a flat fee), and
    // the fee always comes from the DATABASE, never the client payload.
    const itemsTotalKobo = (cartItems as CartRow[]).reduce((acc, item) => {
      const unit = priceById.get(item.product_id) ?? 0;
      const qty = Number(item.quantity);
      if (!Number.isSafeInteger(unit) || unit < 0 || !Number.isSafeInteger(qty) || qty < 1) return Number.NaN;
      const line = unit * qty;
      if (!Number.isSafeInteger(line)) return Number.NaN;
      const next = acc + line;
      return Number.isSafeInteger(next) ? next : Number.NaN;
    }, 0);

    const deliveryFeeKobo = deliveryFeeForSellers(
      (products ?? []).map((product) => ({
        seller_id: product.seller_id,
        delivery_fee_kobo: product.delivery_fee_kobo as number | null,
      })),
    );

    // Platform earning model: goods + per-seller delivery (platform handles the
    // drop) + a tiered buyer service fee on the goods total. The buyer service
    // fee applies to every order, pickup or delivery.
    const buyerServiceFee = buyerServiceFeeKobo(itemsTotalKobo);
    const trueTotalKobo =
      itemsTotalKobo + (isPaidDelivery ? deliveryFeeKobo : 0) + buyerServiceFee;

    if (!Number.isSafeInteger(trueTotalKobo) || trueTotalKobo <= 0) {
      console.error('[paystack] invalid financial amount', {
        userId: user.id,
        trueTotalKobo,
        itemsTotalKobo,
        isPaidDelivery,
        productIds,
        priceById: Object.fromEntries(priceById),
        cartItems: JSON.stringify(cartItems),
      });
      return NextResponse.json({ error: 'Invalid financial amount calculation.' }, { status: 400 });
    }

    // 3.b. Wallet-first split: let the buyer's wallet cover as much of the total
    //       as it has; Paystack pays only the remainder. `walletKobo` is fixed
    //       here from the live balance and echoed into the Paystack metadata so
    //       the order-creation path (verify/webhook) debits the same amount via
    //       the idempotent debit_wallet ledger. The escrow value recorded later
    //       is the full product price regardless of the payment split.
    let walletKobo = 0;
    let paystackAmountKobo = trueTotalKobo;
    if (walletFirst) {
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();
      const balance = wallet ? Number(wallet.balance) : 0;
      walletKobo = Math.min(balance, trueTotalKobo);
      if (walletKobo >= trueTotalKobo) {
        // Wallet covers the entire order — go through the wallet-only route,
        // no Paystack charge. Signal the client to use /api/orders/pay-wallet.
        return NextResponse.json({ wallet_only: true, wallet_kobo: trueTotalKobo });
      }
      paystackAmountKobo = trueTotalKobo - walletKobo;
    }

    // 4. Dispatch a hidden credentialed request to Paystack's API engine
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const callbackUrl = `${origin.replace(/\/$/, '')}/buyer/orders`;

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        amount: paystackAmountKobo,
        callback_url: callbackUrl,
    // ⚡ CRITICAL CRITERIA: This metadata structure maps the transaction assets
    metadata: {
      buyer_id: user.id,
      product_ids: productIds, // Array of IDs being purchased
      checkout_items: (cartItems as CartRow[]).map((item) => ({
        product_id: item.product_id,
        quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
        unit_price_kobo: priceById.get(item.product_id) ?? 0,
      })),
      expected_total_kobo: trueTotalKobo,
      currency: 'NGN',
      purpose: 'marketplace_checkout',
      checkout_mode: buyNow ? 'buy_now' : 'cart',
      wallet_kobo: walletKobo,
      delivery_type: deliveryType,
      delivery_fee_kobo: isPaidDelivery ? deliveryFeeKobo : 0,
      buyer_fee_kobo: buyerServiceFee,
      receiver_name: receiverName,
      receiver_phone: receiverPhone,
      matric_number: matricNumber,
      delivery_address: deliveryAddress,
    }
  }),
});

    const paystackData = await paystackResponse.json();

    if (!paystackData.status) {
      return NextResponse.json({ error: 'Failed to initialize system transaction with Paystack.' }, { status: 500 });
    }

    // Pass the secure authorization portal link back out to the UI
    return NextResponse.json({ authorization_url: paystackData.data.authorization_url });

  } catch {
    return NextResponse.json({ error: 'Internal system gateway exception occurred.' }, { status: 500 });
  }
}
