'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
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
    <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
        
        <div className="text-center mb-8">
          <span className="text-2xl font-black tracking-wider text-red-500">FUHSI<span className="text-white">MARKET</span></span>
          <p className="text-sm text-neutral-400 mt-2">Sign into your workspace node</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 text-neutral-500" size={18} />
              <input 
                type="email" 
                placeholder="you@student.edu.ng" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 text-neutral-500" size={18} />
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
              />
            </div>
          </div>

          {errorMessage && (
            <div className="p-4 bg-red-950/20 border border-red-900/50 text-red-400 text-sm rounded-xl flex items-center space-x-2">
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-red-700 hover:bg-red-800 disabled:bg-neutral-800 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all cursor-pointer"
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <span>Access Dashboard</span>}
          </button>
        </form>

        <p className="text-xs text-center text-neutral-500 mt-6">
          New to the hub? <Link href="/signup" className="text-red-500 hover:underline">Register here</Link>
        </p>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-800" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-neutral-950 px-3 text-neutral-500 font-mono">or sign in with</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={isGoogle}
          className="w-full bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-900 border border-neutral-700 hover:border-neutral-600 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-70"
        >
          {isGoogle ? <Loader2 className="animate-spin" size={18} /> : <GoogleIcon />}
          <span>{isGoogle ? 'Redirecting to Google…' : 'Continue with Google'}</span>
        </button>
      </div>
    </div>
  );
}
