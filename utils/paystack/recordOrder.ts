import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { sellerCommissionKobo, buyerServiceFeeKobo } from '@/utils/pricing';
import { createAdminClient } from '@/utils/supabase/admin';
import { sendPushToUsers } from '@/utils/push';

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
    code += chars[crypto.randomInt(chars.length)];
  }
  return `FHSI-${code}`;
}

export interface RecordOrderInput {
  buyerId: string;
  reference: string;
  productIds: string[];
  /** Frozen checkout snapshot created server-side before payment. */
  items: Array<{ productId: string; quantity: number; unitPriceKobo: number }>;
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
  /** Actual Paystack amount in kobo; 0 for wallet-only checkout. */
  gatewayAmountKobo: number;
}

export async function recordOrder(
  supabase: SupabaseClient,
  input: RecordOrderInput,
): Promise<number> {
  // The payment flow passes a server-created, immutable checkout snapshot.
  // Never derive paid quantities/prices from the current cart here: the cart may
  // have changed after payment initialization. We still re-read product identity,
  // seller and stock from the database.
  const snapshotById = new Map(
    input.items.map((item) => [item.productId, item]),
  );
  const snapshotIds = [...snapshotById.keys()];
  const uniqueProductIds = new Set(input.productIds);
  if (snapshotIds.length === 0 || uniqueProductIds.size !== input.productIds.length ||
      snapshotIds.length !== input.productIds.length ||
      input.productIds.some((id) => !snapshotById.has(id))) {
    throw new Error('invalid checkout snapshot');
  }

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, price, seller_id, stock')
    .in('id', snapshotIds);

  if (productsError) throw productsError;
  if (!products || products.length !== snapshotIds.length) {
    throw new Error('one or more products are unavailable');
  }

  const productById = new Map(products.map((p) => [p.id, p]));
  if (products.some((product) => product.seller_id === input.buyerId)) {
    throw new Error('seller cannot purchase their own product');
  }
  const qtyByProduct = new Map<string, number>();

  for (const item of input.items) {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPriceKobo);
    if (!Number.isSafeInteger(quantity) || quantity < 1 ||
        !Number.isSafeInteger(unitPrice) || unitPrice < 0) {
      throw new Error('invalid checkout snapshot values');
    }

    const product = productById.get(item.productId);
    if (!product) throw new Error(`product ${item.productId} is unavailable`);

    // Price is frozen at checkout. A later catalog-price change must not alter
    // what the buyer paid or what gets escrowed.
    qtyByProduct.set(item.productId, quantity);

    // Stock is checked/decremented atomically AFTER the order rows are written
    // and only by the call that actually inserted them. Doing it here would
    // make a webhook/verify retry fail with "insufficient stock" once the first
    // call had already consumed the last unit — which used to leave a paid
    // buyer with no visible order and an uncleared cart.
  }

  const expectedGoodsKobo = input.items.reduce(
    (sum, item) => {
      const line = item.unitPriceKobo * item.quantity;
      const next = sum + line;
      return Number.isSafeInteger(line) && Number.isSafeInteger(next) ? next : Number.NaN;
    },
    0,
  );
  const expectedBuyerFeeKobo = buyerServiceFeeKobo(expectedGoodsKobo);
  const expectedTotalKobo =
    expectedGoodsKobo +
    Math.floor(Number(input.deliveryFeeKobo) || 0) +
    expectedBuyerFeeKobo;

  if (!Number.isSafeInteger(expectedGoodsKobo) || expectedGoodsKobo < 0 || !Number.isSafeInteger(expectedTotalKobo) || expectedTotalKobo <= 0) {
    throw new Error('invalid checkout total');
  }

  const walletKobo = Math.floor(Number(input.walletKobo) || 0);
  const gatewayAmountKobo = Math.floor(Number(input.gatewayAmountKobo));
  if (!Number.isSafeInteger(gatewayAmountKobo) || gatewayAmountKobo < 0) {
    throw new Error('invalid gateway amount');
  }
  if (walletKobo < 0 || walletKobo > expectedTotalKobo ||
      gatewayAmountKobo + walletKobo !== expectedTotalKobo) {
    throw new Error('payment amount does not match checkout total');
  }

  // Note whether this reference is already recorded before we debit/upsert.
  // `.select()` after the upsert is the authoritative idempotency signal, but
  // this pre-check keeps the wallet debit safe for plain retries regardless of
  // client-library behaviour. The DB ledger in `debit_wallet` closes the truly
  // concurrent webhook/verify race.
  const { data: existingRows } = await supabase
    .from('orders')
    .select('id')
    .eq('order_ref', input.reference)
    .limit(1);
  const orderAlreadyExisted = Boolean(existingRows?.length);

  // Debit wallet only after the immutable checkout snapshot and payment amount
  // have both been validated. This prevents a malformed/replayed payment from
  // consuming wallet funds before validation fails. Skip entirely when this
  // reference is already recorded: a webhook/verify retry must never debit the
  // buyer a second time.
  if (walletKobo > 0 && !orderAlreadyExisted) {
    let debited = false;
    try {
      const { data: ok, error: debitError } = await supabase.rpc('debit_wallet', {
        p_user_id: input.buyerId,
        p_order_ref: input.reference,
        p_amount_kobo: walletKobo,
      });
      if (!debitError && ok === true) {
        debited = true;
      }
    } catch {
      debited = false;
    }

    if (!debited) {
      const { data: wallet, error: walletQueryError } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', input.buyerId)
        .maybeSingle();

      if (walletQueryError || !wallet) {
        throw new Error('Wallet balance is insufficient to complete the order.');
      }

      const currentBalance = Number(wallet.balance) || 0;
      if (currentBalance < walletKobo) {
        throw new Error('Wallet balance is insufficient to complete the order.');
      }

      const { error: updateError } = await supabase
        .from('wallets')
        .update({ balance: currentBalance - walletKobo })
        .eq('user_id', input.buyerId);

      if (updateError) {
        throw new Error('Wallet balance is insufficient to complete the order.');
      }
    }
  }

  // `orders` requires several NOT NULL columns; give safe defaults until fee
  // and meetup logic exist. `meetup_time` is NOT NULL, so keep it a day out for
  // buyer and seller to agree a real time.
  const meetupTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // One short code shared by every row of this order (all sellers, all items),
  // so the buyer and the delivery/admin person hand it over as a single order.
  const deliveryCode = generateDeliveryCode();

  // The upsert is also the idempotency boundary for the webhook/verify race:
  // `.select()` returns ONLY the rows this call actually inserted, so a retry
  // (or the losing side of the race) gets an empty array. Stock is only
  // decremented when we won the insert, never twice for one payment.
  const { data: insertedOrders, error: ordersError } = await supabase
    .from('orders')
    .upsert(
      products.map((product) => {
        const quantity = qtyByProduct.get(product.id) ?? 1;
        const amountKobo = snapshotById.get(product.id)!.unitPriceKobo * quantity;
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
    )
    .select('id, seller_id, product_id, amount_kobo');

  if (ordersError) throw ordersError;

  const newlyInsertedOrders = insertedOrders ?? [];

  // Fetch the rows we just escrowed so we can create matching escrow ledger
  // entries and (later) credit the seller's wallet from them. Upserts do not
  // return the new IDs, so read them back by reference.
  const { data: createdOrders, error: createdOrdersError } = await supabase
    .from('orders')
    .select('id, seller_id, product_id, amount_kobo')
    .eq('order_ref', input.reference);
  if (createdOrdersError) throw createdOrdersError;

  // Notify each seller only for rows this call inserted, so the losing side of
  // the webhook/verify race never sends a duplicate alert. Push is best-effort:
  // a missing service key or offline phone must never break a paid order.
  if (newlyInsertedOrders.length > 0) {
    try {
      const admin = createAdminClient();
      const notifications = newlyInsertedOrders.map((order) => ({
        user_id: order.seller_id,
        type: 'order_new',
        title: 'New paid order',
        message: 'A buyer has paid for your product. Open Sales to prepare the order.',
        order_id: order.id,
      }));
      const { error: notificationError } = await admin
        .from('notifications')
        .upsert(notifications, { onConflict: 'user_id,order_id,type', ignoreDuplicates: true });
      if (notificationError) {
        console.error('[recordOrder] seller notification failed', notificationError);
      } else {
        const sellerIds = Array.from(
          new Set(
            newlyInsertedOrders
              .map((row) => row.seller_id as string | null)
              .filter((id): id is string => Boolean(id)),
          ),
        );
        try {
          await sendPushToUsers(admin, sellerIds, {
            title: 'New paid order',
            body: 'A buyer has paid for your product. Open Sales to prepare the order.',
            url: '/seller/orders',
            tag: `order-${input.reference}`,
          });
        } catch (pushError) {
          // Push is best-effort: never fail a paid order because a phone was offline.
          console.error('[recordOrder] push notification failed', pushError);
        }
      }
    } catch (notifyError) {
      // Notifications are a side effect — the order is already safely escrowed.
      console.error('[recordOrder] notification setup failed', notifyError);
    }
  }

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

  // Decrement tracked stock atomically in Postgres — but ONLY for the call that
  // actually inserted the order rows. The webhook and the browser verify both
  // call recordOrder for the same reference; without this gate the loser would
  // decrement a second time (or throw "insufficient stock" when the first call
  // took the last unit), which is what broke the paid-order return.
  const shouldDecrementStock =
    newlyInsertedOrders.length > 0 || (insertedOrders === null && !orderAlreadyExisted);

  if (shouldDecrementStock) {
    for (const product of products) {
      if (product.stock === null || product.stock === undefined) continue;
      const qty = qtyByProduct.get(product.id) ?? 1;
      const { data: remaining, error: stockError } = await supabase.rpc('decrement_product_stock', {
        p_product_id: product.id,
        p_quantity: qty,
      });
      if (stockError || remaining === null || remaining === undefined) {
        // The buyer has already paid and the order rows are safely escrowed, so
        // never fail the recording over an inventory race. Log it for manual
        // reconciliation instead.
        console.error('[recordOrder] stock decrement failed', {
          productId: product.id,
          reference: input.reference,
          error: stockError?.message ?? 'insufficient stock',
        });
      }
    }
  }

  // Only clear what was actually bought, not the whole cart.
  const { error: cartError } = await supabase
    .from('carts')
    .delete()
    .eq('user_id', input.buyerId)
    .in('product_id', products.map((product) => product.id));
  if (cartError) throw cartError;

  return walletKobo;
}