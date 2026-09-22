'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ShoppingCart, Clock, User, Heart } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { createClient } from '@/utils/supabase';

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { totalItems } = useCart();
  const [savedCount, setSavedCount] = useState(0);
  useEffect(() => { const supabase = createClient(); void (async () => { const { data: { user } } = await supabase.auth.getUser(); if (!user) return; const { count } = await supabase.from('wishlists').select('*', { count: 'exact', head: true }).eq('user_id', user.id); setSavedCount(count || 0); })(); }, []);

  const buyerNav = [
    { label: 'Home', href: '/buyer', icon: Home },
    { label: 'Cart', href: '/buyer/cart', icon: ShoppingCart },
    { label: 'Saved', href: '/buyer/wishlist', icon: Heart },
    { label: 'Orders', href: '/buyer/orders', icon: Clock },
    { label: 'Account', href: '/buyer/profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-[#fffdfa] text-[#251d18] relative pb-24">
      <main className={pathname === '/buyer' ? 'px-4 pb-4' : 'p-4'}>{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#eee6de] bg-white/95 px-2 py-2 backdrop-blur-xl flex items-center justify-around safe-area-pb">
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
              className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
                isActive
                  ? 'bg-[#fff0e9] text-[#d8552e] font-bold'
                  : 'text-[#8f8279] hover:text-[#443832]'
              }`}
            >
              <Icon size={20} />
              {((item.href === '/buyer/cart' && totalItems > 0) || (item.href === '/buyer/wishlist' && savedCount > 0)) && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#ef6b3b] px-1 text-[9px] font-black text-white">{item.href === '/buyer/cart' ? totalItems : savedCount}</span>}
              <span className="text-[10px] font-mono mt-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
