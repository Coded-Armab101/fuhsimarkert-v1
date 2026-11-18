'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { formatNaira } from '@/utils/money';
import { Receipt, Loader2, Package, MapPin, Truck, User, Phone, Hash, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { safeImageSrc } from '@/utils/safeImage';
import { variantLabel } from '@/utils/variants';
import { useNotifications } from '@/components/NotificationProvider';

type SellerOrder = {
  id: string;
  amount_kobo: number;
  delivery_fee_kobo: number;
  quantity: number;
  status: string;
  order_ref: string;
  size?: string | null;
  color?: string | null;
  variant_key?: string | null;
  delivery_code?: string | null;
  delivery_type: string;
  receiver_name?: string | null;
  receiver_phone?: string | null;
  matric_number?: string | null;
  delivery_address?: string | null;
  meetup_location: string;
  created_at: string;
  dispute_reason?: string | null;
  dispute_opened_at?: string | null;
  return_required?: boolean | null;
  return_received_at?: string | null;
  return_confirmation_source?: string | null;
  products?: { id: string; title: string; image_url?: string | null }[] | { id: string; title: string; image_url?: string | null } | null;
};

function getOrderProduct(products: SellerOrder['products']): { id?: string; title?: string; image_url?: string | null } | null {
  if (!products) return null;
  if (Array.isArray(products)) return products[0] || null;
  if (typeof products === 'object') return products;
  return null;
}

type SellerOrderGroup = {
  key: string;
  orderRef: string;
  rows: SellerOrder[];
  status: string;
  amountKobo: number;
  quantity: number;
};

const FULFILMENT_RANK: Record<string, number> = {
  in_escrow: 0,
  packing: 1,
  ready_for_pickup: 2,
  confirmed: 3,
  delivered: 4,
  completed: 5,
};

/**
 * All products a buyer bought from this seller in one checkout are packed and
 * handed over once. The API moves every row in the group together.
 */
function groupOrders(rows: SellerOrder[]): SellerOrderGroup[] {
  const byRef = new Map<string, SellerOrder[]>();
  for (const row of rows) {
    const ref = row.order_ref || row.id;
    const bucket = byRef.get(ref) || [];
    bucket.push(row);
    byRef.set(ref, bucket);
  }
  return Array.from(byRef, ([ref, bucket]) => ({
    key: ref,
    orderRef: ref,
    rows: bucket,
    status: bucket.reduce((lowest, row) => {
      const rowRank = FULFILMENT_RANK[row.status] ?? 99;
      const lowestRank = FULFILMENT_RANK[lowest] ?? 99;
      return rowRank < lowestRank ? row.status : lowest;
    }, bucket[0]?.status || 'in_escrow'),
    amountKobo: bucket.reduce((sum, row) => sum + row.amount_kobo, 0),
    quantity: bucket.reduce((sum, row) => sum + row.quantity, 0),
  }));
}

export default function SellerOrdersPage() {
  const router = useRouter();
  const supabase = createClient();
  const { notify, confirm } = useNotifications();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmingReturnId, setConfirmingReturnId] = useState<string | null>(null);
  const groups = useMemo(() => groupOrders(orders), [orders]);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login?redirect=/seller/orders');
          return;
        }

        let { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            product_id,
            amount_kobo,
            delivery_fee_kobo,
            quantity,
            status,
            order_ref,
            size,
            color,
            variant_key,
            delivery_code,
            delivery_type,
            receiver_name,
            receiver_phone,
            matric_number,
            delivery_address,
            meetup_location,
            created_at,
            dispute_reason,
            dispute_opened_at,
            return_required,
            return_received_at,
            return_confirmation_source,
            products:product_id (
              id,
              title,
              image_url
            )
          `)
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          const fallbackRes = await supabase
            .from('orders')
            .select(`
              id,
              product_id,
              amount_kobo,
              delivery_fee_kobo,
              quantity,
              status,
              order_ref,
              size,
              color,
              variant_key,
              delivery_code,
              delivery_type,
              receiver_name,
              receiver_phone,
              matric_number,
              delivery_address,
              meetup_location,
              created_at,
              dispute_reason,
              dispute_opened_at,
              return_required,
              return_received_at,
              return_confirmation_source
            `)
            .eq('seller_id', user.id)
            .order('created_at', { ascending: false });

          if (!fallbackRes.error && fallbackRes.data) {
            data = fallbackRes.data as unknown as typeof data;
            error = null;
          }
        }

        if (!error && data) {
          const rows = data as (SellerOrder & { product_id?: string })[];
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
          setOrders(rows);
        } else if (error) {
          console.error('Failed to load orders:', error);
        }
      } catch (err) {
        console.error('Failed to load orders:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [router, supabase]);

  const advanceStatus = async (group: SellerOrderGroup, newStatus: 'packing' | 'ready_for_pickup') => {
    setUpdatingId(group.key);
    const response = await fetch('/api/orders/seller-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The server advances every row for this order_ref that belongs to the
      // signed-in seller, so one button packs the whole seller bundle.
      body: JSON.stringify({ orderRef: group.orderRef, status: newStatus }),
    });
    if (response.ok) {
      const ids = new Set(group.rows.map((row) => row.id));
      setOrders((prev) => prev.map((ord) => (ids.has(ord.id) ? { ...ord, status: newStatus } : ord)));
    } else {
      const data = await response.json().catch(() => null);
      console.error('Failed to update order:', data);
      notify(data?.error || 'Could not update the order. Please try again.', { tone: 'error' });
    }
    setUpdatingId(null);
  };

  const confirmReturnedItem = async (order: SellerOrder) => {
    const accepted = await confirm({
      title: 'Confirm item is back with you?',
      message: 'Only continue after you have physically received and checked the returned product. This confirmation allows the protected buyer refund to continue and is recorded in the dispute history.',
      confirmLabel: 'Yes, item received',
      tone: 'warning',
    });
    if (!accepted) return;

    setConfirmingReturnId(order.id);
    try {
      const response = await fetch('/api/orders/return-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not confirm the returned item.');
      setOrders((current) => current.map((entry) =>
        entry.id === order.id
          ? { ...entry, return_received_at: new Date().toISOString(), return_confirmation_source: 'seller' }
          : entry,
      ));
      notify('Returned item confirmed. The buyer can now continue the protected refund.', { tone: 'success' });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not confirm the returned item.', { tone: 'error' });
    } finally {
      setConfirmingReturnId(null);
    }
  };

  const statusLabel = (status: string) => status.replace(/_/g, ' ').toUpperCase();

  const statusTone = (status: string) => {
    if (status === 'confirmed' || status === 'delivered' || status === 'completed') {
      return 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400';
    }
    if (status === 'disputed' || status === 'cancelled') {
      return 'bg-red-950/40 border-red-800/60 text-red-400';
    }
    if (status === 'ready_for_pickup') {
      return 'bg-sky-950/40 border-sky-800/60 text-sky-400';
    }
    return 'bg-amber-950/40 border-amber-800/60 text-amber-400';
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse pt-3">
        {[1,2].map(item => <div key={item} className="rounded-[1.75rem] bg-white p-5 shadow-sm"><div className="h-5 w-32 rounded bg-[#eee4dc]" /><div className="mt-4 h-16 rounded-2xl bg-[#f4eee9]" /><div className="mt-3 h-12 rounded-xl bg-[#faf6f2]" /></div>)}
      </div>
    );
  }

  return (
    <div className="seller-secondary max-w-5xl mx-auto py-3 px-1 space-y-5">
      <div className="bg-neutral-950 border border-neutral-800 p-6 rounded-3xl">
        <h1 className="text-xl font-bold text-white">Escrow Orders</h1>
        <p className="text-xs text-neutral-400">
          Fulfil orders, track student purchases & payout releases
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-12 text-center space-y-3">
          <Receipt size={36} className="mx-auto text-neutral-600" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">No active orders</h3>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              When a student buys one of your items via Escrow, order status
              will show up here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const order = group.rows[0];
            const product = getOrderProduct(order.products);
            const hasProblem = group.rows.some((row) => row.status === 'disputed' || row.status === 'cancelled');
            const canPack = group.status === 'in_escrow' && !hasProblem;
            const canReady = group.status === 'packing' && !hasProblem;
            const fulfilled = ['ready_for_pickup', 'confirmed', 'delivered', 'completed'].includes(group.status);
            const grandTotal = group.amountKobo;
            const orderedAt = new Date(order.created_at);
            const orderedAtLabel = Number.isNaN(orderedAt.getTime())
              ? 'Time unavailable'
              : orderedAt.toLocaleString('en-NG', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                });
            const phoneHref = order.receiver_phone
              ? `tel:${order.receiver_phone.replace(/[^\d+]/g, '')}`
              : null;

            return (
              <div key={group.key} className="bg-neutral-950 border border-neutral-800 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-neutral-900 rounded-2xl overflow-hidden flex-shrink-0">
                      {product?.image_url ? (
                        <img src={safeImageSrc(product.image_url) ?? undefined} alt={product.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-700">
                          <Package size={22} />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <h3 className="font-bold text-white text-sm line-clamp-1">
                        {product?.title || 'Campus product purchase'}
                        {order.quantity > 1 && (
                          <span className="ml-2 text-[10px] font-mono text-red-400 bg-red-950/40 border border-red-900/60 rounded px-1.5 py-0.5 align-middle">
                            x{order.quantity}
                          </span>
                        )}
                      </h3>
                      {variantLabel(order.size, order.color) && (
                        <p className="inline-flex rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] font-bold text-neutral-300">
                          {variantLabel(order.size, order.color)}
                        </p>
                      )}
                      {group.rows.length > 1 && (
                        <div className="mt-2 space-y-1 rounded-xl border border-neutral-800 bg-neutral-900/60 p-2.5">
                          <p className="text-[9px] font-mono uppercase tracking-wider text-neutral-500">
                            Packed together · {group.rows.length} product lines
                          </p>
                          {group.rows.map((row) => {
                            const rowProduct = getOrderProduct(row.products);
                            const rowVariant = variantLabel(row.size, row.color);
                            return (
                              <p key={row.id} className="text-[10px] font-mono text-neutral-400">
                                • {rowProduct?.title || 'Campus product purchase'}
                                {row.quantity > 1 ? ` x${row.quantity}` : ''}
                                {rowVariant ? ` · ${rowVariant}` : ''} · ₦{formatNaira(row.amount_kobo)}
                              </p>
                            );
                          })}
                        </div>
                      )}
                      <p className="text-[11px] font-mono text-neutral-500">
                        Order: <span className="text-white font-bold tracking-wider">{order.delivery_code || group.orderRef}</span>
                      </p>
                      <p className="text-[10px] font-mono text-neutral-600">
                        Ref ID: {group.orderRef.slice(0, 8)}
                      </p>
                      <p className="flex items-center gap-1 text-[10px] font-mono text-neutral-400">
                        <Clock size={11} /> Ordered {orderedAtLabel}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 sm:text-right">
                    <div className="space-y-1">
                      <span className={`inline-flex text-[10px] font-mono px-2.5 py-1 rounded border uppercase tracking-wider font-bold ${statusTone(group.status)}`}>
                        {statusLabel(group.status)}
                      </span>
                      <p className="text-emerald-400 font-mono font-black text-lg">
                        ₦{formatNaira(grandTotal)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Receiver / delivery info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border-t border-neutral-900 pt-4">
                  <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-3 space-y-1">
                    <span className="text-[10px] text-neutral-500 uppercase font-mono block">
                      Buyer contact ({order.delivery_type === 'delivery' ? 'delivery' : 'pickup'})
                    </span>
                    <p className="font-semibold text-neutral-200 flex items-center gap-1">
                      <User size={12} className="text-neutral-500" /> {order.receiver_name || '—'}
                    </p>
                    {phoneHref ? (
                      <a href={phoneHref} className="text-sky-300 hover:text-sky-200 flex items-center gap-1 font-semibold">
                        <Phone size={11} className="text-sky-400" /> {order.receiver_phone}
                      </a>
                    ) : (
                      <p className="text-neutral-400 flex items-center gap-1">
                        <Phone size={11} className="text-neutral-500" /> —
                      </p>
                    )}
                    <p className="text-neutral-400 flex items-center gap-1">
                      <Hash size={11} className="text-neutral-500" /> {order.matric_number || '—'}
                    </p>
                  </div>

                  <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-3">
                    <span className="text-[10px] text-neutral-500 uppercase font-mono block">Fulfil at</span>
                    <p className="font-semibold text-neutral-200 mt-0.5 flex items-center gap-1">
                      {order.delivery_type === 'delivery'
                        ? <><Truck size={12} className="text-red-500" /> {order.delivery_address || '—'}</>
                        : <><MapPin size={12} className="text-emerald-500" /> On-campus pickup</>}
                    </p>
                    {order.delivery_fee_kobo > 0 && (
                      <p className="text-[10px] font-mono text-amber-400 mt-1">
                        FuhsiMarket delivery arranged · buyer paid the platform delivery fee
                      </p>
                    )}
                  </div>
                </div>

                {/* Fulfilment actions */}
                {(canPack || canReady) && (
                  <div className="border-t border-neutral-900 pt-4">
                    <button
                      onClick={() => advanceStatus(group, canPack ? 'packing' : 'ready_for_pickup')}
                      disabled={updatingId === group.key}
                      className="w-full sm:w-auto bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-3 px-6 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
                    >
                      {updatingId === group.key && <Loader2 size={14} className="animate-spin" />}
                      <CheckCircle2 size={14} />
                      {canPack ? 'Start Packing Order' : 'Mark as Ready for Pickup'}
                    </button>
                  </div>
                )}

                {fulfilled && (
                  <div className="border-t border-neutral-900 pt-3 text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} />
                    {group.status === 'completed'
                      ? 'Buyer confirmed receipt — payment has been released to your wallet.'
                      : 'Ready for the buyer — they will confirm receipt on their end.'}
                  </div>
                )}

                {group.rows
                  .filter((row) => row.status === 'disputed' && row.return_required && !row.return_received_at)
                  .map((row) => (
                    <div key={row.id} className="border-t border-red-900/40 pt-4">
                      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-xs text-red-100">
                        <p className="font-bold">Buyer says an item in this bundle will be returned</p>
                        {row.dispute_reason ? <p className="mt-1 text-[11px] leading-relaxed text-red-200/80">Reason: “{row.dispute_reason}”</p> : null}
                        <p className="mt-2 text-[10px] leading-relaxed text-neutral-400">
                          Do not confirm until the physical item is back with you. Escrow stays frozen while confirmation is pending.
                        </p>
                        <button
                          type="button"
                          onClick={() => void confirmReturnedItem(row)}
                          disabled={confirmingReturnId === row.id}
                          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-xs font-bold text-white transition-colors hover:bg-red-500 disabled:opacity-60 sm:w-auto"
                        >
                          {confirmingReturnId === row.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                          {confirmingReturnId === row.id ? 'Confirming…' : 'I received the returned item'}
                        </button>
                      </div>
                    </div>
                  ))}

                {order.status === 'disputed' && order.return_required && order.return_received_at ? (
                  <div className="border-t border-emerald-900/40 pt-3 text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} /> Returned item confirmed {new Date(order.return_received_at).toLocaleString('en-NG')}.
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
