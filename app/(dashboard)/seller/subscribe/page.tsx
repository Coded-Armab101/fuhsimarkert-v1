'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Store, CheckCircle2, ShieldCheck, ArrowRight, Lock, Loader2, AlertCircle } from 'lucide-react';
import { createClient } from '@/utils/supabase';
import PaystackPop from '@paystack/inline-js';

export default function SellerSubscribePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [profileIncomplete, setProfileIncomplete] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/login?redirect=/seller/subscribe');
        return;
      }
      setUser(authUser);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      setProfile(profileData);

      if (!profileData?.bank_name || !profileData?.account_number || !profileData?.full_name) {
        setProfileIncomplete(true);
      }

      setLoading(false);
    };

    fetchUserData();
  }, [router, supabase]);

  const verifySubscription = async (reference: string) => {
    try {
      const expireDate = new Date();
      expireDate.setDate(expireDate.getDate() + 30);

      const res = await fetch('/api/seller/verify-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: reference,
          userId: user.id,
          expiresAt: expireDate.toISOString(),
        }),
      });

      if (res.ok) {
        alert('Subscription activated successfully!');
        window.location.href = '/seller/dashboard';
      } else {
        alert('Payment received, but activation failed. Please contact support.');
      }
    } catch (error) {
      console.error('Error verifying payment:', error);
      alert('An error occurred during verification.');
    } finally {
      setProcessing(false);
    }
  };

  const handlePaystackPayment = () => {
    if (profileIncomplete) {
      alert('Please complete your profile details before placing an order!');
      router.push('/profile');
      return;
    }

    if (!user || !user.id || !user.email) {
      alert('User session not loaded. Please refresh or log in again.');
      return;
    }

    setProcessing(true);

    try {
      const popup = new PaystackPop();
      popup.newTransaction({
        key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || 'pk_test_xxx',
        email: user.email,
        amount: 1500 * 100, // ₦1,500 in kobo
        currency: 'NGN',
        ref: `SUB_SELLER_${user.id.slice(0, 5)}_${Date.now()}`,
        metadata: {
          custom_fields: [
            { display_name: 'User ID', variable_name: 'user_id', value: user.id },
            { display_name: 'Subscription Type', variable_name: 'type', value: 'seller_monthly' }
          ]
        },
        onSuccess: (transaction: { reference: string }) => {
          verifySubscription(transaction.reference);
        },
        onCancel: () => {
          setProcessing(false);
          alert('Transaction cancelled.');
        }
      });
    } catch (err) {
      console.error('Paystack transaction error:', err);
      setProcessing(false);
      alert('Failed to launch Paystack modal. Please check console for details.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-xs font-mono text-neutral-400 gap-3">
        <Loader2 className="animate-spin text-red-500" size={24} />
        <span>Loading Vendor Subscription Portal...</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      {/* BANNER HEADER */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-3xl p-6 sm:p-8 space-y-3 relative overflow-hidden shadow-2xl">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/60 border border-red-800/60 text-red-400 text-xs font-mono font-bold">
          <Store size={14} /> FUHSI Vendor Ecosystem
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white">Activate Your Seller Studio</h1>
        <p className="text-xs sm:text-sm text-neutral-400 max-w-xl">
          Start listing products, host your campus storefront, and receive direct escrow-backed payments from FUHSI students.
        </p>
      </div>

      {/* PROFILE INCOMPLETE ALERT */}
      {profileIncomplete && (
        <div className="bg-amber-950/40 border border-amber-800/60 rounded-2xl p-4 flex items-start gap-3 text-amber-300 text-xs">
          <AlertCircle size={18} className="shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block">Bank Payout Info Required</span>
            <span>You haven't linked your 10-digit Nigerian bank account in your profile yet. Please complete it so sales revenue can be routed to you.</span>
            <button
              onClick={() => router.push('/profile')}
              className="mt-2 text-xs font-bold underline text-amber-200 block hover:text-white"
            >
              Go to Profile to Update Bank Info &rarr;
            </button>
          </div>
        </div>
      )}

      {/* PRICING & FEATURES CARD */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-neutral-900 pb-6">
          <div>
            <h2 className="text-lg font-bold text-white">Monthly Vendor Pass</h2>
            <p className="text-xs text-neutral-400">Full access to sell unlimited products on campus</p>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-3xl font-black font-mono text-red-500">₦1,500</span>
            <span className="text-xs text-neutral-500 block font-mono">/ per month</span>
          </div>
        </div>

        {/* INCLUDED PRIVILEGES */}
        <div className="space-y-3">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-400">Included Privileges</h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-neutral-300 font-mono">
            <li className="flex items-center gap-2 bg-neutral-900/60 p-3 rounded-xl border border-neutral-800">
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
              <span>Unlimited Campus Listings</span>
            </li>
            <li className="flex items-center gap-2 bg-neutral-900/60 p-3 rounded-xl border border-neutral-800">
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
              <span>Dedicated Vendor Store Page</span>
            </li>
            <li className="flex items-center gap-2 bg-neutral-900/60 p-3 rounded-xl border border-neutral-800">
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
              <span>Escrow Anti-Scam Buyer Protection</span>
            </li>
            <li className="flex items-center gap-2 bg-neutral-900/60 p-3 rounded-xl border border-neutral-800">
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
              <span>Real-time Orders & Sales Analytics</span>
            </li>
          </ul>
        </div>

        {/* PAYMENT BUTTON */}
        <div className="pt-2">
          <button
            onClick={handlePaystackPayment}
            disabled={processing || profileIncomplete}
            className="w-full bg-red-600 hover:bg-red-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold text-sm py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-950/40 cursor-pointer"
          >
            {processing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Initializing Paystack Channel...</span>
              </>
            ) : (
              <>
                <Lock size={16} />
                <span>Pay ₦1,500 via Dynamic Bank Transfer / Card</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>

        {/* TRUST BADGES */}
        <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-500 font-mono pt-2">
          <ShieldCheck size={14} className="text-emerald-500" />
          <span>Secured by Paystack • Instant Automated Verification</span>
        </div>
      </div>
    </div>
  );
}