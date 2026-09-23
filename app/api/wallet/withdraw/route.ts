import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { cookies } from 'next/headers';
import { SESSION_NONCE_COOKIE, nonceValid } from '@/utils/single-session';

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

    const amount = Number(body?.amountKobo);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Enter a valid withdrawal amount.' }, { status: 400 });
    }
    const bankName = String(body?.bankName || '').trim();
    const accountNumber = String(body?.accountNumber || '').trim();
    const accountName = String(body?.accountName || '').trim();
    if (!bankName || !accountNumber || !accountName) {
      return NextResponse.json({
        error: 'Bank name, account number and account name are required.',
      }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized system access request.' }, { status: 401 });
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

    // The balance deduction and withdrawal insert must happen atomically in
    // Postgres. A JS read -> update -> insert sequence can strand funds if the
    // insert fails or race another request. The RPC is service-role-only.
    const { error: withdrawalError } = await admin.rpc('create_seller_withdrawal', {
      p_seller_id: user.id,
      p_amount_kobo: amount,
      p_bank_name: bankName,
      p_account_number: accountNumber,
      p_account_name: accountName,
    });
    if (withdrawalError) {
      const message = withdrawalError.message || '';
      if (message.includes('pending withdrawal')) {
        return NextResponse.json({ error: 'You already have a pending withdrawal request. Wait for it to be settled before requesting another.' }, { status: 409 });
      }
      if (message.includes('insufficient')) {
        return NextResponse.json({ error: 'Your wallet balance is not enough for this withdrawal.' }, { status: 400 });
      }
      throw withdrawalError;
    }

    return NextResponse.json({ ok: true, status: 'pending', amount_kobo: amount });
  } catch (err) {
    console.error('[wallet/withdraw] error:', err);
    return NextResponse.json({ error: 'Could not process your withdrawal request.' }, { status: 500 });
  }
}