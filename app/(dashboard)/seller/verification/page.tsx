'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import SellerVerificationGate, { type SellerGateProfile } from '../../SellerVerificationGate';

export default function SellerVerificationPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<SellerGateProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login?redirect=/seller/verification'); return; }
    const { data } = await supabase.from('profiles').select(
      'full_name, is_admin, is_approved_seller, verification_status, verification_submitted_at, verification_reject_reason'
    ).eq('id', user.id).maybeSingle();
    setProfile((data as SellerGateProfile | null) ?? null);
    setLoading(false);
  }, [router, supabase]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (profile?.is_admin || profile?.is_approved_seller) router.replace('/seller');
  }, [profile, router]);

  if (loading || !profile) return <div className="mx-auto max-w-xl py-10 animate-pulse"><div className="h-44 rounded-[1.75rem] bg-[#eee4dc]"/><div className="mt-4 h-64 rounded-[1.75rem] bg-[#f4eee9]"/></div>;
  return <SellerVerificationGate profile={profile} onRefresh={refresh} />;
}
