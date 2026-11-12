'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase';
import BrandLogo from '@/components/BrandLogo';
import { Mail, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';

/**
 * Request a password-reset email.
 *
 * The link in the email points at Supabase's verify endpoint, which then
 * redirects to `/auth/callback?next=/reset-password`. The callback exchanges the
 * one-time code for a session, so `/reset-password` can call `updateUser`.
 */
export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setStatus({ kind: 'error', message: 'Enter the email address on your account.' });
      return;
    }

    setSubmitting(true);
    setStatus(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (error) throw error;

      setStatus({
        kind: 'ok',
        message:
          'If that email is registered, a reset link is on its way. Check your inbox and spam folder.',
      });
      setEmail('');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not send the reset email. Please try again.';
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
            Reset your password
          </h1>
          <p className="mt-1.5 text-sm text-[#81756D]">
            We&apos;ll email you a secure link to set a new one.
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-[#ECE5DE] bg-white p-6 shadow-[0_14px_40px_rgba(44,44,44,0.06)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="reset-email"
                className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-[#81756D]"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#DE6437]" size={18} />
                <input
                  id="reset-email"
                  type="email"
                  placeholder="you@student.edu.ng"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
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
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#DE6437] py-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(222,100,55,0.25)] transition-colors hover:bg-[#C9511F] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="animate-spin" size={18} /> : <span>Send reset link</span>}
            </button>
          </form>
        </div>

        <Link
          href="/login"
          className="mt-6 inline-flex items-center justify-center gap-2 text-xs font-bold text-[#81756D] hover:text-[#DE6437]"
        >
          <ArrowLeft size={14} /> Back to sign in
        </Link>
      </div>
    </div>
  );
}
