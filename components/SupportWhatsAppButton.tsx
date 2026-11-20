'use client';

import { usePathname } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { supportWhatsappUrl } from '@/utils/support';

const SUPPORT_MESSAGE =
  'Hello FuhsiMarket support, I paid for an order but it has not reflected yet. Please help me verify my payment.';

/**
 * Global, low-priority support entry point. It sits above the bottom navigation
 * and PWA install card but below modals/toasts, and is hidden on the admin board
 * (operators do not need a buyer-facing contact button there). The whole button
 * disappears until NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER is configured.
 */
export default function SupportWhatsAppButton() {
  const pathname = usePathname() || '';
  const href = supportWhatsappUrl(SUPPORT_MESSAGE);

  if (!href || pathname.startsWith('/admin-dashboard')) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contact FuhsiMarket support on WhatsApp"
      title="Paid but it has not reflected? Chat support on WhatsApp"
      className="fixed bottom-32 right-4 z-[75] inline-flex items-center gap-2 rounded-full bg-[#25D366] px-3.5 py-3 text-xs font-bold text-[#06251a] shadow-lg shadow-black/20 transition-transform hover:scale-105 active:scale-95"
    >
      <MessageCircle size={18} strokeWidth={2.4} />
      <span className="hidden sm:inline">Need help?</span>
    </a>
  );
}
