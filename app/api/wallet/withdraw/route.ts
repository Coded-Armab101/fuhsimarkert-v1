import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { cookies } from 'next/headers';
import { SESSION_NONCE_COOKIE, nonceValid } from '@/utils/single-session';
import { accountIsActive } from '@/utils/account';
import {
  paystackTransferFeeKobo,
  PLATFORM_TRANSFER_FEE_SOURCE,
  platformTransferFeeNote,
  sellerWithdrawalDebitKobo,
  WALLET_WITHDRAWAL_DAILY_MAX_KOBO,
  WALLET_WITHDRAWAL_MIN_KOBO,
} from '@/utils/payment-fees';
import { resolveBankCode } from '@/utils/paystack/transfer';
import { resolveAccountNumber } from '@/utils/paystack/api';

function nameTokens(value: string): Set<string> {
  return new Set(
    value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((part) => part.length > 1),
  );
}

function namesLikelyMatch(profileName: string, bankName: string): boolean {
  const profile = nameTokens(profileName);
  const bank = nameTokens(bankName);
  if (profile.size === 0 || bank.size === 0) return false;
  let matches = 0;
  for (const token of profile) if (bank.has(token)) matches += 1;
  return matches >= Math.min(2, profile.size, bank.size);
}

/**
 * Seller requests a withdrawal from their wallet balance.
 *
 * The call is authenticated with the cookie client (proves who the seller is),
 * then the money bookkeeping happens through the service-role client because
 * RLS is intentionally closed to direct user writes on `wallets`/`withdrawals`.
 * Validates:
 *  - caller is authenticated,
 *  - the withdrawable balance covers the BANK AMOUNT only,
 *  - bank details are present.
 *
 * Paystack transfer/stamp charges are a platform cost funded by the 3%
 * commission. The expected fee is still computed and sent to the RPC for the
 * accounting record, but the wallet is debited only the bank amount.
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
    if (!Number.isSafeInteger(amount) || amount < WALLET_WITHDRAWAL_MIN_KOBO || amount > WALLET_WITHDRAWAL_DAILY_MAX_KOBO) {
      return NextResponse.json({ error: 'Withdraw between ₦1,000 and ₦100,000 per day.' }, { status: 400 });
    }
    const bankName = String(body?.bankName || '').trim();
    const accountNumber = String(body?.accountNumber || '').trim();
    const suppliedAccountName = String(body?.accountName || '').trim();
    if (!bankName || !accountNumber || !suppliedAccountName || !/^\d{10}$/.test(accountNumber)) {
      return NextResponse.json({
        error: 'Bank name, account number and account name are required.',
      }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized system access request.' }, { status: 401 });
    }
    if (!(await accountIsActive(supabase, user.id))) {
      return NextResponse.json({ error: 'This account is suspended.' }, { status: 403 });
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

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.full_name) {
      return NextResponse.json({ error: 'Save your full legal name before withdrawing.' }, { status: 400 });
    }

    const bank = await resolveBankCode(bankName);
    if (!bank) {
      return NextResponse.json({ error: 'Choose a supported bank name.' }, { status: 400 });
    }
    let resolvedAccount: { account_number: string; account_name: string };
    try {
      resolvedAccount = await resolveAccountNumber(accountNumber, bank.code);
    } catch {
      return NextResponse.json({ error: 'Paystack could not verify this bank account.' }, { status: 400 });
    }
    if (!namesLikelyMatch(profile.full_name, resolvedAccount.account_name)) {
      return NextResponse.json({
        error: `The bank account name (${resolvedAccount.account_name}) does not match the legal name on this profile.`,
      }, { status: 400 });
    }

    // Audit only: the RPC validates this against its own fee function and stores
    // it on the withdrawal row. The seller never pays it from their wallet.
    const transferFeeKobo = paystackTransferFeeKobo(amount);
    const walletDebitKobo = sellerWithdrawalDebitKobo(amount);

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
    const { data: withdrawalId, error: withdrawalError } = await admin.rpc('create_wallet_withdrawal', {
      p_user_id: user.id,
      p_bank_amount_kobo: amount,
      p_transfer_fee_kobo: transferFeeKobo,
      p_bank_name: bank.name,
      p_bank_code: bank.code,
      p_account_number: accountNumber,
      p_account_name: resolvedAccount.account_name,
    });
    if (withdrawalError) {
      const message = withdrawalError.message || '';
      if (message.includes('pending withdrawal')) {
        return NextResponse.json({ error: 'You already have a pending withdrawal request. Wait for it to be settled before requesting another.' }, { status: 409 });
      }
      if (message.includes('insufficient withdrawable')) {
        return NextResponse.json({ error: 'Your withdrawable balance does not cover the bank amount. Held funding/refunds unlock after 14 days.' }, { status: 400 });
      }
      if (message.includes('daily withdrawal')) {
        return NextResponse.json({ error: 'The ₦100,000 daily withdrawal limit would be exceeded.' }, { status: 409 });
      }
      throw withdrawalError;
    }

    await admin.from('profiles').update({
      bank_name: bank.name,
      account_number: accountNumber,
      account_name: resolvedAccount.account_name,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);

    return NextResponse.json({
      ok: true,
      status: 'pending',
      withdrawal_id: withdrawalId,
      amount_kobo: amount,
      transfer_fee_kobo: transferFeeKobo,
      transfer_fee_source: PLATFORM_TRANSFER_FEE_SOURCE,
      wallet_debit_kobo: walletDebitKobo,
      message: platformTransferFeeNote(transferFeeKobo, amount),
      account_name: resolvedAccount.account_name,
    });
  } catch (err) {
    console.error('[wallet/withdraw] error:', err);
    return NextResponse.json({ error: 'Could not process your withdrawal request.' }, { status: 500 });
  }
}
