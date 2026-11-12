import type { SupabaseClient } from '@supabase/supabase-js';
import { paystackConfigured, refundTransaction, verifyTransaction } from './api';

/**
 * Card refunds for disputed orders.
 *
 * The buyer may have paid part of an order from their wallet and part by card
 * (wallet-first checkout). The caller refunds the card portion through Paystack
 * and credits only the wallet portion back to the wallet, so nobody is paid
 * twice. Wallet-only references start with `WAL-` and never touch Paystack.
 */

export type CardRefundResult =
  | { ok: true; amountKobo: number; reference: string | null; note: string }
  | { ok: false; amountKobo: 0; reason: string };

export function isWalletOnlyReference(reference: string): boolean {
  return reference.startsWith('WAL-');
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
    return { ok: true, amountKobo: 0, reference: null, note: 'No card portion to refund.' };
  }

  if (!paystackConfigured()) {
    return {
      ok: false,
      amountKobo: 0,
      reason: 'PAYSTACK_SECRET_KEY is not configured, so the card portion cannot be refunded.',
    };
  }

  try {
    const transaction = await verifyTransaction(reference);
    if (transaction.status !== 'success') {
      return {
        ok: false,
        amountKobo: 0,
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
        note: 'The card charge has no refundable balance.',
      };
    }

    const refund = await refundTransaction({ reference, amountKobo });
    return {
      ok: true,
      amountKobo,
      reference: refund.transaction?.reference || transaction.reference || reference,
      note: 'Card refund submitted to Paystack.',
    };
  } catch (err) {
    return {
      ok: false,
      amountKobo: 0,
      reason: err instanceof Error ? err.message : 'Paystack rejected the refund.',
    };
  }
}
