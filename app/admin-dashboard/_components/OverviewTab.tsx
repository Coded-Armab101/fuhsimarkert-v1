'use client';

import React from 'react';
import {
  Activity,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleAlert,
  Clock,
  Info,
  Loader2,
  Lock,
  Package,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  TriangleAlert,
  UserPlus,
  Wallet,
} from 'lucide-react';
import type { AdminAlert, AdminOverview, AdminTab } from '@/utils/admin/metrics';
import {
  compactNaira,
  EmptyLine,
  formatDateTime,
  fullNaira,
  Panel,
  PanelHeader,
  StatusPill,
  timeAgo,
} from './ui';

type Props = {
  data: AdminOverview | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenTab: (tab: AdminTab) => void;
};

function Kpi({
  label,
  value,
  hint,
  icon,
  tone = 'text-[#FFB08F] bg-[#DE6437]/10 border-[#DE6437]/25',
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.015] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-neutral-400">
          {label}
        </p>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border ${tone}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-black tracking-tight text-white">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">{hint}</p>
    </div>
  );
}

function AlertRow({
  alert,
  onOpenTab,
}: {
  alert: AdminAlert;
  onOpenTab: (tab: AdminTab) => void;
}) {
  const tone =
    alert.level === 'danger'
      ? 'border-red-500/30 bg-red-500/[0.07] text-red-300'
      : alert.level === 'warn'
        ? 'border-amber-500/30 bg-amber-500/[0.07] text-amber-300'
        : 'border-sky-500/25 bg-sky-500/[0.05] text-sky-300';
  const Icon = alert.level === 'danger' ? TriangleAlert : alert.level === 'warn' ? CircleAlert : Info;

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${tone}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-white">{alert.title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-400">{alert.detail}</p>
      </div>
      <button
        onClick={() => onOpenTab(alert.tab)}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-neutral-200 transition-colors hover:bg-white/10"
      >
        Open <ArrowRight size={11} />
      </button>
    </div>
  );
}

function ActivityChart({ data }: { data: AdminOverview['trend'] }) {
  const max = Math.max(
    1,
    ...data.map((point) => Math.max(point.orders, point.signups)),
  );

  return (
    <div className="px-4 pb-4 pt-3">
      <div className="flex h-32 items-end gap-2">
        {data.map((point) => {
          const day = new Date(`${point.day}T00:00:00Z`);
          const label = day.toLocaleDateString('en-NG', { weekday: 'short' });
          return (
            <div key={point.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-24 w-full items-end justify-center gap-1">
                <div
                  className="w-2.5 rounded-t-sm bg-[#DE6437]"
                  title={`${point.orders} orders`}
                  style={{ height: `${Math.max(2, (point.orders / max) * 100)}%` }}
                />
                <div
                  className="w-2.5 rounded-t-sm bg-neutral-600"
                  title={`${point.signups} signups`}
                  style={{ height: `${Math.max(2, (point.signups / max) * 100)}%` }}
                />
              </div>
              <span className="text-[9px] font-mono uppercase text-neutral-500">{label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px] font-mono text-neutral-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[#DE6437]" /> Orders
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-neutral-600" /> Signups
        </span>
        <span className="ml-auto text-neutral-500">
          {data.reduce((sum, point) => sum + point.orders, 0)} orders ·{' '}
          {compactNaira(data.reduce((sum, point) => sum + point.revenueKobo, 0))} value
        </span>
      </div>
    </div>
  );
}

function MoneyLine({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border-b border-white/5 py-2.5 last:border-0 ${
        emphasis ? 'text-white' : 'text-neutral-400'
      }`}
    >
      <span className={`text-[11px] ${emphasis ? 'font-bold' : ''}`}>{label}</span>
      <span className={`font-mono text-xs ${emphasis ? 'font-black text-emerald-300' : 'text-neutral-200'}`}>
        {fullNaira(value)}
      </span>
    </div>
  );
}

export default function OverviewTab({ data, loading, error, onRetry, onOpenTab }: Props) {
  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-neutral-500">
        <Loader2 className="animate-spin" size={24} />
        <p className="text-[11px] font-mono">Reading platform activity…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <Panel className="p-8 text-center">
        <TriangleAlert className="mx-auto text-red-400" size={26} />
        <p className="mt-3 text-sm font-bold text-white">Could not load the overview</p>
        <p className="mt-1 text-[11px] text-neutral-400">{error || 'Unknown error.'}</p>
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#DE6437] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#C9511F]"
        >
          <RefreshCw size={13} /> Try again
        </button>
      </Panel>
    );
  }

  const profitParts = [
    { label: 'Commission', value: data.orders.commissionKobo, color: 'bg-[#DE6437]' },
    { label: 'Buyer fees', value: data.orders.buyerFeesKobo, color: 'bg-amber-400' },
    { label: 'Delivery', value: data.orders.deliveryFeesKobo, color: 'bg-sky-400' },
    { label: 'Seller plans', value: data.orders.subscriptionRevenueKobo, color: 'bg-violet-400' },
  ];
  const profitTotal = Math.max(1, data.orders.platformProfitKobo);

  return (
    <div className="space-y-5">
      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/[0.07] px-3 py-2.5 text-[11px] text-red-300">
          <span>Showing the last good snapshot. Refresh failed: {error}</span>
          <button onClick={onRetry} className="font-bold underline">
            retry
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi
          label="Signups"
          value={data.users.total.toLocaleString()}
          hint={`+${data.users.newToday} today · +${data.users.new7d} this week · ${data.users.sellers} sellers`}
          icon={<UserPlus size={16} />}
          tone="text-sky-300 bg-sky-500/10 border-sky-500/25"
        />
        <Kpi
          label="Order success rate"
          value={`${data.orders.completionRatePct}%`}
          hint={`${data.orders.completed} completed of ${data.orders.total} orders · ${data.orders.disputeRatePct}% disputed`}
          icon={<CheckCircle2 size={16} />}
          tone="text-emerald-300 bg-emerald-500/10 border-emerald-500/25"
        />
        <Kpi
          label="Active revenue"
          value={compactNaira(data.orders.activeValueKobo)}
          hint={`In escrow across ${data.orders.active} open orders · ${compactNaira(data.orders.completedGmvKobo)} completed GMV`}
          icon={<Lock size={16} />}
          tone="text-amber-300 bg-amber-500/10 border-amber-500/25"
        />
        <Kpi
          label="Platform profit"
          value={compactNaira(data.orders.platformProfitKobo)}
          hint={`${compactNaira(data.orders.commissionKobo)} commission · ${compactNaira(data.orders.buyerFeesKobo + data.orders.deliveryFeesKobo)} service fees · ${compactNaira(data.orders.subscriptionRevenueKobo)} plans`}
          icon={<TrendingUp size={16} />}
          tone="text-[#FFB08F] bg-[#DE6437]/10 border-[#DE6437]/25"
        />
        <Kpi
          label="Seller money"
          value={compactNaira(data.money.sellerMoneyKobo)}
          hint={`${compactNaira(data.money.sellerWalletKobo)} in wallets · ${compactNaira(data.money.pendingWithdrawalsKobo)} awaiting payout`}
          icon={<Wallet size={16} />}
          tone="text-violet-300 bg-violet-500/10 border-violet-500/25"
        />
        <Kpi
          label="Live activity"
          value={data.orders.active.toLocaleString()}
          hint={`${data.orders.today} orders today · ${data.orders.last7d} this week · ${data.alerts.length} alert${data.alerts.length === 1 ? '' : 's'}`}
          icon={<Activity size={16} />}
          tone={
            data.alerts.some((alert) => alert.level === 'danger')
              ? 'text-red-300 bg-red-500/10 border-red-500/25'
              : 'text-neutral-200 bg-white/5 border-white/10'
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <PanelHeader
            title="Activity — last 7 days"
            subtitle="New signups and orders, with the order value created each day."
          />
          <ActivityChart data={data.trend} />
        </Panel>

        <Panel>
          <PanelHeader
            title="Needs attention"
            subtitle={
              data.alerts.length === 0
                ? 'Nothing is waiting. The platform is clear.'
                : `${data.alerts.length} thing${data.alerts.length === 1 ? '' : 's'} worth checking.`
            }
          />
          <div className="space-y-2 p-3">
            {data.alerts.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-4 text-[11px] text-emerald-300">
                <CheckCircle2 size={16} /> All clear. No pending payouts, verifications or stalled orders.
              </div>
            ) : (
              data.alerts.map((alert) => (
                <AlertRow key={alert.id} alert={alert} onOpenTab={onOpenTab} />
              ))
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Where the profit comes from"
            subtitle="Completed orders plus active seller plans."
            action={
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-mono text-emerald-300">
                {fullNaira(data.orders.platformProfitKobo)}
              </span>
            }
          />
          <div className="px-4 py-4">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-white/5">
              {profitParts.map((part) => (
                <div
                  key={part.label}
                  className={part.color}
                  style={{ width: `${(part.value / profitTotal) * 100}%` }}
                  title={`${part.label}: ${fullNaira(part.value)}`}
                />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4">
              <MoneyLine label="Seller commission" value={data.orders.commissionKobo} />
              <MoneyLine label="Buyer service fees" value={data.orders.buyerFeesKobo} />
              <MoneyLine label="Delivery fees kept" value={data.orders.deliveryFeesKobo} />
              <MoneyLine label="Seller plan revenue" value={data.orders.subscriptionRevenueKobo} />
            </div>
            <div className="mt-2 border-t border-white/10 pt-2">
              <MoneyLine label="Total platform profit" value={data.orders.platformProfitKobo} emphasis />
              <MoneyLine label="Paid out to sellers" value={data.orders.sellerPayoutKobo} />
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Money at rest"
            subtitle="What the platform is holding for buyers and sellers."
            action={
              <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2.5 py-1 text-[10px] font-mono text-violet-300">
                {fullNaira(data.money.sellerMoneyKobo)} seller
              </span>
            }
          />
          <div className="grid grid-cols-2 gap-x-4 px-4 py-4">
            <MoneyLine label="Seller wallet balances" value={data.money.sellerWalletKobo} />
            <MoneyLine label="Pending withdrawals" value={data.money.pendingWithdrawalsKobo} />
            <MoneyLine label="Buyer wallet float" value={data.money.buyerWalletKobo} />
            <MoneyLine label="All-time paid out" value={data.money.paidWithdrawalsKobo} />
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-white/10 px-4 py-3 text-center">
            <div>
              <p className="text-lg font-black text-white">{data.catalogue.total}</p>
              <p className="text-[10px] font-mono uppercase text-neutral-500">Listings</p>
            </div>
            <div>
              <p className="text-lg font-black text-amber-300">{data.catalogue.lowStock}</p>
              <p className="text-[10px] font-mono uppercase text-neutral-500">Low stock</p>
            </div>
            <div>
              <p className="text-lg font-black text-red-300">{data.catalogue.outOfStock}</p>
              <p className="text-[10px] font-mono uppercase text-neutral-500">Sold out</p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel>
          <PanelHeader title="Newest signups" subtitle={`${data.users.new7d} joined this week`} />
          {data.recent.signups.length === 0 ? (
            <EmptyLine>No signups yet.</EmptyLine>
          ) : (
            <div className="divide-y divide-white/5">
              {data.recent.signups.map((signup) => (
                <div key={signup.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-[11px] font-black text-neutral-300">
                    {signup.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">{signup.name}</p>
                    <p className="text-[10px] font-mono text-neutral-500">
                      {signup.persona} · {timeAgo(signup.createdAt)}
                    </p>
                  </div>
                  <StatusPill status={signup.persona} />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Latest orders"
            subtitle={`${data.orders.today} placed today`}
            action={<ShoppingBag size={15} className="text-neutral-500" />}
          />
          {data.recent.orders.length === 0 ? (
            <EmptyLine>No orders yet.</EmptyLine>
          ) : (
            <div className="divide-y divide-white/5">
              {data.recent.orders.map((order) => (
                <div key={order.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] font-bold text-white">
                      {order.ref.length > 18 ? `${order.ref.slice(0, 18)}…` : order.ref}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] font-bold text-emerald-300">
                      {fullNaira(order.amountKobo)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="truncate text-[10px] text-neutral-500">
                      {order.buyer} → {order.sellers}
                    </p>
                    <StatusPill status={order.status} />
                  </div>
                  <p className="mt-1 text-[9px] font-mono text-neutral-600">
                    {order.items} item{order.items === 1 ? '' : 's'} · {timeAgo(order.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Payout queue"
            subtitle={`${data.money.pendingWithdrawalsCount} waiting · ${data.money.paidWithdrawalsCount} paid all-time`}
            action={<Banknote size={15} className="text-neutral-500" />}
          />
          {data.recent.withdrawals.length === 0 ? (
            <EmptyLine>No withdrawal requests yet.</EmptyLine>
          ) : (
            <div className="divide-y divide-white/5">
              {data.recent.withdrawals.map((withdrawal) => (
                <div key={withdrawal.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">{withdrawal.seller}</p>
                    <p className="text-[10px] font-mono text-neutral-500">
                      {formatDateTime(withdrawal.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[11px] font-bold text-neutral-200">
                      {fullNaira(withdrawal.amountKobo)}
                    </p>
                    <StatusPill status={withdrawal.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => onOpenTab('withdrawals')}
            className="flex w-full items-center justify-center gap-1.5 border-t border-white/10 py-2.5 text-[10px] font-bold text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            Manage payouts <ArrowRight size={11} />
          </button>
        </Panel>
      </div>

      <p className="flex items-center justify-center gap-1.5 pb-2 text-[10px] font-mono text-neutral-600">
        <Clock size={11} /> Snapshot generated {formatDateTime(data.generatedAt)}
        <Package size={11} className="ml-2" /> {data.users.approvedSellers} approved sellers ·{' '}
        {data.users.activeSubscriptions} active plans
      </p>
    </div>
  );
}
