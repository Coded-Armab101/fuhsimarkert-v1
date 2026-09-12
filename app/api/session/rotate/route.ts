import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import {
  SESSION_NONCE_COOKIE,
  SESSION_NONCE_COOKIE_MAX_AGE,
  rotateSessionNonce,
} from '@/utils/single-session';

/**
 * Mint the single-session nonce for the currently signed-in user.
 *
 * Called by the password-login flow immediately after a successful
 * `signInWithPassword`, BEFORE the browser navigates to /buyer. Rotating here —
 * one server request, one DB write — removes the race that existed when the
 * proxy minted the nonce lazily on the first navigation (concurrent requests
 * each wrote a different UUID, so the cookie and DB disagreed and the user got
 * signed out on the next page load).
 *
 * Sets the httpOnly session-nonce cookie on its own response, so the browser
 * carries it forward for every subsequent navigation.
 */
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const nonce = await rotateSessionNonce(supabase, user.id);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_NONCE_COOKIE_MAX_AGE,
  });
  return response;
}