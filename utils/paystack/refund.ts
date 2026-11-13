import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import {
  fetchRefund,
  paystackConfigured,
  PaystackRequestError,
  refundTransaction,
  verifyTransaction,
  type PaystackRefund,
} from './api';

/**
 * Card refunds for disputed orders.
 *
 * The buyer may have paid part of an order from their wallet and part by card
 * (wallet-first checkout). The caller refunds the card portion through Paystack
 * and credits only the wallet portion back to the wallet, so nobody is paid
 * twice. Wallet-only references start with `WAL-` and never touch Paystack.
 */

export type CardRefundResult =
  | { ok: true; amountKobo: number; reference: string | null; status: string; note: string }
  | { ok: false; amountKobo: 0; reason: string; uncertain?: boolean; reference?: string };

export function isWalletOnlyReference(reference: string): boolean {
  return reference.startsWith('WAL-');
}

/** Paystack accepts a merchant refund reference once, making retries safe. */
export function refundReferenceForOrder(orderRef: string): string {
  const digest = createHash('sha256').update(orderRef).digest('hex').slice(0, 40);
  return `RF-${digest}`;
}

function existingRefundResult(
  refund: PaystackRefund,
  expectedKobo: number,
  fallbackReference: string,
): CardRefundResult {
  const amountKobo = Math.max(0, Math.floor(Number(refund.amount) || 0));
  const status = String(refund.status || '').toLowerCase();

  if (status === 'failed') {
    return {
      ok: false,
      amountKobo: 0,
      reason: 'Paystack reports that the card refund failed.',
    };
  }

  // A smaller amount is valid when the checkout was split with the wallet; the
  // remainder is credited locally. More than expected means we cannot safely
  // decide how much wallet credit to add without manual reconciliation.
  if (amountKobo <= 0 || amountKobo > expectedKobo) {
    return {
      ok: false,
      amountKobo: 0,
      uncertain: true,
      reference: fallbackReference,
      reason: 'Paystack has a refund for this order, but its amount does not match the protected order total.',
    };
  }

  return {
    ok: true,
    amountKobo,
    reference: refund.reference || fallbackReference,
    status: status || 'pending',
    note: `Card refund ${status || 'pending'} at Paystack.`,
  };
}

/** Amount a buyer paid with their wallet for this order reference (kobo). */
export async function getWalletPaidKobo(
  admin: SupabaseClient,
  orderRef: string,
): Promise<number> {
  try {
    const { data } = await admin
      .from('wallet_debits')
      .select('amount_kobo')
      .eq('order_ref', orderRef)
      .maybeSingle<{ amount_kobo?: number | null }>();
    const amount = Number(data?.amount_kobo) || 0;
    return amount > 0 ? Math.floor(amount) : 0;
  } catch {
    return 0;
  }
}

/**
 * Refund the card/gateway portion of an order.
 *
 * `expectedKobo` is what remains after subtracting the wallet share from the
 * escrowed total. Paystack can refund less than the transaction amount, but
 * never more, so the request is clamped to the real charge.
 */
export async function refundCardPortion(
  reference: string,
  expectedKobo: number,
): Promise<CardRefundResult> {
  if (expectedKobo <= 0 || isWalletOnlyReference(reference)) {
    return {
      ok: true,
      amountKobo: 0,
      reference: null,
      status: 'not-applicable',
      note: 'No card portion to refund.',
    };
  }

  if (!paystackConfigured()) {
    return {
      ok: false,
      amountKobo: 0,
      reason: 'PAYSTACK_SECRET_KEY is not configured, so the card portion cannot be refunded.',
    };
  }

  const refundReference = refundReferenceForOrder(reference);

  // If a previous request reached Paystack but crashed before saving locally,
  // recover that exact refund first. This is the distributed idempotency key.
  try {
    const existing = await fetchRefund(refundReference);
    return existingRefundResult(existing, expectedKobo, refundReference);
  } catch {
    // Usually a 404 (first attempt). Creation below uses the same unique key,
    // so even an API/network ambiguity cannot produce a second card refund.
  }

  try {
    const transaction = await verifyTransaction(reference);
    if (transaction.status !== 'success') {
      return {
        ok: false,
        amountKobo: 0,
        uncertain: ['reversal_pending', 'reversed'].includes(
          String(transaction.status).toLowerCase(),
        ),
        reference: refundReference,
        reason: `Paystack reports the original charge as "${transaction.status}".`,
      };
    }

    const chargeKobo = Math.max(0, Math.floor(Number(transaction.amount) || 0));
    const amountKobo = Math.min(Math.floor(expectedKobo), chargeKobo);
    if (amountKobo <= 0) {
      return {
        ok: true,
        amountKobo: 0,
        reference: transaction.reference || reference,
        status: 'not-applicable',
        note: 'The card charge has no refundable balance.',
      };
    }

    try {
      const refund = await refundTransaction({
        reference,
        amountKobo,
        refundReference,
      });
      return existingRefundResult(refund, expectedKobo, refundReference);
    } catch (createError) {
      // The request may have timed out after Paystack accepted it. Fetching by
      // our unique reference tells us whether to resume or report uncertainty.
      try {
        const existing = await fetchRefund(refundReference);
        return existingRefundResult(existing, expectedKobo, refundReference);
      } catch {
        const explicitFailure =
          createError instanceof PaystackRequestError &&
          [401, 403, 404, 422].includes(createError.statusCode);
        return {
          ok: false,
          amountKobo: 0,
          uncertain: !explicitFailure,
          reference: refundReference,
          reason:
            createError instanceof Error
              ? createError.message
              : 'Paystack rejected the refund.',
        };
      }
    }
  } catch (err) {
    return {
      ok: false,
      amountKobo: 0,
      uncertain: true,
      reference: refundReference,
      reason: err instanceof Error ? err.message : 'Paystack rejected the refund.',
    };
  }
}
