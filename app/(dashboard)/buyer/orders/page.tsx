'use client';

import React, { useEffect, useState } from 'react';
import { CreditCard, RefreshCw, MapPin, Truck, User, Phone, Hash, AlertTriangle, CheckCircle2, Loader2, Package, Boxes } from 'lucide-react';
import { createClient } from '@/utils/supabase';
import { formatNaira } from '@/utils/money';
import DeliveryAnnouncement from '../DeliveryAnnouncement';

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
  products?: { id: string; title: string; image_url?: string | null }[] | null;
};

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
};

const TRACK_STEPS = ['in_escrow', 'packing', 'ready_for_pickup', 'confirmed', 'completed'];
const STEP_LABEL: Record<string, string> = {
  in_escrow: 'Order Received',
  packing: 'Packing Order',
  ready_for_pickup: 'Ready for Pickup',
  confirmed: 'Received by You',
  completed: 'Completed',
};

export default function OrdersPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<OrderGroup[]>([]);
  const [updatingRef, setUpdatingRef] = useState<string | null>(null);

  useEffect(() => {
    const fetchBuyerOrders = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            buyer_id,
            seller_id,
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
            products ( id, title, image_url )
          `)
          .eq('buyer_id', user.id)
          .order('created_at', { ascending: false });

        if (!error && data) {
          // Group all rows that share an order_ref into one "combined order".
          const rows = data as BuyerOrderRow[];
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
              });
            } else {
              existing.items.push(row);
              existing.totalKobo += row.amount_kobo;
              // Delivery fee applies once for the whole combined order.
              existing.deliveryFeeKobo = existing.deliveryFeeKobo || row.delivery_fee_kobo || 0;
              // The group only advances to a stage once EVERY seller's item has
              // reached it. Whichever seller is furthest behind sets the tracker.
              const rank = (s: string) => TRACK_STEPS.indexOf(s);
              if (rank(row.status) < rank(existing.status)) existing.status = row.status;
            }
          }
          setGroups(Array.from(byRef.values()));
        }
      }
      setLoading(false);
    };

    fetchBuyerOrders();
  }, [supabase]);

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

  if (loading) {
    return (
      <div className="h-[50vh] flex flex-col items-center justify-center text-xs font-mono text-neutral-500 gap-2">
        <RefreshCw className="animate-spin text-red-500" size={18} />
        <span>Loading your orders...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DeliveryAnnouncement />

      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <CreditCard className="text-red-500" /> My Orders & Tracking
        </h1>
        <p className="text-xs text-neutral-400 mt-1">
          Items from different sellers you bought together are packed as one order. Show the Order ID to the delivery person, then confirm once you have everything.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="p-12 border border-neutral-800 bg-neutral-950 rounded-2xl text-center text-xs text-neutral-500 font-mono">
          No orders yet. When you checkout, your combined order tracking appears here.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const statusIndex = TRACK_STEPS.indexOf(group.status);
            const isDelivered = ['confirmed', 'delivered', 'completed'].includes(group.status);
            const isDisputed = group.status === 'disputed';
            const canConfirm = group.status === 'ready_for_pickup';
            const isTerminal = group.status === 'completed' || group.status === 'cancelled';

            return (
              <div key={group.order_ref} className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 max-w-2xl space-y-6 shadow-xl">
                {/* SUMMARY */}
                <div className="flex justify-between items-start border-b border-neutral-900 pb-4">
                  <div className="space-y-1">
                    <span className={`text-[10px] font-mono px-2.5 py-1 rounded border uppercase tracking-wider font-bold ${
                      isDisputed
                        ? 'bg-red-950/40 border-red-800/60 text-red-400'
                        : isTerminal
                          ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400'
                          : 'bg-amber-950/40 border-amber-800/60 text-amber-400'
                    }`}>
                      STATUS: {group.status.replace(/_/g, ' ')}
                    </span>

                    {/* THE HANDOFF CODE */}
                    <div className="mt-3 flex items-center gap-2">
                      <Boxes size={18} className="text-red-500" />
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">Order ID for delivery</p>
                        <p className="text-2xl font-black font-mono text-white tracking-widest">{group.delivery_code}</p>
                      </div>
                    </div>

                    <p className="text-[10px] font-mono text-neutral-600 mt-1">
                      {group.items.length} item{group.items.length === 1 ? '' : 's'} · {group.order_ref?.slice(0, 8)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-emerald-400 font-mono font-black text-lg">
                      ₦{formatNaira(group.totalKobo)}
                    </p>
                    {group.deliveryFeeKobo > 0 && (
                      <p className="text-[10px] font-mono text-neutral-500">
                        incl. delivery ₦{formatNaira(group.deliveryFeeKobo)}
                      </p>
                    )}
                  </div>
                </div>

                {/* ITEM LIST (all sellers' items in this combined order) */}
                <div className="space-y-2">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 flex items-center gap-1">
                    <Package size={12} /> Items in this order
                  </p>
                  {group.items.map((item) => {
                    const product = item.products?.[0];
                    return (
                      <div key={item.id} className="flex items-center gap-3 bg-neutral-900/60 border border-neutral-800 rounded-xl p-3">
                        {product?.image_url ? (
                          <img src={product.image_url} alt={product.title || ''} className="w-12 h-12 rounded-lg object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-neutral-800 flex items-center justify-center">
                            <Package size={18} className="text-neutral-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-neutral-200 truncate">{product?.title || 'Campus Asset Purchase'}</p>
                          <p className="text-[10px] font-mono text-neutral-500">
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
                    <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">Live Tracking</p>
                    <div className="flex items-center justify-between">
                      {TRACK_STEPS.map((step, idx) => {
                        const done = statusIndex !== -1 && idx <= statusIndex;
                        const current = idx === statusIndex;
                        return (
                          <div key={step} className="flex-1 flex items-center flex-col gap-1.5">
                            <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-mono transition-all ${
                              done
                                ? 'bg-emerald-950 border-emerald-500 text-emerald-400'
                                : 'bg-neutral-900 border-neutral-700 text-neutral-600'
                            } ${current ? 'ring-2 ring-emerald-500/40' : ''}`}>
                              {done ? <CheckCircle2 size={13} /> : idx + 1}
                            </div>
                            <span className={`text-[9px] text-center font-mono uppercase leading-tight ${
                              done ? 'text-emerald-400' : 'text-neutral-600'
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
                  <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-3">
                    <span className="text-[10px] text-neutral-500 uppercase font-mono block">Method</span>
                    <p className="font-semibold text-neutral-200 mt-0.5 flex items-center gap-1">
                      {group.delivery_type === 'delivery' ? <Truck size={12} className="text-red-500" /> : <MapPin size={12} className="text-emerald-500" />}
                      {group.delivery_type === 'delivery'
                        ? `Deliver to: ${group.delivery_address || '—'}`
                        : 'On-campus pickup'}
                    </p>
                  </div>

                  <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-3 space-y-1">
                    <span className="text-[10px] text-neutral-500 uppercase font-mono block">Receiver</span>
                    <p className="font-semibold text-neutral-200 flex items-center gap-1">
                      <User size={12} className="text-neutral-500" /> {group.receiver_name || '—'}
                    </p>
                    <p className="text-neutral-400 flex items-center gap-1">
                      <Phone size={11} className="text-neutral-500" /> {group.receiver_phone || '—'}
                    </p>
                    <p className="text-neutral-400 flex items-center gap-1">
                      <Hash size={11} className="text-neutral-500" /> {group.matric_number || '—'}
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
                    {updatingRef === group.order_ref ? 'Confirming & Releasing to Sellers...' : 'Confirm Received'}
                  </button>
                )}

                {isDelivered && (
                  <div className="p-4 bg-emerald-950/20 border border-emerald-900/30 text-emerald-400 text-xs rounded-xl text-center font-medium font-mono">
                    <CheckCircle2 size={16} className="inline mr-1" /> Received. Escrow released to all sellers.
                  </div>
                )}
                {isDisputed && (
                  <div className="p-4 bg-red-950/20 border border-red-900/30 text-red-400 text-xs rounded-xl text-center font-medium font-mono">
                    <AlertTriangle size={16} className="inline mr-1" /> Escrow locked. Deal flagged for dispute arbitration.
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