'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Loader2, LogOut, ShieldAlert } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { createClient } from '@/utils/supabase';

export default function AccountSuspendedPage() {
  const supabase = createClient();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut().catch(() => null);
    window.location.href = '/login';
  };

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#FAFAFA] px-4 py-10 text-[#2C2C2C]">
      <div className="w-full max-w-md">
        <BrandLogo height={42} />
        <section className="mt-6 rounded-[2rem] border border-red-200 bg-white p-7 shadow-[0_18px_55px_rgba(44,44,44,0.08)]">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600">
            <ShieldAlert size={28} />
          </div>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">Account restricted</p>
          <h1 className="mt-1 text-2xl font-black">This account is suspended</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#6F625A]">
            Buyer and seller access has been paused because an administrator identified or is investigating activity that may violate FuhsiMarket rules or the law. Your order and financial records are preserved while the review is open.
          </p>
          <p className="mt-3 rounded-2xl bg-[#FAF6F2] p-4 text-xs leading-relaxed text-[#6F625A]">
            If you believe this is a mistake, contact the platform support team and include the email address on your account. Do not create another account to bypass this restriction.
          </p>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#2C2C2C] py-3.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {signingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
          <div className="mt-5 flex justify-center gap-3 text-[11px] font-bold text-[#DE6437]">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/refund-policy">Refunds</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
