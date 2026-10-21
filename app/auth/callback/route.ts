import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
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

  // The exchange just wrote the session cookies into cookieStore. Copy all
  // cookieStore cookies onto the redirect response so that the browser receives
  // the Supabase auth tokens (sb-*-auth-token) alongside the single-session nonce.
  const cookieStore = await cookies();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirect = NextResponse.redirect(new URL(next, request.nextUrl.origin));

  for (const cookie of cookieStore.getAll()) {
    redirect.cookies.set(cookie.name, cookie.value, cookie);
  }

  if (user) {
    // Auto-create default buyer profile for first-time Google sign-ups/logins
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, user_persona')
      .eq('id', user.id)
      .maybeSingle();

    if (!existingProfile) {
      const fullName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split('@')[0] ||
        'Campus Student';

      await supabase.from('profiles').upsert(
        {
          id: user.id,
          full_name: fullName,
          user_persona: 'buyer',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
    }

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