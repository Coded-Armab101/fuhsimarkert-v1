import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { recordOrder } from '@/utils/paystack/recordOrder';
import { DELIVERY_FEE_KOBO, buyerServiceFeeKobo } from '@/utils/pricing';
import { rateLimit, PAYMENT_INIT_LIMIT } from '@/utils/rate-limit';

/**
 * Wallet-only checkout: the buyer's wallet balance covers the entire order, so
 * no Paystack charge is needed. The amount is recomputed server-side from the
 * carts table (never from the client), verified against the wallet balance, and
 * the wallet is debited atomically + idempotently via recordOrder's debit_wallet
 * path using a fresh wallet reference. Escrow/order/stock/cart handling is 100%
 * shared with the card path via recordOrder, so a wallet order behaves exactly
 * like a card order once escrowed.
 */

export async function POST(request: Request) {
  try {
    let delivery;
    try {
      const body = await request.json();
      delivery = body?.delivery ?? {};
    } catch {
      delivery = {};
    }
    const deliveryType = delivery.type === 'delivery' ? 'delivery' : 'pickup';
    const receiverName = String(delivery.name || '').trim();
    const receiverPhone = String(delivery.phone || '').trim();
    const matricNumber = String(delivery.matric || '').trim();
    const deliveryAddress = deliveryType === 'delivery' ? String(delivery.address || '').trim() : null;
    const isPaidDelivery = deliveryType === 'delivery';
    if (receiverName.length > 120 || receiverPhone.length > 32 || matricNumber.length > 64 || deliveryAddress !== null && deliveryAddress.length > 300) {
      return NextResponse.json({ error: 'Delivery details are too long.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized system access request.' }, { status: 401 });
    }

    const limit = rateLimit({ key: `wallet-checkout:${user.id}`, ...PAYMENT_INIT_LIMIT });
    if (!limit.ok) {
      return NextResponse.json({ error: 'Too many checkout attempts. Please wait a moment and try again.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
    }

    const { data: cartItems, error: cartError } = await supabase
      .from('carts')
      .select('product_id, quantity')
      .eq('user_id', user.id);
    if (cartError || !cartItems || cartItems.length === 0) {
      return NextResponse.json({ error: 'Shopping cart ledger is empty.' }, { status: 400 });
    }
    const normalizedCart = (cartItems as { product_id: string; quantity: number }[]).map((i) => ({
      product_id: String(i.product_id),
      quantity: Number(i.quantity),
    }));
    if (normalizedCart.length > 100 || normalizedCart.some((i) => !i.product_id || !Number.isSafeInteger(i.quantity) || i.quantity < 1)) {
      return NextResponse.json({ error: 'Invalid cart contents.' }, { status: 400 });
    }
    const productIds = normalizedCart.map((i) => i.product_id);
    if (new Set(productIds).size !== productIds.length) {
      return NextResponse.json({ error: 'Duplicate cart items are not allowed.' }, { status: 400 });
    }

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, price, stock')
      .in('id', productIds);
    if (productsError || !products || products.length !== productIds.length) {
      return NextResponse.json({ error: 'Internal system pricing error.' }, { status: 500 });
    }
    const priceById = new Map<string, number>();
    for (const product of products) {
      const price = Number(product.price);
      if (!Number.isSafeInteger(price) || price < 0) {
        return NextResponse.json({ error: 'Invalid product price.' }, { status: 500 });
      }
      priceById.set(product.id, price);
    }

    const itemsTotalKobo = (cartItems as { product_id: string; quantity: number }[]).reduce((acc, item) => {
      const unit = priceById.get(item.product_id) ?? 0;
      const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
      return acc + unit * qty;
    }, 0);
    const buyerFeeKobo = buyerServiceFeeKobo(itemsTotalKobo);
    const totalKobo = itemsTotalKobo + (isPaidDelivery ? DELIVERY_FEE_KOBO : 0) + buyerFeeKobo;
    if (!Number.isSafeInteger(itemsTotalKobo) || !Number.isSafeInteger(buyerFeeKobo) ||
        !Number.isSafeInteger(totalKobo) || totalKobo <= 0) {
      return NextResponse.json({ error: 'Invalid financial amount calculation.' }, { status: 400 });
    }

    // Fresh wallet reference: unique, so the idempotent wallet debit runs once.
    const walletRef = `WAL-${crypto.createHash('sha256').update(JSON.stringify({
      userId: user.id,
      productIds,
      items: (cartItems as { product_id: string; quantity: number }[]).map((item) => ({
        productId: item.product_id,
        quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
        unitPriceKobo: priceById.get(item.product_id) ?? 0,
      })),
      deliveryType,
      receiverName,
      receiverPhone,
      matricNumber,
      deliveryAddress,
    })).digest('hex').slice(0, 32)}`;

    const admin = createAdminClient();
    await recordOrder(admin, {
      buyerId: user.id,
      reference: walletRef,
      productIds,
      items: (cartItems as { product_id: string; quantity: number }[]).map((item) => ({
        productId: item.product_id,
        quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
        unitPriceKobo: priceById.get(item.product_id) ?? 0,
      })),
      deliveryType,
      deliveryFeeKobo: isPaidDelivery ? DELIVERY_FEE_KOBO : 0,
      receiverName,
      receiverPhone,
      matricNumber,
      deliveryAddress,
      walletKobo: totalKobo,
      gatewayAmountKobo: 0,
    });

    return NextResponse.json({
      ok: true,
      status: 'in_escrow',
      reference: walletRef,
      wallet_kobo: totalKobo,
    });
  } catch (err) {
    console.error('[orders/pay-wallet] error:', err);
    const message = err instanceof Error ? err.message : '';
    if (message.includes('insufficient') || message.includes('balance')) {
      return NextResponse.json({ error: 'Your wallet balance is not enough for this order.' }, { status: 400 });
    }
    if (message.includes('stock')) {
      return NextResponse.json({ error: 'One item has just sold out or does not have enough stock. Refresh your cart and try again.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'We could not complete the wallet payment. Please try again or use card/transfer.' }, { status: 500 });
  }
}
