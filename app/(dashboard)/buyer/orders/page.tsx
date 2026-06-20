'use client';

import React, { useEffect, useState } from 'react';
import { CreditCard, ShieldCheck, RefreshCw } from 'lucide-react';
import { createClient } from '@/utils/supabase';

export default function OrdersPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [activeOrder, setActiveOrder] = useState<any>(null);

  useEffect(() => {
    const fetchLatestOrder = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // ⚡ RELATIONAL JOIN: We fetch order columns + auto-pull the title from the linked listing row
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            amount_kobo,
            status,
            order_ref,
            created_at,
            listings (
              title
            )
          `)
          .eq('buyer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          setActiveOrder(data[0]);
        }
      }
      setLoading(false);
    };

    fetchLatestOrder();
  }, []);

  // Updated to match your exact Postgres Enum options from the dropdown list
  const handleUpdateStatus = async (newStatus: 'confirmed' | 'disputed') => {
    if (!activeOrder) return;
    setLoading(true);

    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', activeOrder.id);

    if (!error) {
      setActiveOrder((prev: any) => ({ ...prev, status: newStatus }));
      
      if (newStatus === 'disputed') {
        alert('Order flagged for dispute. Support agents will audit this escrow ledger partition.');
      } else {
        alert('Order confirmed. Escrow unlocked for seller payout disbursement.');
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
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6">
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <CreditCard className="text-red-500" /> Live Escrow Registries
        </h1>
        <p className="text-xs text-neutral-400 mt-1">Physical verification gate tied to automated platform clearing codes.</p>
      </div>

      {!activeOrder ? (
        <div className="p-12 border border-neutral-800 bg-neutral-950 rounded-2xl text-center text-xs text-neutral-500 font-mono">
          No transactions detected inside your buyer profile workspace registry.
        </div>
      ) : (
        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 max-w-2xl space-y-6">
          <div className="flex justify-between items-start border-b border-neutral-900 pb-4">
            <div>
              <span className="text-[10px] font-mono text-amber-500 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800 uppercase tracking-wider">
                STATUS: {activeOrder.status}
              </span>
              {/* Displays the product title safely through our database join relation */}
              <h3 className="text-base font-bold text-neutral-200 mt-2">
                {activeOrder.listings?.title || 'Campus Asset Purchase'}
              </h3>
            </div>
            {/* FIXES THE NaN ERROR: amount_kobo calculation check */}
            <p className="text-emerald-400 font-mono font-black text-base">
              ₦{((activeOrder.amount_kobo || 0) / 100).toLocaleString()}
            </p>
          </div>

          {/* Matches 'paid' or 'in_escrow' to safely show the actionable handshake buttons */}
          {(activeOrder.status === 'paid' || activeOrder.status === 'in_escrow') && (
            <div className="space-y-4">
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 flex gap-2 text-xs text-neutral-400">
                <ShieldCheck size={18} className="text-amber-500 shrink-0" />
                <p>Inspect item at the hostel meetup. Do not approve until you are satisfied with its physical condition.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button 
                  onClick={() => handleUpdateStatus('confirmed')}
                  className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs py-3 rounded-xl cursor-pointer transition-all"
                >
                  Confirm Received & Pay Seller
                </button>
                <button 
                  onClick={() => handleUpdateStatus('disputed')}
                  className="bg-neutral-900 border border-neutral-800 text-red-400 font-bold text-xs py-3 rounded-xl cursor-pointer transition-all"
                >
                  Raise Dispute / Void Deal
                </button>
              </div>
            </div>
          )}

          {/* Renders if order status switches to confirmed or completed */}
          {(activeOrder.status === 'confirmed' || activeOrder.status === 'completed') && (
            <div className="p-4 bg-emerald-950/20 border border-emerald-900/30 text-emerald-400 text-xs rounded-xl text-center font-medium font-mono">
              ✓ Inspection Authorized. Escrow unlocked and routed cleanly to the seller profile registry.
            </div>
          )}

          {/* Renders if order status switches to disputed */}
          {activeOrder.status === 'disputed' && (
            <div className="p-4 bg-red-950/20 border border-red-900/30 text-red-400 text-xs rounded-xl text-center font-medium font-mono">
              ⚠ Escrow Locked. Deal flagged for dispute arbitration.
            </div>
          )}
        </div>
      )}
    </div>
  );
}