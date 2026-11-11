'use client';

import React from 'react';
import {
  ArrowRight,
  Banknote,
  Info,
  Loader2,
  RefreshCw,
  ShoppingBag,
  Store,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { AdminOverview } from '@/utils/admin/metrics';
import { compactNaira, fullNaira, Panel, PanelHeader } from './ui';

/**
 * The money screen: three pools, one per owner.
 *
 *  Seller money  — every naira the platform is holding for sellers. When a
 *                  seller requests a withdrawal the wallet balance drops and a
 *                  pending withdrawal is created, so wallet + pending is the
 *                  real amount still owed to sellers.
 *  Buyer money   — buyer wallet balances (refunds and wallet credit).
 *  Platform money— what FuhsiMarket has earned and kept: seller commission,
 *                  buyer service fees, delivery fees and seller plans.
 *
 * Every figure is all-time and derived from the same order rows as the rest of
 * the console, so this tab never disagrees with the Overview KPIs.
 */

type Props = {
  data: AdminOverview | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

function share(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.round((Math.max(0, part) / whole) * 100);
}

function MoneyRow({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: number;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 border-b border-white/5 py-2.5 last:border-0 ${
        emphasis ? 'text-white' : 'text-neutral-400'
      }`}
    >
      <div className="min-w-0">
        <p className={`text-[11px] ${emphasis ? 'font-bold' : ''}`}>{label}</p>
        {hint ? <p className="mt-0.5 text-[10px] text-neutral-500">{hint}</p> : null}
      </div>
      <span
        className={`shrink-0 font-mono text-xs ${
          emphasis ? 'font-black text-emerald-300' : 'text-neutral-200'
        }`}
      >
        {fullNaira(value)}
      </span>
    </div>
  );
}

function PoolCard({
  title,
  owner,
  total,
  hint,
  icon,
  tone,
  children,
}: {
  title: string;
  owner: string;
  total: number;
  hint: string;
  icon: React.ReactNode;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border bg-gradient-to-br from-white/[0.06] to-white/[0.01] p-5 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-neutral-400">
            {title}
          </p>
          <p className="mt-1 text-[11px] font-bold text-neutral-200">{owner}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5">
          {icon}
        </span>
      </div>
      <p className="mt-4 text-3xl font-black tracking-tight text-white">{compactNaira(total)}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">{hint}</p>
      <div className="mt-3 border-t border-white/10 pt-1">{children}</div>
    </div>
  );
}

export default function MoneyTab({ data, loading, error, onRetry }: Props) {
  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-neutral-500">
        <Loader2 className="animate-spin" size={24} />
        <p className="text-[11px] font-mono">Counting every naira…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <Panel className="p-8 text-center">
        <Info className="mx-auto text-red-400" size={26} />
        <p className="mt-3 text-sm font-bold text-white">Could not load the money split</p>
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

  const { money, orders } = data;
  const heldForPeople = money.sellerMoneyKobo + money.buyerWalletKobo;
  const everythingTracked = heldForPeople + orders.platformProfitKobo;

  const revenueStreams = [
    { label: 'Seller commission', value: orders.commissionKobo, color: 'bg-[#DE6437]' },
    { label: 'Buyer service fees', value: orders.buyerFeesKobo, color: 'bg-amber-400' },
    { label: 'Delivery fees', value: orders.deliveryFeesKobo, color: 'bg-sky-400' },
    { label: 'Seller subscriptions', value: orders.subscriptionRevenueKobo, color: 'bg-violet-400' },
  ];
  const revenueTotal = Math.max(1, orders.platformProfitKobo);

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

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <p className="flex items-center gap-2 text-[11px] leading-relaxed text-neutral-400">
          <Info size={13} className="shrink-0" />
          Seller and buyer balances are money the platform is holding for other people.
          Platform earnings are what FuhsiMarket has kept for itself. Keep the two separate —
          a big balance is not profit.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <PoolCard
          title="Seller money"
          owner="Held for sellers"
          total={money.sellerMoneyKobo}
          hint="Withdrawable seller balances plus payout requests not yet sent to a bank."
          icon={<Store size={17} className="text-violet-300" />}
          tone="border-violet-500/25"
        >
          <MoneyRow label="In seller wallets" value={money.sellerWalletKobo} />
          <MoneyRow
            label="Waiting to be paid out"
            value={money.pendingWithdrawalsKobo}
            hint={`${money.pendingWithdrawalsCount} pending request${
              money.pendingWithdrawalsCount === 1 ? '' : 's'
            }`}
          />
          <MoneyRow label="Already paid to sellers" value={money.paidWithdrawalsKobo} hint="All-time" />
          <MoneyRow label="Seller payouts from completed orders" value={orders.sellerPayoutKobo} hint="After commission" />
        </PoolCard>

        <PoolCard
          title="Buyer money"
          owner="Held for buyers"
          total={money.buyerWalletKobo}
          hint="Buyer wallet credit waiting to be spent or withdrawn-back through support."
          icon={<ShoppingBag size={17} className="text-sky-300" />}
          tone="border-sky-500/25"
        >
          <MoneyRow label="Buyer wallet balances" value={money.buyerWalletKobo} />
          <MoneyRow label="Total buyer spend" value={orders.gmvKobo} hint="All orders except cancelled" />
          <MoneyRow label="Completed buyer spend" value={orders.completedGmvKobo} hint="Delivered orders" />
          <MoneyRow label="Still in escrow" value={orders.activeValueKobo} hint={`${orders.active} open orders`} />
        </PoolCard>

        <PoolCard
          title="FuhsiMarket money"
          owner="Earned by the platform"
          total={orders.platformProfitKobo}
          hint="Every revenue stream combined: commission, fees, delivery and seller plans."
          icon={<TrendingUp size={17} className="text-[#FFB08F]" />}
          tone="border-[#DE6437]/25"
        >
          <MoneyRow label="Seller commission (3%)" value={orders.commissionKobo} />
          <MoneyRow label="Buyer service fees" value={orders.buyerFeesKobo} />
          <MoneyRow label="Delivery fees kept" value={orders.deliveryFeesKobo} />
          <MoneyRow label="Seller plan revenue" value={orders.subscriptionRevenueKobo} hint={`${data.users.activeSubscriptions} active plans`} />
        </PoolCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Panel>
          <PanelHeader
            title="Revenue streams"
            subtitle="Every way FuhsiMarket makes money, all-time and combined."
            action={
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-mono text-emerald-300">
                {fullNaira(orders.platformProfitKobo)}
              </span>
            }
          />
          <div className="space-y-4 px-4 py-4">
            <div className="flex h-3 overflow-hidden rounded-full bg-white/5">
              {revenueStreams.map((stream) => (
                <div
                  key={stream.label}
                  className={stream.color}
                  style={{ width: `${(stream.value / revenueTotal) * 100}%` }}
                  title={`${stream.label}: ${fullNaira(stream.value)}`}
                />
              ))}
            </div>

            <div className="space-y-3">
              {revenueStreams.map((stream) => (
                <div key={stream.label}>
                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="flex items-center gap-2 text-neutral-300">
                      <span className={`h-2.5 w-2.5 rounded-sm ${stream.color}`} />
                      {stream.label}
                    </span>
                    <span className="shrink-0 font-mono font-bold text-neutral-200">
                      {fullNaira(stream.value)}
                      <span className="ml-2 font-normal text-neutral-500">
                        {share(stream.value, revenueTotal)}%
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={stream.color}
                      style={{ width: `${(stream.value / revenueTotal) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 pt-1">
              <MoneyRow label="Total platform earnings" value={orders.platformProfitKobo} emphasis />
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Where every naira sits"
            subtitle="Held money and earned money, side by side."
          />
          <div className="px-4 py-4">
            <div className="flex h-3 overflow-hidden rounded-full bg-white/5">
              <div
                className="bg-violet-400"
                style={{ width: `${(money.sellerMoneyKobo / Math.max(1, everythingTracked)) * 100}%` }}
                title={`Seller: ${fullNaira(money.sellerMoneyKobo)}`}
              />
              <div
                className="bg-sky-400"
                style={{ width: `${(money.buyerWalletKobo / Math.max(1, everythingTracked)) * 100}%` }}
                title={`Buyer: ${fullNaira(money.buyerWalletKobo)}`}
              />
              <div
                className="bg-[#DE6437]"
                style={{ width: `${(orders.platformProfitKobo / Math.max(1, everythingTracked)) * 100}%` }}
                title={`Platform: ${fullNaira(orders.platformProfitKobo)}`}
              />
            </div>
            <div className="mt-4">
              <MoneyRow
                label="Total held for sellers and buyers"
                value={heldForPeople}
                hint={`${share(heldForPeople, everythingTracked)}% of everything tracked`}
              />
              <MoneyRow
                label="Earned by FuhsiMarket"
                value={orders.platformProfitKobo}
                hint={`${share(orders.platformProfitKobo, everythingTracked)}% of everything tracked`}
              />
              <MoneyRow
                label="Everything tracked"
                value={everythingTracked}
                hint="Held balances + platform earnings"
                emphasis
              />
            </div>

            <button
              onClick={onRetry}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2.5 text-[10px] font-bold text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <RefreshCw size={11} /> Refresh the numbers
            </button>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Payouts"
            subtitle="Money moving from escrow back to sellers."
            action={<Banknote size={15} className="text-neutral-500" />}
          />
          <div className="px-4 py-4">
            <MoneyRow label="Pending withdrawal requests" value={money.pendingWithdrawalsKobo} hint={`${money.pendingWithdrawalsCount} waiting`} />
            <MoneyRow label="Paid out all-time" value={money.paidWithdrawalsKobo} hint={`${money.paidWithdrawalsCount} completed transfers`} />
            <MoneyRow label="Available in seller wallets now" value={money.sellerWalletKobo} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Platform earnings per order"
            subtitle="Recognised when an order completes, so it never counts money still in escrow."
            action={<Wallet size={15} className="text-neutral-500" />}
          />
          <div className="px-4 py-4">
            <MoneyRow label="Completed goods value" value={orders.completedGmvKobo} hint={`${orders.completed} completed orders`} />
            <MoneyRow label="Commission taken" value={orders.commissionKobo} />
            <MoneyRow label="Buyer fees collected" value={orders.buyerFeesKobo} />
            <MoneyRow label="Delivery fees collected" value={orders.deliveryFeesKobo} />
            <MoneyRow label="Seller plan revenue" value={orders.subscriptionRevenueKobo} />
            <div className="mt-1 border-t border-white/10 pt-1">
              <MoneyRow label="Total kept by FuhsiMarket" value={orders.platformProfitKobo} emphasis />
            </div>
          </div>
        </Panel>
      </div>

      <p className="flex items-center justify-center gap-1.5 pb-2 text-[10px] font-mono text-neutral-600">
        <ArrowRight size={11} /> Snapshot generated {new Date(data.generatedAt).toLocaleString('en-NG')}
      </p>
    </div>
  );
}
