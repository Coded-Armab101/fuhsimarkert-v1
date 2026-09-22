import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const sections: { title: string; body: string }[] = [
  {
    title: 'Overview',
    body: 'Fuhsi Market is a campus marketplace for FUHSI students. This policy explains what information we collect, why we collect it, and how we protect it. We only use your data to make the marketplace work — we never sell it.',
  },
  {
    title: 'What we collect',
    body: 'Account details: your name, campus email, matric number, phone number, hostel and role on the platform. Marketplace data: your listings, orders, chats, reviews and saved watchlist. Wallet data: your balance, transactions and the payout bank details you register for withdrawals.',
  },
  {
    title: 'How we use your data',
    body: 'Your details power the marketplace — showing your name to buyers and sellers, confirming your student status, fulfilling orders and deliveries, holding escrow payments, processing payouts, and keeping the platform secure. We may also send you important account updates.',
  },
  {
    title: 'Payments & Paystack',
    body: 'Card payments are processed by Paystack. We do not see or store your card number. We only keep transaction references, amounts and wallet movements needed to operate escrow, refunds and ledger records.',
  },
  {
    title: 'Who we share with',
    body: 'Sellers receive the fulfilment details needed to complete your order (your name and handover information). Escrow and order data is shared with the platform operations team. We share with Paystack to move money, and with authorities only where the law requires it.',
  },
  {
    title: 'Where your data lives',
    body: 'Your data is stored securely on our Supabase-hosted infrastructure in the region configured for Fuhsi Market. Access is restricted to the tools needed to run the platform and is protected by role-based controls.',
  },
  {
    title: 'Cookies & local storage',
    body: 'We use an httpOnly session cookie to keep you signed in and secure, plus browser local storage to remember your cart locally. These help the app stay fast; we do not use them for advertising profiling.',
  },
  {
    title: 'How long we keep data',
    body: 'We keep account and order records as long as your account is active and for a reasonable period after, to operate escrow, resolve disputes and meet legal obligations. You can ask us to delete your data at any time.',
  },
  {
    title: 'Your rights',
    body: 'You can review and correct your profile at any time. You can request a copy of your data, ask for it to be corrected, or ask for your account and data to be deleted. We respond to such requests promptly.',
  },
  {
    title: 'Children',
    body: 'Fuhsi Market is intended for registered tertiary students. Anyone under the age of 16 must not use the platform.',
  },
  {
    title: 'Changes to this policy',
    body: 'We may update this policy as the marketplace grows. Significant changes will be announced in the app before they take effect.',
  },
  {
    title: 'Contact',
    body: 'Privacy questions or requests can be sent through the platform support channels. We will address your request as quickly as we can.',
  },
];

export default function PrivacyPage() {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-white font-sans text-neutral-900">
      {/* glassmorphism backdrop orbs — same world as the onboarding */}
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#fe7743]/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -left-28 top-1/3 h-72 w-72 rounded-full bg-[#ffc3a1]/50 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 right-4 h-64 w-64 rounded-full bg-[#fe7743]/20 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-xl px-6 py-12 pb-16">
        <Link href="/" className="text-sm font-black tracking-tight text-neutral-900">
          FUHSI<span className="text-[#fe7743]">MARKET</span>
        </Link>

        <div className="mt-6 rounded-[2rem] bg-white/60 p-7 shadow-2xl shadow-[#fe7743]/20 ring-1 ring-white/70 backdrop-blur-2xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#fe7743]">Legal</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-neutral-900">Privacy Policy</h1>
          <p className="mt-2 text-xs text-neutral-500">
            Last updated: 22 September 2026. This document explains how Fuhsi Market handles your information.
          </p>

          <ol className="mt-6 space-y-5">
            {sections.map((section, i) => (
              <li key={section.title}>
                <h2 className="flex items-baseline gap-2 text-sm font-bold text-neutral-900">
                  <span className="text-[#fe7743]">{String(i + 1).padStart(2, '0')}</span>
                  {section.title}
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-neutral-600">{section.body}</p>
              </li>
            ))}
          </ol>
        </div>

        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-neutral-900 ring-1 ring-black/10 transition-colors hover:bg-neutral-50"
        >
          <ArrowLeft size={16} /> Back to home
        </Link>
      </div>
    </main>
  );
}