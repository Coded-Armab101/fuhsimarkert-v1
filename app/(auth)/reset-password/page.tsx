'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import BrandLogo from '@/components/BrandLogo';
import { Lock, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';

/**
 * Set a new password after following the recovery email.
 *
 * `/auth/callback` exchanges the recovery code for a session cookie before
 * redirecting here, so this page only needs to verify a session exists and then
 * call `supabase.auth.updateUser({ password })`.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setHasSession(Boolean(user));
      setChecking(false);
    };

    void check();

    // PKCE recovery can finish a moment after mount; react when it does.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session?.user) {
        setHasSession(true);
        setChecking(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      setStatus({ kind: 'error', message: 'Your new password must be at least 6 characters.' });
      return;
    }
    if (password !== confirm) {
      setStatus({ kind: 'error', message: 'The two passwords do not match.' });
      return;
    }

    setSubmitting(true);
    setStatus(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // A fresh session nonce keeps this device as the active session.
      try {
        await fetch('/api/session/rotate', { method: 'POST' });
      } catch {
        /* non-fatal */
      }

      setDone(true);
      setStatus({
        kind: 'ok',
        message: 'Password updated. Taking you to the marketplace…',
      });
      window.setTimeout(() => router.replace('/buyer'), 1200);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not update your password. Please try again.';
      setStatus({ kind: 'error', message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#FAFAFA] px-4 py-10 font-sans text-[#2C2C2C]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo height={46} />
          <h1 className="mt-5 text-2xl font-black tracking-tight text-[#2C2C2C]">
            Set a new password
          </h1>
          <p className="mt-1.5 text-sm text-[#81756D]">
            Choose something you&apos;ll remember — at least 6 characters.
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-[#ECE5DE] bg-white p-6 shadow-[0_14px_40px_rgba(44,44,44,0.06)]">
          {checking ? (
            <div className="flex flex-col items-center gap-3 py-10 text-sm text-[#81756D]">
              <Loader2 className="animate-spin text-[#DE6437]" size={22} />
              <span>Checking your reset link…</span>
            </div>
          ) : !hasSession && !done ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-2xl bg-[#FDF0EA] p-4 text-sm text-[#9A3A17] ring-1 ring-[#DE6437]/25">
                <AlertCircle className="mt-0.5 shrink-0 text-[#DE6437]" size={16} />
                <span>
                  This reset link has expired or was already used. Request a new one to continue.
                </span>
              </div>
              <Link
                href="/forgot-password"
                className="flex w-full items-center justify-center rounded-full bg-[#DE6437] py-4 text-sm font-bold text-white hover:bg-[#C9511F]"
              >
                Request a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="new-password"
                  className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-[#81756D]"
                >
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#DE6437]" size={18} />
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-[#E7E0D8] bg-[#FAFAFA] py-3.5 pl-11 pr-12 text-sm text-[#2C2C2C] outline-none transition-colors placeholder:text-[#A79C92] focus:border-[#DE6437] focus:bg-white focus:ring-2 focus:ring-[#DE6437]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-[#81756D] transition-colors hover:bg-[#F3EEE8] hover:text-[#DE6437]"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-[#81756D]"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#DE6437]" size={18} />
                  <input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-[#E7E0D8] bg-[#FAFAFA] py-3.5 pl-11 pr-4 text-sm text-[#2C2C2C] outline-none transition-colors placeholder:text-[#A79C92] focus:border-[#DE6437] focus:bg-white focus:ring-2 focus:ring-[#DE6437]/20"
                  />
                </div>
              </div>

              {status && (
                <div
                  role="status"
                  className={`flex items-start gap-2 rounded-2xl p-4 text-sm ${
                    status.kind === 'error'
                      ? 'bg-[#FDF0EA] text-[#9A3A17] ring-1 ring-[#DE6437]/25'
                      : 'bg-[#EEF8F1] text-[#236B45] ring-1 ring-[#236B45]/15'
                  }`}
                >
                  {status.kind === 'error' ? (
                    <AlertCircle className="mt-0.5 shrink-0 text-[#DE6437]" size={16} />
                  ) : (
                    <CheckCircle2 className="mt-0.5 shrink-0 text-[#236B45]" size={16} />
                  )}
                  <span>{status.message}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || done}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#DE6437] py-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(222,100,55,0.25)] transition-colors hover:bg-[#C9511F] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <span>{done ? 'Password updated' : 'Update password'}</span>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
