'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { Store, PackagePlus, ShoppingBag, TrendingUp, Loader2 } from 'lucide-react';

export default function SellerPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [productCount, setProductCount] = useState(0);

  useEffect(() => {
    const fetchSellerData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          router.push('/login?redirect=/seller');
          return;
        }

        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        setProfile(profileData);

        if (!profileData || profileData.is_seller !== true) {
          router.push('/seller/subscribe');
          return;
        }

        const { count } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('seller_id', user.id);

        setProductCount(count || 0);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load seller overview:', err);
        setLoading(false);
      }
    };

    fetchSellerData();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-xs font-mono text-neutral-400 gap-3">
        <Loader2 className="animate-spin text-red-500" size={24} />
        <span>Loading Vendor Studio...</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-950 border border-neutral-800 p-6 rounded-3xl shadow-2xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-xs font-mono font-bold">
            <Store size={14} /> Active Vendor Studio
          </div>
          <h1 className="text-2xl font-black text-white">
            Welcome, {profile?.full_name || 'Vendor'}
          </h1>
          <p className="text-xs text-neutral-400">
            Manage your store listings, track orders, and view payout status.
          </p>
        </div>

        <button
          onClick={() => router.push('/seller/products/new')}
          className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-950/40 cursor-pointer self-start md:self-auto"
        >
          <PackagePlus size={16} />
          <span>Add New Product</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
        <div className="bg-neutral-950 border border-neutral-800 p-5 rounded-2xl space-y-2">
          <div className="flex justify-between items-center text-neutral-400 text-xs">
            <span>Total Revenue</span>
            <TrendingUp size={16} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-white">₦0.00</div>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 p-5 rounded-2xl space-y-2">
          <div className="flex justify-between items-center text-neutral-400 text-xs">
            <span>Active Listings</span>
            <ShoppingBag size={16} className="text-blue-500" />
          </div>
          <div className="text-2xl font-black text-white">{productCount}</div>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 p-5 rounded-2xl space-y-2">
          <div className="flex justify-between items-center text-neutral-400 text-xs">
            <span>Subscription</span>
            <Store size={16} className="text-emerald-500" />
          </div>
          <div className="text-sm font-bold text-emerald-400 uppercase">ACTIVE</div>
        </div>
      </div>
    </div>
  );
}