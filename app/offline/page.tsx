import type { Metadata } from 'next';
import Link from 'next/link';
import { WifiOff } from 'lucide-react';

export const metadata: Metadata = {
  title: 'You are offline',
  description: 'FuhsiMarket is offline. Reconnect to keep browsing and manage your orders.',
};

/**
 * Shown by the service worker when a navigation fails and no cached copy of
 * the requested page exists. Deliberately static: it must render with no
 * network, no data fetching and no auth check.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-[#fff0e9]">
        <WifiOff className="text-[#ef6b3b]" size={28} />
      </div>
      <h1 className="mt-5 text-2xl font-black text-[#251d18]">You are offline</h1>
      <p className="mt-2 text-sm leading-6 text-[#81756d]">
        FuhsiMarket needs a connection to load orders, wallets and new products. Your saved cart
        is still on this device.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-[#ef6b3b] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#d8552e]"
      >
        Try again
      </Link>
      <p className="mt-4 text-[11px] font-mono text-[#9d9188]">
        Reconnect to Wi-Fi or mobile data, then tap the button.
      </p>
    </main>
  );
}
