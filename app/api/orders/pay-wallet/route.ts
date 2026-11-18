import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { recordOrder } from '@/utils/paystack/recordOrder';
import { buyerServiceFeeKobo, deliveryFeeForOrder } from '@/utils/pricing';
import { checkoutDatabaseReady } from '@/utils/paystack/checkoutReady';
import { cleanOption, normalizeVariantKey, resolveProductOptions } from '@/utils/variants';
import { accountIsActive } from '@/utils/account';

type CartRow = {
  product_id: string;
  quantity: number;
  size?: string | null;
  color?: string | null;
  variant_key?: string | null;
};

type CartLine = {
  productId: string;
  variantKey: string;
  size: string | null;
  color: string | null;
  quantity: number;
};

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

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized system access request.' }, { status: 401 });
    }
    if (!(await accountIsActive(supabase, user.id))) {
      return NextResponse.json({ error: 'This account is suspended.' }, { status: 403 });
    }

    const admin = createAdminClient();
    const checkoutReady = await checkoutDatabaseReady(admin);
    if (!checkoutReady.ready) {
      console.error('[orders/pay-wallet] checkout database is not ready', checkoutReady.reason);
      return NextResponse.json({
        error: 'Checkout is temporarily unavailable while the order database is being updated. Your wallet was not charged.',
      }, { status: 503 });
    }

    const { data: cartItems, error: cartError } = await supabase
      .from('carts')
      .select('product_id, quantity, size, color, variant_key')
      .eq('user_id', user.id);
    if (cartError || !cartItems || cartItems.length === 0) {
      return NextResponse.json({ error: 'Shopping cart ledger is empty.' }, { status: 400 });
    }
    const cartLines: CartLine[] = (cartItems as CartRow[]).map((item) => {
      const size = cleanOption(item.size) || null;
      const color = cleanOption(item.color) || null;
      const variantKey =
        typeof item.variant_key === 'string'
          ? item.variant_key
          : normalizeVariantKey(size, color);
      return {
        productId: item.product_id,
        variantKey,
        size,
        color,
        quantity: Number(item.quantity),
      };
    });
    const productIds = [...new Set(cartLines.map((line) => line.productId))];

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .in('id', productIds);
    if (productsError || !products) {
      return NextResponse.json({ error: 'Internal system pricing error.' }, { status: 500 });
    }
    if (products.length !== productIds.length || products.some((product) => product.is_available === false)) {
      return NextResponse.json({
        error: 'One or more products are no longer available. Refresh your cart before paying.',
      }, { status: 409 });
    }

    const productById = new Map(products.map((product) => [product.id, product]));
    for (const line of cartLines) {
      const product = productById.get(line.productId);
      const resolved = product
        ? resolveProductOptions(product, line.size, line.color)
        : null;
      if (!resolved || line.variantKey !== resolved.variantKey) {
        return NextResponse.json({
          error: 'A product option in your cart is no longer available. Remove that item, choose its size or colour again, and retry.',
        }, { status: 409 });
      }
      line.size = resolved.size;
      line.color = resolved.color;
      line.variantKey = resolved.variantKey;
    }

    const lineKeys = cartLines.map((line) => `${line.productId}::${line.variantKey}`);
    if (new Set(lineKeys).size !== lineKeys.length) {
      return NextResponse.json({
        error: 'Your cart contains duplicate product options. Remove the duplicate item and try again.',
      }, { status: 409 });
    }

    const qtyByProduct = new Map<string, number>();
    for (const line of cartLines) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
        return NextResponse.json({ error: 'Invalid cart quantity.' }, { status: 400 });
      }
      qtyByProduct.set(
        line.productId,
        (qtyByProduct.get(line.productId) ?? 0) + line.quantity,
      );
    }

    for (const [productId, quantity] of qtyByProduct) {
      const product = productById.get(productId);
      const stock = product?.stock === null || product?.stock === undefined
        ? null
        : Number(product.stock);
      if (!product) {
        return NextResponse.json({ error: 'Invalid cart quantity.' }, { status: 400 });
      }
      if (stock !== null && (!Number.isSafeInteger(stock) || stock < quantity)) {
        return NextResponse.json({
          error: 'One item has sold out or does not have enough stock. Refresh your cart and try again.',
        }, { status: 409 });
      }
    }

    // Same guard as the card route: refuse a self-purchase before the wallet is
    // debited, because recordOrder would reject it after the money moved.
    const ownProducts = products.filter((product) => product.seller_id === user.id);
    if (ownProducts.length > 0) {
      const names = ownProducts.map((product) => `“${product.title}”`).join(', ');
      console.error('[orders/pay-wallet] self-purchase blocked', {
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

    const priceById = new Map((products ?? []).map((p) => [p.id, Number(p.price) || 0]));

    const itemsTotalKobo = cartLines.reduce((acc, item) => {
      const unit = priceById.get(item.productId) ?? 0;
      const quantity = item.quantity;
      const line = unit * quantity;
      const next = acc + line;
      return Number.isSafeInteger(line) && Number.isSafeInteger(next) ? next : Number.NaN;
    }, 0);
    const buyerFeeKobo = buyerServiceFeeKobo(itemsTotalKobo);
    // One delivery charge per seller, priced from the database.
    const deliveryFeeKobo = deliveryFeeForOrder(products ?? []);
    const chargedDeliveryKobo = isPaidDelivery ? deliveryFeeKobo : 0;
    const totalKobo = itemsTotalKobo + chargedDeliveryKobo + buyerFeeKobo;
    if (!Number.isSafeInteger(totalKobo) || totalKobo <= 0) {
      return NextResponse.json({ error: 'Invalid financial amount calculation.' }, { status: 400 });
    }

    let { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!wallet) {
      await admin.from('wallets').upsert({ user_id: user.id, balance: 0 }, { onConflict: 'user_id' });
      wallet = { balance: 0 };
    }

    const currentBalanceKobo = Number(wallet.balance) || 0;
    if (currentBalanceKobo < totalKobo) {
      const { formatNaira } = await import('@/utils/money');
      return NextResponse.json({
        error: `Insufficient wallet balance. Your balance is ₦${formatNaira(currentBalanceKobo)}, but this order total is ₦${formatNaira(totalKobo)}. Add funds or pay via card/transfer.`,
      }, { status: 400 });
    }

    // Fresh wallet reference: unique per checkout, so the idempotent wallet
    // debit runs once and two separate checkouts of the same items cannot
    // collide into one reference (which would silently skip the second debit
    // and insert no new order).
    const walletRef = `WAL-${crypto.createHash('sha256').update(JSON.stringify({
      nonce: crypto.randomUUID(),
      userId: user.id,
      productIds,
      items: cartLines.map((item) => ({
        productId: item.productId,
        variantKey: item.variantKey,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        unitPriceKobo: priceById.get(item.productId) ?? 0,
      })),
      deliveryType,
      deliveryFeeKobo: chargedDeliveryKobo,
      receiverName,
      receiverPhone,
      matricNumber,
      deliveryAddress,
    })).digest('hex').slice(0, 32)}`;

    await recordOrder(admin, {
      buyerId: user.id,
      reference: walletRef,
      productIds,
      items: cartLines.map((item) => ({
        productId: item.productId,
        variantKey: item.variantKey,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        unitPriceKobo: priceById.get(item.productId) ?? 0,
      })),
      deliveryType,
      deliveryFeeKobo: chargedDeliveryKobo,
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
    console.error('[orders/pay-wallet] error details:', err);
    const message = err instanceof Error ? err.message : String(err || '');
    if (message.includes('own product')) {
      return NextResponse.json({ error: 'You cannot purchase your own product.' }, { status: 400 });
    }
    if (message.includes('insufficient') || message.includes('balance')) {
      return NextResponse.json({ error: 'Your wallet balance is not enough for this order.' }, { status: 400 });
    }
    if (message.includes('stock')) {
      return NextResponse.json({ error: 'One item has just sold out or does not have enough stock. Refresh your cart and try again.' }, { status: 409 });
    }
    return NextResponse.json({ error: message || 'We could not complete the wallet payment. Please try again or use card/transfer.' }, { status: 500 });
  }
}
