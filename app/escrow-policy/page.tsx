import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

const sections = [
  {
    title: 'What escrow means here',
    body: 'FuhsiMarket records the protected order amount as held instead of making it immediately withdrawable by the seller. Escrow is an order-protection workflow within the marketplace; it is not a savings, investment or interest-bearing account.',
  },
  {
    title: 'Placing an order',
    body: 'After Paystack or wallet payment is verified, FuhsiMarket creates the order and holds the protected amount. The order shows each seller’s progress from received, to packing, to ready for pickup or delivery.',
  },
  {
    title: 'Releasing the seller’s earnings',
    body: 'The buyer should inspect the order and use “Confirm received” only after receiving all items in that combined order satisfactorily. Confirmation releases each seller’s net earnings, less the displayed platform commission, to the seller wallet. Confirmation is designed to be final except where law or a documented exceptional review requires otherwise.',
  },
  {
    title: 'Disputes freeze release',
    body: 'Reporting a problem before completion changes the order to disputed and prevents normal escrow release. The parties should preserve photos, handover details, listing descriptions and relevant communications. Administrators may review these records and request further evidence.',
  },
  {
    title: 'Returned products',
    body: 'Where the buyer has possession of a disputed product, escrow is not refunded merely because a dispute was opened. The product must normally be returned first. Each affected seller confirms receipt in the app; an administrator may override that step only after reviewing evidence where a seller is unavailable or acting unreasonably.',
  },
  {
    title: 'Resolution',
    body: 'Escrow may be released to the seller, returned to the buyer through the original payment method and/or wallet, or split where the transaction records justify it. Processing by Paystack or a bank may continue after FuhsiMarket records the resolution.',
  },
  {
    title: 'Prohibited conduct',
    body: 'Do not move an escrow order off-platform, share a delivery code before handover, submit false confirmation or return evidence, or pressure another user to bypass the process. These actions may remove escrow protection and can result in account suspension.',
  },
  {
    title: 'Operational interruptions',
    body: 'If a payment provider or network interruption makes a status uncertain, FuhsiMarket may pause release or refund until the external transaction is verified. This safety delay prevents the same money from being paid twice.',
  },
];

export default function EscrowPolicyPage() {
  return (
    <main className="min-h-[100dvh] bg-[#FAFAFA] font-sans text-[#2C2C2C]">
      <div className="mx-auto max-w-xl px-6 py-10 pb-16">
        <BrandLogo height={38} />
        <div className="mt-6 rounded-[1.75rem] border border-[#ECE5DE] bg-white p-7 shadow-[0_14px_40px_rgba(44,44,44,0.06)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#DE6437]">Legal</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Escrow Policy</h1>
          <p className="mt-2 text-xs text-[#81756D]">Last updated: 16 November 2026.</p>
          <ol className="mt-6 space-y-5">
            {sections.map((section, index) => (
              <li key={section.title}>
                <h2 className="flex items-baseline gap-2 text-sm font-bold">
                  <span className="text-[#DE6437]">{String(index + 1).padStart(2, '0')}</span>
                  {section.title}
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-[#5F5650]">{section.body}</p>
              </li>
            ))}
          </ol>
        </div>
        <Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#E7E0D8] bg-white px-6 py-3.5 text-sm font-bold hover:border-[#DE6437] hover:text-[#DE6437]">
          <ArrowLeft size={16} /> Back to market
        </Link>
      </div>
    </main>
  );
}
