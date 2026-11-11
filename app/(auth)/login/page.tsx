'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import BrandLogo from '@/components/BrandLogo';
import { Mail, Lock, Loader2, AlertCircle } from 'lucide-react';

const GoogleIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.08 3.56-5.16 3.56-8.82Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.27 14.29a7.19 7.19 0 0 1 0-4.58V6.62H1.29a12.02 12.02 0 0 0 0 10.76l3.98-3.09Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
    />
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isGoogle, setIsGoogle] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      setErrorMessage('Please provide both parameters to authenticate.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Mint the single-session nonce now, server-side (one request, one DB
      // write), so the browser carries its httpOnly cookie into /buyer. Doing
      // this eagerly — instead of letting the proxy mint it on the first
      // navigation — avoids concurrent proxy requests racing and signing the
      // user straight back out.
      try {
        await fetch('/api/session/rotate', { method: 'POST' });
      } catch (rotateError) {
        console.error('Session nonce mint failed (non-fatal):', rotateError);
      }

      // Upon success, push them straight past the entry gate to the default hub
      router.push('/buyer');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failure. Verify credentials.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setIsGoogle(true);
    setErrorMessage('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // Supabase's PKCE flow bounces back here with a one-time `code` that
          // `/auth/callback` exchanges for a session cookie before landing the
          // user on `/buyer`. Redirecting straight to a protected route would
          // never exchange the code, so no session is created and the proxy
          // sends the user back to /login.
          redirectTo: `${window.location.origin}/auth/callback?next=/buyer`,
        },
      });
      if (error) throw error;
      // signInWithOAuth with redirectTo on a hostless flow redirects the browser;
      // if it returns without throwing, nothing more to do here.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start Google sign-in.';
      setErrorMessage(message);
      setIsGoogle(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#FAFAFA] px-4 py-10 font-sans text-[#2C2C2C]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo height={34} />
          <h1 className="mt-5 text-2xl font-black tracking-tight text-[#2C2C2C]">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-[#81756D]">
            Sign in to your campus market
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-[#ECE5DE] bg-white p-6 shadow-[0_14px_40px_rgba(44,44,44,0.06)]">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-[#81756D]">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#DE6437]" size={18} />
                <input
                  id="login-email"
                  type="email"
                  placeholder="you@student.edu.ng"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full rounded-2xl border border-[#E7E0D8] bg-[#FAFAFA] py-3.5 pl-11 pr-4 text-sm text-[#2C2C2C] outline-none transition-colors placeholder:text-[#A79C92] focus:border-[#DE6437] focus:bg-white focus:ring-2 focus:ring-[#DE6437]/20"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-[#81756D]">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#DE6437]" size={18} />
                <input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-[#E7E0D8] bg-[#FAFAFA] py-3.5 pl-11 pr-4 text-sm text-[#2C2C2C] outline-none transition-colors placeholder:text-[#A79C92] focus:border-[#DE6437] focus:bg-white focus:ring-2 focus:ring-[#DE6437]/20"
                />
              </div>
            </div>

            {errorMessage && (
              <div className="flex items-center gap-2 rounded-2xl bg-[#FDF0EA] p-4 text-sm text-[#9A3A17] ring-1 ring-[#DE6437]/25">
                <AlertCircle size={16} className="shrink-0 text-[#DE6437]" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#DE6437] py-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(222,100,55,0.25)] transition-colors hover:bg-[#C9511F] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <span>Sign in</span>}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#ECE5DE]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 font-semibold text-[#81756D]">or continue with</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={isGoogle}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-[#E7E0D8] bg-white py-3.5 text-sm font-semibold text-[#2C2C2C] transition-colors hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isGoogle ? <Loader2 className="animate-spin" size={18} /> : <GoogleIcon />}
            <span>{isGoogle ? 'Redirecting to Google…' : 'Continue with Google'}</span>
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-[#81756D]">
          New to FuhsiMarket?{' '}
          <Link href="/signup" className="font-bold text-[#DE6437] hover:underline">
            Create an account
          </Link>
        </p>

        <p className="mt-6 text-center text-[11px] text-[#A79C92]">
          <Link href="/" className="hover:text-[#DE6437]">
            Back to market
          </Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-[#DE6437]">
            Terms
          </Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="hover:text-[#DE6437]">
            Privacy
          </Link>
        </p>
      </div>
    </div>
  );
}
