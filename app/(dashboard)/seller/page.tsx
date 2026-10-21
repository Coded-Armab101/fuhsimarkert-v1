'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { Store, PackagePlus, ShoppingBag, TrendingUp, Clock } from 'lucide-react';
import { formatNaira } from '@/utils/money';

type Profile = {
  full_name?: string | null;
  is_seller?: boolean | null;
  subscription_expires_at?: string | null;
};

export default function SellerPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [productCount, setProductCount] = useState(0);
  const [balanceKobo, setBalanceKobo] = useState(0);

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

        const [{ count }, { data: wallet }] = await Promise.all([
          supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('seller_id', user.id),
          supabase.from('wallets').select('balance').eq('user_id', user.id).maybeSingle(),
        ]);

        setProductCount(count || 0);
        setBalanceKobo(wallet ? Number(wallet.balance) || 0 : 0);
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
      <div className="space-y-4 animate-pulse py-6">
        <div className="h-36 rounded-[2rem] bg-[#eee4dc]" />
        <div className="grid grid-cols-3 gap-3">{[1,2,3].map(item => <div key={item} className="h-28 rounded-2xl bg-[#f4eee9]" />)}</div>
      </div>
    );
  }

  return (
    <div className="seller-secondary max-w-5xl mx-auto py-3 px-1 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-[#eee4dc] p-6 rounded-[2rem] shadow-sm">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#fff0e9] text-[#c9552e] text-xs font-bold">
            <Store size={14} /> Your seller space
          </div>
<h1 className="text-2xl font-black text-[#251d18]">
            Welcome, {profile?.full_name || 'Vendor'}
          </h1>
          <p className="text-xs text-[#81756d]">
            Add products, prepare orders, and see your earnings.
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
<div className="bg-white border border-[#eee4dc] p-5 rounded-2xl space-y-2 shadow-sm">
          <div className="flex justify-between items-center text-[#81756d] text-xs">
            <span>Wallet Balance</span>
            <TrendingUp size={16} className="text-[#17805b]" />
          </div>
          <button
            onClick={() => router.push('/seller/wallet')}
            className="text-2xl font-black text-[#17805b] hover:text-[#0f6b4a] transition-colors cursor-pointer"
            title="View wallet"
          >
            ₦{formatNaira(balanceKobo)}
          </button>
        </div>

        <div className="bg-white border border-[#eee4dc] p-5 rounded-2xl space-y-2 shadow-sm">
          <div className="flex justify-between items-center text-[#81756d] text-xs">
            <span>Active Listings</span>
            <ShoppingBag size={16} className="text-blue-500" />
          </div>
          <div className="text-2xl font-black text-[#251d18]">{productCount}</div>
        </div>

        {(() => {
          const expiresAtDate = profile?.subscription_expires_at
            ? new Date(profile.subscription_expires_at)
            : null;
          const isValidDate = expiresAtDate && !Number.isNaN(expiresAtDate.getTime());
          const daysLeft = isValidDate
            ? Math.ceil((expiresAtDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null;
          const isExpiringSoon = daysLeft !== null && daysLeft <= 7;
          const formattedExpiry = isValidDate
            ? expiresAtDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
            : null;

          return (
            <div className="bg-white border border-[#eee4dc] p-5 rounded-2xl space-y-2 shadow-sm">
              <div className="flex justify-between items-center text-[#81756d] text-xs">
                <span>Subscription</span>
                <Clock size={16} className={isExpiringSoon ? 'text-amber-500' : 'text-[#17805b]'} />
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded uppercase ${
                    isExpiringSoon
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}
                >
                  {isExpiringSoon ? 'Expiring Soon' : 'Active'}
                </span>
              </div>
              {formattedExpiry && (
                <p className="text-[10px] text-[#81756d] font-mono mt-1">
                  Expires on <strong className="text-[#251d18]">{formattedExpiry}</strong>
                  {daysLeft !== null && ` (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`}
                </p>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
