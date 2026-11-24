'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { supportWhatsappUrl } from '@/utils/support';

const SUPPORT_MESSAGE =
  'Hello FuhsiMarket support, I paid for an order but it has not reflected yet. Please help me verify my payment.';

/**
 * Global, low-priority support entry point. It sits above the bottom navigation
 * and PWA install card but below modals/toasts. When a WhatsApp number is
 * configured it opens the existing wa.me link; otherwise it still gives buyers
 * and sellers a working route to the Support Center. Hidden on /buyer* (where
 * Support is a bottom-nav item) and on the admin board.
 */
export default function SupportWhatsAppButton() {
  const pathname = usePathname() || '';
  const href = supportWhatsappUrl(SUPPORT_MESSAGE);

  if (pathname.startsWith('/buyer') || pathname.startsWith('/admin-dashboard')) return null;

  const className =
    'fixed bottom-32 right-4 z-[75] inline-flex items-center gap-2 rounded-full bg-[#25D366] px-3.5 py-3 text-xs font-bold text-[#06251a] shadow-lg shadow-black/20 transition-transform hover:scale-105 active:scale-95';
  const content = (
    <>
      <MessageCircle size={18} strokeWidth={2.4} />
      <span className="hidden sm:inline">Need help?</span>
    </>
  );

  if (!href) {
    return (
      <Link
        href="/buyer/support"
        aria-label="Open the FuhsiMarket support center"
        title="Paid but it has not reflected? Open the support center"
        className={className}
      >
        {content}
      </Link>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contact FuhsiMarket support on WhatsApp"
      title="Paid but it has not reflected? Chat support on WhatsApp"
      className={className}
    >
      {content}
    </a>
  );
}
