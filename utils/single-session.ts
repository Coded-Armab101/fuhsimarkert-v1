/**
 * Single active session enforcement.
 *
 * Every successful login rotates a per-user `session_nonce` (stored on
 * `profiles`) and records it in an httpOnly cookie. Any request whose cookie
 * nonce no longer matches the profile's current nonce is running an older,
 * superseded session — which is exactly what happens when the same account signs
 * in on a second device. Enforcing this means a user can only hold ONE live
 * session, so concurrent logs can't race money writes or hide session-level
 * problems.
 *
 * Enforcement:
 *  - rotation: first authenticated navigation after a new sign-in (proxy),
 *  - validation: in the proxy for page navigation, and in money routes.
 */

export const SESSION_NONCE_COOKIE = 'fuhsi_session_nonce';
export const SESSION_NONCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Generate a fresh nonce for a new session. */
export function newSessionNonce(): string {
  return crypto.randomUUID();
}

/** A client that can write to `profiles` (same shape as a Supabase client). */
export type NonceWriter = {
  from: (
    table: 'profiles',
  ) => {
    update: (values: { session_nonce: string }) => {
      eq: (column: 'id', value: string) => unknown;
    };
  };
};

/**
 * Persist `nonce` as the user's current session nonce and return it, ready for
 * the caller to place in the httpOnly cookie. `client` should be tied to the
 * signed-in user (RLS updates only their own profile) or be a service-role
 * client.
 */
export async function rotateSessionNonce(
  client: NonceWriter,
  userId: string,
  nonce = newSessionNonce(),
): Promise<string> {
  await client.from('profiles').update({ session_nonce: nonce }).eq('id', userId);
  return nonce;
}

/** True when the cookie value is present and equals the stored session nonce. */
export function nonceValid(
  contender: string | undefined | null,
  stored: string | null | undefined,
): boolean {
  return !!contender && !!stored && contender === stored;
}