'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase';
import { formatNaira } from '@/utils/money';
import {
  ShieldCheck,
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  HardDrive,
  Check,
  X,
  IdCard,
  Video,
  Eye,
  Package,
  Clock,
  TriangleAlert,
  LayoutDashboard,
  Users,
  RefreshCw,
  Sun,
  Moon,
  Wallet,
} from 'lucide-react';
import OverviewTab from './_components/OverviewTab';
import MoneyTab from './_components/MoneyTab';
import PeopleTab from './_components/PeopleTab';
import type { AdminOverview, AdminTab } from '@/utils/admin/metrics';

type Withdrawal = {
  id: string;
  seller_id: string;
  amount_kobo: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'rejected';
  transfer_status?: string | null;
  transfer_reference?: string | null;
  request_note?: string | null;
  created_at: string;
  processed_at?: string | null;
  seller?: { full_name?: string } | null;
};

type SellerStorage = {
  id: string;
  full_name?: string;
  storage_quota: number | null;
};

type SellerVerification = {
  id: string;
  full_name?: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  status: 'pending' | 'rejected' | null;
  rejectReason: string | null;
  isApproved: boolean;
  urls: { student_id_url: string | null; verification_video_url: string | null };
};

type FulfilmentItem = {
  orderId: string;
  sellerId: string;
  sellerName: string;
  product: { id: string; title: string; image_url?: string | null } | null;
  quantity: number;
  amountKobo: number;
  deliveryFeeKobo: number;
  status: string;
  statusChangedAt: string | null;
  createdAt: string;
  slow: boolean;
};

type FulfilmentGroup = {
  order_ref: string;
  delivery_code: string;
  buyer: { name: string; id: string };
  createdAt: string;
  groupStatus: string;
  items: FulfilmentItem[];
};

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-950/60 text-amber-300 border-amber-800',
  processing: 'bg-blue-950/60 text-blue-300 border-blue-800',
  paid: 'bg-emerald-950/60 text-emerald-300 border-emerald-800',
  failed: 'bg-red-950/60 text-red-300 border-red-800',
  rejected: 'bg-neutral-900 text-neutral-400 border-neutral-800',
};

function elapsedLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

export default function AdminDashboardPage() {
  const supabase = createClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<AdminTab>('overview');
  const [refreshToken, setRefreshToken] = useState(0);
  // Read the saved theme during the first client render. The main board is not
  // part of the initial server HTML (admin access is checked client-side), so
  // this cannot cause a hydration mismatch.
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return window.localStorage.getItem('fuhsi_admin_theme') === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    window.localStorage.setItem('fuhsi_admin_theme', theme);
  }, [theme]);

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [oLoading, setOLoading] = useState(true);
  const [oError, setOError] = useState<string | null>(null);

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [wLoading, setWLoading] = useState(true);
  const [wError, setWError] = useState<string | null>(null);
  const [wMessage, setWMessage] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const [sellers, setSellers] = useState<SellerStorage[]>([]);
  const [sLoading, setSLoading] = useState(true);
  // Inline editing: sellerId -> draft MB text
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingQuota, setSavingQuota] = useState<string | null>(null);
  const [sMessage, setSMessage] = useState<string | null>(null);

  const [verifications, setVerifications] = useState<SellerVerification[]>([]);
  const [vLoading, setVLoading] = useState(true);
  const [vError, setVError] = useState<string | null>(null);
  const [actingV, setActingV] = useState<string | null>(null);
  // sellerId -> reject reason draft
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const [fulfilments, setFulfilments] = useState<FulfilmentGroup[]>([]);
  const [fLoading, setFLoading] = useState(true);
  const [fError, setFError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle();
      setIsAdmin(profile?.is_admin === true);
    })();
  }, [supabase]);

  const loadWithdrawals = async () => {
    setWLoading(true);
    setWError(null);
    try {
      const res = await fetch('/api/admin/withdrawals');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setWithdrawals(data.withdrawals || []);
    } catch (err) {
      setWError(err instanceof Error ? err.message : 'Failed to load withdrawals');
    } finally {
      setWLoading(false);
    }
  };

  const loadVerifications = async () => {
    setVLoading(true);
    setVError(null);
    try {
      const res = await fetch('/api/admin/verifications');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setVerifications(data.sellers || []);
    } catch (err) {
      setVError(err instanceof Error ? err.message : 'Failed to load verifications');
    } finally {
      setVLoading(false);
    }
  };

  const actVerification = async (action: 'approve' | 'reject', sellerId: string) => {
    if (action === 'reject' && !(rejectReasons[sellerId] || '').trim()) {
      alert('Enter a rejection reason first.');
      return;
    }
    setActingV(sellerId);
    setVError(null);
    try {
      const res = await fetch('/api/admin/verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          sellerId,
          rejectReason: action === 'reject' ? rejectReasons[sellerId] : '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      if (action === 'reject') {
        alert('Rejected. They can re-record and resubmit; the activation fee is kept.');
      }
      await loadVerifications();
    } catch (err) {
      setVError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActingV(null);
    }
  };

  const loadSellers = async () => {
    setSLoading(true);
    try {
      const res = await fetch('/api/admin/storage');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setSellers(data.sellers || []);
      const init: Record<string, string> = {};
      for (const s of data.sellers || []) {
        init[s.id] = s.storage_quota != null ? String(Math.round(s.storage_quota / 1024 / 1024)) : '';
      }
      setDrafts(init);
    } finally {
setSLoading(false);
    }
  };

  const loadFulfilments = async () => {
    setFLoading(true);
    setFError(null);
    try {
      const res = await fetch('/api/admin/orders');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setFulfilments(data.groups || []);
    } catch (err) {
      setFError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setFLoading(false);
    }
  };

  const loadOverview = async () => {
    setOLoading(true);
    setOError(null);
    try {
      const res = await fetch('/api/admin/overview');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setOverview(data as AdminOverview);
    } catch (err) {
      setOError(err instanceof Error ? err.message : 'Failed to load overview');
    } finally {
      setOLoading(false);
    }
  };

  const refreshAll = () => {
    setRefreshToken((token) => token + 1);
    loadOverview();
    loadWithdrawals();
    loadSellers();
    loadVerifications();
    loadFulfilments();
  };

  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOverview();
    loadWithdrawals();
    loadSellers();
    loadVerifications();
    loadFulfilments();
  }, [isAdmin]);

  const act = async (action: 'approve' | 'reject', id: string) => {
    setActingId(id);
    setWError(null);
    setWMessage(null);
    try {
      const res = await fetch('/api/admin/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, withdrawalId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      if (data.message) setWMessage(data.message);
      await loadWithdrawals();
    } catch (err) {
      setWError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActingId(null);
    }
  };

  const saveQuota = async (sellerId: string) => {
    setSavingQuota(sellerId);
    setSMessage(null);
    try {
      const mb = drafts[sellerId]?.trim();
      const res = await fetch('/api/admin/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId, quotaMb: mb === '' ? 0 : Number(mb) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSMessage('Quota updated.');
      await loadSellers();
    } catch (err) {
      setSMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingQuota(null);
    }
  };

  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="animate-spin text-neutral-500" size={24} />
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center space-y-2">
          <ShieldCheck size={32} className="mx-auto text-neutral-700" />
          <p className="text-sm text-neutral-400">You do not have access to the admin dashboard.</p>
        </div>
      </div>
    );
  }

  const pendingCount = withdrawals.filter((w) => w.status === 'pending').length;
  const pendingVerifications = verifications.filter((v) => v.status === 'pending').length;
  const slowSellerCount = fulfilments.reduce(
    (n, g) => n + g.items.filter((i) => i.slow).length,
    0
  );
  const dangerAlerts = overview?.alerts.filter((alert) => alert.level === 'danger').length ?? 0;
  const warningAlerts = overview?.alerts.filter((alert) => alert.level === 'warn').length ?? 0;
  const refreshing = oLoading || wLoading || vLoading || fLoading || sLoading;

  const tabs: Array<{ id: AdminTab; label: string; icon: React.ReactNode; badge?: number; danger?: boolean }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={14} />, badge: dangerAlerts, danger: true },
    { id: 'money', label: 'Money', icon: <Wallet size={14} /> },
    { id: 'people', label: 'People', icon: <Users size={14} /> },
    { id: 'withdrawals', label: 'Payouts', icon: <Banknote size={14} />, badge: pendingCount },
    { id: 'verifications', label: 'Verifications', icon: <IdCard size={14} />, badge: pendingVerifications },
    { id: 'fulfilment', label: 'Fulfilment', icon: <Package size={14} />, badge: slowSellerCount, danger: true },
    { id: 'storage', label: 'Storage', icon: <HardDrive size={14} /> },
  ];

  return (
    <div className={`min-h-screen bg-[#070708] text-white px-4 py-6 sm:py-8 ${theme === 'light' ? 'admin-light' : ''}`}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex flex-col gap-4 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.025] to-transparent p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[#DE6437]/30 bg-[#DE6437]/10">
              <ShieldCheck size={22} className="text-[#FF9B73]" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight">FuhsiMarket Ops</h1>
              <p className="text-[11px] font-mono text-neutral-400">
                Signups · orders · money · seller activity
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            {overview ? (
              <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-mono text-neutral-400 sm:inline-flex">
                Updated {new Date(overview.generatedAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
            <button
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? 'Switch admin board to light mode' : 'Switch admin board to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-neutral-300 transition-colors hover:text-white"
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
              <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <button
              onClick={refreshAll}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl bg-[#DE6437] px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#C9511F] disabled:opacity-60"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </header>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          {pendingCount > 0 ? (
            <button
              onClick={() => setTab('withdrawals')}
              className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[10px] font-mono text-amber-300"
            >
              {pendingCount} payout{pendingCount === 1 ? '' : 's'} waiting
            </button>
          ) : null}
          {pendingVerifications > 0 ? (
            <button
              onClick={() => setTab('verifications')}
              className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[10px] font-mono text-amber-300"
            >
              {pendingVerifications} verification{pendingVerifications === 1 ? '' : 's'} waiting
            </button>
          ) : null}
          {slowSellerCount > 0 ? (
            <button
              onClick={() => setTab('fulfilment')}
              className="rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-[10px] font-mono text-red-300"
            >
              {slowSellerCount} slow fulfilment item{slowSellerCount === 1 ? '' : 's'}
            </button>
          ) : null}
          {dangerAlerts > 0 ? (
            <button
              onClick={() => setTab('overview')}
              className="rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-[10px] font-mono text-red-300"
            >
              {dangerAlerts} critical alert{dangerAlerts === 1 ? '' : 's'}
            </button>
          ) : null}
          {pendingCount === 0 && pendingVerifications === 0 && slowSellerCount === 0 && dangerAlerts === 0 && warningAlerts === 0 ? (
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono text-emerald-300">
              All systems normal
            </span>
          ) : null}
        </div>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-xs font-mono transition-all ${
                tab === item.id
                  ? 'border-[#DE6437] bg-[#DE6437] text-white shadow-lg shadow-[#DE6437]/20'
                  : 'border-white/10 bg-white/[0.04] text-neutral-400 hover:border-white/20 hover:text-white'
              }`}
            >
              {item.icon} {item.label}
              {item.badge && item.badge > 0 ? (
                <span
                  className={`rounded-full border px-1.5 text-[10px] ${
                    item.danger
                      ? 'border-red-400/30 bg-red-500/20 text-red-100'
                      : 'border-amber-400/30 bg-amber-500/20 text-amber-100'
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {tab === 'withdrawals' && wError && (
          <p className="mb-4 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2.5 font-mono text-[11px] text-red-400">
            {wError}
          </p>
        )}
        {tab === 'withdrawals' && wMessage && (
          <p className="mb-4 rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-[11px] font-mono text-emerald-300">
            {wMessage}
          </p>
        )}

        {tab === 'overview' ? (
          <OverviewTab
            data={overview}
            loading={oLoading}
            error={oError}
            onRetry={loadOverview}
            onOpenTab={setTab}
          />
        ) : tab === 'money' ? (
          <MoneyTab
            data={overview}
            loading={oLoading}
            error={oError}
            onRetry={loadOverview}
          />
        ) : tab === 'people' ? (
          <PeopleTab onOpenTab={setTab} refreshToken={refreshToken} />
        ) : tab === 'withdrawals' ? (
        <div className="space-y-3">
          {wLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-neutral-600" size={24} />
            </div>
          ) : withdrawals.length === 0 ? (
            <p className="text-center text-xs text-neutral-500 py-16 font-mono">No withdrawal requests yet.</p>
          ) : (
            withdrawals.map((w) => (
              <div
                key={w.id}
                className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-base">₦{formatNaira(w.amount_kobo)}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase ${STATUS_STYLE[w.status]}`}
                    >
                      {w.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    {w.account_name} · {w.bank_name} · {w.account_number}
                  </p>
                  <p className="text-[10px] text-neutral-500 font-mono mt-0.5">
                    {w.seller?.full_name || 'Seller'}
                  </p>
                  <p className="text-[10px] text-neutral-600 font-mono mt-0.5">
                    requested {new Date(w.created_at).toLocaleString()}
                  </p>
                  {w.transfer_status && w.status === 'pending' && (
                    <p className="text-[10px] text-blue-300 font-mono mt-1">
                      Paystack: {w.transfer_status}
                      {w.transfer_reference ? ` · ${w.transfer_reference}` : ''}
                    </p>
                  )}
                </div>
                {w.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => act('approve', w.id)}
                      disabled={actingId === w.id}
                      className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      {actingId === w.id ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
                      Approve
                    </button>
                    <button
                      onClick={() => act('reject', w.id)}
                      disabled={actingId === w.id}
                      className="flex items-center gap-1.5 text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      <X size={13} /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : tab === 'storage' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <ArrowDownLeft size={14} className="text-emerald-500" />
            <span className="text-[11px] font-mono text-neutral-400">
              Set each seller&apos;s storage quota in MB (blank = unlimited). Default is 8MB.
            </span>
          </div>
          {sMessage && (
            <p className="text-[11px] font-mono text-emerald-300 bg-emerald-950/30 border border-emerald-900/50 rounded-xl px-3 py-2">
              {sMessage}
            </p>
          )}
          {sLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-neutral-600" size={24} />
            </div>
          ) : sellers.length === 0 ? (
            <p className="text-center text-xs text-neutral-500 py-16 font-mono">No seller accounts yet.</p>
          ) : (
            sellers.map((s) => (
              <div
                key={s.id}
                className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{s.full_name || 'Unnamed seller'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={drafts[s.id] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                    placeholder="unlimited"
                    inputMode="numeric"
                    className="w-24 bg-neutral-900 border border-neutral-800 focus:border-red-600 text-sm rounded-xl px-3 py-2 text-center font-mono outline-none"
                  />
                  <span className="text-[10px] text-neutral-500 font-mono">MB</span>
                  <button
                    onClick={() => saveQuota(s.id)}
                    disabled={savingQuota === s.id}
                    className="flex items-center gap-1.5 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                  >
                    {savingQuota === s.id ? <Loader2 className="animate-spin" size={13} /> : <ArrowUpRight size={13} />}
                    Save
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : tab === 'fulfilment' ? (
        <div className="space-y-3">
          {fError && (
            <p className="text-[11px] font-mono text-red-400 bg-red-950/30 border border-red-900/50 rounded-xl px-3 py-2.5 mb-2">
              {fError}
            </p>
          )}
          {fLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-neutral-600" size={24} />
            </div>
          ) : fulfilments.length === 0 ? (
            <p className="text-center text-xs text-neutral-500 py-16 font-mono">No orders yet.</p>
          ) : (
            fulfilments.map((g) => (
              <div key={g.order_ref} className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black font-mono tracking-widest text-white">{g.delivery_code}</span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase ${
                          g.groupStatus === 'ready_for_pickup'
                            ? 'bg-sky-950/60 text-sky-300 border-sky-800'
                            : g.groupStatus === 'completed' || g.groupStatus === 'confirmed' || g.groupStatus === 'delivered'
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                            : g.groupStatus === 'disputed' || g.groupStatus === 'cancelled'
                            ? 'bg-red-950/60 text-red-300 border-red-800'
                            : 'bg-amber-950/60 text-amber-300 border-amber-800'
                        }`}
                      >
                        {g.groupStatus.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-600 font-mono mt-1">
                      Buyer: <span className="text-neutral-300">{g.buyer.name}</span> · {g.items.length} item
                      {g.items.length === 1 ? '' : 's'} · {new Date(g.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-emerald-400 font-mono font-bold text-sm">
                      ₦{formatNaira(g.items.reduce((s, i) => s + i.amountKobo + i.deliveryFeeKobo, 0))}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {g.items.map((i) => (
                    <div
                      key={i.orderId}
                      className={`rounded-xl border px-3 py-2.5 flex items-center gap-3 ${
                        i.slow
                          ? 'bg-red-950/20 border-red-900/50'
                          : 'bg-neutral-900/60 border-neutral-800'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-neutral-100 truncate">
                            {i.product?.title || 'Campus asset purchase'}
                          </span>
                          {i.quantity > 1 && (
                            <span className="text-[9px] font-mono text-red-400 bg-red-950/40 border border-red-900/60 rounded px-1">
                              x{i.quantity}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-neutral-500 font-mono truncate">
                          {i.sellerName} · ₦{formatNaira(i.amountKobo)}
                          {i.deliveryFeeKobo > 0 ? ` + ₦${formatNaira(i.deliveryFeeKobo)} fee` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`inline-block text-[9px] font-mono px-2 py-0.5 rounded-full border uppercase ${
                            i.status === 'ready_for_pickup'
                              ? 'bg-sky-950/60 text-sky-300 border-sky-800'
                              : i.status === 'completed' || i.status === 'confirmed' || i.status === 'delivered'
                              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                              : 'bg-amber-950/60 text-amber-300 border-amber-800'
                          }`}
                        >
                          {i.status.replace(/_/g, ' ')}
                        </span>
                        {i.statusChangedAt && (
                          <p className="text-[9px] font-mono text-neutral-500 mt-1">
                            <Clock size={9} className="inline -mt-0.5" /> {elapsedLabel(i.statusChangedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {g.items.some((i) => i.slow) && (
                  <p className="text-[10px] font-mono text-red-400 flex items-center gap-1.5 border-t border-red-900/40 pt-2">
                    <TriangleAlert size={12} /> Some sellers are delaying the combined order.
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {vError && (
            <p className="text-[11px] font-mono text-red-400 bg-red-950/30 border border-red-900/50 rounded-xl px-3 py-2.5 mb-2">
              {vError}
            </p>
          )}
          {vLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-neutral-600" size={24} />
            </div>
          ) : verifications.length === 0 ? (
            <p className="text-center text-xs text-neutral-500 py-16 font-mono">
              No seller verification submissions yet.
            </p>
          ) : (
            verifications.map((v) => (
              <div
                key={v.id}
                className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{v.full_name || 'Unnamed seller'}</span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase ${
                      v.status === 'pending'
                        ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                        : v.isApproved
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                        : 'bg-red-950/60 text-red-300 border-red-800'
                    }`}
                  >
                    {v.isApproved ? 'approved' : v.status || '—'}
                  </span>
                </div>
                {v.submittedAt && (
                  <p className="text-[10px] text-neutral-600 font-mono">
                    submitted {new Date(v.submittedAt).toLocaleString()}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {v.urls.student_id_url ? (
                    <a
                      href={v.urls.student_id_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 px-3 py-2 rounded-xl transition-all"
                    >
                      <IdCard size={13} /> View Student ID
                    </a>
                  ) : (
                    <span className="text-[11px] text-neutral-600 font-mono">No ID uploaded</span>
                  )}
                  {v.urls.verification_video_url ? (
                    <a
                      href={v.urls.verification_video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 px-3 py-2 rounded-xl transition-all"
                    >
                      <Video size={13} /> View Video
                    </a>
                  ) : (
                    <span className="text-[11px] text-neutral-600 font-mono">No video uploaded</span>
                  )}
                </div>

                {v.status === 'rejected' && v.rejectReason && (
                  <p className="text-[11px] text-neutral-400 border-l-2 border-red-700 pl-3">
                    Rejected: “{v.rejectReason}”
                  </p>
                )}

                {!v.isApproved && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[11px] text-neutral-400">
                        Rejection reason (required to reject)
                      </label>
                      <input
                        value={rejectReasons[v.id] ?? ''}
                        onChange={(e) => setRejectReasons((r) => ({ ...r, [v.id]: e.target.value }))}
                        placeholder="e.g. ID could not be verified"
                        className="w-full bg-neutral-900 border border-neutral-800 focus:border-red-600 text-sm rounded-xl px-3 py-2 outline-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => actVerification('approve', v.id)}
                        disabled={actingV === v.id}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                      >
                        {actingV === v.id ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
                        <span className="inline-flex items-center gap-1">
                          <Eye size={13} /> Approve
                        </span>
                      </button>
                      <button
                        onClick={() => actVerification('reject', v.id)}
                        disabled={actingV === v.id}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                      >
                        <X size={13} /> Reject & Refund
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
      </div>
    </div>
  );
}
