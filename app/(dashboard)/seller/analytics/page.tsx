'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { formatNaira } from '@/utils/money';
import { sellerPayoutForGoodsKobo } from '@/utils/pricing';
import {
  BarChart3,
  Download,
  Package,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react';

/**
 * Seller insights: revenue released, money still in escrow, top products and a
 * simple 14-day chart. Everything is computed from the seller's own `orders`
 * rows (RLS already limits them), so no extra database objects are needed.
 *
 * `amount_kobo` is the goods value only; delivery and the buyer service fee are
 * platform money and never reach the seller, so they are excluded here.
 */

type SellerOrder = {
  id: string;
  order_ref: string;
  product_id: string | null;
  amount_kobo: number;
  quantity: number;
  status: string;
  created_at: string;
  platform_fee_kobo?: number | null;
  products?: { id: string; title: string }[] | { id: string; title: string } | null;
};

function productTitle(row: SellerOrder): string {
  const product = row.products;
  if (!product) return 'Campus item';
  if (Array.isArray(product)) return product[0]?.title || 'Campus item';
  return product.title || 'Campus item';
}

const RELEASED = new Set(['completed', 'confirmed', 'delivered']);
const IN_ESCROW = new Set(['in_escrow', 'packing', 'ready_for_pickup']);
const LOST = new Set(['cancelled', 'rejected', 'refunded', 'disputed']);

export default function SellerAnalyticsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login?redirect=/seller/analytics');
        return;
      }

      let { data, error: queryError } = await supabase
        .from('orders')
        .select(`
          id,
          order_ref,
          product_id,
          amount_kobo,
          quantity,
          status,
          created_at,
          platform_fee_kobo,
          products:product_id ( id, title )
        `)
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false });

      if (queryError) {
        const fallback = await supabase
          .from('orders')
          .select('id, order_ref, product_id, amount_kobo, quantity, status, created_at, platform_fee_kobo')
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false });
        data = fallback.data as typeof data;
        queryError = fallback.error;
      }

      if (queryError) {
        console.error('[seller/analytics] load failed', queryError);
        setError('Could not load your sales data. Pull to refresh and try again.');
      } else {
        setOrders((data || []) as unknown as SellerOrder[]);
      }
      setLoading(false);
    };

    void load();
  }, [router, supabase]);

  const stats = useMemo(() => {
    let releasedKobo = 0;
    let escrowKobo = 0;
    let lostKobo = 0;
    let releasedOrders = 0;
    let escrowOrders = 0;
    let lostOrders = 0;
    const units = new Map<string, { title: string; units: number; revenueKobo: number }>();

    for (const order of orders) {
      const goods = Number(order.amount_kobo) || 0;
      const payout =
        order.platform_fee_kobo !== null && order.platform_fee_kobo !== undefined
          ? Math.max(goods - Number(order.platform_fee_kobo), 0)
          : sellerPayoutForGoodsKobo(goods);

      if (RELEASED.has(order.status)) {
        releasedKobo += payout;
        releasedOrders += 1;
        const key = order.product_id || productTitle(order);
        const entry = units.get(key) || { title: productTitle(order), units: 0, revenueKobo: 0 };
        entry.units += Number(order.quantity) || 1;
        entry.revenueKobo += payout;
        units.set(key, entry);
      } else if (IN_ESCROW.has(order.status)) {
        escrowKobo += payout;
        escrowOrders += 1;
      } else if (LOST.has(order.status)) {
        lostKobo += goods;
        lostOrders += 1;
      }
    }

    const topProducts = Array.from(units.values())
      .sort((a, b) => b.revenueKobo - a.revenueKobo)
      .slice(0, 5);

    // Last 14 calendar days of released revenue.
    const days: { key: string; label: string; kobo: number }[] = [];
    const byDay = new Map<string, number>();
    for (const order of orders) {
      if (!RELEASED.has(order.status)) continue;
      const goods = Number(order.amount_kobo) || 0;
      const payout =
        order.platform_fee_kobo !== null && order.platform_fee_kobo !== undefined
          ? Math.max(goods - Number(order.platform_fee_kobo), 0)
          : sellerPayoutForGoodsKobo(goods);
      const key = new Date(order.created_at).toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) || 0) + payout);
    }
    for (let i = 13; i >= 0; i--) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      days.push({
        key,
        label: date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }),
        kobo: byDay.get(key) || 0,
      });
    }

    return {
      releasedKobo,
      escrowKobo,
      lostKobo,
      releasedOrders,
      escrowOrders,
      lostOrders,
      topProducts,
      days,
      maxDayKobo: Math.max(...days.map((day) => day.kobo), 1),
      totalOrders: orders.length,
    };
  }, [orders]);

  const exportCsv = () => {
    const header = [
      'Date',
      'Order reference',
      'Product',
      'Quantity',
      'Goods (NGN)',
      'Commission (NGN)',
      'Seller payout (NGN)',
      'Status',
    ];
    const lines = orders.map((order) => {
      const goods = Number(order.amount_kobo) || 0;
      const fee =
        order.platform_fee_kobo !== null && order.platform_fee_kobo !== undefined
          ? Number(order.platform_fee_kobo)
          : Math.max(goods - sellerPayoutForGoodsKobo(goods), 0);
      const payout = Math.max(goods - fee, 0);
      return [
        new Date(order.created_at).toLocaleString('en-NG'),
        order.order_ref,
        productTitle(order),
        Number(order.quantity) || 1,
        (goods / 100).toFixed(2),
        (fee / 100).toFixed(2),
        (payout / 100).toFixed(2),
        order.status,
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(',');
    });

    const blob = new Blob([[header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fuhsimarket-sales-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse py-4">
        <div className="h-28 rounded-[1.75rem] bg-[#eee4dc]" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-24 rounded-2xl bg-[#f4eee9]" />
          ))}
        </div>
        <div className="h-56 rounded-[1.75rem] bg-[#faf6f2]" />
      </div>
    );
  }

  return (
    <div className="space-y-5 py-2">
      <div className="rounded-[1.75rem] border border-[#eee4dc] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-black text-[#251d18]">
              <BarChart3 className="text-[#ef6b3b]" /> Sales insights
            </h1>
            <p className="mt-1 text-xs text-[#81756d]">
              Revenue released to your wallet, money still in escrow, and how your products are performing.
            </p>
          </div>
          <button
            onClick={exportCsv}
            disabled={orders.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#eee4dc] bg-[#faf6f2] px-3 py-2 text-xs font-bold text-[#d8552e] transition-colors hover:bg-[#fff0e9] disabled:opacity-50"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-[#ffd9c4] bg-[#fff0e9] p-4 text-xs font-mono text-[#b04a27]">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Wallet size={16} />}
          label="Released revenue"
          value={`₦${formatNaira(stats.releasedKobo)}`}
          hint={`${stats.releasedOrders} completed order${stats.releasedOrders === 1 ? '' : 's'}`}
          tone="green"
        />
        <StatCard
          icon={<TrendingUp size={16} />}
          label="In escrow"
          value={`₦${formatNaira(stats.escrowKobo)}`}
          hint={`${stats.escrowOrders} order${stats.escrowOrders === 1 ? '' : 's'} awaiting confirmation`}
          tone="amber"
        />
        <StatCard
          icon={<ShoppingBag size={16} />}
          label="Total orders"
          value={String(stats.totalOrders)}
          hint={`${stats.lostOrders} cancelled/refunded`}
          tone="neutral"
        />
        <StatCard
          icon={<Package size={16} />}
          label="Top product"
          value={stats.topProducts[0]?.title || '—'}
          hint={
            stats.topProducts[0]
              ? `${stats.topProducts[0].units} sold · ₦${formatNaira(stats.topProducts[0].revenueKobo)}`
              : 'No completed sales yet'
          }
          tone="orange"
        />
      </div>

      {/* 14-day revenue chart */}
      <div className="rounded-[1.75rem] border border-[#eee4dc] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black text-[#251d18]">Revenue · last 14 days</h2>
            <p className="text-[10px] font-mono text-[#81756d]">
              Goods value after the 3% platform commission
            </p>
          </div>
          <span className="rounded-full bg-[#fff7e8] px-2.5 py-1 text-[10px] font-mono font-bold text-[#8a650f]">
            ₦{formatNaira(stats.days.reduce((sum, day) => sum + day.kobo, 0))}
          </span>
        </div>

        <div className="mt-5 flex h-36 items-end gap-1.5">
          {stats.days.map((day) => {
            const height = Math.max((day.kobo / stats.maxDayKobo) * 100, day.kobo > 0 ? 6 : 2);
            return (
              <div key={day.key} className="group flex flex-1 flex-col items-center gap-1.5">
                <div className="relative flex w-full flex-1 items-end">
                  <div
                    className={`w-full rounded-t-md transition-colors ${
                      day.kobo > 0 ? 'bg-[#ef6b3b] group-hover:bg-[#d8552e]' : 'bg-[#eee4dc]'
                    }`}
                    style={{ height: `${height}%` }}
                    title={`${day.label}: ₦${formatNaira(day.kobo)}`}
                  />
                </div>
                <span className="text-[8px] font-mono text-[#9d9188]">{day.label.split(' ')[0]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top products */}
      <div className="rounded-[1.75rem] border border-[#eee4dc] bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-[#251d18]">Top products</h2>
        {stats.topProducts.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-[#faf6f2] p-4 text-center text-xs font-mono text-[#81756d]">
            Completed sales will appear here. Mark orders ready and ask the buyer to confirm receipt to release payment.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-[#f0e9e2]">
            {stats.topProducts.map((product, index) => (
              <div key={`${product.title}-${index}`} className="flex items-center gap-3 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff0e9] text-[11px] font-black text-[#d8552e]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-[#251d18]">{product.title}</p>
                  <p className="text-[10px] font-mono text-[#81756d]">{product.units} unit{product.units === 1 ? '' : 's'} sold</p>
                </div>
                <p className="shrink-0 text-xs font-mono font-black text-[#17805b]">
                  ₦{formatNaira(product.revenueKobo)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-[1.75rem] border border-[#eee4dc] bg-[#faf6f2] p-4 text-center text-[11px] text-[#81756d]">
        Need to move an order forward?{' '}
        <Link href="/seller/orders" className="font-bold text-[#d8552e] underline">
          Open your sales
        </Link>
        .
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: 'green' | 'amber' | 'neutral' | 'orange';
}) {
  const tones = {
    green: 'bg-[#e8f7ef] text-[#0f6b4a] border-[#cdeeda]',
    amber: 'bg-[#fff7e8] text-[#8a650f] border-[#f2e0b8]',
    neutral: 'bg-[#f4eee9] text-[#443832] border-[#eee4dc]',
    orange: 'bg-[#fff0e9] text-[#b04a27] border-[#ffd9c4]',
  } as const;

  return (
    <div className="rounded-2xl border border-[#eee4dc] bg-white p-4 shadow-sm">
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${tones[tone]}`}>
        {icon}
        {label}
      </div>
      <p className="mt-3 truncate text-lg font-black text-[#251d18]" title={value}>{value}</p>
      <p className="mt-0.5 text-[10px] font-mono text-[#81756d]">{hint}</p>
    </div>
  );
}
