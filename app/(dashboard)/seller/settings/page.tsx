'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { Settings, Building2, Loader2 } from 'lucide-react';

export default function SellerSettingsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          return;
        }

        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        setProfile(data);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };

    fetchSettings();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-xs font-mono text-neutral-400 gap-2">
        <Loader2 className="animate-spin text-red-500" size={20} />
        <span>Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      <div className="bg-neutral-950 border border-neutral-800 p-6 rounded-3xl flex items-center gap-3">
        <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-2xl text-neutral-300">
          <Settings size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Vendor Settings</h1>
          <p className="text-xs text-neutral-400">Payout details & store configuration</p>
        </div>
      </div>

      <div className="bg-neutral-950 border border-neutral-800 rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-xs font-mono font-bold text-red-400">
          <Building2 size={16} />
          <span>Payout Bank Account</span>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl font-mono text-xs space-y-2 text-neutral-300">
          <div><span className="text-neutral-500">Bank:</span> {profile?.bank_name || 'Not set'}</div>
          <div><span className="text-neutral-500">Account Number:</span> {profile?.account_number || 'Not set'}</div>
          <div><span className="text-neutral-500">Account Name:</span> {profile?.account_name || profile?.full_name || 'Not set'}</div>
        </div>

        <button
          onClick={() => router.push('/profile')}
          className="text-xs font-mono text-red-400 hover:text-red-300 underline cursor-pointer"
        >
          Update Bank Account in Main Profile →
        </button>
      </div>
    </div>
  );
}