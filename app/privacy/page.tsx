import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

const sections: { title: string; body: string }[] = [
  {
    title: 'Overview',
    body: 'FuhsiMarket is a campus marketplace for FUHSI students. This policy explains the personal information we collect, why we need it, who can receive it, and the choices available to you. We do not sell personal information or use seller verification media for advertising.',
  },
  {
    title: 'What we collect',
    body: 'We collect account and profile details such as your name, email address, matric number, date of birth, hostel or campus location, account role and profile settings. For seller verification, we collect a student ID image and a short selfie video. For orders and delivery, we collect the receiver name, phone number, matric number, pickup or delivery address, order items and handover code. We also store listings, cart and wishlist records, reviews, support or dispute information, wallet movements, bank name, account number and account name.',
  },
  {
    title: 'How we use your data',
    body: 'We use this information to create and secure accounts, confirm FUHSI student eligibility, display and fulfil listings, deliver orders, operate escrow, prevent fraud, resolve disputes, issue refunds, process seller payouts and comply with legal obligations. We may send transactional email, in-app or push notifications about orders, security, payouts and important service changes.',
  },
  {
    title: 'Student ID & verification video',
    body: 'The student ID image and short selfie video are used only for a trained administrator to check that a seller appears to be the FUHSI student represented by the account. We do not use them for advertising, public profiles, automated facial recognition or unrelated purposes. Files are stored in a private bucket, are available only through short-lived administrator links, and are deleted after the administrator approves or rejects the submission. We retain only the review result, dates, consent record and any rejection reason needed for account safety.',
  },
  {
    title: 'Payments & Paystack',
    body: 'Payments, refunds and bank transfers are processed by Paystack. FuhsiMarket does not receive or store your full card number or PIN. We retain transaction and transfer references, amounts, statuses, bank payout details and wallet ledger entries needed to operate escrow, reconcile money and investigate payment problems.',
  },
  {
    title: 'Who we share with',
    body: 'A seller receives only the buyer or receiver details needed to fulfil that seller’s order. Authorized FuhsiMarket administrators can access account, order, verification and dispute records when needed for operations and safety. Service providers include Supabase for authentication, database and file storage; Paystack for payments, refunds and payouts; Resend for transactional email; and web-push delivery providers when you enable device notifications. We may disclose information to authorities where legally required or to protect users from fraud or harm.',
  },
  {
    title: 'Where your data lives',
    body: 'Marketplace data is stored on Supabase-hosted infrastructure in the region configured for FuhsiMarket. Access is restricted by authentication, row-level security and administrator permissions. No online system can promise absolute security, but we limit access and use private storage for identity documents.',
  },
  {
    title: 'Cookies & local storage',
    body: 'We use secure session cookies and a session nonce to keep you signed in and prevent account sharing across active sessions. Browser local storage remembers cart, interface and onboarding preferences. If you enable push notifications, we store a device push endpoint and encryption keys. We do not use these technologies for third-party advertising profiling.',
  },
  {
    title: 'How long we keep data',
    body: 'Verification ID and video files are deleted after review as described above. Account, order, escrow, payout, refund, moderation and dispute records are retained while needed to provide the service, prevent fraud, reconcile financial records and satisfy legal obligations. Retention periods may therefore differ by record. A deletion request may not remove information that must be kept for an unresolved transaction, safety investigation or legal requirement.',
  },
  {
    title: 'Your rights',
    body: 'You can review and correct many profile fields in the app, disable optional push notifications, and request access to, correction of or deletion of your personal information through support. You may also object to or ask us to restrict a use where applicable. We may need to verify your identity before completing a request.',
  },
  {
    title: 'Children',
    body: 'FuhsiMarket is intended for registered tertiary students. Anyone under the age of 16 must not use the platform.',
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
    <main className="min-h-[100dvh] bg-[#FAFAFA] font-sans text-[#2C2C2C]">
      <div className="mx-auto max-w-xl px-6 py-10 pb-16">
        <BrandLogo height={38} />

        <div className="mt-6 rounded-[1.75rem] border border-[#ECE5DE] bg-white p-7 shadow-[0_14px_40px_rgba(44,44,44,0.06)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#DE6437]">Legal</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[#2C2C2C]">Privacy Policy</h1>
          <p className="mt-2 text-xs text-[#81756D]">
            Last updated: 16 November 2026. This document explains how FuhsiMarket handles your information.
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

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-[#DE6437]">
          <Link href="/terms" className="rounded-full bg-white px-4 py-2 ring-1 ring-[#E7E0D8]">Terms</Link>
          <Link href="/refund-policy" className="rounded-full bg-white px-4 py-2 ring-1 ring-[#E7E0D8]">Refund Policy</Link>
          <Link href="/escrow-policy" className="rounded-full bg-white px-4 py-2 ring-1 ring-[#E7E0D8]">Escrow Policy</Link>
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
