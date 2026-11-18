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
import { formatNaira } from '@/utils/money';
import { compactNaira, fullNaira, Panel, PanelHeader } from './ui';

/**
 * The money screen: three pools, one per owner.
 *
 *  Seller money  — every naira the platform is holding for sellers. When a
 *                  seller requests a withdrawal the wallet balance drops and a
 *                  pending withdrawal is created, so wallet + pending is the
 *                  real amount still owed to sellers.
 *  Buyer money   — buyer wallet balances (refunds and wallet credit).
 *  Platform money— cash left after Paystack costs. Gross income includes
 *                  commission, buyer fees, delivery and seller plans; net
 *                  revenue excludes delivery because it is reserved for courier.
 *
 * Every figure is all-time and derived from the same order/ledger rows as the
 * rest of the console, so this tab never disagrees with the Overview KPIs.
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

function signedNaira(kobo: number): string {
  return kobo < 0 ? `-₦${formatNaira(Math.abs(kobo))}` : fullNaira(kobo);
}

function MoneyRow({
  label,
  value,
  hint,
  emphasis = false,
  signed = false,
}: {
  label: string;
  value: number;
  hint?: string;
  emphasis?: boolean;
  signed?: boolean;
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
        {signed ? signedNaira(value) : fullNaira(value)}
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

  const { money, orders, fees } = data;
  const heldForPeople = money.sellerMoneyKobo + money.buyerWalletKobo;
  const everythingTracked = heldForPeople + fees.netPlatformCashKobo;

  const revenueStreams = [
    { label: 'Seller commission', value: orders.commissionKobo, color: 'bg-[#DE6437]' },
    { label: 'Buyer service fees', value: orders.buyerFeesKobo, color: 'bg-amber-400' },
    { label: 'Delivery fees', value: orders.deliveryFeesKobo, color: 'bg-sky-400' },
    { label: 'Seller subscriptions', value: orders.subscriptionRevenueKobo, color: 'bg-violet-400' },
  ];
  const revenueTotal = Math.max(1, fees.grossPlatformIncomeKobo);

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
          Seller and buyer balances belong to other people. Paystack charges are costs, and
          delivery money is reserved for the courier. Net revenue is what is left after both.
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
          <MoneyRow label="In seller wallets" value={money.sellerWalletKobo} hint="Source-tracked seller earnings" />
          <MoneyRow
            label="Waiting to be paid out"
            value={money.pendingWithdrawalsKobo}
            hint={`${money.pendingWithdrawalsCount} pending request${
              money.pendingWithdrawalsCount === 1 ? '' : 's'
            } · includes seller-paid transfer fee`}
          />
          <MoneyRow label="Already paid to sellers" value={money.paidWithdrawalsKobo} hint="Bank amount, all-time" />
          <MoneyRow label="Transfer fees paid to Paystack" value={money.paidTransferFeesKobo} hint="Paid by sellers, not platform revenue" />
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
          <MoneyRow label="Inside 14-day cash-out hold" value={money.heldBuyerMoneyKobo} hint="Spendable now, not withdrawable yet" />
          <MoneyRow label="Total buyer spend" value={orders.gmvKobo} hint="All orders except cancelled" />
          <MoneyRow label="Completed buyer spend" value={orders.completedGmvKobo} hint="Delivered orders" />
          <MoneyRow label="Still in escrow" value={orders.activeValueKobo} hint={`${orders.active} open orders`} />
        </PoolCard>

        <PoolCard
          title="FuhsiMarket money"
          owner="Cash left after Paystack costs"
          total={fees.netPlatformCashKobo}
          hint="Includes the delivery reserve. Net revenue excludes it until courier is paid."
          icon={<TrendingUp size={17} className="text-[#FFB08F]" />}
          tone="border-[#DE6437]/25"
        >
          <MoneyRow label="Gross platform income" value={fees.grossPlatformIncomeKobo} />
          <MoneyRow label="Payment fee surplus / (shortfall)" value={fees.paymentFeeSurplusKobo} signed />
          <MoneyRow label="Paystack fees lost on refunds" value={-fees.refundedProviderFeesKobo} signed hint="Original fees are not returned" />
          <MoneyRow label="Net platform cash" value={fees.netPlatformCashKobo} emphasis />
          <MoneyRow label="Delivery reserve inside cash" value={fees.deliveryReserveKobo} hint="Courier paid outside the app" />
          <MoneyRow label="Net revenue before courier" value={fees.netRevenueBeforeCourierKobo} emphasis />
        </PoolCard>
      </div>

      <Panel>
        <PanelHeader
          title="Paystack fees & real revenue"
          subtitle="Buyer-paid processing is a pass-through. Only the surplus or shortfall is ours."
          action={
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-mono text-emerald-300">
              {fullNaira(fees.netRevenueBeforeCourierKobo)}
            </span>
          }
        />
        <div className="grid gap-x-8 px-4 py-4 sm:grid-cols-2">
          <div>
            <MoneyRow label="Processing fees collected from buyers" value={fees.processingCollectedKobo} />
            <MoneyRow label="Paystack collection fees paid" value={-fees.providerCollectionFeesKobo} signed />
            <MoneyRow
              label="Payment fee surplus / (shortfall)"
              value={fees.paymentFeeSurplusKobo}
              signed
              hint="Collected processing minus Paystack's real charge"
            />
            <MoneyRow
              label="Paystack fees lost on refunds"
              value={-fees.refundedProviderFeesKobo}
              signed
              hint="Paystack does not refund the original charge"
            />
            <MoneyRow label="Transfer fees collected from users" value={fees.transferFeesCollectedKobo} hint="Deducted from seller/buyer wallets" />
          </div>
          <div>
            <MoneyRow label="Transfer fee variance" value={-fees.transferFeeVarianceKobo} signed hint="Quote minus actual Paystack transfer fee" />
            <MoneyRow label="Gross platform income" value={fees.grossPlatformIncomeKobo} />
            <MoneyRow label="Net platform cash" value={fees.netPlatformCashKobo} emphasis />
            <MoneyRow label="Delivery reserve" value={fees.deliveryReserveKobo} hint="Held for courier payment outside the app" />
            <MoneyRow label="Net revenue before courier" value={fees.netRevenueBeforeCourierKobo} emphasis />
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Panel>
          <PanelHeader
            title="Gross income streams"
            subtitle="Before Paystack costs and before courier payment."
            action={
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-mono text-emerald-300">
                {fullNaira(fees.grossPlatformIncomeKobo)}
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
              <MoneyRow label="Gross platform income" value={fees.grossPlatformIncomeKobo} emphasis />
              <MoneyRow label="Net revenue before courier" value={fees.netRevenueBeforeCourierKobo} />
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Where every naira sits"
            subtitle="Held money and net platform cash, side by side."
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
                style={{ width: `${(Math.max(0, fees.netPlatformCashKobo) / Math.max(1, everythingTracked)) * 100}%` }}
                title={`Platform: ${fullNaira(fees.netPlatformCashKobo)}`}
              />
            </div>
            <div className="mt-4">
              <MoneyRow
                label="Total held for sellers and buyers"
                value={heldForPeople}
                hint={`${share(heldForPeople, everythingTracked)}% of everything tracked`}
              />
              <MoneyRow
                label="Net platform cash"
                value={fees.netPlatformCashKobo}
                hint={`${share(fees.netPlatformCashKobo, everythingTracked)}% of everything tracked`}
              />
              <MoneyRow
                label="Everything tracked"
                value={everythingTracked}
                hint="Held balances + net platform cash"
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
            <MoneyRow label="Pending wallet debits" value={money.pendingWithdrawalsKobo} hint={`${money.pendingWithdrawalsCount} waiting · bank amount + fee`} />
            <MoneyRow label="Paid to bank accounts" value={money.paidWithdrawalsKobo} hint={`${money.paidWithdrawalsCount} completed transfers`} />
            <MoneyRow label="Transfer charges paid by users" value={money.paidTransferFeesKobo} hint="Not FuhsiMarket revenue" />
            <MoneyRow label="Available in seller wallets now" value={money.sellerWalletKobo} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Platform income per order"
            subtitle="Recognised when an order completes, before Paystack costs and courier."
            action={<Wallet size={15} className="text-neutral-500" />}
          />
          <div className="px-4 py-4">
            <MoneyRow label="Completed goods value" value={orders.completedGmvKobo} hint={`${orders.completed} completed orders`} />
            <MoneyRow label="Commission taken" value={orders.commissionKobo} />
            <MoneyRow label="Buyer fees collected" value={orders.buyerFeesKobo} />
            <MoneyRow label="Gross delivery fees collected" value={orders.deliveryFeesKobo} hint="Delivery reserve, not profit" />
            <MoneyRow label="Seller plan revenue" value={orders.subscriptionRevenueKobo} />
            <div className="mt-1 border-t border-white/10 pt-1">
              <MoneyRow label="Gross platform income" value={fees.grossPlatformIncomeKobo} emphasis />
              <MoneyRow label="Net revenue before courier" value={fees.netRevenueBeforeCourierKobo} />
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
