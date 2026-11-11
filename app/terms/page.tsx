import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

const sections: { title: string; body: string }[] = [
  {
    title: 'Acceptance of these Terms',
    body: 'By creating an account or using FuhsiMarket, you agree to these Terms of Service. If you do not agree, please do not use the platform. We may update these terms from time to time, and continued use after a change counts as acceptance.',
  },
  {
    title: 'Eligibility',
    body: 'FuhsiMarket is a campus marketplace for FUHSI students. To buy or sell, you must be a current student, provide a genuine matric number, and keep your profile verified and up to date. One account per person.',
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
    body: 'FuhsiMarket provides the platform and escrow services as described. We are not liable for the quality or legality of items traded between users, or for losses caused by misuse of your account.',
  },
  {
    title: 'Contact',
    body: 'Questions about these terms? Reach out through the platform support channels before taking action. We are happy to help.',
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-[100dvh] bg-[#FAFAFA] font-sans text-[#2C2C2C]">
      <div className="mx-auto max-w-xl px-6 py-10 pb-16">
        <BrandLogo height={38} />

        <div className="mt-6 rounded-[1.75rem] border border-[#ECE5DE] bg-white p-7 shadow-[0_14px_40px_rgba(44,44,44,0.06)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#DE6437]">Legal</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[#2C2C2C]">Terms of Service</h1>
          <p className="mt-2 text-xs text-[#81756D]">
            Last updated: 22 September 2026. This document applies to every FUHSI student using FuhsiMarket.
          </p>

          <ol className="mt-6 space-y-5">
            {sections.map((section, i) => (
              <li key={section.title}>
                <h2 className="flex items-baseline gap-2 text-sm font-bold text-[#2C2C2C]">
                  <span className="text-[#DE6437]">{String(i + 1).padStart(2, '0')}</span>
                  {section.title}
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-[#5F5650]">{section.body}</p>
              </li>
            ))}
          </ol>
        </div>

        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#E7E0D8] bg-white px-6 py-3.5 text-sm font-bold text-[#2C2C2C] transition-colors hover:border-[#DE6437] hover:text-[#DE6437]"
        >
          <ArrowLeft size={16} /> Back to market
        </Link>
      </div>
    </main>
  );
}