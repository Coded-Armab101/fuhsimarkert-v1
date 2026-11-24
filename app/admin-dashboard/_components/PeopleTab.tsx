'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Cake,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Truck,
  TriangleAlert,
  UserCheck,
  UserX,
  Users,
  Wallet,
} from 'lucide-react';
import type { AdminRange } from '@/utils/admin/date-range';
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
import { useNotifications } from '@/components/NotificationProvider';

type Props = {
  onOpenTab: (tab: AdminTab) => void;
  refreshToken: number;
  range: AdminRange;
  onReviewSeller: (userId: string) => void;
};

type Filter = 'all' | 'buyers' | 'sellers' | 'pending' | 'suspended' | 'admins';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Everyone' },
  { id: 'buyers', label: 'Buyers' },
  { id: 'sellers', label: 'Sellers' },
  { id: 'pending', label: 'Pending review' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'admins', label: 'Admins' },
];

export default function PeopleTab({ onOpenTab, refreshToken, range, onReviewSeller }: Props) {
  const { notify } = useNotifications();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [reloadKey, setReloadKey] = useState(0);
  const [moderationTarget, setModerationTarget] = useState<AdminUserRow | null>(null);
  const [moderationReason, setModerationReason] = useState('');
  const [savingModeration, setSavingModeration] = useState(false);
  const [pickupTarget, setPickupTarget] = useState<AdminUserRow | null>(null);
  const [pickupReason, setPickupReason] = useState('');
  const [savingPickup, setSavingPickup] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: '500' });
        if (search.trim()) params.set('q', search.trim());
        if (range !== 'all') params.set('range', range);
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
  }, [search, range, reloadKey, refreshToken]);

  const filtered = useMemo(() => {
    return users.filter((user) => {
      if (filter === 'buyers') return user.persona === 'buyer' && !user.isSeller;
      if (filter === 'sellers') return user.isSeller;
      if (filter === 'pending') return user.verificationStatus === 'pending';
      if (filter === 'suspended') return user.isSuspended;
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
      suspended: users.filter((user) => user.isSuspended).length,
    };
  }, [users]);

  const openModeration = (user: AdminUserRow) => {
    setModerationTarget(user);
    setModerationReason('');
  };

  const saveModeration = async () => {
    if (!moderationTarget) return;
    if (moderationReason.trim().length < 5) {
      notify('Enter a clear reason of at least 5 characters.', { tone: 'warning' });
      return;
    }

    const action = moderationTarget.isSuspended ? 'restore' : 'suspend';
    setSavingModeration(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: moderationTarget.id,
          action,
          reason: moderationReason.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not update this account.');
      notify(
        action === 'suspend'
          ? `${moderationTarget.fullName} has been suspended.`
          : `${moderationTarget.fullName} has been restored.`,
        { tone: 'success' },
      );
      setModerationTarget(null);
      setModerationReason('');
      setReloadKey((key) => key + 1);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not update this account.', { tone: 'error' });
    } finally {
      setSavingModeration(false);
    }
  };

  const savePickup = async () => {
    if (!pickupTarget) return;
    if (pickupReason.trim().length < 5) {
      notify('Enter a clear reason of at least 5 characters.', { tone: 'warning' });
      return;
    }

    const action = pickupTarget.isPickupStaff ? 'remove_pickup' : 'assign_pickup';
    setSavingPickup(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: pickupTarget.id,
          action,
          reason: pickupReason.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not update pickup access.');
      notify(
        action === 'assign_pickup'
          ? `${pickupTarget.fullName} can now record pickup events.`
          : `${pickupTarget.fullName} can no longer record pickup events.`,
        { tone: 'success' },
      );
      setPickupTarget(null);
      setPickupReason('');
      setReloadKey((key) => key + 1);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not update pickup access.', { tone: 'error' });
    } finally {
      setSavingPickup(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'People shown', value: filtered.length.toLocaleString(), hint: `${total} matching profiles`, icon: <Users size={15} /> },
          { label: 'Sellers', value: summary.sellers.toLocaleString(), hint: `${summary.approved} approved`, icon: <Store size={15} /> },
          { label: 'Pending review', value: summary.pending.toLocaleString(), hint: `${summary.suspended} account${summary.suspended === 1 ? '' : 's'} suspended`, icon: <ShieldCheck size={15} /> },
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
                        {user.birthdayLabel ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-pink-500/25 bg-pink-500/10 px-1.5 py-0.5 text-[9px] font-mono text-pink-300"
                            title={user.nextBirthday ? `Next birthday ${user.nextBirthday}` : undefined}
                          >
                            <Cake size={10} />
                            {user.birthdayLabel}
                            {user.daysToBirthday === 0
                              ? ' · Today'
                              : user.daysToBirthday !== null
                                ? ` · in ${user.daysToBirthday} days`
                                : ''}
                          </span>
                        ) : null}
                        {user.isPickupStaff ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-300">
                            <Truck size={10} /> Pickup staff
                          </span>
                        ) : null}
                        {user.isAdmin ? <StatusPill status="admin" /> : null}
                        <StatusPill status={user.isSeller ? 'seller' : 'buyer'} />
                        {user.isSuspended ? <StatusPill status="suspended" /> : null}
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

                  <div className="flex flex-wrap justify-start gap-1.5 md:justify-end">
                    {user.verificationStatus === 'pending' && !user.isSuspended ? (
                      <button
                        onClick={() => onOpenTab('verifications')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-bold text-amber-300 transition-colors hover:bg-amber-500/20"
                      >
                        Review <ArrowRight size={11} />
                      </button>
                    ) : user.isSeller && !user.isSuspended ? (
                      <button
                        onClick={() => onOpenTab('storage')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        Storage <ArrowRight size={11} />
                      </button>
                    ) : !user.isSuspended ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-neutral-600">
                        <CheckCircle2 size={11} /> active
                      </span>
                    ) : null}
                    {user.isSeller ? (
                      <button
                        onClick={() => onReviewSeller(user.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <Store size={11} /> Seller review
                      </button>
                    ) : null}
                    {!user.isAdmin ? (
                      <button
                        onClick={() => {
                          setPickupTarget(user);
                          setPickupReason('');
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-colors ${
                          user.isPickupStaff
                            ? 'border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20'
                            : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <Truck size={11} /> Pickup
                      </button>
                    ) : null}
                    {!user.isAdmin ? (
                      <button
                        onClick={() => openModeration(user)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-colors ${
                          user.isSuspended
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                            : 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                        }`}
                      >
                        {user.isSuspended ? <UserCheck size={11} /> : <UserX size={11} />}
                        {user.isSuspended ? 'Restore' : 'Suspend'}
                      </button>
                    ) : null}
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

      {moderationTarget ? (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${moderationTarget.isSuspended ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                {moderationTarget.isSuspended ? <UserCheck size={20} /> : <UserX size={20} />}
              </div>
              <div>
                <h2 className="text-base font-black text-white">
                  {moderationTarget.isSuspended ? 'Restore account' : 'Suspend account'}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                  {moderationTarget.isSuspended
                    ? `Restore access for ${moderationTarget.fullName}. The reason is kept in the moderation audit history.`
                    : `Block ${moderationTarget.fullName} from signing in or using buyer/seller tools while illegal activity is investigated.`}
                </p>
              </div>
            </div>

            {moderationTarget.isSuspended && moderationTarget.suspensionReason ? (
              <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[11px] text-red-200">
                Current reason: {moderationTarget.suspensionReason}
              </p>
            ) : null}

            <label className="mt-5 block text-[10px] font-mono uppercase tracking-wider text-neutral-500">
              {moderationTarget.isSuspended ? 'Reason for restoring' : 'Reason and evidence summary'}
              <textarea
                value={moderationReason}
                onChange={(event) => setModerationReason(event.target.value)}
                maxLength={500}
                rows={4}
                placeholder={moderationTarget.isSuspended ? 'e.g. Investigation completed; account cleared' : 'e.g. Confirmed prohibited-item listing and off-platform fraud attempt'}
                className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-xs normal-case tracking-normal text-white outline-none focus:border-[#DE6437]"
              />
            </label>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setModerationTarget(null)}
                disabled={savingModeration}
                className="rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-bold text-neutral-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveModeration}
                disabled={savingModeration}
                className={`inline-flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold text-white disabled:opacity-50 ${moderationTarget.isSuspended ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}`}
              >
                {savingModeration ? <Loader2 size={13} className="animate-spin" /> : moderationTarget.isSuspended ? <UserCheck size={13} /> : <UserX size={13} />}
                {savingModeration ? 'Saving…' : moderationTarget.isSuspended ? 'Restore access' : 'Suspend access'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pickupTarget ? (
        <div className="fixed inset-0 z-[111] grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-sky-500/20 bg-neutral-950 p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-500/10 text-sky-300">
                <Truck size={20} />
              </div>
              <div>
                <h2 className="text-base font-black text-white">
                  {pickupTarget.isPickupStaff ? 'Remove pickup access' : 'Assign pickup access'}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                  {pickupTarget.isPickupStaff
                    ? `Stop ${pickupTarget.fullName} from recording pickup handovers. The reason is saved in the audit history.`
                    : `Allow ${pickupTarget.fullName} to record pickup handovers and delivery codes. The reason is saved in the audit history.`}
                </p>
              </div>
            </div>
            <label className="mt-5 block text-[10px] font-mono uppercase tracking-wider text-neutral-500">
              Reason
              <textarea
                value={pickupReason}
                onChange={(event) => setPickupReason(event.target.value)}
                maxLength={500}
                rows={4}
                placeholder="e.g. Trained on pickup handover and added to the shift rota"
                className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-xs normal-case tracking-normal text-white outline-none focus:border-sky-500"
              />
            </label>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPickupTarget(null)}
                disabled={savingPickup}
                className="rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-bold text-neutral-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePickup}
                disabled={savingPickup}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {savingPickup ? <Loader2 size={13} className="animate-spin" /> : <Truck size={13} />}
                {savingPickup ? 'Saving…' : pickupTarget.isPickupStaff ? 'Remove access' : 'Assign access'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
