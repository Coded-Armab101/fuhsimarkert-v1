/**
 * One definition of "does this user have a paid, unexpired role".
 *
 * The profile schema has no single "active" column. Activation is three columns
 * on `profiles`, written by `/api/subscription/verify`:
 *
 *   user_persona            'buyer' | 'seller'
 *   is_seller               true once a role is paid for
 *   seller_active           true once a role is paid for
 *   subscription_expires_at now + PLAN_DURATION_DAYS
 *
 * This lived in three places (proxy, the paywall, the buyer profile) and drifted.
 * Keep it here. Pure functions only, so it is safe to import into `proxy.ts`.
 */

export type RoleProfile = {
  user_persona?: string | null;
  is_seller?: boolean | null;
  seller_active?: boolean | null;
  subscription_expires_at?: string | null;
  is_admin?: boolean | null;
  is_approved_seller?: boolean | null;
  verification_status?: string | null;
};

/** True if the profile is a platform admin (bypasses paid-role checks). */
export function isAdmin(profile: RoleProfile | null | undefined): boolean {
  return profile?.is_admin === true;
}

/** Parsed expiry, or null if absent/unparseable. */
export function subscriptionExpiry(profile: RoleProfile | null | undefined): Date | null {
  if (!profile?.subscription_expires_at) return null;

  const expiry = new Date(profile.subscription_expires_at);
  return Number.isNaN(expiry.getTime()) ? null : expiry;
}

/** True if the profile paid for `persona` and that has not run out yet. */
export function hasActiveRole(
  profile: RoleProfile | null | undefined,
  persona: string,
): boolean {
  if (!profile) return false;
  if (profile.user_persona !== persona) return false;
  if (profile.is_seller !== true || profile.seller_active !== true) return false;

  const expiry = subscriptionExpiry(profile);
  return expiry !== null && expiry.getTime() > Date.now();
}

/**
 * True if there *was* a subscription and it has run out. Distinguishes "renew"
 * from "subscribe" on the paywall.
 */
export function hasLapsedRole(profile: RoleProfile | null | undefined): boolean {
  const expiry = subscriptionExpiry(profile);
  return expiry !== null && expiry.getTime() <= Date.now();
}

/** The paid persona if one is currently active, else null. */
export function activeRole(profile: RoleProfile | null | undefined): 'seller' | null {
  return hasActiveRole(profile, 'seller') ? 'seller' : null;
}
