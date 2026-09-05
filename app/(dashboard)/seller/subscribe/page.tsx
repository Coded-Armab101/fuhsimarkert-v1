import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { ROLE_PLANS, PLAN_DURATION_DAYS } from '@/utils/plans';
import { hasActiveRole, hasLapsedRole, subscriptionExpiry } from '@/utils/roles';
import { formatNaira } from '@/utils/money';
import { Store, ShieldCheck, ArrowRight, Clock } from 'lucide-react';

/**
 * The seller paywall.
 *
 * This is the destination `proxy.ts` sends anyone who hits `/seller/*` without
 * an active seller subscription, so it must never redirect anywhere that would
 * bounce back here — that is exactly the infinite loop this file used to
 * contain, when it held a second copy of the seller dashboard that redirected to
 * its own URL.
 *
 * It is a Server Component on purpose. Proxy is an optimistic check; this is a
 * real one that runs during render, which is what the Next docs ask for.
 */
export default async function SellerSubscribePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/seller');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_persona, is_seller, seller_active, subscription_expires_at')
    .eq('id', user.id)
    .maybeSingle();

  const expiresAt = subscriptionExpiry(profile);

  // Already paid — nothing to sell them.
  if (hasActiveRole(profile, 'seller')) {
    redirect('/seller');
  }

  const hasLapsed = hasLapsedRole(profile);

  return (
    <div className="max-w-xl mx-auto py-10 px-4 space-y-6">
      <div className="bg-neutral-950 border border-neutral-800 rounded-3xl p-8 space-y-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-950/40 border border-red-900/60 flex items-center justify-center mx-auto">
          <Store size={24} className="text-red-500" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-white">
            {hasLapsed ? 'Your seller plan has expired' : 'Become a FUHSI Seller'}
          </h1>
          <p className="text-xs text-neutral-400 leading-relaxed">
            {hasLapsed
              ? 'Renew to get your Vendor Studio, product listings and escrow orders back.'
              : 'Unlock the Vendor Studio to list products, manage orders and get paid through FUHSI Escrow.'}
          </p>
        </div>

        {hasLapsed && expiresAt && (
          <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-xl p-3">
            <Clock size={14} className="flex-shrink-0" />
            <span>
              Expired on{' '}
              {expiresAt.toLocaleDateString('en-NG', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
        )}

        <div className="border-y border-neutral-900 py-5">
          <p className="text-3xl font-mono font-bold text-white">
            ₦{formatNaira(ROLE_PLANS.seller.amount)}
          </p>
          <p className="text-[11px] font-mono text-neutral-500 mt-1">
            every {PLAN_DURATION_DAYS} days
          </p>
        </div>

        {/*
          Checkout deliberately lives in one place — the buyer profile — so there
          is a single Paystack integration to keep correct, rather than two.
        */}
        <Link
          href="/buyer/profile"
          className="w-full inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-3.5 rounded-2xl transition-all shadow-xl shadow-red-950/50"
        >
          {hasLapsed ? 'Renew Seller Plan' : 'Choose Seller Role'}
          <ArrowRight size={14} />
        </Link>

        <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-neutral-500">
          <ShieldCheck size={14} className="text-emerald-500 flex-shrink-0" />
          <span>Secured by Paystack</span>
        </div>
      </div>

      <Link
        href="/buyer"
        className="block text-center text-xs font-mono text-neutral-500 hover:text-white transition-colors"
      >
        Back to the market
      </Link>
    </div>
  );
}
