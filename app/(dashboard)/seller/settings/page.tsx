'use client';

import Link from 'next/link';
import {
  ArrowLeftRight,
  Banknote,
  ChevronRight,
  LockKeyhole,
  Settings2,
  Store,
  UserRound,
} from 'lucide-react';
import PushNotificationToggle from '@/components/PushNotificationToggle';
import ProfileInstallApp from '@/components/ProfileInstallApp';

const accountRows = [
  {
    title: 'Personal and seller identity',
    detail: 'Name, matric number, hostel and verification details',
    href: '/buyer/profile#profile-details',
    icon: UserRound,
  },
  {
    title: 'Bank and payout details',
    detail: 'Withdrawal bank, account number and wallet information',
    href: '/buyer/profile#wallet-details',
    icon: Banknote,
  },
  {
    title: 'Password and account security',
    detail: 'Change your password and review account access',
    href: '/buyer/profile#security-details',
    icon: LockKeyhole,
  },
];

export default function SettingsPage() {
  return (
    <div className="seller-secondary mx-auto max-w-2xl space-y-5 py-2">
      <section className="settings-hero overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#2e2520] via-[#3c302a] to-[#4b392f] p-6 text-white shadow-lg">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
          <Store size={14} className="text-[#ff9a55]" /> Seller account
        </div>
        <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-md">
            <h1 className="text-2xl font-black tracking-tight">Account & settings</h1>
            <p className="settings-muted mt-1.5 text-xs leading-5 text-white/65">
              Keep order alerts, payout details and account security in one place.
            </p>
          </div>
          <Link
            href="/buyer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#ef6b3b] px-5 py-3 text-xs font-black text-white shadow-lg shadow-black/20 transition-colors hover:bg-[#d8552e]"
          >
            <ArrowLeftRight size={15} /> Switch to buyer
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2 px-1">
          <Settings2 size={14} className="text-[#d8552e]" />
          <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-[#81756d]">
            Order notifications
          </h2>
        </div>
        <PushNotificationToggle />
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-[#eee4dc] bg-white shadow-sm">
        <div className="border-b border-[#f0e9e2] px-5 py-4">
          <h2 className="text-sm font-black text-[#251d18]">Account details</h2>
          <p className="mt-0.5 text-[11px] text-[#81756d]">
            Buyer and seller modes use the same secure account information.
          </p>
        </div>
        <div className="divide-y divide-[#f4eee9]">
          {accountRows.map((row) => {
            const Icon = row.icon;
            return (
              <Link
                key={row.title}
                href={row.href}
                className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-[#fffaf7]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#faf6f2] text-[#d8552e]">
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-[#251d18]">{row.title}</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-[#81756d]">{row.detail}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-[#c9bfb7]" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* Only renders when this browser exposes a real one-click PWA prompt. */}
      <ProfileInstallApp />

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 pb-2 text-[10px] font-bold text-[#9d9188]">
        <Link href="/terms" className="hover:text-[#d8552e]">Terms</Link>
        <Link href="/privacy" className="hover:text-[#d8552e]">Privacy</Link>
        <Link href="/refund-policy" className="hover:text-[#d8552e]">Refunds</Link>
        <Link href="/escrow-policy" className="hover:text-[#d8552e]">Escrow</Link>
      </div>
    </div>
  );
}
