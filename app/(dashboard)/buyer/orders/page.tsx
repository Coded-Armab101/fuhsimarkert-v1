'use client';

import React, { useEffect, useState } from 'react';
import { CreditCard, ShieldCheck, RefreshCw, MapPin, Clock, Phone, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/utils/supabase';

export default function OrdersPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    const fetchBuyerOrders = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Fetch order details + listing details + pickup parameters
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            amount_kobo,
            status,
            order_ref,
            meetup_location,
            created_at,
            listings (
              title,
              image_url,
              seller_id
            ),
            profiles:buyer_id (
              hostel,
              full_name
            )
          `)
          .eq('buyer_id', user.id)
          .order('created_at', { ascending: false });

        if (!error && data) {
          setOrders(data);
        }
      }
      setLoading(false);
    };

    fetchBuyerOrders();
  }, []);

  const handleUpdateStatus = async (orderId: string, newStatus: 'confirmed' | 'disputed') => {
    setLoading(true);

    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    if (!error) {
      setOrders(prev =>
        prev.map(ord => (ord.id === orderId ? { ...ord, status: newStatus } : ord))
      );

      if (newStatus === 'disputed') {
        alert('Order flagged for dispute. Support agents will audit this escrow ledger partition.');
      } else {
        alert('Order confirmed! Escrow unlocked for seller payout disbursement.');
      }
    } else {
      alert(`Database rejection: ${error.message}`);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="h-[50vh] flex flex-col items-center justify-center text-xs font-mono text-neutral-500 gap-2">
        <RefreshCw className="animate-spin text-red-500" size={18} />
        <span>Querying real-time ledger records...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER MATRIX */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <CreditCard className="text-red-500" /> Live Escrow Registries
        </h1>
        <p className="text-xs text-neutral-400 mt-1">
          Physical verification gate tied to automated platform clearing codes.
        </p>
      </div>

      {/* ORDERS LIST */}
      {orders.length === 0 ? (
        <div className="p-12 border border-neutral-800 bg-neutral-950 rounded-2xl text-center text-xs text-neutral-500 font-mono">
          No active transactions detected inside your buyer profile workspace registry.
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => {
            const isEscrowActive = order.status === 'paid' || order.status === 'in_escrow' || order.status === 'ready_for_pickup';
            const isConfirmed = order.status === 'confirmed' || order.status === 'completed';
            const isDisputed = order.status === 'disputed';

            return (
              <div key={order.id} className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 max-w-2xl space-y-6 shadow-xl">
                
                {/* ORDER SUMMARY BAR */}
                <div className="flex justify-between items-start border-b border-neutral-900 pb-4">
                  <div className="space-y-1">
                    <span className={`text-[10px] font-mono px-2.5 py-1 rounded border uppercase tracking-wider font-bold ${
                      isEscrowActive 
                        ? 'bg-amber-950/40 border-amber-800/60 text-amber-400' 
                        : isConfirmed 
                        ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400' 
                        : 'bg-red-950/40 border-red-800/60 text-red-400'
                    }`}>
                      STATUS: {order.status.replace(/_/g, ' ')}
                    </span>

                    <h3 className="text-base font-bold text-neutral-200 mt-2">
                      {order.listings?.title || 'Campus Asset Purchase'}
                    </h3>
                    <p className="text-[11px] font-mono text-neutral-500">Ref ID: {order.order_ref || order.id.slice(0, 8)}</p>
                  </div>

                  <p className="text-emerald-400 font-mono font-black text-lg">
                    ₦{((order.amount_kobo || 0) / 100).toLocaleString()}
                  </p>
                </div>

                {/* 📍 NEW: CAMPUS MEETUP & PICKUP CARD */}
                {isEscrowActive && (
                  <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider font-mono">
                      <MapPin size={15} /> Campus Delivery & Meetup Location
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                        <span className="text-[10px] text-neutral-500 uppercase font-mono block">Designated Meetup Point</span>
                        <p className="font-semibold text-neutral-200 mt-0.5">
                          {order.meetup_location || order.profiles?.hostel || 'Hostel Quadrangle / Main Gate'}
                        </p>
                      </div>

                      <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                        <span className="text-[10px] text-neutral-500 uppercase font-mono block">Fulfilment Protocol</span>
                        <p className="font-semibold text-neutral-200 mt-0.5 flex items-center gap-1">
                          <Clock size={12} className="text-amber-500" />
                          {order.status === 'ready_for_pickup' ? 'Ready for Instant Pickup' : 'Seller Packing Item'}
                        </p>
                      </div>
                    </div>

                    <div className="bg-neutral-900 border border-neutral-800/80 rounded-xl p-3 flex gap-2 text.xs text-neutral-400 text-[11px]">
                      <ShieldCheck size={16} className="text-amber-500 shrink-0 mt-0.5" />
                      <p>Meet seller at the location above. Inspect item thoroughly. Do NOT confirm payment until you receive and test the product.</p>
                    </div>
                  </div>
                )}

                {/* ACTION BUTTONS (CONFIRM / REJECT) */}
                {isEscrowActive && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <button 
                      onClick={() => handleUpdateStatus(order.id, 'confirmed')}
                      className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs py-3.5 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/20 active:scale-95"
                    >
                      <CheckCircle2 size={15} />
                      Confirm Received & Release Escrow
                    </button>
                    <button 
                      onClick={() => handleUpdateStatus(order.id, 'disputed')}
                      className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-red-400 font-bold text-xs py-3.5 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <AlertTriangle size={15} />
                      Raise Dispute / Void Deal
                    </button>
                  </div>
                )}

                {/* RESOLVED STATES */}
                {isConfirmed && (
                  <div className="p-4 bg-emerald-950/20 border border-emerald-900/30 text-emerald-400 text-xs rounded-xl text-center font-medium font-mono flex items-center justify-center gap-2">
                    <CheckCircle2 size={16} /> Inspection Authorized. Escrow unlocked and routed cleanly to seller.
                  </div>
                )}

                {isDisputed && (
                  <div className="p-4 bg-red-950/20 border border-red-900/30 text-red-400 text-xs rounded-xl text-center font-medium font-mono flex items-center justify-center gap-2">
                    <AlertTriangle size={16} /> Escrow Locked. Deal flagged for dispute arbitration.
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