/**
 * Customer-support contact configuration.
 *
 * The support phone number is supplied by the operator after deployment, so it
 * is a build-time public env var rather than a hard-coded value. If it is not
 * set (or is not a plausible phone number) every support link is hidden instead
 * of sending the buyer to `https://wa.me/` with no recipient.
 *
 * NEXT_PUBLIC_* values are inlined during `next build`, so changing the number
 * requires a Vercel redeploy.
 */

const DEFAULT_SUPPORT_MESSAGE =
  'Hello FuhsiMarket support, I need help with a payment or an order.';

/**
 * Normalise a pasted phone number to the digits wa.me expects (country code
 * first, no `+`, spaces or dashes). Nigerian 11-digit numbers starting with 0
 * are converted to the 234 country code, which is the common case here.
 */
export function normalizeWhatsappNumber(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const normalized =
    digits.startsWith('0') && digits.length === 11 ? `234${digits.slice(1)}` : digits;
  return /^\d{8,15}$/.test(normalized) ? normalized : null;
}

/** Build a wa.me deep link with a capped, URL-encoded pre-filled message. */
export function buildWhatsappUrl(
  number: string | null,
  message?: string | null,
): string | null {
  if (!number || !/^\d{8,15}$/.test(number)) return null;
  const text = (message && message.trim()) || DEFAULT_SUPPORT_MESSAGE;
  return `https://wa.me/${number}?text=${encodeURIComponent(text.slice(0, 600))}`;
}

const configuredNumber = normalizeWhatsappNumber(
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER,
);

export const supportWhatsappNumber: string | null = configuredNumber;
export const isSupportConfigured: boolean = configuredNumber !== null;

export function supportWhatsappUrl(message?: string | null): string | null {
  return buildWhatsappUrl(configuredNumber, message);
}
