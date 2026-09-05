/**
 * Server-side source of truth for role subscription pricing.
 * Amounts are in kobo. Never trust a price sent from the browser.
 */
export const ROLE_PLANS = {
  seller: { amount: 150000, label: 'FUHSI Seller (monthly)' },
} as const;

export type RolePlan = keyof typeof ROLE_PLANS;

export function isRolePlan(value: unknown): value is RolePlan {
  return value === 'seller';
}

/** Subscription window granted per successful payment. */
export const PLAN_DURATION_DAYS = 30;
