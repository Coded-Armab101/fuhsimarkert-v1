'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ShoppingCart, Clock, User, Heart, MessageCircle } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { createClient } from '@/utils/supabase';
import OnboardingGuide from '@/components/OnboardingGuide';

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { totalItems } = useCart();
  const [savedCount, setSavedCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    const supabase = createClient();
    let userId: string | null = null;
    let stopped = false;
    let requestInFlight = false;
    const load = async () => {
      try {
        if (document.visibilityState !== 'visible' || !userId || stopped || requestInFlight) return;
        requestInFlight = true;
        // The badge now counts real unread inbox rows written by trusted server
        // code, not localStorage/derived order statuses. An alert generated
        // while the tab was closed is still unread when the buyer returns.
        const { count, error } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .is('read_at', null);
        if (stopped || error) return;
        setUnreadCount(count || 0);
      } finally {
        requestInFlight = false;
      }
    };
    const start = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || stopped) return;
      userId = user.id;
      await load();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const onMarked = () => void load();
    void start();
    // One lightweight refresh per minute while the tab is visible. The old
    // 15-second loop also called Auth every time, multiplying Supabase traffic.
    const t = window.setInterval(() => void load(), 60000);
    document.addEventListener('visibilitychange', onVisible);
    // The bell dispatches this event after "Mark all read" so the bottom nav
    // updates immediately instead of waiting for the next poll.
    window.addEventListener('fuhsi-notifications-read', onMarked);
    return () => {
      stopped = true;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('fuhsi-notifications-read', onMarked);
    };
  }, []);
  useEffect(() => { const supabase = createClient(); void (async () => { const { data: { user } } = await supabase.auth.getUser(); if (!user) return; const { count } = await supabase.from('wishlists').select('*', { count: 'exact', head: true }).eq('user_id', user.id); setSavedCount(count || 0); })(); }, []);

  const buyerNav = [
    { label: 'Home', href: '/buyer', icon: Home },
    { label: 'Cart', href: '/buyer/cart', icon: ShoppingCart },
    { label: 'Saved', href: '/buyer/wishlist', icon: Heart },
    { label: 'Orders', href: '/buyer/orders', icon: Clock },
    { label: 'Support', href: '/buyer/support', icon: MessageCircle },
    { label: 'Account', href: '/buyer/profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-[#fffdfa] text-[#251d18] relative pb-24">
      <main className={pathname === '/buyer' ? 'px-4 pb-4' : 'p-4'}>{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#eee6de] bg-white/95 px-1 py-2 backdrop-blur-xl flex items-center justify-around safe-area-pb sm:px-2">
        {buyerNav.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === '/buyer'
              ? pathname === '/buyer'
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all sm:px-2 ${
                isActive
                  ? 'bg-[#fff0e9] text-[#d8552e] font-bold'
                  : 'text-[#8f8279] hover:text-[#443832]'
              }`}
            >
              <Icon size={20} />
              {((item.href === '/buyer/cart' && totalItems > 0) || (item.href === '/buyer/wishlist' && savedCount > 0) || (item.href === '/buyer/orders' && unreadCount > 0)) && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#ef6b3b] px-1 text-[9px] font-black text-white">{item.href === '/buyer/cart' ? totalItems : item.href === '/buyer/wishlist' ? savedCount : unreadCount}</span>}
              <span className="mt-1 text-[9px] font-mono sm:text-[10px]">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <OnboardingGuide role="buyer" />
    </div>
  );
}
