'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import {
  User,
  Building2,
  ArrowRightLeft,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Save,
} from 'lucide-react';

export default function SellerSettingsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Profile Form States
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push('/login?redirect=/seller/settings');
          return;
        }

        setEmail(user.email || '');

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (profile) {
          setFullName(profile.full_name || '');
          setBankName(profile.bank_name || '');
          setAccountNumber(profile.account_number || '');
          setAccountName(profile.account_name || profile.full_name || '');
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading settings:', err);
        setLoading(false);
      }
    };

    fetchUserData();
  }, [router, supabase]);

  // Save changes to profile & bank info
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage('');

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      if (accountNumber && !/^\d{10}$/.test(accountNumber)) {
        alert('Account number must be exactly 10 digits.');
        setSaving(false);
        return;
      }

      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: fullName.trim(),
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        account_name: accountName.trim(),
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      setSuccessMessage('Settings updated successfully!');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      console.error('Failed to update settings:', err);
      alert('Failed to update settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Switch mode to Buyer
  const handleSwitchToBuyer = () => {
    router.push('/buyer'); // Redirects to buyer home/market
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-xs font-mono text-neutral-400 gap-2">
        <Loader2 className="animate-spin text-red-500" size={22} />
        <span>Loading Vendor Settings...</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6 pb-28">
      {/* HEADER & SWITCH ROLE BANNER */}
      <div className="bg-neutral-950 border border-neutral-800 p-6 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/60 border border-red-800/60 text-red-400 text-xs font-mono font-bold">
            <ShieldCheck size={14} /> Vendor Settings
          </div>
          <h1 className="text-xl font-bold text-white">Account & Payouts</h1>
          <p className="text-xs text-neutral-400">
            Manage your personal profile and bank account for automated payouts.
          </p>
        </div>

        {/* SWITCH TO BUYER BUTTON */}
        <button
          onClick={handleSwitchToBuyer}
          className="bg-neutral-900 hover:bg-neutral-800 text-white font-mono text-xs py-2.5 px-4 rounded-xl border border-neutral-700 transition-all flex items-center justify-center gap-2 cursor-pointer self-start sm:self-auto shadow-md"
        >
          <ArrowRightLeft size={15} className="text-red-500" />
          <span>Switch to Buyer Mode</span>
        </button>
      </div>

      {successMessage && (
        <div className="bg-emerald-950/80 border border-emerald-800/80 p-4 rounded-2xl flex items-center gap-2 text-emerald-400 text-xs font-mono">
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* PERSONAL DETAILS SECTION */}
        <div className="bg-neutral-950 border border-neutral-800 p-6 rounded-3xl space-y-4">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-neutral-200 uppercase tracking-wider">
            <User size={16} className="text-red-500" />
            <span>Personal Information</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-neutral-400">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-red-600 transition-colors"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-neutral-400">
                Email Address (Read-only)
              </label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full bg-neutral-900/50 border border-neutral-800/50 rounded-xl px-4 py-3 text-xs text-neutral-500 cursor-not-allowed"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-mono text-neutral-400">
                Bank Account Number
              </label>
              <input
                type="text"
                maxLength={10}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 8123456789"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-red-600 transition-colors font-mono"
              />
            </div>
          </div>
        </div>

        {/* BANK PAYOUT DETAILS SECTION */}
        <div className="bg-neutral-950 border border-neutral-800 p-6 rounded-3xl space-y-4">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-neutral-200 uppercase tracking-wider">
            <Building2 size={16} className="text-emerald-500" />
            <span>Bank Account Details (For Payouts)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-neutral-400">
                Bank Name
              </label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. OPay / Palmpay / GTBank"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-red-600 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-neutral-400">
                Account Number
              </label>
              <input
                type="text"
                maxLength={10}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 8123456789"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-red-600 transition-colors font-mono"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-mono text-neutral-400">
                Account Name
              </label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Must match your bank account title"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-red-600 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* SAVE BUTTON */}
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-3.5 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xl shadow-red-950/50"
        >
          {saving ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <Save size={16} />
          )}
          <span>{saving ? 'Saving Settings...' : 'Save Settings'}</span>
        </button>
      </form>
    </div>
  );
}