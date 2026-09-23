import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { hasActiveRole, isAdmin, type RoleProfile } from '@/utils/roles';
import {
  SESSION_NONCE_COOKIE,
  SESSION_NONCE_COOKIE_MAX_AGE,
  rotateSessionNonce,
} from '@/utils/single-session';

/**
 * Next 16 renamed the `middleware` convention to `proxy`. This file must live at
 * the project root, next to `app/` — not inside it. It runs on the Node.js
 * runtime by default; setting a `runtime` config here throws.
 *
 * Two jobs:
 *
 *  1. Refresh the Supabase auth cookie on every navigation. Without this the
 *     access token expires mid-session and pages start seeing a signed-out user.
 *  2. Keep signed-out visitors, and users without a paid role, out of the
 *     dashboards.
 *
 * Job 2 is an *optimistic* check only. The Next docs are explicit that proxy
 * "should not be used as a full session management or authorization solution",
 * and a matcher change or a moved Server Function can silently drop coverage.
 * Row Level Security in Postgres remains the authoritative boundary — this just
 * stops the wrong page from rendering and its queries from firing.
 */

/** Route prefixes that require a signed-in user. */
const AUTH_REQUIRED = ['/buyer', '/seller', '/admin-dashboard'];

/** Pages a signed-in user has no reason to see. */
const GUEST_ONLY = ['/login', '/signup'];

type RoleGate = {
  /** Route prefix being protected. */
  prefix: string;
  /** The `profiles.user_persona` value that unlocks it. */
  persona: string;
  /** Where to send someone who does not have it. Never itself. */
  fallback: string;
};

/**
 * Prefixes that need a paid, unexpired role on top of a session.
 *
 * `/admin-dashboard` is gated on `is_admin` (a boolean on `profiles`), not a
 * persona. An admin passes the gate for every protected prefix regardless of
 * persona or subscription.
 */
const ROLE_GATES: RoleGate[] = [
  {
    prefix: '/seller',
    persona: 'seller',
    fallback: '/seller/subscribe',
  },
  { prefix: '/admin-dashboard', persona: '__no_such_persona__', fallback: '/buyer' },
];

function isUnder(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Carry any cookies Supabase just refreshed onto a redirect, otherwise the
 * rotated tokens are dropped and the user is signed out by the redirect itself.
 */
function redirectPreservingCookies(url: URL, carrier: NextResponse) {
  const redirect = NextResponse.redirect(url);
  for (const cookie of carrier.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the token against Supabase, which is what triggers the
  // refresh. getSession() only decodes the cookie and would not be trustworthy
  // here, since a cookie is client-supplied data.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const needsAuth = AUTH_REQUIRED.some((prefix) => isUnder(pathname, prefix));

  if (!user) {
    if (needsAuth) {
      const login = request.nextUrl.clone();
      login.pathname = '/login';
      login.search = '';
      login.searchParams.set('redirect', `${pathname}${search}`);
      return redirectPreservingCookies(login, response);
    }
    return response;
  }

  if (GUEST_ONLY.includes(pathname)) {
    const home = request.nextUrl.clone();
    home.pathname = '/buyer';
    home.search = '';
    return redirectPreservingCookies(home, response);
  }

  // ---- Single-session enforcement ------------------------------------------
  // An httpOnly nonce cookie is bound to the session issued at login. If it is
  // absent this is the first navigation of a fresh session -> rotate + mint the
  // cookie. If it is present but no longer matches the profile, that session was
  // superseded by a sign-in on another device -> force it out by clearing the
  // session and the stale cookie. (Runs for any authenticated user regardless of
  // route, so it also covers pages without a persona gate such as /buyer.)
  const cookieNonce = request.cookies.get(SESSION_NONCE_COOKIE)?.value ?? null;

  const { data: nonceRow } = await supabase
    .from('profiles')
    .select('session_nonce')
    .eq('id', user.id)
    .maybeSingle<{ session_nonce: string | null }>();

  const storedNonce = nonceRow?.session_nonce ?? null;

  if (cookieNonce && storedNonce && cookieNonce !== storedNonce) {
    // Cookie belongs to a superseded session — revoke.
    await supabase.auth.signOut();
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    login.searchParams.set('reason', 'session_expired');
    const redirect = redirectPreservingCookies(login, response);
    redirect.cookies.delete(SESSION_NONCE_COOKIE);
    return redirect;
  }

  if (!cookieNonce && storedNonce) {
    // Cookie was lost (cleared, new browser tab, etc.) but the stored nonce
    // confirms an active session on this device. Adopt it — no DB write,
    // no race. Concurrent proxy runs all converge on the same value.
    response.cookies.set(SESSION_NONCE_COOKIE, storedNonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_NONCE_COOKIE_MAX_AGE,
    });
  }

  if (!cookieNonce && !storedNonce) {
    // Truly fresh session (first-ever login or pre-nonce user).
    // Mint once. If concurrent requests race this, only one nonce ends up
    // in the DB; the next navigation converges via the adopt path above.
    const fresh = await rotateSessionNonce(supabase, user.id);
    response.cookies.set(SESSION_NONCE_COOKIE, fresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_NONCE_COOKIE_MAX_AGE,
    });
  }

  // A gate never guards its own fallback, or the redirect would loop.
  const gate = ROLE_GATES.find(
    (candidate) => isUnder(pathname, candidate.prefix) && pathname !== candidate.fallback,
  );

  if (gate) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_persona, is_seller, seller_active, subscription_expires_at, is_admin, is_approved_seller')
      .eq('id', user.id)
      .maybeSingle<RoleProfile>();

    // Admins bypass paid-role checks on every gate.
    if (isAdmin(profile)) return response;

    const hasRole = hasActiveRole(profile, gate.persona);

    if (!hasRole) {
      const fallback = request.nextUrl.clone();
      fallback.pathname = gate.fallback;
      fallback.search = '';
      return redirectPreservingCookies(fallback, response);
    }

    // Paying for Seller does not grant Seller Studio access. The only seller
    // route available before admin approval is the verification/onboarding
    // screen. This is enforced in proxy in addition to the layout/RLS gates.
    if (gate.prefix === '/seller' &&
        profile?.is_approved_seller !== true &&
        pathname !== '/seller/verification') {
      const verification = request.nextUrl.clone();
      verification.pathname = '/seller/verification';
      verification.search = '';
      return redirectPreservingCookies(verification, response);
    }
  }

  return response;
}

export const config = {
  /*
   * Everything except static assets and `/api`.
   *
   * `/api` is excluded on purpose: `/api/webhooks` verifies an HMAC over the
   * raw request body and must not be touched, and every other route handler
   * already calls `auth.getUser()` itself. Per the Next docs, authorization
   * belongs inside the handler rather than out here anyway.
   *
   * Note that proxy still runs for `/_next/data/*` even when excluded — that is
   * intentional upstream behaviour so a protected page's data route cannot be
   * left open by accident.
   */
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
