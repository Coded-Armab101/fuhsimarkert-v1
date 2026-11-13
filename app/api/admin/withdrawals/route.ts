import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  sendSellerPayout,
  transferFailed,
  transferIsPending,
  transferNeedsOtp,
  verifyTransfer,
} from '@/utils/paystack/transfer';
import { sendEmailToUsers, appLink } from '@/utils/email';
import { formatNaira } from '@/utils/money';

type AdminClient = ReturnType<typeof createAdminClient>;
type WithdrawalForPayout = {
  id: string;
  seller_id: string;
  bank_name: string;
};

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
    // REJECT — return held money only when no transfer can still land.
    // -----------------------------------------------------------------------
    if (action === 'reject') {
      if (w.transfer_reference) {
        let transfer: Awaited<ReturnType<typeof verifyTransfer>> | null = null;
        try {
          transfer = await verifyTransfer(w.transfer_reference);
        } catch (err) {
          console.warn('[admin/withdrawals] reject could not verify transfer', err);
          if (w.transfer_status !== 'not-started') {
            return NextResponse.json({
              error: 'Could not prove that the existing Paystack transfer failed. Check Paystack before returning this money.',
            }, { status: 502 });
          }
          // Recipient/bank validation failed before initiation. The hardened
          // RPC below rechecks this state under a row lock before refunding.
        }

        if (transfer) {
          await storeTransferState(
            admin,
            w.id,
            w.transfer_reference,
            transfer.transfer_code || w.transfer_code,
            transfer.status,
          );

          if (transfer.status === 'success') {
            const settled = await markWithdrawalPaid(
              admin,
              w,
              amountKobo,
              w.transfer_reference,
              transfer.transfer_code || w.transfer_code,
            );
            return NextResponse.json({
              ok: true,
              action: settled.action,
              status: 'paid',
              message: 'The transfer had already succeeded, so it was marked paid instead of returning the money.',
            });
          }

          if (transferNeedsOtp(transfer.status)) {
            return NextResponse.json({
              error: 'This transfer is waiting for a Paystack OTP. Complete or cancel it in Paystack before rejecting the withdrawal.',
            }, { status: 409 });
          }

          if (transferIsPending(transfer.status)) {
            return NextResponse.json({
              error: `A Paystack transfer is already in progress (${transfer.status}). Wait for it to settle before rejecting.`,
            }, { status: 409 });
          }

          if (!transferFailed(transfer.status)) {
            return NextResponse.json({
              error: `Paystack transfer status "${transfer.status}" is not final. Check the Paystack dashboard before rejecting.`,
            }, { status: 409 });
          }
        }
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
        if (message.includes('transfer already started')) {
          return NextResponse.json({
            error: 'A Paystack transfer started at the same time. Verify it before rejecting.',
          }, { status: 409 });
        }
        throw processError;
      }

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
    // APPROVE — claim one reference, pay through Paystack, then mark paid.
    // -----------------------------------------------------------------------
    const existingReference = w.transfer_reference as string | null;
    let existingCode = w.transfer_code as string | null;
    let existingStatus = w.transfer_status as string | null;

    // A previous request may have saved Paystack success before the ledger RPC
    // completed. Finish the local transition without sending another transfer.
    if (existingReference && existingStatus === 'success') {
      const settled = await markWithdrawalPaid(
        admin,
        w,
        amountKobo,
        existingReference,
        existingCode,
      );
      return NextResponse.json({
        ok: true,
        action: settled.action,
        status: 'paid',
        transfer_reference: existingReference,
        transfer_code: existingCode,
      });
    }

    if (existingReference) {
      let transfer: Awaited<ReturnType<typeof verifyTransfer>> | null = null;
      try {
        transfer = await verifyTransfer(existingReference);
      } catch (err) {
        if (transferNeedsOtp(existingStatus || '')) {
          return NextResponse.json({
            error: 'This transfer is waiting for a Paystack OTP. Complete or cancel it in the Paystack dashboard.',
          }, { status: 409 });
        }
        console.warn('[admin/withdrawals] existing transfer verification failed; reusing its reference', err);
        // Reusing (not replacing) the exact reference is safe: Paystack rejects
        // a duplicate, and sendSellerPayout then verifies the original transfer.
      }

      if (transfer) {
        existingStatus = transfer.status;
        existingCode = transfer.transfer_code || existingCode;
        await storeTransferState(
          admin,
          w.id,
          existingReference,
          existingCode,
          existingStatus,
        );

        if (existingStatus === 'success') {
          const settled = await markWithdrawalPaid(
            admin,
            w,
            amountKobo,
            existingReference,
            existingCode,
          );
          return NextResponse.json({
            ok: true,
            action: settled.action,
            status: 'paid',
            transfer_reference: existingReference,
            transfer_code: existingCode,
          });
        }

        if (transferNeedsOtp(existingStatus)) {
          return NextResponse.json({
            error: 'Paystack requires a transfer OTP. Disable transfer OTP or complete/cancel this transfer in the Paystack dashboard.',
          }, { status: 409 });
        }

        if (transferIsPending(existingStatus)) {
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
        // A verified terminal failure is safe to replace. The claim RPC below
        // performs that replacement while holding the withdrawal row lock.
      }
    }

    const candidateReference = `WD-${w.id.replace(/-/g, '').slice(0, 10)}-${Date.now().toString(36).toUpperCase()}`;
    const { data: claimRows, error: claimError } = await admin.rpc(
      'claim_seller_withdrawal_transfer',
      {
        p_withdrawal_id: w.id,
        p_reference: candidateReference,
      },
    );
    if (claimError) {
      if ((claimError.message || '').includes('already processed')) {
        return NextResponse.json({ error: 'This withdrawal was already processed.' }, { status: 409 });
      }
      throw claimError;
    }

    const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;
    const reference = String(claim?.out_reference || '');
    if (!reference) throw new Error('Could not reserve a Paystack transfer reference.');

    if (claim?.out_claimed !== true) {
      const claimStatus = String(claim?.out_status || 'initiating');
      if (claimStatus === 'success') {
        const settled = await markWithdrawalPaid(
          admin,
          w,
          amountKobo,
          reference,
          existingCode,
        );
        return NextResponse.json({
          ok: true,
          action: settled.action,
          status: 'paid',
          transfer_reference: reference,
          transfer_code: existingCode,
        });
      }
      if (transferNeedsOtp(claimStatus)) {
        return NextResponse.json({
          error: 'This transfer is waiting for a Paystack OTP. Complete or cancel it in the Paystack dashboard.',
        }, { status: 409 });
      }

      return NextResponse.json({
        ok: true,
        status: 'processing',
        transfer_status: claimStatus,
        transfer_reference: reference,
        message: 'Another approval request is already handling this transfer. Refresh its status shortly.',
      }, { status: 202 });
    }

    const payout = await sendSellerPayout({
      bankName: w.bank_name,
      bankCode: w.bank_code,
      accountNumber: w.account_number,
      accountName: w.account_name,
      amountKobo,
      reference,
    });

    if (payout.kind === 'error') {
      await storeTransferState(
        admin,
        w.id,
        reference,
        payout.transferCode || existingCode,
        payout.transferStatus || 'error',
      );

      return NextResponse.json({
        error: payout.message,
        retryable: payout.retryable,
        transfer_status: payout.transferStatus || 'error',
      }, { status: transferNeedsOtp(payout.transferStatus || '') ? 409 : 502 });
    }

    if (payout.kind === 'pending') {
      await storeTransferState(
        admin,
        w.id,
        payout.reference,
        payout.transferCode,
        payout.transferStatus,
      );

      return NextResponse.json({
        ok: true,
        status: 'processing',
        transfer_status: payout.transferStatus,
        transfer_reference: payout.reference,
        transfer_code: payout.transferCode,
        message: `Paystack accepted the transfer (${payout.transferStatus}). Approve again later to confirm it settled.`,
      }, { status: 202 });
    }

    // Save gateway success BEFORE the ledger RPC. If the local write that marks
    // `paid` fails, a retry sees success and cannot send the bank transfer again.
    const settled = await markWithdrawalPaid(
      admin,
      w,
      amountKobo,
      payout.reference,
      payout.transferCode,
    );

    return NextResponse.json({
      ok: true,
      action: settled.action,
      status: 'paid',
      transfer_reference: payout.reference,
      transfer_code: payout.transferCode,
    });
  } catch (err) {
    console.error('[admin/withdrawals] error:', err);
    const message = err instanceof Error ? err.message : '';
    if (message.startsWith('TRANSFER_SENT_LEDGER_ERROR:')) {
      return NextResponse.json({
        error: message.slice('TRANSFER_SENT_LEDGER_ERROR:'.length).trim(),
      }, { status: 500 });
    }
    return NextResponse.json({ error: 'Could not process the withdrawal.' }, { status: 500 });
  }
}

async function storeTransferState(
  admin: AdminClient,
  withdrawalId: string,
  reference: string,
  transferCode: string | null,
  status: string,
) {
  const { error } = await admin
    .from('withdrawals')
    .update({
      transfer_reference: reference,
      transfer_code: transferCode,
      transfer_status: status,
      transfer_claimed_at: null,
    })
    .eq('id', withdrawalId)
    .eq('status', 'pending');
  if (error) throw error;
}

/**
 * Persist Paystack success first, then close the local ledger. Concurrent calls
 * are harmless: only the request that changes pending → paid sends the email.
 */
async function markWithdrawalPaid(
  admin: AdminClient,
  withdrawal: WithdrawalForPayout,
  amountKobo: number,
  reference: string,
  transferCode: string | null,
): Promise<{ action: string; newlyPaid: boolean }> {
  await storeTransferState(
    admin,
    withdrawal.id,
    reference,
    transferCode,
    'success',
  );

  const { data: result, error: processError } = await admin.rpc(
    'process_seller_withdrawal',
    {
      p_withdrawal_id: withdrawal.id,
      p_action: 'approve',
    },
  );

  if (processError) {
    const message = processError.message || '';
    if (message.includes('already processed')) {
      const { data: current } = await admin
        .from('withdrawals')
        .select('status')
        .eq('id', withdrawal.id)
        .maybeSingle();
      if (current?.status === 'paid') {
        return { action: 'already-paid', newlyPaid: false };
      }
    }

    throw new Error(
      `TRANSFER_SENT_LEDGER_ERROR: Paystack paid the seller (${reference}), but the withdrawal ledger could not be closed: ${message || 'unknown database error'}. Do not send another transfer; reconcile this reference manually.`,
    );
  }

  await sendPayoutEmail(
    admin,
    withdrawal.seller_id,
    amountKobo,
    withdrawal.bank_name,
  );
  return { action: String(result || 'approved'), newlyPaid: true };
}

async function sendPayoutEmail(
  admin: AdminClient,
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
