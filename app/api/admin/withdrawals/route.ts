import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  sendSellerPayout,
  transferFailed,
  transferIsPending,
  verifyTransfer,
} from '@/utils/paystack/transfer';
import { sendEmailToUsers, appLink } from '@/utils/email';
import { formatNaira } from '@/utils/money';

/**
 * Operator/admin tools for withdrawals.
 *
 * GET  – list every withdrawal with seller identity (chronological, newest first).
 * POST – approve or reject a single pending withdrawal.
 *
 * Money model: a seller's withdrawal request already deducts the amount from
 * their wallet when it is opened (see /api/wallet/withdraw), and the money sits
 * in the platform balance.
 *
 * Approve now actually pays out through Paystack:
 *  - create a NUBAN transfer recipient from the saved bank details,
 *  - initiate a transfer for the exact amount,
 *  - only mark the ledger `paid` when Paystack reports `success`.
 *
 * A `pending`/`queued`/`processing` transfer leaves the withdrawal `pending`
 * (with `transfer_status` set) so the operator can Approve again later; the
 * existing transfer is verified first, never re-sent. Rejecting returns the
 * held amount to the seller's wallet.
 *
 * Authorization: the caller must be a user whose `profiles.is_admin` is true.
 * The cookie client proves identity; the service-role client does the writes
 * because `wallets`/`withdrawals` are not user-writable under RLS.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: adminProfile } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (adminProfile?.is_admin !== true) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    // Join seller profile for names/email. All via service role (RLS bypass).
    const { data, error } = await admin
      .from('withdrawals')
      .select(
        'id, seller_id, amount_kobo, bank_name, bank_code, account_number, account_name, status, request_note, transfer_reference, transfer_code, transfer_status, created_at, processed_at',
      )
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Join seller profile for names. All via service role (RLS bypass).
    const sellerIds = [...new Set((data || []).map((w) => w.seller_id))];
    const sellers: Record<string, { full_name?: string }> = {};
    if (sellerIds.length) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', sellerIds);
      for (const p of profiles || []) sellers[p.id] = p;
    }

    const rows = (data || []).map((w) => ({
      ...w,
      amount_kobo: Number(w.amount_kobo),
      seller: sellers[w.seller_id] || null,
    }));

    return NextResponse.json({ withdrawals: rows });
  } catch (err) {
    console.error('[admin/withdrawals] error:', err);
    return NextResponse.json({ error: 'Could not load withdrawals.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let body: { action?: string; withdrawalId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
    }

    const action = body?.action;
    const withdrawalId = String(body?.withdrawalId || '');
    if (!['approve', 'reject'].includes(action || '')) {
      return NextResponse.json({ error: 'Valid actions: approve, reject.' }, { status: 400 });
    }
    if (!withdrawalId) {
      return NextResponse.json({ error: 'withdrawalId is required.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: adminProfile } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (adminProfile?.is_admin !== true) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    // Load the withdrawal and guard against double-processing.
    const { data: w, error: loadError } = await admin
      .from('withdrawals')
      .select(
        'id, seller_id, amount_kobo, bank_name, bank_code, account_number, account_name, status, transfer_reference, transfer_code, transfer_status',
      )
      .eq('id', withdrawalId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!w) {
      return NextResponse.json({ error: 'Withdrawal not found.' }, { status: 404 });
    }
    if (w.status !== 'pending') {
      return NextResponse.json({ error: 'This withdrawal was already processed.' }, { status: 409 });
    }

    const amountKobo = Math.floor(Number(w.amount_kobo) || 0);
    if (amountKobo <= 0) {
      return NextResponse.json({ error: 'This withdrawal has an invalid amount.' }, { status: 400 });
    }

    // -----------------------------------------------------------------------
    // REJECT — return the held money to the seller's wallet.
    // -----------------------------------------------------------------------
    if (action === 'reject') {
      // If a transfer is already in flight, rejecting would refund the wallet
      // AND let the bank transfer land. Make the operator wait for it to settle.
      if (w.transfer_reference && w.transfer_status && transferIsPending(w.transfer_status)) {
        return NextResponse.json({
          error: `A Paystack transfer is already in progress (${w.transfer_status}). Wait for it to settle before rejecting.`,
        }, { status: 409 });
      }

      const { data: result, error: processError } = await admin.rpc('process_seller_withdrawal', {
        p_withdrawal_id: w.id,
        p_action: 'reject',
      });
      if (processError) {
        const message = processError.message || '';
        if (message.includes('already processed')) {
          return NextResponse.json({ error: 'This withdrawal was already processed.' }, { status: 409 });
        }
        throw processError;
      }

      await admin
        .from('withdrawals')
        .update({
          transfer_status: 'rejected',
          processed_at: new Date().toISOString(),
        })
        .eq('id', w.id);

      try {
        await sendEmailToUsers(admin, [w.seller_id], {
          subject: 'Your FuhsiMarket withdrawal was returned',
          heading: 'Withdrawal not completed',
          lines: [
            `Your withdrawal request for ₦${formatNaira(amountKobo)} was not approved.`,
            'The full amount has been returned to your FuhsiMarket wallet, so you can request it again.',
          ],
          cta: { label: 'Open your wallet', url: appLink('/seller/wallet') },
        });
      } catch (err) {
        console.warn('[admin/withdrawals] rejection email failed', err);
      }

      return NextResponse.json({ ok: true, action: result, status: 'rejected' });
    }

    // -----------------------------------------------------------------------
    // APPROVE — pay through Paystack, then mark the ledger paid on success.
    // -----------------------------------------------------------------------

    // If a previous Approve already started a transfer, verify it rather than
    // creating a second one for the same withdrawal.
    let existingStatus: string | null = null;
    let existingReference = w.transfer_reference as string | null;
    let existingCode = w.transfer_code as string | null;

    if (existingReference) {
      try {
        const transfer = await verifyTransfer(existingReference);
        existingStatus = transfer.status;
        existingCode = transfer.transfer_code || existingCode;
      } catch (err) {
        console.warn('[admin/withdrawals] could not verify existing transfer', err);
        // Without a verified state we must not risk a second transfer.
        return NextResponse.json({
          error: 'Could not verify the existing Paystack transfer. Check the Paystack dashboard before retrying.',
        }, { status: 502 });
      }

      if (existingStatus === 'success') {
        const { error: processError } = await admin.rpc('process_seller_withdrawal', {
          p_withdrawal_id: w.id,
          p_action: 'approve',
        });
        if (processError) throw processError;

        await admin
          .from('withdrawals')
          .update({
            transfer_status: 'success',
            transfer_code: existingCode,
            processed_at: new Date().toISOString(),
          })
          .eq('id', w.id);

        await sendPayoutEmail(admin, w.seller_id, amountKobo, w.bank_name);
        return NextResponse.json({
          ok: true,
          action: 'approve',
          status: 'paid',
          transfer_reference: existingReference,
          transfer_code: existingCode,
        });
      }

      if (transferIsPending(existingStatus)) {
        await admin
          .from('withdrawals')
          .update({ transfer_status: existingStatus, transfer_code: existingCode })
          .eq('id', w.id);
        return NextResponse.json({
          ok: true,
          status: 'processing',
          transfer_status: existingStatus,
          transfer_reference: existingReference,
          message: 'The transfer is still processing at Paystack. Approve again later to refresh its status.',
        }, { status: 202 });
      }

      if (!transferFailed(existingStatus)) {
        return NextResponse.json({
          error: `Paystack transfer status "${existingStatus}" is not final. Check the Paystack dashboard.`,
        }, { status: 502 });
      }

      // A failed/reversed/abandoned transfer did not pay the seller, so a fresh
      // attempt is safe.
      existingReference = null;
    }

    const reference = `WD-${w.id.replace(/-/g, '').slice(0, 10)}-${Date.now().toString(36).toUpperCase()}`;
    const payout = await sendSellerPayout({
      bankName: w.bank_name,
      bankCode: w.bank_code,
      accountNumber: w.account_number,
      accountName: w.account_name,
      amountKobo,
      reference,
    });

    if (payout.kind === 'error') {
      // Money stays in the platform balance and the withdrawal stays pending so
      // the operator can fix the details and retry. Return the exact reason.
      await admin
        .from('withdrawals')
        .update({
          transfer_reference: payout.reference || existingReference,
          transfer_code: payout.transferCode || existingCode,
          transfer_status: 'failed',
        })
        .eq('id', w.id);

      return NextResponse.json({
        error: payout.message,
        retryable: payout.retryable,
      }, { status: 502 });
    }

    // Persist the transfer state before touching the ledger.
    if (payout.kind === 'pending') {
      await admin
        .from('withdrawals')
        .update({
          transfer_reference: payout.reference,
          transfer_code: payout.transferCode,
          transfer_status: payout.transferStatus,
        })
        .eq('id', w.id);

      return NextResponse.json({
        ok: true,
        status: 'processing',
        transfer_status: payout.transferStatus,
        transfer_reference: payout.reference,
        transfer_code: payout.transferCode,
        message: `Paystack accepted the transfer (${payout.transferStatus}). Approve again later to confirm it settled.`,
      }, { status: 202 });
    }

    // Success: mark the ledger paid, store the transfer, and email the seller.
    const { data: result, error: processError } = await admin.rpc('process_seller_withdrawal', {
      p_withdrawal_id: w.id,
      p_action: 'approve',
    });
    if (processError) {
      const message = processError.message || '';
      if (message.includes('already processed')) {
        return NextResponse.json({ error: 'This withdrawal was already processed.' }, { status: 409 });
      }
      // The bank transfer HAS been sent. Never retry blindly — surface the
      // ledger error so the operator can reconcile manually.
      console.error('[admin/withdrawals] transfer succeeded but ledger update failed', {
        withdrawalId: w.id,
        reference: payout.reference,
        message,
      });
      return NextResponse.json({
        error: `Paystack paid the seller (${payout.reference}) but the ledger could not be updated: ${message}. Reconcile this withdrawal manually.`,
      }, { status: 500 });
    }

    await admin
      .from('withdrawals')
      .update({
        transfer_reference: payout.reference,
        transfer_code: payout.transferCode,
        transfer_status: 'success',
        processed_at: new Date().toISOString(),
      })
      .eq('id', w.id);

    await sendPayoutEmail(admin, w.seller_id, amountKobo, w.bank_name);

    return NextResponse.json({
      ok: true,
      action: result,
      status: 'paid',
      transfer_reference: payout.reference,
      transfer_code: payout.transferCode,
    });
  } catch (err) {
    console.error('[admin/withdrawals] error:', err);
    return NextResponse.json({ error: 'Could not process the withdrawal.' }, { status: 500 });
  }
}

async function sendPayoutEmail(
  admin: ReturnType<typeof createAdminClient>,
  sellerId: string,
  amountKobo: number,
  bankName: string,
) {
  try {
    await sendEmailToUsers(admin, [sellerId], {
      subject: 'Your FuhsiMarket payout is on its way',
      heading: 'Withdrawal approved',
      lines: [
        `We sent ₦${formatNaira(amountKobo)} to your ${bankName} account through Paystack.`,
        'Your wallet balance has been updated. Bank settlement is usually instant, but can take a few minutes.',
      ],
      cta: { label: 'Open your wallet', url: appLink('/seller/wallet') },
    });
  } catch (err) {
    console.warn('[admin/withdrawals] payout email failed', err);
  }
}
