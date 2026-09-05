'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { useCart } from '@/context/CartContext';
import { formatNaira } from '@/utils/money';
import { ShoppingBag, Trash2, ArrowLeft, ShieldCheck, Plus, Minus, Loader2, Truck, Store, User, Phone, Hash, Wallet } from 'lucide-react';

const DELIVERY_FEE_NGN = 500;

export default function BuyerCartPage() {
  const router = useRouter();
  const supabase = createClient();
  const { cart, addToCart, decreaseQuantity, removeFromCart, clearCart, totalAmount } = useCart();
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'paystack' | 'wallet'>('paystack');
  const [paymentNotice, setPaymentNotice] = useState<{
    kind: 'success' | 'error' | 'pending';
    message: string;
  } | null>(null);

  // Delivery / fulfilment details entered before checkout.
  const [delivery, setDelivery] = useState({
    name: '',
    phone: '',
    matric: '',
    type: 'pickup' as 'pickup' | 'delivery',
    address: '',
  });

  // Prefill delivery fields from the buyer's profile on mount.
  useEffect(() => {
    const prefill = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, matric_no, hostel')
        .eq('id', user.id)
        .maybeSingle();
      setDelivery((d) => ({
        ...d,
        name: d.name || profile?.full_name || '',
        matric: d.matric || profile?.matric_no || '',
        address: d.address || profile?.hostel || '',
      }));
      // Load the buyer's wallet balance so the UI can offer split payment.
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();
      if (wallet) setWalletBalance(Number(wallet.balance) || 0);
    };
    prefill();
  }, [supabase]);

  const grandTotalKobo =
    totalAmount + (delivery.type === 'delivery' ? DELIVERY_FEE_NGN * 100 : 0);

  // Wallet-first split: wallet covers as much as it can, the remainder via
  // card/transfer. When the wallet covers the whole total, no Paystack needed.
  const walletShareKobo = Math.min(walletBalance, grandTotalKobo);
  const paystackShareKobo = grandTotalKobo - walletShareKobo;
  const walletCoversAll = paymentMethod === 'wallet' && walletShareKobo >= grandTotalKobo;

  // When Paystack redirects the buyer back here after payment, it appends
  // ?reference=... to the URL. We strip the param immediately (so a refresh
  // doesn't re-verify), then confirm the real transaction status with Paystack.
  // The localStorage cart is only cleared on confirmed success — a cancelled
  // or failed payment leaves the cart untouched.
  useEffect(() => {
    const url = new URL(window.location.href);
    const reference = url.searchParams.get('reference') || url.searchParams.get('trxref');
    if (!reference) return;

    url.searchParams.delete('reference');
    url.searchParams.delete('trxref');
    window.history.replaceState(null, '', url.toString());

    (async () => {
      try {
        const res = await fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`);
        const data = await res.json();

        if (res.ok && data.status === 'success') {
          // Payment confirmed. Clear the paid items and send the buyer straight
          // to their orders page to see the live tracking. We only redirect
          // here (not on failure) so a cancelled pay keeps the cart intact.
          clearCart();
          router.replace('/buyer/orders');
          return;
        } else if (res.ok && (data.status === 'failed' || data.status === 'abandoned')) {
          setPaymentNotice({
            kind: 'error',
            message: 'Payment was cancelled or failed. Nothing was charged and your cart is untouched.',
          });
        } else {
          setPaymentNotice({
            kind: 'pending',
            message: 'Your payment is still being confirmed. Check the Orders page in a moment.',
          });
        }
      } catch {
        setPaymentNotice({
          kind: 'error',
          message: 'Could not confirm your payment status right now. Your cart has been kept.',
        });
      }
    })();
  }, [clearCart, router]);

  /**
   * Proceeds to Paystack escrow checkout.
   *
   * The UI cart lives in localStorage but `/api/paystack` reads the `carts`
   * DB table, so first we sync every distinct item into that table, then ask
   * the server to open a Paystack transaction, then send the buyer to the
   * hosted checkout page. Paystack returns here with a transaction reference;
   * that return handler (above) clears the cart only if payment succeeded.
   */
  const handleCheckout = async () => {
    if (cart.length === 0) return;

    // Validate the delivery form before starting the transaction.
    if (!delivery.name.trim()) {
      setCheckoutError('Please enter the receiver\'s full name.');
      return;
    }
    if (!/^[\d+\s-]{7,15}$/.test(delivery.phone.trim())) {
      setCheckoutError('Please enter a valid phone number.');
      return;
    }
    if (!delivery.matric.trim()) {
      setCheckoutError('Please enter your matric number.');
      return;
    }
    if (delivery.type === 'delivery' && !delivery.address.trim()) {
      setCheckoutError('Please enter the delivery address.');
      return;
    }

    setCheckingOut(true);
    setCheckoutError(null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.push('/login?redirect=/buyer/cart');
        return;
      }

      // 1. Sync the localStorage cart into the `carts` table, carrying each
      //    line's quantity. The table used to have no quantity column (so any
      //    quantity > 1 was charged as 1 — a fraud hole); it now stores it, and
      //    the server charges `price * quantity`. We overwrite the row so the
      //    DB reflects the exact UI cart (upsert without ignoreDuplicates).
      const { error: syncError } = await supabase.from('carts').upsert(
        cart.map((item) => ({
          user_id: user.id,
          product_id: item.id,
          quantity: item.quantity,
          created_at: new Date().toISOString(),
        })),
        { onConflict: 'user_id,product_id' },
      );

      if (syncError) throw syncError;

      // 2. Choose the payment path. With wallet-first selected and the balance
      //    covering the whole order, no Paystack charge happens — call the
      //    wallet-only route. Otherwise ask the server to open a Paystack
      //    transaction for just the remainder (the server reads the carts
      //    table and recomputes the amount; nothing is taken from the client).
      const deliveryPayload = {
        type: delivery.type,
        name: delivery.name,
        phone: delivery.phone,
        matric: delivery.matric,
        address: delivery.address,
      };

      if (walletCoversAll) {
        const walletRes = await fetch('/api/orders/pay-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ delivery: deliveryPayload }),
        });
        const walletData = await walletRes.json();
        if (walletRes.ok && walletData.ok) {
          clearCart();
          router.replace('/buyer/orders');
          return;
        }
        throw new Error(
          walletData?.error || 'Could not process your wallet payment. Please try again.',
        );
      }

      const initRes = await fetch('/api/paystack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletFirst: paymentMethod === 'wallet',
          delivery: deliveryPayload,
        }),
      });

      const initData = await initRes.json();

      if (!initRes.ok || !initData.authorization_url) {
        throw new Error(
          initData?.error || 'Could not start the checkout. Please try again.',
        );
      }

      // 3. Send the buyer to Paystack's hosted page. The cart is NOT cleared
      //    here — it stays until the return handler confirms payment success,
      //    so an abandoned payment keeps the full cart history.
      window.location.href = initData.authorization_url;
    } catch (err) {
      console.error('Checkout error:', err);
      setCheckoutError(
        err instanceof Error
          ? err.message
          : 'Could not start the checkout. Please try again.'
      );
      setCheckingOut(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6 pb-28">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-xs font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer"
      >
        <ArrowLeft size={14} /> Back to Market
      </button>

      <div className="bg-neutral-950 border border-neutral-800 p-6 rounded-3xl flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-white">Your Shopping Cart</h1>
          <p className="text-xs text-neutral-400">Review items before placing Escrow order</p>
        </div>
        {cart.length > 0 && (
          <button
            onClick={clearCart}
            className="text-xs font-mono text-neutral-500 hover:text-red-400 transition-colors cursor-pointer"
          >
            Clear Cart
          </button>
        )}
      </div>

      {cart.length === 0 ? (
        <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-12 text-center space-y-4">
          <ShoppingBag size={40} className="mx-auto text-neutral-700" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">Your cart is empty</h3>
            <p className="text-xs text-neutral-500">
              Explore items on campus market and add them to your cart.
            </p>
          </div>
          <Link
            href="/buyer"
            className="inline-block bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-2.5 px-6 rounded-xl transition-all"
          >
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            {cart.map((item) => (
              <div
                key={item.id}
                className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 bg-neutral-900 rounded-xl overflow-hidden flex-shrink-0">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-700">
                        <ShoppingBag size={18} />
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-xs">{item.title}</h4>
                    <p className="text-xs font-mono text-red-500 mt-1">
                      ₦{formatNaira(item.price)} x {item.quantity}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* QUANTITY STEPPER */}
                  <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-xl px-1 py-1">
                    <button
                      onClick={() => decreaseQuantity(item.id)}
                      className="p-1.5 rounded-lg text-neutral-300 hover:text-red-400 hover:bg-red-950/40 transition-all cursor-pointer"
                      aria-label={`Decrease ${item.title}`}
                    >
                      <Minus size={14} />
                    </button>
                    <span className="text-xs font-mono font-bold text-white w-4 text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => addToCart(item)}
                      className="p-1.5 rounded-lg text-neutral-300 hover:text-red-400 hover:bg-red-950/40 transition-all cursor-pointer"
                      aria-label={`Increase ${item.title}`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="p-2 text-neutral-500 hover:text-red-400 transition-colors cursor-pointer"
                    aria-label={`Remove ${item.title}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* DELIVERY / FULFILMENT DETAILS */}
          <div className="bg-neutral-950 border border-neutral-800 p-6 rounded-3xl space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white border-b border-neutral-900 pb-3">
              <Truck size={16} className="text-red-500" />
              Delivery & Receiver Details
            </div>

            {/* Receiver name */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                <User size={11} /> Receiver full name
              </label>
              <input
                value={delivery.name}
                onChange={(e) => setDelivery({ ...delivery, name: e.target.value })}
                placeholder="e.g. Adebayo Ola"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-neutral-600 outline-none focus:border-red-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Phone */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                  <Phone size={11} /> Phone number
                </label>
                <input
                  value={delivery.phone}
                  onChange={(e) => setDelivery({ ...delivery, phone: e.target.value })}
                  placeholder="08012345678"
                  inputMode="tel"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-neutral-600 outline-none focus:border-red-600"
                />
              </div>

              {/* Matric number */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                  <Hash size={11} /> Matric number
                </label>
                <input
                  value={delivery.matric}
                  onChange={(e) => setDelivery({ ...delivery, matric: e.target.value })}
                  placeholder="e.g. FUHSI/22/0012"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-neutral-600 outline-none focus:border-red-600"
                />
              </div>
            </div>

            {/* Delivery method toggle */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDelivery({ ...delivery, type: 'pickup' })}
                className={`rounded-2xl border p-3 text-left transition-all cursor-pointer ${
                  delivery.type === 'pickup'
                    ? 'border-red-600 bg-red-950/30'
                    : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700'
                }`}
              >
                <Store size={16} className="text-red-500" />
                <p className="text-xs font-bold text-white mt-2">School Pickup</p>
                <p className="text-[10px] text-emerald-400 font-mono mt-0.5">FREE</p>
              </button>
              <button
                type="button"
                onClick={() => setDelivery({ ...delivery, type: 'delivery' })}
                className={`rounded-2xl border p-3 text-left transition-all cursor-pointer ${
                  delivery.type === 'delivery'
                    ? 'border-red-600 bg-red-950/30'
                    : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700'
                }`}
              >
                <Truck size={16} className="text-red-500" />
                <p className="text-xs font-bold text-white mt-2">Deliver to a place</p>
                <p className="text-[10px] text-amber-400 font-mono mt-0.5">
                  +₦{DELIVERY_FEE_NGN}
                </p>
              </button>
            </div>

            {delivery.type === 'delivery' && (
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                  <Truck size={11} /> Delivery address
                </label>
                <input
                  value={delivery.address}
                  onChange={(e) => setDelivery({ ...delivery, address: e.target.value })}
                  placeholder="e.g. Room 12, Alfa Hall or off-campus address"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-neutral-600 outline-none focus:border-red-600"
                />
              </div>
            )}
          </div>

          {/* CHECKOUT SUMMARY CARD */}
          {paymentNotice && (
            <div
              role="status"
              className={`rounded-2xl border p-4 flex items-start gap-3 text-[11px] font-mono ${
                paymentNotice.kind === 'success'
                  ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-400'
                  : paymentNotice.kind === 'pending'
                    ? 'bg-amber-950/30 border-amber-800/60 text-amber-400'
                    : 'bg-red-950/30 border-red-900/60 text-red-400'
              }`}
            >
              <ShieldCheck size={18} className="flex-shrink-0 mt-0.5" />
              <span>{paymentNotice.message}</span>
            </div>
          )}

          <div className="bg-neutral-950 border border-neutral-800 p-6 rounded-3xl space-y-4">
            <div className="flex justify-between items-center text-sm font-bold border-b border-neutral-900 pb-3">
              <span className="text-neutral-400 font-mono">Total Amount:</span>
              <span className="text-lg font-mono text-red-500">
                ₦{formatNaira(grandTotalKobo)}
              </span>
            </div>

            {delivery.type === 'delivery' && (
              <div className="flex justify-between items-center text-[11px] font-mono text-neutral-400 border-b border-neutral-900/70 pb-2">
                <span>Items subtotal</span>
                <span>₦{formatNaira(totalAmount)}</span>
              </div>
            )}
            {delivery.type === 'delivery' && (
              <div className="flex justify-between items-center text-[11px] font-mono text-neutral-400 border-b border-neutral-900/70 pb-2">
                <span className="flex items-center gap-1">
                  <Truck size={11} className="text-amber-400" /> Delivery fee
                </span>
                <span className="text-amber-400">+₦{DELIVERY_FEE_NGN}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-400 bg-neutral-900/60 border border-neutral-800 p-3 rounded-xl">
              <ShieldCheck size={16} className="text-emerald-500 flex-shrink-0" />
              <span>
                Protected by FUHSI Escrow. Funds are held safely until you confirm delivery.
              </span>
            </div>

            {/* PAYMENT METHOD */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                <span>Wallet balance</span>
                <span className="text-emerald-400">₦{formatNaira(walletBalance)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('wallet')}
                  className={`text-left text-[11px] font-bold px-3 py-3 rounded-xl border transition-all cursor-pointer ${
                    paymentMethod === 'wallet'
                      ? 'bg-emerald-950/40 border-emerald-700 text-emerald-300'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Wallet size={13} /> Wallet First
                  </div>
                  {walletShareKobo >= grandTotalKobo ? (
                    <span className="text-[10px] font-normal text-emerald-400">
                      Pays the full ₦{formatNaira(grandTotalKobo)}
                    </span>
                  ) : (
                    <span className="text-[10px] font-normal text-neutral-500">
                      ₦{formatNaira(walletShareKobo)} from wallet · <span className="text-amber-400">₦{formatNaira(paystackShareKobo)}</span> by card
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('paystack')}
                  className={`text-left text-[11px] font-bold px-3 py-3 rounded-xl border transition-all cursor-pointer ${
                    paymentMethod === 'paystack'
                      ? 'bg-red-950/40 border-red-700 text-red-300'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <ShieldCheck size={13} /> Card / Transfer
                  </div>
                  <span className="text-[10px] font-normal text-neutral-500">
                    Pay the full ₦{formatNaira(grandTotalKobo)} via Paystack
                  </span>
                </button>
              </div>
              {paymentMethod === 'wallet' && paystackShareKobo > 0 && (
                <p className="text-[10px] text-neutral-500">
                  Wallet pays the first ₦{formatNaira(walletShareKobo)}, then you complete the
                  remaining ₦{formatNaira(paystackShareKobo)} on Paystack. Both go into escrow.
                </p>
              )}
            </div>

            {checkoutError && (
              <p
                role="alert"
                className="text-[11px] font-mono text-red-400 bg-red-950/30 border border-red-900/50 rounded-xl px-3 py-2.5"
              >
                {checkoutError}
              </p>
            )}

            <button
              onClick={handleCheckout}
              disabled={checkingOut}
              className="w-full bg-red-600 hover:bg-red-500 disabled:bg-neutral-800 disabled:cursor-not-allowed text-white font-bold text-xs py-3.5 rounded-2xl transition-all cursor-pointer shadow-xl shadow-red-950/50 flex items-center justify-center gap-2"
            >
              {checkingOut ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Starting Checkout...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>
                    {walletCoversAll
                      ? `Pay with Wallet (₦${formatNaira(grandTotalKobo)})`
                      : `Proceed to Escrow Checkout (₦${formatNaira(grandTotalKobo)})`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}