'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Package, ShoppingBag, Settings, LogOut, Wallet } from 'lucide-react';
import { createClient } from '@/utils/supabase';
import { useRouter } from 'next/navigation';

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const sellerNav = [
    { label: 'Overview', href: '/seller', icon: LayoutDashboard },
    { label: 'Products', href: '/seller/products', icon: Package },
    { label: 'Sales', href: '/seller/orders', icon: ShoppingBag },
    { label: 'Wallet', href: '/seller/wallet', icon: Wallet },
    { label: 'Settings', href: '/seller/settings', icon: Settings },
  ];

  // On the paywall the visitor has no seller subscription, so every nav link
  // would just bounce them back here. Hide the nav rather than offer dead ends.
  const isPaywall = pathname === '/seller/subscribe';

  return (
    <div
      className={`seller-shell min-h-screen bg-[#fffdfa] text-[#251d18] relative ${
        isPaywall ? '' : 'pb-24'
      }`}
    >
      {/* Top Header Mobile Safe Zone */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[#eee4dc] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ef6b3b] animate-pulse"></span>
          <span className="text-xs font-bold tracking-wider text-[#d8552e] uppercase">
            FuhsiMarket Seller
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#fff0e9] text-xs font-bold text-[#b94a29]"
        >
          <LogOut size={13} />
          <span>Exit</span>
        </button>
      </header>

      {/* Main Seller Screen */}
      <main className="p-4">{children}</main>

      {/* FIXED MOBILE BOTTOM NAVBAR FOR PWA */}
      {!isPaywall && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-[#eee4dc] px-2 py-2 flex items-center justify-around safe-area-pb">
          {sellerNav.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/seller'
                ? pathname === '/seller'
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-[#fff0e9] text-[#d8552e] font-bold'
                    : 'text-[#8f8279] hover:text-[#443832]'
                }`}
              >
                <Icon size={20} />
                <span className="text-[10px] font-mono mt-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
