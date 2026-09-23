import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import {
  SESSION_NONCE_COOKIE,
  SESSION_NONCE_COOKIE_MAX_AGE,
  rotateSessionNonce,
} from '@/utils/single-session';

/**
 * OAuth callback for Supabase's PKCE flow.
 *
 * `signInWithOAuth` sets a `code_verifier` cookie, then redirects the browser to
 * Google and back. Supabase hands control back to this URL with a one-time
 * `code` that MUST be exchanged for a session here — otherwise the session
 * cookie is never written and the user is bounced straight back to /login.
 *
 * After the exchange we land the user on the value of `next` (default /buyer).
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/buyer';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=oauth_missing_code', request.nextUrl.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] code exchange failed:', error);
    return NextResponse.redirect(
      new URL(`/login?error=oauth_failed`, request.nextUrl.origin)
    );
  }

  // The exchange just wrote the session cookies. Mint the single-session nonce
  // here — one request, one DB write — and carry the httpOnly cookie on the
  // redirect, so the protected page's navigation never has to mint it lazily
  // (which caused sign-out races under concurrent proxy requests).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirect = NextResponse.redirect(new URL(next, request.nextUrl.origin));
  if (user) {
    const nonce = await rotateSessionNonce(supabase, user.id);
    redirect.cookies.set(SESSION_NONCE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_NONCE_COOKIE_MAX_AGE,
    });
  }
  return redirect;
}