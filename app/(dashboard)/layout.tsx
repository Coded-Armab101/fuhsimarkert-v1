'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Package, Plus, Receipt, Settings } from 'lucide-react';

export default function SellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const navItems = [
    {
      label: 'Home',
      href: '/seller',
      icon: LayoutDashboard,
    },
    {
      label: 'Products',
      href: '/seller/products',
      icon: Package,
    },
    {
      label: 'Post',
      href: '/seller/products/new',
      icon: Plus,
      isAction: true,
    },
    {
      label: 'Orders',
      href: '/seller/orders',
      icon: Receipt,
    },
    {
      label: 'Settings',
      href: '/seller/settings',
      icon: Settings,
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white relative pb-28">
      {/* SELLER PAGES CONTENT */}
      <main className="w-full">{children}</main>

      {/* FIXED SELLER FLOATING BOTTOM NAV BAR */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md">
        <div className="bg-neutral-950/95 backdrop-blur-xl border border-neutral-800/80 p-2 rounded-2xl shadow-2xl flex items-center justify-between gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            
            // Check exact match for root `/seller` or sub-route match
            const isActive =
              item.href === '/seller'
                ? pathname === '/seller'
                : pathname?.startsWith(item.href);

            if (item.isAction) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex-1 flex flex-col items-center justify-center group"
                >
                  <div className="bg-red-600 group-hover:bg-red-500 text-white p-2.5 rounded-xl shadow-lg shadow-red-950/60 transition-transform active:scale-95 flex items-center justify-center">
                    <Icon size={18} strokeWidth={2.5} />
                  </div>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all ${
                  isActive
                    ? 'bg-neutral-900 text-red-500 font-bold border border-neutral-800 shadow-inner'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900/50'
                }`}
              >
                <Icon size={18} />
                <span className="text-[10px] font-mono tracking-tight mt-1">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}