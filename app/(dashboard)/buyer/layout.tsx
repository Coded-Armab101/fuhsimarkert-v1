'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ShoppingCart, Clock, User, Heart } from 'lucide-react';

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const buyerNav = [
    { label: 'Home', href: '/buyer', icon: Home },
    { label: 'Cart', href: '/buyer/cart', icon: ShoppingCart },
    { label: 'Saved', href: '/buyer/wishlist', icon: Heart },
    { label: 'Orders', href: '/buyer/orders', icon: Clock },
    { label: 'Account', href: '/buyer/profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-[#fffdfa] text-[#251d18] relative pb-24">
      <main className="p-4">{children}</main>

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
    </div>
  );
}
