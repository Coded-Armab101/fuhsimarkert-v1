'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShoppingBag, CreditCard, Heart, User, Sparkles, LogOut, ShoppingCart } from 'lucide-react';
import { createClient } from '@/utils/supabase';

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

const navTabs = [
  { name: 'Shop', href: '/buyer', icon: ShoppingBag },
  { name: 'Cart', href: '/buyer/cart', icon: ShoppingCart }, // ◄── Added Here
  { name: 'Orders', href: '/buyer/orders', icon: CreditCard },
  { name: 'Wishlist', href: '/buyer/wishlist', icon: Heart },
  { name: 'Profile', href: '/buyer/profile', icon: User },
];
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 flex flex-col pb-20 md:pb-0 md:pl-64">
      
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col justify-between fixed left-0 top-0 bottom-0 w-64 bg-neutral-950 border-r border-neutral-800 p-6">
        <div className="space-y-8">
          <div className="flex items-center space-x-2">
            <span className="text-xl font-black tracking-wider text-red-500">FUHSI<span className="text-white">MARKET</span></span>
          </div>
          
          <nav className="space-y-2">
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = pathname === tab.href;
              return (
                <Link
                  key={tab.name}
                  href={tab.href}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive 
                      ? 'bg-red-700 text-white font-bold' 
                      : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                  }`}
                >
                  <Icon size={18} />
                  <span>{tab.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <button 
          onClick={handleSignOut}
          className="flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium text-neutral-500 hover:bg-red-950/20 hover:text-red-400 transition-all cursor-pointer w-full text-left"
        >
          <LogOut size={18} />
          <span>Logout Session</span>
        </button>
      </aside>

      {/* MOBILE HEADER */}
      <header className="md:hidden h-16 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between px-4 sticky top-0 z-40">
        <span className="text-lg font-black tracking-wider text-red-500">FUHSI<span className="text-white">MARKET</span></span>
        <div className="flex items-center space-x-2 text-xs text-amber-500 bg-amber-950/30 border border-amber-900/30 px-2.5 py-1 rounded-full font-mono font-bold">
          <Sparkles size={12} />
          <span>P2P Escrow</span>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-4 md:p-8 max-w-5xl w-full mx-auto">
        {children}
      </main>

      {/* MOBILE BOTTOM NAVIGATION */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-neutral-950/95 backdrop-blur border-t border-neutral-800 flex items-center justify-around px-2 z-40 shadow-2xl">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={`flex flex-col items-center justify-center flex-1 h-full space-y-1 transition-all ${
                isActive ? 'text-red-500 font-bold' : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <Icon size={20} className={isActive ? 'scale-110 transition-transform' : ''} />
              <span className="text-[10px] tracking-tight">{tab.name}</span>
            </Link>
          );
        })}
      </nav>

    </div>
  );
}