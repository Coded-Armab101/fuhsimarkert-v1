'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react';
import type { AdminTab, AdminUserRow } from '@/utils/admin/metrics';
import {
  compactNaira,
  EmptyLine,
  formatDateTime,
  fullNaira,
  Panel,
  PanelHeader,
  StatusPill,
} from './ui';

type Props = {
  onOpenTab: (tab: AdminTab) => void;
  refreshToken: number;
};

type Filter = 'all' | 'buyers' | 'sellers' | 'pending' | 'admins';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Everyone' },
  { id: 'buyers', label: 'Buyers' },
  { id: 'sellers', label: 'Sellers' },
  { id: 'pending', label: 'Pending review' },
  { id: 'admins', label: 'Admins' },
];

export default function PeopleTab({ onOpenTab, refreshToken }: Props) {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: '500' });
        if (search.trim()) params.set('q', search.trim());
        const response = await fetch(`/api/admin/users?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load people.');
        setUsers(data.users || []);
        setTotal(Number(data.total) || 0);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Could not load people.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [search, reloadKey, refreshToken]);

  const filtered = useMemo(() => {
    return users.filter((user) => {
      if (filter === 'buyers') return user.persona === 'buyer' && !user.isSeller;
      if (filter === 'sellers') return user.isSeller;
      if (filter === 'pending') return user.verificationStatus === 'pending';
      if (filter === 'admins') return user.isAdmin;
      return true;
    });
  }, [users, filter]);

  const summary = useMemo(() => {
    return {
      sellers: users.filter((user) => user.isSeller).length,
      approved: users.filter((user) => user.isApprovedSeller).length,
      pending: users.filter((user) => user.verificationStatus === 'pending').length,
      wallet: users.reduce((sum, user) => sum + user.walletKobo, 0),
    };
  }, [users]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'People shown', value: filtered.length.toLocaleString(), hint: `${total} matching profiles`, icon: <Users size={15} /> },
          { label: 'Sellers', value: summary.sellers.toLocaleString(), hint: `${summary.approved} approved`, icon: <Store size={15} /> },
          { label: 'Pending review', value: summary.pending.toLocaleString(), hint: 'verification submissions', icon: <ShieldCheck size={15} /> },
          { label: 'Wallet float', value: compactNaira(summary.wallet), hint: 'balances in these accounts', icon: <Wallet size={15} /> },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-neutral-400">
                {item.label}
              </p>
              <span className="text-neutral-500">{item.icon}</span>
            </div>
            <p className="mt-2 text-xl font-black text-white">{item.value}</p>
            <p className="text-[10px] font-mono text-neutral-500">{item.hint}</p>
          </div>
        ))}
      </div>

      <Panel>
        <PanelHeader
          title="People directory"
          subtitle="Search by name or account id. Newest profiles appear first."
          action={
            <button
              onClick={() => setReloadKey((key) => key + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          }
        />

        <div className="space-y-3 border-b border-white/10 p-3">
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 focus-within:border-[#DE6437]">
            <Search size={14} className="text-neutral-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search a student, seller or admin…"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-600"
            />
            {loading ? <Loader2 size={13} className="animate-spin text-neutral-500" /> : null}
          </label>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold transition-colors ${
                  filter === item.id
                    ? 'border-[#DE6437] bg-[#DE6437] text-white'
                    : 'border-white/10 bg-white/5 text-neutral-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/[0.06] px-4 py-2.5 text-[11px] text-red-300">
            <TriangleAlert size={13} /> {error}
          </div>
        ) : null}

        {loading && users.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-neutral-600" size={24} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyLine>
            {search ? `No profile matches “${search}”.` : 'No profiles match this filter.'}
          </EmptyLine>
        ) : (
          <div className="divide-y divide-white/5">
            <div className="hidden grid-cols-[1.7fr_0.9fr_0.8fr_0.9fr_auto] gap-3 px-4 py-2 text-[9px] font-mono uppercase tracking-wider text-neutral-600 md:grid">
              <span>Person</span>
              <span>Joined</span>
              <span>Wallet</span>
              <span>Activity</span>
              <span className="text-right">Action</span>
            </div>
            {filtered.map((user) => {
              const verification = user.isApprovedSeller
                ? 'approved'
                : user.verificationStatus || null;
              return (
                <div
                  key={user.id}
                  className="grid gap-3 px-4 py-3.5 md:grid-cols-[1.7fr_0.9fr_0.8fr_0.9fr_auto] md:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-[11px] font-black ${
                        user.isAdmin
                          ? 'border-violet-500/30 bg-violet-500/10 text-violet-300'
                          : user.isSeller
                            ? 'border-[#DE6437]/30 bg-[#DE6437]/10 text-[#FFB08F]'
                            : 'border-sky-500/25 bg-sky-500/10 text-sky-300'
                      }`}
                    >
                      {user.fullName.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-xs font-bold text-white">{user.fullName}</p>
                        {user.isAdmin ? <StatusPill status="admin" /> : null}
                        <StatusPill status={user.isSeller ? 'seller' : 'buyer'} />
                        {verification ? <StatusPill status={verification} /> : null}
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[9px] text-neutral-600">
                        {user.id}
                      </p>
                    </div>
                  </div>

                  <div className="text-[10px] font-mono text-neutral-400">
                    <span className="md:hidden text-neutral-600">Joined · </span>
                    {formatDateTime(user.createdAt)}
                  </div>

                  <div className="font-mono text-[11px] font-bold text-neutral-200">
                    <span className="md:hidden text-neutral-600">Wallet · </span>
                    {fullNaira(user.walletKobo)}
                  </div>

                  <div className="space-y-0.5 text-[10px] text-neutral-500">
                    <p>
                      <span className="text-neutral-300">{user.buyerOrders}</span> buys ·{' '}
                      {compactNaira(user.spendKobo)}
                    </p>
                    <p>
                      <span className="text-neutral-300">{user.sellerOrders}</span> sales ·{' '}
                      <span className="text-emerald-400">{compactNaira(user.earnedKobo)}</span>
                    </p>
                  </div>

                  <div className="flex justify-start md:justify-end">
                    {user.verificationStatus === 'pending' ? (
                      <button
                        onClick={() => onOpenTab('verifications')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-bold text-amber-300 transition-colors hover:bg-amber-500/20"
                      >
                        Review <ArrowRight size={11} />
                      </button>
                    ) : user.isSeller ? (
                      <button
                        onClick={() => onOpenTab('storage')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        Storage <ArrowRight size={11} />
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-neutral-600">
                        <CheckCircle2 size={11} /> active
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filtered.length > 0 && total > filtered.length ? (
          <p className="border-t border-white/10 px-4 py-2.5 text-center text-[10px] font-mono text-neutral-500">
            Showing {filtered.length} of {total} matching profiles. Use search to narrow the list.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
