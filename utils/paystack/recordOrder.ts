import type { SupabaseClient } from '@supabase/supabase-js';
import { sellerCommissionKobo, buyerServiceFeeKobo } from '@/utils/pricing';

/**
 * Shared order-creation routine for a successful Paystack payment.
 *
 * Both the inbound webhook (`/api/webhooks`) and the active confirmation
 * (`/api/paystack/verify`, run by the buyer's browser) end up calling this. The
 * webhook uses a service-role client (no user session); the verify route uses
 * the cookie client for the authenticated buyer, which is still able to write
 * thanks to RLS. It computes prices from the database and quantity from the
 * buyer's cart rows — never from the (spoofable) payment payload — so escrowing
 * quantity N charges N × price.
 *
 * Invariants:
 *  - One `orders` row per (order_ref, product_id) — the unique index makes a
 *    retry or a webhook+verify race a no-op instead of a duplicate. Therefore it
 *    is safe to call from both paths.
 *  - Only the products represented in `productIds` are cleared from the cart, so
 *    anything the buyer added after checkout is preserved.
 */
export const ESCROW_HELD_STATUS = 'in_escrow';

/** A short, web-safe handoff code shared by every row of one order_ref. */
export function generateDeliveryCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 for clarity
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `FHSI-${code}`;
}

export interface RecordOrderInput {
  buyerId: string;
  reference: string;
  productIds: string[];
  deliveryType: 'pickup' | 'delivery';
  deliveryFeeKobo: number;
  receiverName: string | null;
  receiverPhone: string | null;
  matricNumber: string | null;
  deliveryAddress: string | null;
  /**
   * Kobo to pull from the buyer's wallet as part of a wallet-first split
   * payment. The remainder of the (recomputed) total is what Paystack charged.
   * This is deducted exactly once via the unique `wallet_debits.order_ref`
   * ledger, so recordOrder being called for the same reference by both the
   * webhook and the browser verify never double-charges the wallet.
   */
  walletKobo?: number;
}

export async function recordOrder(
  supabase: SupabaseClient,
  input: RecordOrderInput,
): Promise<number> {
  // Wallet-first split payment: debit the buyer's wallet for the agreed amount
  // before escrowing anything, so an insufficient wallet aborts with no side
  // effects. `debit_wallet` is a SECURITY DEFINER function that runs atomically:
  // it only decrements when the balance still covers the amount, records the
  // debit in the wallet_debits ledger (unique on order_ref, so the webhook +
  // verify race for the same reference only charges once), and returns false
  // when the balance is too low. No order/escrow/cart rows have been written at
  // this point, so a failure here leaves the system untouched.
  const walletKobo = Math.floor(Number(input.walletKobo) || 0);
  if (walletKobo > 0) {
    const { data: ok, error: debitError } = await supabase.rpc('debit_wallet', {
      p_user_id: input.buyerId,
      p_order_ref: input.reference,
      p_amount_kobo: walletKobo,
    });
    if (debitError) throw debitError;
    if (ok !== true) {
      throw new Error('Wallet balance is insufficient to complete the order.');
    }
  }

  // Prices come from the database, never from the caller — the same rule
  // /api/paystack follows when it computes the amount to charge.
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, price, seller_id, stock')
    .in('id', input.productIds);

  if (productsError) throw productsError;
  if (!products || products.length === 0) {
    throw new Error('no products matched product_ids');
  }

  // Quantity lives in this buyer's `carts` rows (set at checkout), never in the
  // request payload, so an order for quantity 5 is escrowed at 5 × price, not
  // 1 × price — closing the undercharging/fraud case.
  const { data: cartRows, error: cartRowsError } = await supabase
    .from('carts')
    .select('product_id, quantity')
    .eq('user_id', input.buyerId)
    .in('product_id', input.productIds);

  if (cartRowsError) throw cartRowsError;

  const qtyByProduct = new Map(
    (cartRows || []).map((row) => [
      row.product_id,
      Number(row.quantity) > 0 ? Number(row.quantity) : 1,
    ]),
  );

  // Stock guard: refuse to escrow more units than are in stock. The initial
  // checkout route also checks, but the webhook/verify path re-checks here so a
  // stale cart (or stock that changed mid-payment) cannot oversell.
  const stockByProduct = new Map(products.map((p) => [p.id, p.stock]));
  for (const product of products) {
    const stock = stockByProduct.get(product.id);
    const qty = qtyByProduct.get(product.id) ?? 1;
    if (stock !== null && stock !== undefined && (Number(stock) < 1 || qty > Number(stock))) {
      throw new Error(`insufficient stock for product ${product.id}`);
    }
  }

  // `orders` requires several NOT NULL columns; give safe defaults until fee
  // and meetup logic exist. `meetup_time` is NOT NULL, so keep it a day out for
  // buyer and seller to agree a real time.
  const meetupTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // One short code shared by every row of this order (all sellers, all items),
  // so the buyer and the delivery/admin person hand it over as a single order.
  const deliveryCode = generateDeliveryCode();

  const { error: ordersError } = await supabase.from('orders').upsert(
    products.map((product) => {
      const quantity = qtyByProduct.get(product.id) ?? 1;
      const amountKobo = product.price * quantity;
      return {
        buyer_id: input.buyerId,
        seller_id: product.seller_id,
        product_id: product.id,
        amount_kobo: amountKobo,
        quantity,
        order_ref: input.reference,
        delivery_code: deliveryCode,
        status: ESCROW_HELD_STATUS,
        // 3% commission on THIS product's goods; kept by the platform when the
        // seller is paid `amount - platform_fee` on confirmation.
        platform_fee_kobo: sellerCommissionKobo(amountKobo),
        meetup_location:
          input.deliveryType === 'delivery'
            ? 'Delivery to buyer'
            : 'On-campus pickup',
        meetup_time: meetupTime,
        delivery_type: input.deliveryType,
        delivery_fee_kobo: input.deliveryFeeKobo,
        receiver_name: input.receiverName,
        receiver_phone: input.receiverPhone,
        matric_number: input.matricNumber,
        delivery_address: input.deliveryAddress,
      };
    }),
    { onConflict: 'order_ref,product_id', ignoreDuplicates: true },
  );

  if (ordersError) throw ordersError;

  // Fetch the rows we just escrowed so we can create matching escrow ledger
  // entries and (later) credit the seller's wallet from them. Upserts do not
  // return the new IDs, so read them back by reference.
  const { data: createdOrders, error: createdOrdersError } = await supabase
    .from('orders')
    .select('id, seller_id, product_id, amount_kobo')
    .eq('order_ref', input.reference);
  if (createdOrdersError) throw createdOrdersError;

  // One escrow ledger row per escrowed order, held until the buyer confirms
  // receipt. `webhook_event` and `gateway_ref` are NOT NULL; `gateway_ref` is
  // UNIQUE system-wide, so suffix it with the product id — two products in the
  // same order_ref (a combined multi-seller order) must not collide.
  const deliveryFeeKobo = Math.floor(Number(input.deliveryFeeKobo) || 0);
  if (createdOrders && createdOrders.length > 0) {
    const productEscrows =
      createdOrders.map((order) => ({
        order_id: order.id,
        payment_gateway: 'paystack',
        gateway_ref: `${input.reference}:P${order.product_id}`,
        webhook_event: 'charge.success',
        amount_kobo: order.amount_kobo,
        status: 'held',
      }));

    const { error: escrowError } = await supabase.from('escrow_transactions').upsert(
      productEscrows,
      { onConflict: 'gateway_ref', ignoreDuplicates: true },
    );
    if (escrowError) throw escrowError;
  }

  // The buyer pays delivery once per combined order. Escrow it as its own row
  // (distinct gateway_ref) so the platform collects it on confirmation; a
  // cancellation/refund returns it with the product money.
  if (deliveryFeeKobo > 0 && createdOrders && createdOrders.length > 0) {
    const { error: deliveryEscrowError } = await supabase
      .from('escrow_transactions')
      .upsert(
        [{
          order_id: createdOrders[0].id,
          payment_gateway: 'paystack',
          gateway_ref: `${input.reference}:DELIVERY`,
          webhook_event: 'charge.success',
          amount_kobo: deliveryFeeKobo,
          status: 'held',
        }],
        { onConflict: 'gateway_ref', ignoreDuplicates: true },
      );
    if (deliveryEscrowError) throw deliveryEscrowError;
  }

  // The tiered buyer service fee backs the platform's operating cost and is
  // charged on EVERY order. Recomputed here from the goods total (never from
  // the client) so it matches the Paystack charge exactly, and escrowed in its
  // own row; the platform collects it on confirmation and a refund returns it.
  if (createdOrders && createdOrders.length > 0) {
    const goodsTotal = createdOrders.reduce(
      (acc, o) => acc + Number(o.amount_kobo) || 0,
      0,
    );
    const buyerFeeKobo = buyerServiceFeeKobo(goodsTotal);
    if (buyerFeeKobo > 0) {
      const { error: buyerFeeError } = await supabase
        .from('escrow_transactions')
        .upsert(
          [{
            order_id: createdOrders[0].id,
            payment_gateway: 'paystack',
            gateway_ref: `${input.reference}:FEES`,
            webhook_event: 'charge.success',
            amount_kobo: buyerFeeKobo,
            status: 'held',
          }],
          { onConflict: 'gateway_ref', ignoreDuplicates: true },
        );
      if (buyerFeeError) throw buyerFeeError;
    }
  }

  const { error: soldError } = await supabase
    .from('products')
    .update({ is_sold: true })
    .in('id', products.map((product) => product.id));
  if (soldError) throw soldError;

  // Decrement tracked stock. Row-level decrement keeps this atomic even when
  // two buyers pay around the same time; products with NULL stock (untracked /
  // unlimited) are left untouched.
  for (const product of products) {
    if (product.stock === null || product.stock === undefined) continue;
    const qty = qtyByProduct.get(product.id) ?? 1;
    const { error: stockError } = await supabase
      .from('products')
      .update({ stock: Number(product.stock) - qty })
      .eq('id', product.id);
    if (stockError) throw stockError;
  }

  // Only clear what was actually bought, not the whole cart.
  const { error: cartError } = await supabase
    .from('carts')
    .delete()
    .eq('user_id', input.buyerId)
    .in('id', products.map((product) => product.id));
  if (cartError) throw cartError;

  return walletKobo;
}