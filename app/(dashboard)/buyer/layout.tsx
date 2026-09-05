'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ShoppingCart, Clock, User, Heart } from 'lucide-react';

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const buyerNav = [
    { label: 'Market', href: '/buyer', icon: Home },
    { label: 'Cart', href: '/buyer/cart', icon: ShoppingCart },
    { label: 'Saved', href: '/buyer/wishlist', icon: Heart },
    { label: 'Orders', href: '/buyer/orders', icon: Clock },
    { label: 'Account', href: '/buyer/profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-black text-white relative select-none pb-24">
      <main className="p-4">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-950/95 backdrop-blur-xl border-t border-neutral-800 px-2 py-2 flex items-center justify-around safe-area-pb">
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
                  ? 'text-red-500 font-bold scale-105'
                  : 'text-neutral-500 hover:text-neutral-300'
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