/**
 * Platform pricing — the single source of truth for every fee, split, and the
 * delivery charge. Both the Paystack charge (`/api/paystack`) and the ledger
 * creation (`utils/paystack/recordOrder` → the confirm/dispute SQL) MUST read
 * from here so the amount charged to the buyer always equals what is escrowed
 * and what is paid out. Money is integer kobo everywhere (see utils/money.ts).
 *
 * Earning model (per the product decisions):
 *  - 3% commission deducted from each seller's goods on confirmation.
 *  - A tiered buyer service fee added to every order (platform revenue).
 *  - A flat one-time delivery fee charged when delivery is chosen; the platform
 *    handles the drop and pays the delivery person outside this app.
 */

/** Flat platform delivery charge for one combined order: ₦1,000. */
export const DELIVERY_FEE_KOBO = 100_000;

/**
 * Delivery is flat per combined order, even when it contains several sellers.
 * The item argument is retained so an empty checkout never receives a fee.
 */
export function deliveryFeeForOrder(
  items: Array<unknown>,
): number {
  return items.length > 0 ? DELIVERY_FEE_KOBO : 0;
}


/** Seller commission, as a whole percent off the goods value. */
export const SELLER_COMMISSION_PERCENT = 3;

/** Buyer service-fee tiers: breakpoints on the goods total (kobo) → fee (kobo). */
const BUYER_FEE_TIERS: { upToKobo: number; feeKobo: number }[] = [
  { upToKobo: 500000, feeKobo: 5000 },     // goods ≤ ₦5,000   → ₦50
  { upToKobo: 2_000_000, feeKobo: 10000 }, // goods ≤ ₦20,000  → ₦100
  { upToKobo: Infinity, feeKobo: 15000 },  // goods > ₦20,000  → ₦150
];

/**
 * The buyer service fee for a given goods total (kobo). Tiered by order value;
 * applies to every order (pickup and delivery alike).
 */
export function buyerServiceFeeKobo(goodsTotalKobo: number): number {
  const goods = Number(goodsTotalKobo) || 0;
  for (const tier of BUYER_FEE_TIERS) {
    if (goods <= tier.upToKobo) return tier.feeKobo;
  }
  return BUYER_FEE_TIERS[BUYER_FEE_TIERS.length - 1].feeKobo;
}

/**
 * The platform's commission on a seller's goods value (kobo). Always rounds
 * DOWN to whole kobo so the payout never exceeds what revenue allows.
 */
export function sellerCommissionKobo(goodsKobo: number): number {
  return Math.floor((Number(goodsKobo) || 0) * SELLER_COMMISSION_PERCENT / 100);
}

/** What a seller is paid on confirmation for their goods value (kobo). */
export function sellerPayoutForGoodsKobo(goodsKobo: number): number {
  return Math.max(0, (Number(goodsKobo) || 0) - sellerCommissionKobo(goodsKobo));
}

/* -------------------------------------------------------------------------- */
/* Seller percentage-off discounts                                            */
/* -------------------------------------------------------------------------- */

/** The subset of a product row needed to work out its effective price. */
export type DiscountableProduct = {
  price: number | string | null | undefined;
  discount_percent?: number | string | null;
};

/**
 * Normalise a seller-entered discount to a whole percentage between 0 and 100.
 * Supabase returns bigint as a string, so accept either representation. Anything
 * unparseable is treated as "no discount" rather than throwing during checkout.
 */
export function normalizeDiscountPercent(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

/**
 * Effective unit price in kobo after the seller's percentage-off discount.
 * This is the ONLY price checkout should charge: it is used both when computing
 * the Paystack amount and when writing the immutable order snapshot, so the
 * buyer can never be charged one amount while escrow records another.
 */
export function discountedUnitPriceKobo(product: DiscountableProduct): number {
  const listPrice = Number(product.price) || 0;
  const discount = normalizeDiscountPercent(product.discount_percent);
  if (listPrice <= 0 || discount <= 0) return listPrice;

  const effective = Math.round(listPrice * (100 - discount) / 100);
  return Number.isSafeInteger(effective) && effective > 0 ? effective : 0;
}
