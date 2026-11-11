'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase';
import BrandLogo from '@/components/BrandLogo';
import { User, Mail, Lock, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

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

export default function SignUpPage() {
  const supabase = createClient();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogle, setIsGoogle] = useState(false);
  const [uiStatus, setUiStatus] = useState({ type: '', text: '' });

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName || !email || !password) {
      setUiStatus({ type: 'error', text: 'Please fill out all required fields.' });
      return;
    }

    setIsSubmitting(true);
    setUiStatus({ type: '', text: '' });

    try {
      // Execute the signup request to Supabase Auth
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Send the confirmation link back to whichever origin the user
          // actually signed up on. Without this it always follows the Site URL
          // configured in the Supabase dashboard, so a localhost signup mails a
          // link to the ngrok host — landing the session on a different origin
          // (and therefore a different localStorage cart).
          emailRedirectTo: `${window.location.origin}/login`,
          // The user metadata maps directly to our public profile trigger!
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) throw error;

      setUiStatus({
        type: 'success',
        text: 'Account initiated! Please check your campus email inbox to click the verification link.',
      });

      // Reset inputs
      setFullName('');
      setEmail('');
      setPassword('');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An error occurred during account registration.';
      setUiStatus({ type: 'error', text: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setIsGoogle(true);
    setUiStatus({ type: '', text: '' });
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // Supabase's PKCE flow bounces back here with a one-time `code` that
          // `/auth/callback` exchanges for a session cookie before landing the
          // user on `/buyer`. Redirecting straight to a protected route would
          // never exchange the code, so no session is created.
          redirectTo: `${window.location.origin}/auth/callback?next=/buyer`,
        },
      });
      if (error) throw error;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start Google sign-in.';
      setUiStatus({ type: 'error', text: message });
      setIsGoogle(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#FAFAFA] px-4 py-10 font-sans text-[#2C2C2C]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo height={46} />
          <h1 className="mt-5 text-2xl font-black tracking-tight text-[#2C2C2C]">
            Create your account
          </h1>
          <p className="mt-1.5 text-sm text-[#81756D]">
            Join the FUHSI campus marketplace
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-[#ECE5DE] bg-white p-6 shadow-[0_14px_40px_rgba(44,44,44,0.06)]">
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label htmlFor="signup-name" className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-[#81756D]">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-[#DE6437]" size={18} />
                <input
                  id="signup-name"
                  type="text"
                  placeholder="e.g., Abdulrahman..."
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  className="w-full rounded-2xl border border-[#E7E0D8] bg-[#FAFAFA] py-3.5 pl-11 pr-4 text-sm text-[#2C2C2C] outline-none transition-colors placeholder:text-[#A79C92] focus:border-[#DE6437] focus:bg-white focus:ring-2 focus:ring-[#DE6437]/20"
                />
              </div>
            </div>

            <div>
              <label htmlFor="signup-email" className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-[#81756D]">
                Campus Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#DE6437]" size={18} />
                <input
                  id="signup-email"
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
              <label htmlFor="signup-password" className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-[#81756D]">
                Secure Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#DE6437]" size={18} />
                <input
                  id="signup-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-[#E7E0D8] bg-[#FAFAFA] py-3.5 pl-11 pr-4 text-sm text-[#2C2C2C] outline-none transition-colors placeholder:text-[#A79C92] focus:border-[#DE6437] focus:bg-white focus:ring-2 focus:ring-[#DE6437]/20"
                />
              </div>
            </div>

            {uiStatus.text && (
              <div
                className={`flex items-start gap-2 rounded-2xl p-4 text-sm ${
                  uiStatus.type === 'error'
                    ? 'bg-[#FDF0EA] text-[#9A3A17] ring-1 ring-[#DE6437]/25'
                    : 'bg-[#EEF8F1] text-[#236B45] ring-1 ring-[#236B45]/15'
                }`}
              >
                {uiStatus.type === 'error' ? (
                  <AlertCircle className="mt-0.5 shrink-0 text-[#DE6437]" size={16} />
                ) : (
                  <CheckCircle2 className="mt-0.5 shrink-0 text-[#236B45]" size={16} />
                )}
                <span>{uiStatus.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#DE6437] py-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(222,100,55,0.25)] transition-colors hover:bg-[#C9511F] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <span>Create account</span>}
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
          Already have an account?{' '}
          <Link href="/login" className="font-bold text-[#DE6437] hover:underline">
            Sign in
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
