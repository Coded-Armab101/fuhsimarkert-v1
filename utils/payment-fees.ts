import { formatNaira } from './money.ts';

/**
 * Paystack Nigeria fee helpers. All values are integer kobo.
 *
 * Local collections (2026): 1.5%, plus ₦100 from ₦2,500 upward, capped at
 * ₦2,000. We round the estimate up so the platform never under-collects due to
 * a fractional-kobo boundary. The verified provider fee is stored separately.
 *
 * Withdrawal transfer/stamp charges are a PLATFORM cost funded by the 3%
 * seller commission. Sellers are debited only the bank amount they requested.
 */

const LOCAL_RATE = 0.015;
const LOCAL_FLAT_KOBO = 10_000;
const LOCAL_FLAT_THRESHOLD_KOBO = 250_000;
const LOCAL_FEE_CAP_KOBO = 200_000;

export function paystackLocalCollectionFeeKobo(grossKobo: number): number {
  const gross = Math.max(0, Math.floor(Number(grossKobo) || 0));
  if (gross === 0) return 0;
  const percentage = Math.ceil(gross * LOCAL_RATE);
  const fee = percentage + (gross >= LOCAL_FLAT_THRESHOLD_KOBO ? LOCAL_FLAT_KOBO : 0);
  return Math.min(fee, LOCAL_FEE_CAP_KOBO);
}

/** Smallest local Paystack charge whose estimated net covers `principalKobo`. */
export function grossUpPaystackLocalKobo(principalKobo: number): {
  principalKobo: number;
  processingFeeKobo: number;
  grossKobo: number;
} {
  const principal = Math.max(0, Math.floor(Number(principalKobo) || 0));
  if (principal === 0) return { principalKobo: 0, processingFeeKobo: 0, grossKobo: 0 };

  let low = principal;
  let high = principal + LOCAL_FEE_CAP_KOBO;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const net = middle - paystackLocalCollectionFeeKobo(middle);
    if (net >= principal) high = middle;
    else low = middle + 1;
  }

  return {
    principalKobo: principal,
    processingFeeKobo: low - principal,
    grossKobo: low,
  };
}

/**
 * Paystack Nigeria transfer cost (2026): ₦10 / ₦25 / ₦50 by amount, plus the
 * statutory ₦50 stamp duty on transfers of ₦10,000 or more.
 */
export function paystackTransferFeeKobo(bankAmountKobo: number): number {
  const amount = Math.max(0, Math.floor(Number(bankAmountKobo) || 0));
  if (amount === 0) return 0;
  const providerFee = amount <= 500_000 ? 1_000 : amount <= 5_000_000 ? 2_500 : 5_000;
  const stampDuty = amount >= 1_000_000 ? 5_000 : 0;
  return providerFee + stampDuty;
}

/** Accounting source for provider transfer costs after 2026-11-27. */
export const PLATFORM_TRANSFER_FEE_SOURCE = 'platform_commission' as const;

/**
 * Seller withdrawals never add the transfer fee to the wallet debit. The fee
 * stays on the withdrawal row for accounting, funded by the 3% commission.
 */
export function sellerWithdrawalDebitKobo(bankAmountKobo: number): number {
  return Math.max(0, Math.floor(Number(bankAmountKobo) || 0));
}

/** Shared customer-facing explanation for platform-paid transfer charges. */
export function platformTransferFeeNote(feeKobo: number, bankAmountKobo?: number): string {
  const fee = `₦${formatNaira(feeKobo)}`;
  const debit = bankAmountKobo === undefined
    ? 'the bank amount'
    : `₦${formatNaira(sellerWithdrawalDebitKobo(bankAmountKobo))}`;
  return `Transfer/stamp charge (${fee}) is covered by FuhsiMarket from our commission. You are debited only ${debit}.`;
}

export const WALLET_FUNDING_MIN_KOBO = 50_000; // ₦500
export const WALLET_FUNDING_DAILY_MAX_KOBO = 10_000_000; // ₦100,000
export const WALLET_WITHDRAWAL_MIN_KOBO = 100_000; // ₦1,000 to the bank
export const WALLET_WITHDRAWAL_DAILY_MAX_KOBO = 10_000_000; // ₦100,000
export const WALLET_CASHOUT_HOLD_DAYS = 14;
