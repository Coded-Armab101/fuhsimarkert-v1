'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Package, ShoppingBag, Settings, LogOut, Wallet, ArrowLeftRight } from 'lucide-react';
import OrderNotificationBell from '@/components/OrderNotificationBell';
import { createClient } from '@/utils/supabase';
import { useRouter } from 'next/navigation';
import SellerVerificationGate, { type SellerGateProfile } from '../SellerVerificationGate';

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [gateProfile, setGateProfile] = useState<SellerGateProfile | null>(null);
  const [gateLoading, setGateLoading] = useState(true);

  const refreshGate = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select(
        'full_name, is_admin, is_approved_seller, verification_status, verification_submitted_at, verification_reject_reason'
      )
      .eq('id', user.id)
      .maybeSingle();
    setGateProfile((data as SellerGateProfile | null) ?? null);
    setGateLoading(false);
  }, [supabase]);

  useEffect(() => {
    void refreshGate();
  }, [refreshGate]);

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

  // Paid sellers who have not been approved by an admin yet must NOT reach the
  // seller tools: the layout replaces the page with a verification onboarding
  // (ID + video) and hides the nav, so the only actions available are submitting
  // that verification or switching back to the buyer profile. Admins always pass.
  const approved =
    gateProfile?.is_admin === true || gateProfile?.is_approved_seller === true;
  const showGate = !isPaywall && !gateLoading && !approved;

  return (
    <div
      className={`seller-shell min-h-screen bg-[#fffdfa] text-[#251d18] relative ${
        isPaywall || showGate ? '' : 'pb-24'
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
        <div className="flex items-center gap-2">
          {approved && <OrderNotificationBell role="seller" />}
          <button
            onClick={() => router.push('/buyer/profile')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#fff0e9] text-xs font-bold text-[#b94a29] hover:bg-[#ffe2d2] transition-colors cursor-pointer"
            aria-label="Switch to your buyer profile"
          >
            <ArrowLeftRight size={13} />
            <span className="hidden sm:inline">Buyer</span>
            <span className="sm:hidden">Buyer</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#f6efe9] text-xs font-bold text-[#81756d] hover:text-[#b04a27] transition-colors cursor-pointer"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Exit</span>
            <span className="sm:hidden">Exit</span>
          </button>
        </div>
      </header>

      {/* Main Seller Screen */}
      <main className="p-4">
        {showGate && gateProfile ? (
          <SellerVerificationGate profile={gateProfile} onRefresh={refreshGate} />
        ) : gateLoading && !isPaywall ? (
          <div className="space-y-4 animate-pulse py-6">
            <div className="mx-auto max-w-xl rounded-[1.75rem] bg-[#eee4dc] h-44" />
            <div className="mx-auto max-w-xl rounded-[1.75rem] bg-[#f4eee9] h-64" />
          </div>
        ) : (
          children
        )}
      </main>

      {/* FIXED MOBILE BOTTOM NAVBAR FOR PWA */}
      {!isPaywall && !showGate && (
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