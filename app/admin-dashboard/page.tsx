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
} from 'lucide-react';

type Withdrawal = {
  id: string;
  seller_id: string;
  amount_kobo: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'rejected';
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
  const [tab, setTab] = useState<'withdrawals' | 'storage' | 'verifications' | 'fulfilment'>('withdrawals');

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [wLoading, setWLoading] = useState(true);
  const [wError, setWError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWithdrawals();
    loadSellers();
    loadVerifications();
    loadFulfilments();
  }, [isAdmin]);

  const act = async (action: 'approve' | 'reject', id: string) => {
    setActingId(id);
    setWError(null);
    try {
      const res = await fetch('/api/admin/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, withdrawalId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
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

  return (
    <div className="min-h-screen bg-black text-white px-4 py-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-11 h-11 rounded-2xl bg-red-950/50 border border-red-900/50 flex items-center justify-center">
          <ShieldCheck size={22} className="text-red-500" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Admin Dashboard</h1>
          <p className="text-[11px] text-neutral-500 font-mono">Operator console</p>
        </div>
        {pendingCount > 0 && (
          <span className="ml-auto text-[11px] font-mono text-amber-300 bg-amber-950/60 border border-amber-800 rounded-full px-3 py-1">
            {pendingCount} pending withdrawal{pendingCount === 1 ? '' : 's'}
          </span>
        )}
        {pendingVerifications > 0 && (
          <span className="text-[11px] font-mono text-amber-300 bg-amber-950/60 border border-amber-800 rounded-full px-3 py-1">
            {pendingVerifications} pending verification{pendingVerifications === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('withdrawals')}
          className={`flex items-center gap-2 text-xs font-mono px-4 py-2 rounded-xl border transition-all cursor-pointer ${
            tab === 'withdrawals'
              ? 'bg-red-600 border-red-500 text-white'
              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700'
          }`}
        >
          <Banknote size={14} /> Withdrawals
        </button>
        <button
          onClick={() => setTab('storage')}
          className={`flex items-center gap-2 text-xs font-mono px-4 py-2 rounded-xl border transition-all cursor-pointer ${
            tab === 'storage'
              ? 'bg-red-600 border-red-500 text-white'
              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700'
          }`}
        >
          <HardDrive size={14} /> Seller Storage
        </button>
        <button
          onClick={() => setTab('verifications')}
          className={`flex items-center gap-2 text-xs font-mono px-4 py-2 rounded-xl border transition-all cursor-pointer ${
            tab === 'verifications'
              ? 'bg-red-600 border-red-500 text-white'
              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700'
          }`}
        >
          <IdCard size={14} /> Verifications
        </button>
        <button
          onClick={() => setTab('fulfilment')}
          className={`flex items-center gap-2 text-xs font-mono px-4 py-2 rounded-xl border transition-all cursor-pointer ${
            tab === 'fulfilment'
              ? 'bg-red-600 border-red-500 text-white'
              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700'
          }`}
        >
          <Package size={14} /> Fulfilment
          {slowSellerCount > 0 && (
            <span className="text-[10px] text-red-300 bg-red-950/60 border border-red-800 rounded-full px-1.5">
              {slowSellerCount}
            </span>
          )}
        </button>
      </div>

      {wError && (
        <p className="text-[11px] font-mono text-red-400 bg-red-950/30 border border-red-900/50 rounded-xl px-3 py-2.5 mb-4">
          {wError}
        </p>
      )}

      {tab === 'withdrawals' ? (
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
  );
}