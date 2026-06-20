'use client';

import React, { useEffect, useState } from 'react';
import { ShoppingCart, Trash2, ShieldCheck, RefreshCw } from 'lucide-react';
import { createClient } from '@/utils/supabase';

export default function CartPage() {
  const supabase = createClient();
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false); // Secure checkout loading state

  // Fetch items inside the student's cart from Supabase
  const fetchCartItems = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setLoading(false);

    // Relation Join: Selects fields from cart registry + nested product parameters
    const { data, error } = await supabase
      .from('carts')
      .select(`
        id,
        products (
          id,
          title,
          price,
          hostel_location
        )
      `)
      .eq('user_id', user.id);

    if (!error && data) setCartItems(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchCartItems();
  }, []);

  // Handle removing items from the cart
  const handleRemoveItem = async (cartId: string) => {
    const { error } = await supabase
      .from('carts')
      .delete()
      .eq('id', cartId);

    if (!error) {
      setCartItems(prev => prev.filter(item => item.id !== cartId));
    } else {
      alert('Security Exception: Could not clear cart element.');
    }
  };

  // 🔒 Secure Backend Checkout Integration (Prevents Client-Side Inspect Element Price Tampering)
  const handleSecureCheckout = async () => {
    setCheckingOut(true);
    try {
      // Direct POST request to your existing secure Paystack API route
      const response = await fetch('/api/paystack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const resData = await response.json();

      if (resData.authorization_url) {
        // Redirect the student directly to Paystack's encrypted payment checkout page
        window.location.href = resData.authorization_url;
      } else {
        alert(resData.error || 'System failed to negotiate secure transaction.');
        setCheckingOut(false);
      }
    } catch (err) {
      alert('Critical connection failure communicating with the payment routing interface.');
      setCheckingOut(false);
    }
  };

  // Calculates combined currency matrix metrics from raw DB outputs (in Kobo)
  const totalKobo = cartItems.reduce((acc, item) => acc + (item.products?.price || 0), 0);

  if (loading) {
    return (
      <div className="h-[50vh] flex flex-col items-center justify-center text-xs font-mono text-neutral-500 gap-2">
        <RefreshCw className="animate-spin text-red-500" size={18} />
        <span>Compiling database carts...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER BAR */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6">
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <ShoppingCart className="text-red-500" /> Secure Cart Allocation
        </h1>
        <p className="text-xs text-neutral-400 mt-1">Verify asset choices before routing funds into protected escrow holds.</p>
      </div>

      {cartItems.length === 0 ? (
        <div className="p-12 border border-neutral-800 bg-neutral-950 rounded-2xl text-center text-xs text-neutral-500 font-mono">
          Your active cart structure contains zero objects.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* LIST ITEMS (Left 2 Columns) */}
          <div className="lg:col-span-2 space-y-3">
            {cartItems.map((item) => {
              const product = item.products;
              if (!product) return null;
              return (
                <div key={item.id} className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex justify-between items-center shadow-md">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-200">{product.title}</h3>
                    <p className="text-[10px] text-neutral-500 font-mono uppercase mt-0.5">{product.hostel_location}</p>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-emerald-400 font-mono font-black text-sm">
                      ₦{(product.price / 100).toLocaleString()}
                    </span>
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-neutral-600 hover:text-red-400 transition-all cursor-pointer p-1"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CHECKOUT ESCROW INVOICE CARD (Right 1 Column) */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <h3 className="text-xs font-bold text-neutral-400 tracking-wider uppercase font-mono border-b border-neutral-900 pb-3">
              Escrow Invoice Manifest
            </h3>
            <div className="flex justify-between items-center text-sm">
              <span className="text-neutral-400">Total Purchase</span>
              <span className="text-emerald-400 font-black font-mono">₦{(totalKobo / 100).toLocaleString()}</span>
            </div>
            
            {/* Wires straight into our secure API backend route */}
            <button 
              onClick={handleSecureCheckout}
              disabled={checkingOut || cartItems.length === 0}
              className="w-full bg-red-700 hover:bg-red-600 disabled:bg-neutral-900 text-white font-bold text-xs py-3 rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <ShieldCheck size={14} />
              <span>{checkingOut ? 'Securing Transaction Session...' : 'Initialize Paystack Escrow Lock'}</span>
            </button>
          </div>

        </div>
      )}
    </div>
  );
}