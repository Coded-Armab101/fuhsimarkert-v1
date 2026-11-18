import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { accountIsActive } from '@/utils/account';
import { rateLimit } from '@/utils/rate-limit';
import {
  grossUpPaystackLocalKobo,
  WALLET_FUNDING_DAILY_MAX_KOBO,
  WALLET_FUNDING_MIN_KOBO,
} from '@/utils/payment-fees';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.email) {
      return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    }
    if (!(await accountIsActive(supabase, user.id))) {
      return NextResponse.json({ error: 'This account is suspended.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const creditKobo = Math.floor(Number(body?.creditKobo));
    if (
      !Number.isSafeInteger(creditKobo) ||
      creditKobo < WALLET_FUNDING_MIN_KOBO ||
      creditKobo > WALLET_FUNDING_DAILY_MAX_KOBO
    ) {
      return NextResponse.json({ error: 'Fund between ₦500 and ₦100,000 at a time.' }, { status: 400 });
    }

    const limit = rateLimit({ key: `wallet-funding:${user.id}`, limit: 5, windowMs: 10 * 60 * 1000 });
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many funding attempts. Please wait and try again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const admin = createAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentFunding, error: recentError } = await admin
      .from('payment_transactions')
      .select('principal_amount_kobo')
      .eq('user_id', user.id)
      .eq('purpose', 'wallet_funding')
      .gte('created_at', since);
    if (recentError) throw recentError;
    const funded24h = (recentFunding || []).reduce(
      (sum, row) => sum + (Number(row.principal_amount_kobo) || 0),
      0,
    );
    if (funded24h + creditKobo > WALLET_FUNDING_DAILY_MAX_KOBO) {
      return NextResponse.json({ error: 'The ₦100,000 daily funding limit would be exceeded.' }, { status: 409 });
    }

    const quote = grossUpPaystackLocalKobo(creditKobo);
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const callbackUrl = `${origin.replace(/\/$/, '')}/buyer/profile?funding=1`;
    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        amount: quote.grossKobo,
        callback_url: callbackUrl,
        metadata: {
          purpose: 'wallet_funding',
          currency: 'NGN',
          user_id: user.id,
          credit_amount_kobo: creditKobo,
          processing_fee_kobo: quote.processingFeeKobo,
          gateway_charge_kobo: quote.grossKobo,
        },
      }),
    });
    const payload = await paystackResponse.json().catch(() => ({}));
    if (!paystackResponse.ok || payload?.status !== true || !payload?.data?.authorization_url) {
      return NextResponse.json({ error: 'Could not start wallet funding.' }, { status: 502 });
    }

    return NextResponse.json({
      authorization_url: payload.data.authorization_url,
      credit_kobo: creditKobo,
      processing_fee_kobo: quote.processingFeeKobo,
      charge_kobo: quote.grossKobo,
    });
  } catch (error) {
    console.error('[wallet/fund/initialize] failed', error);
    return NextResponse.json({ error: 'Could not start wallet funding.' }, { status: 500 });
  }
}
