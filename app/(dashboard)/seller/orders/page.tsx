'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { formatNaira } from '@/utils/money';
import { Receipt, Loader2, Package, MapPin, Truck, User, Phone, Hash, CheckCircle2 } from 'lucide-react';

type SellerOrder = {
  id: string;
  amount_kobo: number;
  delivery_fee_kobo: number;
  quantity: number;
  status: string;
  order_ref: string;
  delivery_code?: string | null;
  delivery_type: string;
  receiver_name?: string | null;
  receiver_phone?: string | null;
  matric_number?: string | null;
  delivery_address?: string | null;
  meetup_location: string;
  created_at: string;
  products?: { id: string; title: string; image_url?: string | null }[] | null;
};

export default function SellerOrdersPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login?redirect=/seller/orders');
          return;
        }

        const { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            amount_kobo,
            delivery_fee_kobo,
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
            products (
              id,
              title,
              image_url
            )
          `)
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Failed to load orders:', error);
        } else {
          setOrders((data as SellerOrder[]) || []);
        }
      } catch (err) {
        console.error('Failed to load orders:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [router, supabase]);

  const advanceStatus = async (order: SellerOrder, newStatus: 'packing' | 'ready_for_pickup') => {
    setUpdatingId(order.id);
    const res = await fetch('/api/orders/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.id, status: newStatus }),
    });

    if (res.ok) {
      setOrders((prev) =>
        prev.map((ord) => (ord.id === order.id ? { ...ord, status: newStatus } : ord))
      );
    } else {
      const data = await res.json().catch(() => null);
      console.error('Failed to update order:', data);
      alert(data?.error || 'Could not update the order. Please try again.');
    }
    setUpdatingId(null);
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
          {orders.map((order) => {
            const product = order.products?.[0];
            const canPack = order.status === 'in_escrow';
            const canReady = order.status === 'packing';
            const fulfilled = order.status === 'ready_for_pickup' || order.status === 'confirmed' || order.status === 'delivered' || order.status === 'completed';
            const grandTotal = order.amount_kobo + (order.delivery_fee_kobo || 0);

            return (
              <div key={order.id} className="bg-neutral-950 border border-neutral-800 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-neutral-900 rounded-2xl overflow-hidden flex-shrink-0">
                      {product?.image_url ? (
                        <img src={product.image_url} alt={product.title} className="w-full h-full object-cover" />
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
                      <p className="text-[11px] font-mono text-neutral-500">
                        Order: <span className="text-white font-bold tracking-wider">{order.delivery_code || order.order_ref}</span>
                      </p>
                      <p className="text-[10px] font-mono text-neutral-600">
                        Ref ID: {order.order_ref || order.id.slice(0, 8)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 sm:text-right">
                    <div className="space-y-1">
                      <span className={`inline-flex text-[10px] font-mono px-2.5 py-1 rounded border uppercase tracking-wider font-bold ${statusTone(order.status)}`}>
                        {statusLabel(order.status)}
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
                      Receiver ({order.delivery_type === 'delivery' ? 'delivery' : 'pickup'})
                    </span>
                    <p className="font-semibold text-neutral-200 flex items-center gap-1">
                      <User size={12} className="text-neutral-500" /> {order.receiver_name || '—'}
                    </p>
                    <p className="text-neutral-400 flex items-center gap-1">
                      <Phone size={11} className="text-neutral-500" /> {order.receiver_phone || '—'}
                    </p>
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
                        +₦{formatNaira(order.delivery_fee_kobo)} delivery fee
                      </p>
                    )}
                  </div>
                </div>

                {/* Fulfilment actions */}
                {(canPack || canReady) && (
                  <div className="border-t border-neutral-900 pt-4">
                    <button
                      onClick={() => advanceStatus(order, canPack ? 'packing' : 'ready_for_pickup')}
                      disabled={updatingId === order.id}
                      className="w-full sm:w-auto bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-3 px-6 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
                    >
                      {updatingId === order.id && <Loader2 size={14} className="animate-spin" />}
                      <CheckCircle2 size={14} />
                      {canPack ? 'Start Packing Order' : 'Mark as Ready for Pickup'}
                    </button>
                  </div>
                )}

                {fulfilled && (
                  <div className="border-t border-neutral-900 pt-3 text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} /> Ready for the buyer — they will confirm receipt on their end.
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
