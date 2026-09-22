'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
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
  const router = useRouter();
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
      const { data, error } = await supabase.auth.signUp({
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
            full_name: fullName
          }
        }
      });

      if (error) throw error;

      setUiStatus({ 
        type: 'success', 
        text: 'Account initiated! Please check your campus email inbox to click the verification link.' 
      });
      
      // Reset inputs
      setFullName('');
      setEmail('');
      setPassword('');

    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred during account registration.';
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
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-white px-4 py-12 font-sans text-neutral-900 select-none">
      {/* glassmorphism backdrop orbs — same world as the onboarding */}
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#fe7743]/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -left-28 top-1/3 h-72 w-72 rounded-full bg-[#ffc3a1]/50 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 right-4 h-64 w-64 rounded-full bg-[#fe7743]/20 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="text-2xl font-black tracking-tight text-neutral-900">FUHSI<span className="text-[#fe7743]">MARKET</span></span>
          <p className="mt-2 text-sm font-medium text-neutral-500">Create your secure student account</p>
        </div>

        <div className="rounded-[2rem] bg-white/60 p-7 shadow-2xl shadow-[#fe7743]/20 ring-1 ring-white/70 backdrop-blur-2xl">
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-neutral-500">Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-[#fe7743]" size={18} />
                <input
                  type="text"
                  placeholder="e.g., Abdulrahman..."
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-2xl bg-white/70 py-3.5 pl-11 pr-4 text-sm text-neutral-900 outline-none ring-1 ring-black/10 transition-shadow placeholder:text-neutral-400 focus:bg-white focus:ring-2 focus:ring-[#fe7743]"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-neutral-500">Campus Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#fe7743]" size={18} />
                <input
                  type="email"
                  placeholder="you@student.edu.ng"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl bg-white/70 py-3.5 pl-11 pr-4 text-sm text-neutral-900 outline-none ring-1 ring-black/10 transition-shadow placeholder:text-neutral-400 focus:bg-white focus:ring-2 focus:ring-[#fe7743]"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-neutral-500">Secure Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#fe7743]" size={18} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl bg-white/70 py-3.5 pl-11 pr-4 text-sm text-neutral-900 outline-none ring-1 ring-black/10 transition-shadow placeholder:text-neutral-400 focus:bg-white focus:ring-2 focus:ring-[#fe7743]"
                />
              </div>
            </div>

            {uiStatus.text && (
              <div className={`flex items-start space-x-2 rounded-2xl p-4 text-sm ${
                uiStatus.type === 'error'
                  ? 'bg-[#fe7743]/15 text-neutral-900 ring-1 ring-[#fe7743]/40'
                  : 'bg-white/70 text-neutral-900 ring-1 ring-black/10'
              }`}>
                {uiStatus.type === 'error' ? (
                  <AlertCircle className="mt-0.5 shrink-0 text-[#fe7743]" size={16} />
                ) : (
                  <CheckCircle2 className="mt-0.5 shrink-0 text-[#fe7743]" size={16} />
                )}
                <span>{uiStatus.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center space-x-2 rounded-full bg-[#fe7743] py-4 text-sm font-bold text-white shadow-lg shadow-[#fe7743]/40 transition-transform hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <span>Register Profile</span>}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-black/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="rounded-full bg-white/70 px-3 font-semibold text-neutral-500">or sign up with</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={isGoogle}
            className="flex w-full items-center justify-center space-x-2 rounded-full bg-white py-4 text-sm font-semibold text-neutral-900 ring-1 ring-black/10 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isGoogle ? <Loader2 className="animate-spin" size={18} /> : <GoogleIcon />}
            <span>{isGoogle ? 'Redirecting to Google…' : 'Continue with Google'}</span>
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500">
          Already verified?{' '}
          <Link href="/login" className="font-bold text-[#fe7743] hover:underline">
            Log in here
          </Link>
        </p>
      </div>
    </div>
  );
}