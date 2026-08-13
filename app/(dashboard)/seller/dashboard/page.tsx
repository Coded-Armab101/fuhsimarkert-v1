'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { Store, PackagePlus, ShoppingBag, TrendingUp, Loader2 } from 'lucide-react';

export default function SellerDashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    const checkSellerAccess = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
          console.log('No active user session, redirecting to login');
          router.push('/login?redirect=/seller/dashboard');
          return;
        }

        // Query profiles with no-cache mode using single()
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        console.log('Profile loaded on dashboard:', profileData);

        if (profileError) {
          console.error('Error fetching profile:', profileError);
        }

        setProfile(profileData);

        // Check if is_seller is explicitly false (or missing)
        if (!profileData || profileData.is_seller !== true) {
          console.warn('User is not marked as seller. Redirecting to subscribe...');
          router.push('/seller/subscribe');
          return;
        }

        setLoading(false);
      } catch (err) {
        console.error('Dashboard authorization check failed:', err);
        setLoading(false);
      }
    };

    checkSellerAccess();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-xs font-mono text-neutral-400 gap-3">
        <Loader2 className="animate-spin text-red-500" size={24} />
        <span>Verifying Vendor Subscription...</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-950 border border-neutral-800 p-6 sm:p-8 rounded-3xl shadow-2xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-xs font-mono font-bold">
            <Store size={14} /> Active Vendor Studio
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white">
            Welcome, {profile?.full_name || 'Vendor'}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400">
            Manage your store listings, track orders, and view sales payouts.
          </p>
        </div>

        <button
          onClick={() => router.push('/seller/products/new')}
          className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-3 px-5 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-950/40 cursor-pointer self-start md:self-auto"
        >
          <PackagePlus size={16} />
          <span>Add New Product</span>
        </button>
      </div>

      {/* METRICS STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
        <div className="bg-neutral-950 border border-neutral-800 p-5 rounded-2xl space-y-2">
          <div className="flex justify-between items-center text-neutral-400 text-xs">
            <span>Total Earnings</span>
            <TrendingUp size={16} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-white">₦0.00</div>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 p-5 rounded-2xl space-y-2">
          <div className="flex justify-between items-center text-neutral-400 text-xs">
            <span>Active Products</span>
            <ShoppingBag size={16} className="text-blue-500" />
          </div>
          <div className="text-2xl font-black text-white">0</div>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 p-5 rounded-2xl space-y-2">
          <div className="flex justify-between items-center text-neutral-400 text-xs">
            <span>Subscription Status</span>
            <Store size={16} className="text-emerald-500" />
          </div>
          <div className="text-sm font-bold text-emerald-400 uppercase">ACTIVE</div>
        </div>
      </div>

      {/* STOREFRONT MANAGEMENT CONTAINER */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-3xl p-6 sm:p-8 space-y-4 shadow-xl">
        <h2 className="text-lg font-bold text-white">Your Campus Storefront</h2>
        <p className="text-xs text-neutral-400">
          You have no active product listings on FUHSI Market yet. Click "Add New Product" above to create your first listing.
        </p>
      </div>
    </div>
  );
}