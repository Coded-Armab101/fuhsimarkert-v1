import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const sections: { title: string; body: string }[] = [
  {
    title: 'Acceptance of these Terms',
    body: 'By creating an account or using Fuhsi Market, you agree to these Terms of Service. If you do not agree, please do not use the platform. We may update these terms from time to time, and continued use after a change counts as acceptance.',
  },
  {
    title: 'Eligibility',
    body: 'Fuhsi Market is a campus marketplace for FUHSI students. To buy or sell, you must be a current student, provide a genuine matric number, and keep your profile verified and up to date. One account per person.',
  },
  {
    title: 'Your account',
    body: 'You are responsible for the accuracy of the information on your account and for keeping your login credentials private. You agree to inform us if you suspect your account has been compromised.',
  },
  {
    title: 'Buying & escrow protection',
    body: 'When you pay, your funds are held in escrow instead of going straight to the seller. The seller only receives the money after you confirm receipt of the item, or after a dispute is resolved in their favour.',
  },
  {
    title: 'Selling & listings',
    body: 'Sellers must list genuine, legal items with accurate descriptions, prices and stock. You must deliver what was promised in the condition promised. Prohibited items, counterfeits and deceptive listings are grounds for removal.',
  },
  {
    title: 'Fees & payments',
    body: 'A tiered buyer service fee applies to every order, a delivery fee applies when doorstep delivery is chosen, and a platform commission is deducted from seller payouts. Fees are displayed before you confirm an order.',
  },
  {
    title: 'Wallet & withdrawals',
    body: 'Your wallet holds funds from sales and refunds. Withdrawals are processed to the bank account or Paystack transfer account you register. You are responsible for entering correct payout details.',
  },
  {
    title: 'Delivery & handover',
    body: 'Orders are fulfilled by campus pickup or delivery using the meetup location you provide. Always share the order delivery code securely with the other party to complete a handover and protect yourself.',
  },
  {
    title: 'Prohibited conduct',
    body: 'You may not misuse the platform — fraud, off-platform payment demands, harassment, fake identities, or attempting to bypass escrow. We may suspend or terminate accounts that break these rules.',
  },
  {
    title: 'Disputes',
    body: 'If an order cannot be completed, raise a dispute within the platform. Our team reviews the evidence and releases funds according to the escrow rules. Keep payment and chat records as evidence.',
  },
  {
    title: 'Suspension & termination',
    body: 'We may restrict or close an account that violates these terms, harms other users, or that we reasonably believe is involved in fraud. You may close your account at any time.',
  },
  {
    title: 'Liability',
    body: 'Fuhsi Market provides the platform and escrow services as described. We are not liable for the quality or legality of items traded between users, or for losses caused by misuse of your account.',
  },
  {
    title: 'Contact',
    body: 'Questions about these terms? Reach out through the platform support channels before taking action. We are happy to help.',
  },
];

export default function TermsPage() {
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
          <h1 className="mt-2 text-3xl font-black tracking-tight text-neutral-900">Terms of Service</h1>
          <p className="mt-2 text-xs text-neutral-500">
            Last updated: 22 September 2026. This document applies to every FUHSI student using Fuhsi Market.
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