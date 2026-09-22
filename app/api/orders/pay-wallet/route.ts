import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { recordOrder } from '@/utils/paystack/recordOrder';
import { DELIVERY_FEE_KOBO, buyerServiceFeeKobo } from '@/utils/pricing';

/**
 * Wallet-only checkout: the buyer's wallet balance covers the entire order, so
 * no Paystack charge is needed. The amount is recomputed server-side from the
 * carts table (never from the client), verified against the wallet balance, and
 * the wallet is debited atomically + idempotently via recordOrder's debit_wallet
 * path using a fresh wallet reference. Escrow/order/stock/cart handling is 100%
 * shared with the card path via recordOrder, so a wallet order behaves exactly
 * like a card order once escrowed.
 */

export async function POST(request: Request) {
  try {
    let delivery;
    try {
      const body = await request.json();
      delivery = body?.delivery ?? {};
    } catch {
      delivery = {};
    }
    const deliveryType = delivery.type === 'delivery' ? 'delivery' : 'pickup';
    const receiverName = String(delivery.name || '').trim();
    const receiverPhone = String(delivery.phone || '').trim();
    const matricNumber = String(delivery.matric || '').trim();
    const deliveryAddress = deliveryType === 'delivery' ? String(delivery.address || '').trim() : null;
    const isPaidDelivery = deliveryType === 'delivery';

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized system access request.' }, { status: 401 });
    }

    const { data: cartItems, error: cartError } = await supabase
      .from('carts')
      .select('product_id, quantity')
      .eq('user_id', user.id);
    if (cartError || !cartItems || cartItems.length === 0) {
      return NextResponse.json({ error: 'Shopping cart ledger is empty.' }, { status: 400 });
    }
    const productIds = (cartItems as { product_id: string; quantity: number }[]).map((i) => i.product_id);

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, price, stock')
      .in('id', productIds);
    if (productsError || !products) {
      return NextResponse.json({ error: 'Internal system pricing error.' }, { status: 500 });
    }
    const priceById = new Map((products ?? []).map((p) => [p.id, Number(p.price) || 0]));

    const itemsTotalKobo = (cartItems as { product_id: string; quantity: number }[]).reduce((acc, item) => {
      const unit = priceById.get(item.product_id) ?? 0;
      const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
      return acc + unit * qty;
    }, 0);
    const buyerFeeKobo = buyerServiceFeeKobo(itemsTotalKobo);
    const totalKobo = itemsTotalKobo + (isPaidDelivery ? DELIVERY_FEE_KOBO : 0) + buyerFeeKobo;
    if (!Number.isFinite(totalKobo) || totalKobo <= 0) {
      return NextResponse.json({ error: 'Invalid financial amount calculation.' }, { status: 400 });
    }

    // Fresh wallet reference: unique, so the idempotent wallet debit runs once.
    const walletRef = `WAL-${crypto.createHash('sha256').update(JSON.stringify({
      userId: user.id,
      productIds,
      items: (cartItems as { product_id: string; quantity: number }[]).map((item) => ({
        productId: item.product_id,
        quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
        unitPriceKobo: priceById.get(item.product_id) ?? 0,
      })),
      deliveryType,
      receiverName,
      receiverPhone,
      matricNumber,
      deliveryAddress,
    })).digest('hex').slice(0, 32)}`;

    const admin = createAdminClient();
    await recordOrder(admin, {
      buyerId: user.id,
      reference: walletRef,
      productIds,
      items: (cartItems as { product_id: string; quantity: number }[]).map((item) => ({
        productId: item.product_id,
        quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
        unitPriceKobo: priceById.get(item.product_id) ?? 0,
      })),
      deliveryType,
      deliveryFeeKobo: isPaidDelivery ? DELIVERY_FEE_KOBO : 0,
      receiverName,
      receiverPhone,
      matricNumber,
      deliveryAddress,
      walletKobo: totalKobo,
      gatewayAmountKobo: 0,
    });

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
    return NextResponse.json({
      ok: true,
      status: 'in_escrow',
      reference: walletRef,
      wallet_kobo: totalKobo,
    });
  } catch (err) {
    console.error('[orders/pay-wallet] error:', err);
    return NextResponse.json({ error: 'Could not process your wallet payment. Please try again.' }, { status: 500 });
  }
}
