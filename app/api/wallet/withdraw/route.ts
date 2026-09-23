import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { cookies } from 'next/headers';
import { SESSION_NONCE_COOKIE, nonceValid } from '@/utils/single-session';
import { rateLimit } from '@/utils/rate-limit';

/**
 * Seller requests a withdrawal from their wallet balance.
 *
 * The call is authenticated with the cookie client (proves who the seller is),
 * then the money bookkeeping happens through the service-role client because
 * RLS is intentionally closed to direct user writes on `wallets`/`withdrawals`.
 * Validates:
 *  - caller is authenticated,
 *  - the wallet exists and has enough balance,
 *  - bank details are present.
 * On success it deducts the amount from the wallet and records a pending
 * withdrawal that an operator later pays out (Paystack transfer).
 */
export async function POST(request: Request) {
  try {
    let body: { amountKobo?: number; bankName?: string; accountNumber?: string; accountName?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
    }

    const rawAmount = Number(body?.amountKobo);
    const amount = Math.floor(rawAmount);
    if (!Number.isSafeInteger(rawAmount) || amount <= 0 || amount > 100_000_000_00) {
      return NextResponse.json({ error: 'Enter a valid withdrawal amount.' }, { status: 400 });
    }
    const bankName = String(body?.bankName || '').trim();
    const accountNumber = String(body?.accountNumber || '').trim();
    const accountName = String(body?.accountName || '').trim();
    if (!bankName || !accountNumber || !accountName || bankName.length > 120 || accountName.length > 120 || !/^\d{10}$/.test(accountNumber)) {
      return NextResponse.json({
        error: 'Bank name, account number and account name are required.',
      }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized system access request.' }, { status: 401 });
    }

    const limit = rateLimit({ key: `withdraw:${user.id}`, limit: 3, windowMs: 10 * 60 * 1000 });
    if (!limit.ok) {
      return NextResponse.json({ error: 'Too many withdrawal attempts. Please wait.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
    }

    // Single-session guard: a request may only move money if its httpOnly nonce
    // cookie still matches the account's current session nonce. If the user
    // signed in on another device, the old session is stale even though its
    // auth cookie is technically still valid — refuse it here (the proxy enforces
    // the same rule for pages, but /api is excluded from the proxy matcher).
    const cookieStore = await cookies();
    const cookieNonce = cookieStore.get(SESSION_NONCE_COOKIE)?.value ?? null;
    const { data: nonceRow } = await supabase
      .from('profiles')
      .select('session_nonce')
      .eq('id', user.id)
      .maybeSingle<{ session_nonce: string | null }>();
    if (!nonceValid(cookieNonce, nonceRow?.session_nonce ?? null)) {
      return NextResponse.json({
        error: 'This session was superseded by a login on another device. Please sign in again.',
      }, { status: 403 });
    }

    const admin = createAdminClient();

    // One pending withdrawal at a time: a user may not stack withdrawal requests
    // (which could otherwise be raced from two devices). Only a settled/rejected
    // request frees them up to ask again.
    const { data: existing, error: existingError } = await admin
      .from('withdrawals')
      .select('id')
      .eq('seller_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return NextResponse.json({
        error: 'You already have a pending withdrawal request. Wait for it to be settled before requesting another.',
      }, { status: 409 });
    }

    // Confirm the wallet exists and has enough balance (informational message).
    const { data: wallet, error: walletError } = await admin
      .from('wallets')
      .select('id, balance')
      .eq('user_id', user.id)
      .maybeSingle();
    if (walletError) throw walletError;
    const balance = wallet ? Number(wallet.balance) : 0;

    // AVAILABLE_KB≥amount is the adversarial read race: two simultaneous
    // requests (same account, two devices) both passed `balance >= amount`
    // above. The atomic `WHERE ... AND balance >= amount` below means only the
    // FIRST request deducts; the second affects zero rows and is rejected, so
    // a user can never over-withdraw their balance via concurrent requests.
    if (!wallet) {
      return NextResponse.json({ error: 'No wallet balance available.' }, { status: 400 });
    }
    if (balance < amount) {
      return NextResponse.json({
        error: `Insufficient balance. Available: ₦${(balance / 100).toLocaleString()}.`,
      }, { status: 400 });
    }

    const { data: deducted, error: deductError } = await admin
      .from('wallets')
      .update({ balance: balance - amount })
      .eq('id', wallet.id)
      .eq('user_id', user.id)
      .gte('balance', amount)
      .select('id')
      .maybeSingle();
    if (deductError) throw deductError;
    if (!deducted) {
      // Balance was already spent by a concurrent request — reject cleanly.
      return NextResponse.json({
        error: 'Your balance changed. Try your withdrawal again.',
      }, { status: 409 });
    }

    const { error: insertError } = await admin.from('withdrawals').insert({
      seller_id: user.id,
      amount_kobo: amount,
      bank_name: bankName,
      account_number: accountNumber,
      account_name: accountName,
      status: 'pending',
    });
    if (insertError) throw insertError;

    return NextResponse.json({ ok: true, status: 'pending', amount_kobo: amount });
  } catch (err) {
    console.error('[wallet/withdraw] error:', err);
    return NextResponse.json({ error: 'Could not process your withdrawal request.' }, { status: 500 });
  }
}