import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { ROLE_PLANS, isRolePlan } from '@/utils/plans';
import { recordRoleSubscription } from '@/utils/paystack/recordSubscription';
import { accountIsActive } from '@/utils/account';
import { rateLimit, PAYMENT_INIT_LIMIT } from '@/utils/rate-limit';

/**
 * Renew/activate a seller plan using spendable wallet balance.
 *
 * No Paystack charge is created. The wallet still records where the money came
 * from: top-ups may be held for 14 days against bank cash-out, but they are
 * spendable inside the marketplace immediately, so they can pay this plan.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'You must be signed in to renew.' }, { status: 401 });
    }
    if (!(await accountIsActive(supabase, user.id))) {
      return NextResponse.json({ error: 'This account is suspended.' }, { status: 403 });
    }

    const limit = rateLimit({ key: `subscription-wallet:${user.id}`, ...PAYMENT_INIT_LIMIT });
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many renewal attempts. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const planType: unknown = body?.planType;
    if (!isRolePlan(planType)) {
      return NextResponse.json({ error: 'Unknown subscription plan.' }, { status: 400 });
    }
    const plan = ROLE_PLANS[planType];

    const admin = createAdminClient();
    const reference = `wallet_sub_${user.id.replace(/-/g, '').slice(0, 8)}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const { data: existing, error: existingError } = await admin
      .from('subscriptions')
      .select('user_id, plan_type, expires_at')
      .eq('reference', reference)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      if (existing.user_id !== user.id) {
        return NextResponse.json({ error: 'This renewal belongs to another account.' }, { status: 403 });
      }
      return NextResponse.json({
        success: true,
        role: existing.plan_type,
        expiresAt: existing.expires_at,
        redirectUrl: '/seller/verification',
        alreadyRenewed: true,
      });
    }

    const { data: summaryRows, error: summaryError } = await admin.rpc(
      'wallet_balance_summary',
      { p_user_id: user.id },
    );
    if (summaryError) throw summaryError;
    const summary = Array.isArray(summaryRows) ? summaryRows[0] : summaryRows;
    const totalKobo = Number(summary?.total_kobo) || 0;
    if (totalKobo < plan.amount) {
      return NextResponse.json(
        {
          error: `Your wallet has ₦${(totalKobo / 100).toLocaleString('en-NG')}. You need ₦${(plan.amount / 100).toLocaleString('en-NG')} to renew with wallet balance.`,
        },
        { status: 402 },
      );
    }

    const { data: debited, error: debitError } = await admin.rpc('debit_wallet_subscription', {
      p_user_id: user.id,
      p_reference: reference,
      p_amount_kobo: plan.amount,
    });
    if (debitError) throw debitError;
    if (debited !== true) {
      return NextResponse.json({ error: 'Your wallet balance changed. Refresh and try again.' }, { status: 409 });
    }

    let result;
    try {
      result = await recordRoleSubscription(admin, {
        reference,
        amount: plan.amount,
        currency: 'NGN',
        metadata: {
          purpose: 'role_subscription',
          user_id: user.id,
          plan_type: planType,
          currency: 'NGN',
          payment_method: 'wallet',
        },
      });
    } catch (activationError) {
      await admin.rpc('reverse_wallet_subscription_debit', { p_reference: reference });
      throw activationError;
    }

    return NextResponse.json({
      success: true,
      role: result.planType,
      expiresAt: result.expiresAt,
      redirectUrl: '/seller/verification',
    });
  } catch (err) {
    console.error('[subscription/renew-wallet] failed', err);
    return NextResponse.json({ error: 'Could not renew your seller plan from your wallet.' }, { status: 500 });
  }
}
