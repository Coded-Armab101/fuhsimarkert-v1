import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

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

  // The exchange just wrote the session cookies. Redirect (not rewrite) so the
  // browser requests the protected page with the new cookies in hand.
  return NextResponse.redirect(new URL(next, request.nextUrl.origin));
}