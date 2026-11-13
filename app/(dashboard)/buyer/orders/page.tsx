'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, MapPin, Truck, User, Phone, Hash, AlertTriangle, CheckCircle2, Loader2, Package, Boxes, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { createClient } from '@/utils/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useCart } from '@/context/CartContext';
import { formatNaira } from '@/utils/money';
import DeliveryAnnouncement from '../DeliveryAnnouncement';
import LeaveReview from '@/components/LeaveReview';

type BuyerOrderRow = {
  id: string;
  buyer_id: string;
  seller_id: string;
  amount_kobo: number;
  delivery_fee_kobo: number;
  platform_fee_kobo?: number;
  quantity: number;
  status: string;
  order_ref: string;
  delivery_code?: string | null;
  delivery_type: string;
  receiver_name?: string | null;
  receiver_phone?: string | null;
  matric_number?: string | null;
  delivery_address?: string | null;
  meetup_location?: string | null;
  created_at: string;
  refunded_at?: string | null;
  refund_method?: string | null;
  refund_card_kobo?: number | null;
  products?: { id: string; title: string; image_url?: string | null }[] | { id: string; title: string; image_url?: string | null } | null;
};

function getOrderProduct(products: BuyerOrderRow['products']): { id?: string; title?: string; image_url?: string | null } | null {
  if (!products) return null;
  if (Array.isArray(products)) return products[0] || null;
  if (typeof products === 'object') return products;
  return null;
}

type OrderGroup = {
  order_ref: string;
  delivery_code: string;
  status: string;
  delivery_type: string;
  receiver_name?: string | null;
  receiver_phone?: string | null;
  matric_number?: string | null;
  delivery_address?: string | null;
  meetup_location?: string | null;
  created_at: string;
  items: BuyerOrderRow[];
  totalKobo: number;
  deliveryFeeKobo: number;
  refunded: boolean;
  refundMethod: string | null;
  refundCardKobo: number;
};

const TRACK_STEPS = ['in_escrow', 'packing', 'ready_for_pickup', 'confirmed', 'completed'];
const STEP_LABEL: Record<string, string> = {
  in_escrow: 'Order Received',
  packing: 'Packing Order',
  ready_for_pickup: 'Ready for Pickup',
  confirmed: 'Received by You',
  completed: 'Completed',
};

const isOldFinishedOrder = (group: OrderGroup) => {
  const finished = ['completed', 'confirmed', 'delivered', 'cancelled', 'rejected'].includes(group.status);
  return finished && Date.now() - new Date(group.created_at).getTime() > 7 * 24 * 60 * 60 * 1000;
};

type ConfirmResult = {
  done: boolean;
  kind: 'success' | 'error';
  message: string;
};

/**
 * Ask the server to verify a Paystack return reference.
 *
 * The route both reports the real status AND records the escrow order, so the
 * order list must not be fetched until this settles — otherwise the buyer lands
 * on Orders before the row exists and sees "No orders yet".
 */
async function confirmPaystackReturn(reference: string): Promise<ConfirmResult> {
  try {
    const res = await fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`);
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.status === 'success') {
      return {
        done: true,
        kind: 'success',
        message: 'Payment confirmed! Your order has been placed into escrow.',
      };
    }

    if (res.ok && (data.status === 'failed' || data.status === 'abandoned')) {
      return {
        done: true,
        kind: 'error',
        message: 'Payment was cancelled or failed. Nothing was charged.',
      };
    }

    return {
      done: false,
      kind: 'error',
      message:
        data?.error ||
        'We could not confirm this payment yet. If you were charged, tap "Check payment again" in a moment.',
    };
  } catch {
    return {
      done: false,
      kind: 'error',
      message:
        'Could not reach the server to confirm your payment. Tap "Check payment again" when you are back online.',
    };
  }
}

async function fetchBuyerOrderGroups(
  supabase: SupabaseClient,
): Promise<OrderGroup[] | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  let rowsData: BuyerOrderRow[] | null = null;

  const primary = await supabase
    .from('orders')
    .select(`
      id,
      buyer_id,
      seller_id,
      product_id,
      amount_kobo,
      delivery_fee_kobo,
      platform_fee_kobo,
      quantity,
      status,
      order_ref,
      delivery_code,
      delivery_type,
      receiver_name,
      receiver_phone,
      matric_number,
      delivery_address,
      meetup_location,
      created_at,
      refunded_at,
      refund_method,
      refund_card_kobo,
      products:product_id ( id, title, image_url )
    `)
    .eq('buyer_id', user.id)
    .order('created_at', { ascending: false });

  if (!primary.error && primary.data) {
    rowsData = primary.data as unknown as BuyerOrderRow[];
  } else {
    // The embedded `products` relation can fail depending on how the foreign
    // key is exposed; retry without it and fill product details separately.
    const fallback = await supabase
      .from('orders')
      .select(`
        id,
        buyer_id,
        seller_id,
        product_id,
        amount_kobo,
        delivery_fee_kobo,
        platform_fee_kobo,
        quantity,
        status,
        order_ref,
        delivery_code,
        delivery_type,
        receiver_name,
        receiver_phone,
        matric_number,
        delivery_address,
        meetup_location,
        created_at
      `)
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false });

    if (!fallback.error && fallback.data) {
      rowsData = fallback.data as unknown as BuyerOrderRow[];
    }
  }

  if (!rowsData) return null;

  const rows = rowsData as (BuyerOrderRow & { product_id?: string })[];

  const missingProductIds = rows
    .filter((r) => !getOrderProduct(r.products) && r.product_id)
    .map((r) => r.product_id as string);

  if (missingProductIds.length > 0) {
    const { data: fetchedProducts } = await supabase
      .from('products')
      .select('id, title, image_url')
      .in('id', missingProductIds);

    if (fetchedProducts) {
      const productMap = new Map(fetchedProducts.map((p) => [p.id, p]));
      for (const row of rows) {
        if (!getOrderProduct(row.products) && row.product_id) {
          const p = productMap.get(row.product_id);
          if (p) row.products = [p];
        }
      }
    }
  }

  const byRef = new Map<string, OrderGroup>();
  for (const row of rows) {
    const ref = row.order_ref || row.id;
    const existing = byRef.get(ref);
    if (!existing) {
      byRef.set(ref, {
        order_ref: ref,
        delivery_code: row.delivery_code || ref.slice(0, 8).toUpperCase(),
        status: row.status,
        delivery_type: row.delivery_type,
        receiver_name: row.receiver_name,
        receiver_phone: row.receiver_phone,
        matric_number: row.matric_number,
        delivery_address: row.delivery_address,
        meetup_location: row.meetup_location,
        created_at: row.created_at,
        items: [row],
        totalKobo: row.amount_kobo + (row.delivery_fee_kobo || 0),
        deliveryFeeKobo: row.delivery_fee_kobo || 0,
        refunded: Boolean(row.refunded_at),
        refundMethod: row.refund_method ?? null,
        refundCardKobo: Number(row.refund_card_kobo) || 0,
      });
    } else {
      existing.items.push(row);
      existing.totalKobo += row.amount_kobo;
      // Delivery fee applies once for the whole combined order.
      existing.deliveryFeeKobo = existing.deliveryFeeKobo || row.delivery_fee_kobo || 0;
      // Refund state is written to every row of the group; treat the group as
      // refunded as soon as any row says so.
      if (row.refunded_at) existing.refunded = true;
      existing.refundMethod = existing.refundMethod || row.refund_method || null;
      existing.refundCardKobo = Math.max(
        existing.refundCardKobo,
        Number(row.refund_card_kobo) || 0,
      );
      // The group only advances to a stage once EVERY seller's item has
      // reached it. Whichever seller is furthest behind sets the tracker.
      const rank = (s: string) => TRACK_STEPS.indexOf(s);
      if (rank(row.status) < rank(existing.status)) existing.status = row.status;
    }
  }

  // Mark all current order statuses as seen by the buyer so the notification badge clears
  try {
    const key = 'fuhsi_order_notifications_buyer';
    const read = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, string>;
    for (const row of rows) {
      read[row.id] = row.status;
    }
    localStorage.setItem(key, JSON.stringify(read));
  } catch { /* ignore storage errors */ }

  // Keep the database record for refunds/support, but keep the buyer's list
  // tidy: completed, cancelled, and rejected orders leave after seven days.
  return Array.from(byRef.values()).filter((group) => !isOldFinishedOrder(group));
}

export default function OrdersPage() {
  const supabase = createClient();
  const { clearCart } = useCart();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<OrderGroup[]>([]);
  const [updatingRef, setUpdatingRef] = useState<string | null>(null);
  const [refundingRef, setRefundingRef] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<{ kind: 'success' | 'error'; message: string; retry?: boolean } | null>(null);
  const [expandedRefs, setExpandedRefs] = useState<Record<string, boolean>>({});

  const toggleExpand = (ref: string) => {
    setExpandedRefs((prev) => ({
      ...prev,
      [ref]: !prev[ref],
    }));
  };

  const isExpanded = (ref: string) => {
    return expandedRefs[ref] === true;
  };

  const returnedReferenceRef = React.useRef<string | null>(null);
  const [checkingReturn, setCheckingReturn] = useState(false);
  // True from mount until any Paystack return reference has been confirmed, so
  // the list is not fetched before the freshly escrowed order row exists.
  const [confirmingReturn, setConfirmingReturn] = useState(true);
  const [returnReference, setReturnReference] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  // Remove the Paystack return params only after a terminal answer. On a
  // transient failure the reference stays in the URL so the retry button (or a
  // page reload) can re-run the idempotent verify.
  const stripReturnParams = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('reference');
    url.searchParams.delete('trxref');
    window.history.replaceState(null, '', url.toString());
  };

  const applyConfirmResult = (result: ConfirmResult) => {
    // The order is escrowed. Clear the local cart only now, so a failed
    // verification never loses the basket.
    if (result.done && result.kind === 'success') clearCart();
    setPaymentNotice({ kind: result.kind, message: result.message, retry: !result.done });
  };

  // Confirm a Paystack return FIRST, then let the fetch effect below run. A
  // re-render (e.g. from clearing the cart) must not verify the same reference
  // twice, hence the ref guard.
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const url = new URL(window.location.href);
      const reference = url.searchParams.get('reference') || url.searchParams.get('trxref');

      if (reference && returnedReferenceRef.current !== reference) {
        returnedReferenceRef.current = reference;
        setReturnReference(reference);
        const result = await confirmPaystackReturn(reference);
        if (cancelled) return;
        applyConfirmResult(result);
        if (result.done) stripReturnParams();
      }

      if (cancelled) return;
      setConfirmingReturn(false);
      setRefreshToken((n) => n + 1);
    };

    void boot();
    return () => {
      cancelled = true;
    };
    // Run once per mount: the reference comes from the URL (guarded by the ref)
    // and the helpers only touch stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCheckPaymentAgain = async () => {
    const url = new URL(window.location.href);
    const reference = url.searchParams.get('reference') || url.searchParams.get('trxref');
    setCheckingReturn(true);
    try {
      if (reference) {
        const result = await confirmPaystackReturn(reference);
        applyConfirmResult(result);
        if (result.done) stripReturnParams();
      } else {
        setPaymentNotice(null);
      }
      setRefreshToken((n) => n + 1);
    } finally {
      setCheckingReturn(false);
    }
  };

  // Fetch (and refetch after confirmation) the buyer's orders.
  useEffect(() => {
    if (confirmingReturn) return;

    let cancelled = false;
    const run = async () => {
      const nextGroups = await fetchBuyerOrderGroups(supabase);
      if (cancelled) return;
      if (nextGroups) setGroups(nextGroups);
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [supabase, refreshToken, confirmingReturn]);

  const handleGroupComplete = async (group: OrderGroup) => {
    setUpdatingRef(group.order_ref);
    try {
      const res = await fetch('/api/orders/complete-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderRef: group.order_ref }),
      });
      if (res.ok) {
        setGroups((prev) =>
          prev.map((g) =>
            g.order_ref === group.order_ref ? { ...g, status: 'completed' } : g
          )
        );
      } else {
        let message = 'Could not confirm this order. Please try again.';
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch { /* fall through */ }
        alert(message);
      }
    } catch (err) {
      console.error('Confirm order error:', err);
      alert('Could not confirm this order. Please try again.');
    } finally {
      setUpdatingRef(null);
    }
  };

  const handleGroupRefund = async (group: OrderGroup) => {
    const ok = window.confirm(
      'Report a problem with this order and request a refund?\n\nIf you paid by card, the card portion is refunded to your card; any wallet portion returns to your FuhsiMarket wallet. The whole order will be cancelled.',
    );
    if (!ok) return;

    setRefundingRef(group.order_ref);
    try {
      const res = await fetch('/api/orders/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderRef: group.order_ref }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.ok) {
        setGroups((prev) =>
          prev.map((g) =>
            g.order_ref === group.order_ref
              ? {
                  ...g,
                  status: 'disputed',
                  refunded: true,
                  refundMethod: data.method || 'wallet',
                  refundCardKobo: Number(data.cardKobo) || 0,
                }
              : g,
          ),
        );
        setPaymentNotice({
          kind: 'success',
          message:
            Number(data.cardKobo) > 0
              ? 'Refund started. The card portion is on its way and any wallet portion is already in your wallet.'
              : 'Refund complete. The full amount is now in your FuhsiMarket wallet.',
        });
      } else if (res.status === 409) {
        alert(data?.error || 'This order has already been settled and cannot be refunded.');
        setRefreshToken((n) => n + 1);
      } else {
        alert(data?.error || 'Could not start the refund. Please try again.');
      }
    } catch (err) {
      console.error('Refund request error:', err);
      alert('Could not reach the server to refund this order. Please try again.');
    } finally {
      setRefundingRef(null);
    }
  };

  if (loading) {
    if (returnReference) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <Loader2 className="animate-spin text-[#ef6b3b]" size={26} />
          <p className="text-sm font-bold text-[#251d18]">Confirming your payment…</p>
          <p className="max-w-xs text-xs leading-relaxed text-[#81756d]">
            This only takes a moment. Please keep this page open — your order will appear
            here as soon as it is confirmed.
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-4 animate-pulse pt-3">
        <div className="h-7 w-28 rounded-full bg-[#eee4dc]" />
        {[1, 2].map(item => <div key={item} className="rounded-[1.75rem] bg-white p-5 shadow-sm"><div className="h-4 w-20 rounded bg-[#eee4dc]" /><div className="mt-4 h-7 w-40 rounded bg-[#f4eee9]" /><div className="mt-5 h-16 rounded-2xl bg-[#faf6f2]" /></div>)}
      </div>
    );
  }

  return (
    <div className="buyer-secondary space-y-5 py-2">
      <Link href="/buyer" className="inline-flex items-center gap-2 text-xs font-bold text-[#81756d] hover:text-[#d8552e]">← Back to home</Link>
      <DeliveryAnnouncement />

      {paymentNotice && (
        <div
          role="status"
          className={`rounded-2xl border p-4 flex flex-wrap items-center gap-3 text-xs font-mono ${
            paymentNotice.kind === 'success'
              ? 'bg-[#e8f7ef] border-[#cdeeda] text-[#0f6b4a]'
              : 'bg-[#fff0e9] border-[#ffd9c4] text-[#b04a27]'
          }`}
        >
          {paymentNotice.kind === 'success' ? (
            <CheckCircle2 size={18} className="flex-shrink-0" />
          ) : (
            <AlertTriangle size={18} className="flex-shrink-0" />
          )}
          <span>{paymentNotice.message}</span>
          {paymentNotice.retry ? (
            <button
              onClick={handleCheckPaymentAgain}
              disabled={checkingReturn}
              className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#b04a27]/30 px-3 py-1.5 text-[10px] font-bold disabled:opacity-60"
            >
              {checkingReturn ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              {checkingReturn ? 'Checking…' : 'Check payment again'}
            </button>
          ) : null}
        </div>
      )}

      <div className="bg-white border border-[#eee4dc] rounded-[1.75rem] p-6 shadow-sm">
<h1 className="text-xl font-black text-[#251d18] flex items-center gap-2">
          <CreditCard className="text-[#ef6b3b]" /> Your orders
        </h1>
        <p className="text-xs text-[#81756d] mt-1">
          Items from different sellers are shown together here. Show the code when your order arrives, then tap “Confirm received” once you have everything.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="p-12 border border-[#eee4dc] bg-white rounded-[1.75rem] text-center text-xs text-[#81756d] font-mono">
          No orders yet. When you buy something, its delivery updates will show here.
        </div>
      ) : (
        <div className="space-y-4 max-w-2xl">
          {groups.map((group) => {
            const statusIndex = TRACK_STEPS.indexOf(group.status);
            const isDelivered = ['confirmed', 'delivered', 'completed'].includes(group.status);
            const isDisputed = group.status === 'disputed';
            const isRefunded = group.refunded;
            const canConfirm = group.status === 'ready_for_pickup';
            const canRefund = !isRefunded && ['in_escrow', 'packing', 'ready_for_pickup', 'confirmed', 'delivered', 'disputed'].includes(group.status);
            const isTerminal = ['completed', 'confirmed', 'delivered', 'cancelled', 'rejected'].includes(group.status);
            const open = isExpanded(group.order_ref);
            const productNames = group.items
              .map((item) => getOrderProduct(item.products)?.title)
              .filter(Boolean)
              .join(', ') || 'Campus purchase';

            return (
              <div key={group.order_ref} className="bg-white border border-[#eee4dc] rounded-[1.75rem] p-5 space-y-4 shadow-sm transition-all">
                {/* SUMMARY BAR */}
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono px-2.5 py-1 rounded border uppercase tracking-wider font-bold ${
                        isDisputed
                          ? 'bg-[#fff0e9] border-[#ffd9c4] text-[#b04a27]'
                          : isTerminal
                            ? 'bg-[#e8f7ef] border-[#cdeeda] text-[#17805b]'
                            : 'bg-[#fff7e8] border-[#f2e0b8] text-[#8a650f]'
                      }`}>
                        {group.status === 'rejected' ? 'Order not accepted' : group.status.replace(/_/g, ' ')}
                      </span>

                      <button
                        onClick={() => toggleExpand(group.order_ref)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#faf6f2] hover:bg-[#fff0e9] text-[11px] font-bold text-[#d8552e] border border-[#eee4dc] transition-all cursor-pointer"
                        aria-label={open ? 'Hide order details' : 'Show order details'}
                      >
                        <span>{open ? 'Hide order details' : 'Order details'}</span>
                        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    </div>

                    {/* PRODUCT NAME */}
                    <p className="text-xs font-bold text-[#251d18] truncate max-w-xs sm:max-w-md pt-1">
                      {productNames}
                    </p>

                    {/* THE HANDOFF CODE */}
                    <div className="mt-1 flex items-center gap-2">
                      <Boxes size={18} className="text-[#ef6b3b]" />
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-wider text-[#81756d]">Code for delivery</p>
                        <p className="text-xl sm:text-2xl font-black font-mono text-[#251d18] tracking-widest">{group.delivery_code}</p>
                      </div>
                    </div>

                    <p className="text-[10px] font-mono text-[#9d9188] mt-0.5">
                      {group.items.length} item{group.items.length === 1 ? '' : 's'} · Order ID: {group.order_ref?.slice(0, 8)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[#17805b] font-mono font-black text-lg">
                      ₦{formatNaira(group.totalKobo)}
                    </p>
                    {group.deliveryFeeKobo > 0 && (
                      <p className="text-[10px] font-mono text-[#81756d]">
                        incl. delivery ₦{formatNaira(group.deliveryFeeKobo)}
                      </p>
                    )}
                  </div>
                </div>

                {/* EXPANDABLE DROPDOWN DETAILS */}
                {open && (
                  <div className="space-y-4 pt-3 border-t border-[#f0e9e2] animate-in fade-in duration-200">
                    {/* ITEM LIST (all sellers' items in this combined order) */}
                <div className="space-y-2">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[#81756d] flex items-center gap-1">
                    <Package size={12} /> Items in this order
                  </p>
                  {group.items.map((item) => {
                    const product = getOrderProduct(item.products);
                    return (
                      <div key={item.id} className="flex items-center gap-3 bg-[#faf6f2] border border-[#eee4dc] rounded-2xl p-3">
                        {product?.image_url ? (
                          <img src={product.image_url} alt={product.title || ''} className="w-12 h-12 rounded-lg object-cover" />
                        ) : (
<div className="w-12 h-12 rounded-lg bg-[#f3eee8] flex items-center justify-center">
                            <Package size={18} className="text-[#c9bfb2]" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[#251d18] truncate">{product?.title || 'Campus purchase'}</p>
                          <p className="text-[10px] font-mono text-[#81756d]">
                            {item.quantity > 1 ? `x${item.quantity} · ` : ''}₦{formatNaira(item.amount_kobo)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* LIVE TRACKING TIMELINE */}
                {!isDisputed && group.status !== 'cancelled' && (
                  <div className="space-y-3">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[#81756d]">Delivery progress</p>
                    <div className="flex items-center justify-between">
                      {TRACK_STEPS.map((step, idx) => {
                        const done = statusIndex !== -1 && idx <= statusIndex;
                        const current = idx === statusIndex;
                        return (
                          <div key={step} className="flex-1 flex items-center flex-col gap-1.5">
                            <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-mono transition-all ${
                              done
                                ? 'bg-[#e8f7ef] border-[#17805b] text-[#17805b]'
                                : 'bg-[#faf6f2] border-[#e3dad1] text-[#b4aaa2]'
                            } ${current ? 'ring-2 ring-[#17805b]/40' : ''}`}>
                              {done ? <CheckCircle2 size={13} /> : idx + 1}
                            </div>
                            <span className={`text-[9px] text-center font-mono uppercase leading-tight ${
                              done ? 'text-[#17805b]' : 'text-[#9d9188]'
                            } ${current ? 'font-bold' : ''}`}>
                              {STEP_LABEL[step]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* DELIVERY INFO */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-[#faf6f2] border border-[#eee4dc] rounded-2xl p-3">
                    <span className="text-[10px] text-[#81756d] uppercase font-mono block">Method</span>
                    <p className="font-semibold text-[#251d18] mt-0.5 flex items-center gap-1">
                      {group.delivery_type === 'delivery' ? <Truck size={12} className="text-[#ef6b3b]" /> : <MapPin size={12} className="text-[#17805b]" />}
                      {group.delivery_type === 'delivery'
                        ? `Deliver to: ${group.delivery_address || '—'}`
                        : 'On-campus pickup'}
                    </p>
                  </div>

                  <div className="bg-[#faf6f2] border border-[#eee4dc] rounded-2xl p-3 space-y-1">
                    <span className="text-[10px] text-[#81756d] uppercase font-mono block">Receiver</span>
                    <p className="font-semibold text-[#251d18] flex items-center gap-1">
                      <User size={12} className="text-[#81756d]" /> {group.receiver_name || '—'}
                    </p>
                    <p className="text-[#81756d] flex items-center gap-1">
                      <Phone size={11} className="text-[#81756d]" /> {group.receiver_phone || '—'}
                    </p>
                    <p className="text-[#81756d] flex items-center gap-1">
                      <Hash size={11} className="text-[#81756d]" /> {group.matric_number || '—'}
                    </p>
                  </div>
                </div>

                {/* GROUP CONFIRM — releases ALL sellers at once */}
                {canConfirm && (
                  <button
                    onClick={() => handleGroupComplete(group)}
                    disabled={updatingRef === group.order_ref}
                    className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs py-3.5 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/20 active:scale-95 disabled:opacity-60"
                  >
                    {updatingRef === group.order_ref ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    {updatingRef === group.order_ref ? 'Confirming...' : 'Confirm received'}
                  </button>
                )}

{isDelivered && (
                  <div className="p-4 bg-[#e8f7ef] border border-[#cdeeda] text-[#0f6b4a] text-xs rounded-xl text-center font-medium font-mono">
                    <CheckCircle2 size={16} className="inline mr-1" /> You confirmed this order. Payment has been released to the seller.
                  </div>
                )}
                {group.status === 'completed' && (
                  <div className="space-y-2">
                    {group.items.map((item) => {
                      const p = getOrderProduct(item.products);
                      if (!p?.id) return null;
                      return (
                        <LeaveReview
                          key={item.id}
                          orderId={item.id}
                          productId={p.id}
                          productTitle={p.title || 'this item'}
                        />
                      );
                    })}
                  </div>
                )}
                {canRefund && (
                  <button
                    onClick={() => handleGroupRefund(group)}
                    disabled={refundingRef === group.order_ref}
                    className="w-full border border-[#ffd9c4] bg-[#fff7f2] hover:bg-[#fff0e9] text-[#b04a27] font-bold text-xs py-3 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    {refundingRef === group.order_ref ? <Loader2 size={15} className="animate-spin" /> : <AlertTriangle size={15} />}
                    {refundingRef === group.order_ref
                      ? 'Checking refund…'
                      : isDisputed
                        ? 'Retry refund safely'
                        : 'Report a problem / Request refund'}
                  </button>
                )}
                {isRefunded ? (
                  <div className="p-4 bg-[#e8f7ef] border border-[#cdeeda] text-[#0f6b4a] text-xs rounded-xl text-center font-medium font-mono">
                    <CheckCircle2 size={16} className="inline mr-1" />
                    Refund processed.
                    {group.refundMethod !== 'wallet' && group.refundCardKobo > 0
                      ? ` ₦${formatNaira(group.refundCardKobo)} is returning to your card; the rest is in your wallet.`
                      : ' The full amount is in your FuhsiMarket wallet.'}
                  </div>
                ) : isDisputed && (
                  <div className="p-4 bg-[#fff0e9] border border-[#ffd9c4] text-[#b04a27] text-xs rounded-xl text-center font-medium font-mono">
                    <AlertTriangle size={16} className="inline mr-1" /> We are checking this order. Your money is still protected.
                  </div>
                )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
