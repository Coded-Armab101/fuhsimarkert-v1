/**
 * Money handling.
 *
 * **Everything is kobo.** The database, the Paystack API and every server route
 * store and pass integer kobo. Naira only ever appears at the edges: the number
 * a seller types into a form, and the string a user reads on screen.
 *
 * This used to be inconsistent — `products.price` was written in naira by the
 * seller form while `/api/paystack` summed the same column and sent it to
 * Paystack as kobo, so a ₦5,000 item was charged ₦50. Convert at the boundary
 * with these helpers and that class of bug cannot come back.
 */

/** Kobo per naira. */
const KOBO = 100;

/**
 * Parse a naira amount typed by a user into integer kobo.
 * Returns `null` if it is not a usable positive amount.
 */
export function nairaToKobo(input: string | number): number | null {
  const naira = typeof input === 'number' ? input : parseFloat(input);

  if (!Number.isFinite(naira) || naira <= 0) return null;

  // Round rather than truncate so 19.99 → 1999, not 1998.
  const kobo = Math.round(naira * KOBO);

  if (!Number.isSafeInteger(kobo)) return null;

  return kobo;
}

/** Kobo → naira, as a number. Use `formatNaira` for anything user-facing. */
export function koboToNaira(kobo: number): number {
  return kobo / KOBO;
}

/**
 * Kobo → a display string, without the currency symbol.
 * Whole amounts render as "5,000"; fractional ones as "4,999.50".
 */
export function formatNaira(kobo: number | null | undefined): string {
  const amount = koboToNaira(Number(kobo) || 0);

  return amount.toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
