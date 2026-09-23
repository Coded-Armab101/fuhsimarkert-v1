import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { rateLimit, PAYMENT_INIT_LIMIT } from '@/utils/rate-limit';
import { DELIVERY_FEE_KOBO, buyerServiceFeeKobo } from '@/utils/pricing';

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
    try {
      const body = await request.json();
      delivery = body?.delivery ?? {};
      walletFirst = body?.walletFirst === true;
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

    // 2.b. Prices come from the database, never from the client. Fetch the
    //       authoritative unit price AND availability/stock for each product
    //       with an explicit query.
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, price, stock')
      .in('id', productIds);

    if (productsError || !products) {
      console.error('[paystack] products query failed', { userId: user.id, productsError: productsError?.message });
      return NextResponse.json({ error: 'Internal system pricing error.' }, { status: 500 });
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
      const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
      if (stock !== null && (stock < 1 || qty > stock)) {
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
    // cost 5 × price, never 1 × price. The flat delivery fee (₦500) is added
    // only when the buyer chose doorstep delivery rather than campus pickup.
    const itemsTotalKobo = (cartItems as CartRow[]).reduce((acc, item) => {
      const unit = priceById.get(item.product_id) ?? 0;
      const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
      return acc + unit * qty;
    }, 0);

    // Platform earning model: goods + the flat delivery fee (platform handles
    // this drop) + a tiered buyer service fee on the goods total. The buyer
    // service fee applies to every order, pickup or delivery.
    const buyerServiceFee = buyerServiceFeeKobo(itemsTotalKobo);
    const trueTotalKobo =
      itemsTotalKobo + (isPaidDelivery ? DELIVERY_FEE_KOBO : 0) + buyerServiceFee;

    if (!Number.isFinite(trueTotalKobo) || trueTotalKobo <= 0) {
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
const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: user.email,
    amount: paystackAmountKobo,
    callback_url: `${process.env.NEXT_PUBLIC_SITE_URL}/buyer/cart`,
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
      wallet_kobo: walletKobo,
      delivery_type: deliveryType,
      delivery_fee_kobo: isPaidDelivery ? DELIVERY_FEE_KOBO : 0,
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