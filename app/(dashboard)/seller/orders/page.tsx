'use client';

import React from 'react';
import { Receipt } from 'lucide-react';

export default function SellerOrdersPage() {
  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      <div className="bg-neutral-950 border border-neutral-800 p-6 rounded-3xl">
        <h1 className="text-xl font-bold text-white">Escrow Orders</h1>
        <p className="text-xs text-neutral-400">Track student purchases & payout releases</p>
      </div>

      <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-12 text-center space-y-3">
        <Receipt size={36} className="mx-auto text-neutral-600" />
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-white">No active orders</h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            When a student buys one of your items via Escrow, order status will show up here.
          </p>
        </div>
      </div>
    </div>
  );
}