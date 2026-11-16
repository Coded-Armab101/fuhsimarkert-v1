import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

const sections = [
  {
    title: 'When a refund can be requested',
    body: 'A buyer may report a problem before accepting an order when an item was not supplied, is materially different from the listing, is damaged or counterfeit, or the agreed fulfilment cannot be completed. A change of mind is not automatically refundable once a seller has fulfilled the listing as described.',
  },
  {
    title: 'Open a dispute first',
    body: 'Use the order’s “Report a problem” action and give an accurate reason. Opening a dispute freezes any escrow still held while the return and evidence are checked. Do not confirm satisfactory receipt if there is an unresolved problem, because confirmation releases the seller’s earnings.',
  },
  {
    title: 'Returns before refunds',
    body: 'If the buyer already has the item, it must normally be returned in substantially the same condition before a refund is finalized. The affected seller confirms receipt in FuhsiMarket. If a seller does not respond or the parties disagree, an administrator may decide from handover records, photos, messages and other evidence. Falsely claiming a return or refusing a valid return may lead to suspension.',
  },
  {
    title: 'How money is returned',
    body: 'The part originally paid through Paystack is returned through Paystack where available. Any wallet-paid part is credited to the FuhsiMarket wallet. If Paystack definitively refuses an automatic card refund, the protected amount may be credited to the wallet instead so the buyer is not left unpaid.',
  },
  {
    title: 'Timing',
    body: 'Wallet credits are normally visible after the refund is finalized. Paystack card refunds can take approximately 5–10 business days to appear, depending on the bank. A pending card refund remains subject to Paystack and the issuing bank’s processing time.',
  },
  {
    title: 'Delivery and service fees',
    body: 'Amounts still held in escrow are reviewed as part of the disputed transaction. A fee for a service that was fully and correctly supplied may not be refundable. The final split follows the order record, payment method and evidence available for that dispute.',
  },
  {
    title: 'Seller subscriptions',
    body: 'A seller subscription or activation period is generally non-refundable after access has been activated. A rejected identity submission does not automatically refund that fee because the seller may correct and resubmit during the active period. Duplicate charges or an activation that cannot be provided should be reported to support.',
  },
  {
    title: 'Abuse and exceptional cases',
    body: 'FuhsiMarket may deny a dishonest claim, resolve escrow in the other party’s favour, request more evidence, or suspend an account involved in refund abuse, fraud or illegal activity. Nothing in this policy removes rights that cannot lawfully be excluded.',
  },
];

export default function RefundPolicyPage() {
  return (
    <main className="min-h-[100dvh] bg-[#FAFAFA] font-sans text-[#2C2C2C]">
      <div className="mx-auto max-w-xl px-6 py-10 pb-16">
        <BrandLogo height={38} />
        <div className="mt-6 rounded-[1.75rem] border border-[#ECE5DE] bg-white p-7 shadow-[0_14px_40px_rgba(44,44,44,0.06)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#DE6437]">Legal</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Refund & Return Policy</h1>
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
