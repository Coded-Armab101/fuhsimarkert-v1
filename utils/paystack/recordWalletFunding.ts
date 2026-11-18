import type { SupabaseClient } from '@supabase/supabase-js';

export type WalletFundingTransaction = {
  reference: string;
  status: string;
  amount: number;
  fees?: number | null;
  currency: string;
  channel?: string | null;
  paid_at?: string | null;
  metadata?: unknown;
};

/** Validate and credit one Paystack wallet top-up exactly once. */
export async function recordWalletFunding(
  admin: SupabaseClient,
  transaction: WalletFundingTransaction,
): Promise<{ creditKobo: number; processingFeeKobo: number }> {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = typeof transaction.metadata === 'string'
      ? JSON.parse(transaction.metadata || '{}')
      : (transaction.metadata as Record<string, unknown> | null) || {};
  } catch {
    throw new Error('invalid wallet funding metadata');
  }
  const userId = typeof metadata.user_id === 'string' ? metadata.user_id : '';
  const creditKobo = Math.floor(Number(metadata.credit_amount_kobo));
  const processingFeeKobo = Math.floor(Number(metadata.processing_fee_kobo));
  const expectedGrossKobo = Math.floor(Number(metadata.gateway_charge_kobo));
  const providerFeeKobo = Math.max(0, Math.floor(Number(transaction.fees) || 0));

  if (
    transaction.status !== 'success' ||
    transaction.currency !== 'NGN' ||
    metadata.purpose !== 'wallet_funding' ||
    metadata.currency !== 'NGN' ||
    !userId ||
    !Number.isSafeInteger(creditKobo) ||
    !Number.isSafeInteger(processingFeeKobo) ||
    !Number.isSafeInteger(expectedGrossKobo) ||
    creditKobo < 50_000 ||
    creditKobo > 10_000_000 ||
    processingFeeKobo < 0 ||
    expectedGrossKobo !== creditKobo + processingFeeKobo ||
    Number(transaction.amount) !== expectedGrossKobo ||
    providerFeeKobo > processingFeeKobo ||
    expectedGrossKobo - providerFeeKobo < creditKobo
  ) {
    throw new Error('invalid wallet funding payment');
  }

  const { data: credited, error } = await admin.rpc('record_wallet_funding', {
    p_user_id: userId,
    p_reference: transaction.reference,
    p_credit_kobo: creditKobo,
    p_gross_kobo: expectedGrossKobo,
    p_processing_fee_kobo: processingFeeKobo,
    p_provider_fee_kobo: providerFeeKobo,
    p_channel: transaction.channel || null,
    p_paid_at: transaction.paid_at || null,
  });
  if (error) throw error;
  if (credited !== true) throw new Error('wallet funding was not credited');
  return { creditKobo, processingFeeKobo };
}
