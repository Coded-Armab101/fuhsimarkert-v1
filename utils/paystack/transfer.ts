import {
  createTransferRecipient,
  initiateTransfer,
  listBanks,
  resolveAccountNumber,
  verifyTransfer,
  type PaystackBank,
  type PaystackTransfer,
} from './api';

/**
 * Paystack payout helpers.
 *
 * A seller's withdrawal stores the bank NAME they typed. Paystack needs the
 * bank CODE, so this module resolves the name against Paystack's live bank list
 * (with a small alias table for common abbreviations like "GTB" or "UBA"),
 * creates a NUBAN recipient, and initiates a transfer.
 */

type BankCode = { code: string; name: string };

let bankCache: { at: number; banks: PaystackBank[] } | null = null;
const BANK_CACHE_MS = 60 * 60 * 1000;

function normalize(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Alias table used when Paystack's own name differs from what people type.
 * Codes are the official NUBAN codes; a live bank list still takes priority.
 */
const BANK_ALIASES: Record<string, string[]> = {
  '044': ['accessbank', 'access', 'accessbankplc', 'accessbanknigeria'],
  '058': ['gtbank', 'gtb', 'guarantytrustbank', 'guarantytrust', 'guarantytrustbankplc'],
  '011': ['firstbank', 'firstbanknigeria', 'firstbankofnigeria', 'first'],
  '033': ['unitedbankforafrica', 'uba'],
  '057': ['zenithbank', 'zenith'],
  '070': ['fidelitybank', 'fidelity'],
  '032': ['unionbank', 'unionbankofnigeria', 'union'],
  '035': ['wemabank', 'wema', 'alatbywema', 'alat'],
  '232': ['sterlingbank', 'sterling'],
  '221': ['stanbicibtcbank', 'stanbicibtc', 'stanbic'],
  '214': ['firstcitymonumentbank', 'fcmb'],
  '050': ['ecobank', 'ecobanknigeria'],
  '076': ['polarisbank', 'polaris'],
  '215': ['unitybank', 'unity'],
  '082': ['keystonebank', 'keystone'],
  '101': ['providusbank', 'providus'],
  '301': ['jaizbank', 'jaiz'],
  '100': ['suntrustbank', 'suntrust'],
  '068': ['standardcharteredbank', 'standardchartered', 'scb'],
  '023': ['citibank', 'citi'],
  '030': ['heritagebank', 'heritage'],
  '106': ['signaturebank', 'signature'],
  '50211': ['kuda', 'kudabank', 'kudamfb'],
  '999992': ['opay', 'opaydigital', 'paycom'],
  '999991': ['palmpay', 'palmpaylimited'],
  '50515': ['moniepoint', 'moniepointmfb', 'teamapt'],
};

async function getBanks(): Promise<PaystackBank[]> {
  if (bankCache && Date.now() - bankCache.at < BANK_CACHE_MS) return bankCache.banks;
  const banks = await listBanks('NGN');
  bankCache = { at: Date.now(), banks };
  return banks;
}

/** Match a typed bank name to a Paystack bank code. */
export async function resolveBankCode(bankName: string): Promise<BankCode | null> {
  const target = normalize(bankName);
  if (!target) return null;

  let banks: PaystackBank[] = [];
  try {
    banks = await getBanks();
  } catch (err) {
    console.warn('[payout] could not load Paystack bank list, using aliases', err);
  }

  const exact = banks.find((bank) => normalize(bank.name) === target);
  if (exact) return { code: exact.code, name: exact.name };

  const partial = banks.find((bank) => {
    const name = normalize(bank.name);
    return name.includes(target) || target.includes(name);
  });
  if (partial) return { code: partial.code, name: partial.name };

  for (const [code, aliases] of Object.entries(BANK_ALIASES)) {
    if (!aliases.includes(target)) continue;
    const match = banks.find((bank) => bank.code === code);
    return { code, name: match?.name || bankName };
  }

  return null;
}

export type PayoutOutcome =
  | { kind: 'paid'; reference: string; transferCode: string; accountName: string }
  | {
      kind: 'pending';
      reference: string;
      transferCode: string;
      accountName: string;
      transferStatus: string;
    }
  | {
      kind: 'error';
      message: string;
      retryable: boolean;
      reference?: string;
      transferCode?: string;
      transferStatus?: string;
    };

/** Paystack transfer states that mean "money is on its way, do not re-send". */
export function transferIsSettled(status: string): boolean {
  return status === 'success';
}

export function transferIsPending(status: string): boolean {
  return ['pending', 'queued', 'processing', 'received'].includes(status);
}

export function transferFailed(status: string): boolean {
  return ['failed', 'reversed', 'abandoned'].includes(status);
}

export function transferNeedsOtp(status: string): boolean {
  return status === 'otp';
}

/**
 * Create a recipient and initiate a transfer. Never marks the withdrawal paid:
 * the caller persists the returned state and only flips to `paid` on `success`.
 */
export async function sendSellerPayout(input: {
  bankName: string;
  bankCode?: string | null;
  accountNumber: string;
  accountName: string;
  amountKobo: number;
  reference: string;
}): Promise<PayoutOutcome> {
  const bank = input.bankCode
    ? { code: input.bankCode, name: input.bankName }
    : await resolveBankCode(input.bankName);

  if (!bank) {
    return {
      kind: 'error',
      retryable: false,
      reference: input.reference,
      transferStatus: 'not-started',
      message: `Could not match "${input.bankName}" to a Paystack bank. Ask the seller to re-enter their bank from the default list.`,
    };
  }

  if (!Number.isSafeInteger(input.amountKobo) || input.amountKobo <= 0) {
    return {
      kind: 'error',
      retryable: false,
      reference: input.reference,
      transferStatus: 'not-started',
      message: 'Invalid payout amount.',
    };
  }

  // Resolve the account name so Paystack receives the name on the account, not
  // a typo from the request. Failure is non-fatal: keep the seller's spelling.
  let accountName = input.accountName;
  try {
    const resolved = await resolveAccountNumber(input.accountNumber, bank.code);
    if (resolved?.account_name) accountName = resolved.account_name;
  } catch (err) {
    console.warn('[payout] account resolution failed, using provided name', err);
  }

  let recipientCode: string;
  try {
    const recipient = await createTransferRecipient({
      name: accountName,
      accountNumber: input.accountNumber,
      bankCode: bank.code,
    });
    recipientCode = recipient.recipient_code;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create the Paystack recipient.';
    return {
      kind: 'error',
      retryable: true,
      reference: input.reference,
      transferStatus: 'not-started',
      message,
    };
  }

  let transfer: PaystackTransfer;
  try {
    transfer = await initiateTransfer({
      amountKobo: input.amountKobo,
      recipientCode,
      reference: input.reference,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Paystack rejected the transfer.';
    // A duplicate reference means the transfer already exists; verify it.
    try {
      transfer = await verifyTransfer(input.reference);
    } catch {
      return {
        kind: 'error',
        retryable: true,
        reference: input.reference,
        transferStatus: 'unknown',
        message,
      };
    }
  }

  // The initiate response is occasionally `pending` even when the money has
  // already landed, so verify once before reporting.
  let status = transfer.status;
  if (status !== 'success' && status !== 'failed' && status !== 'reversed') {
    try {
      const verified = await verifyTransfer(input.reference);
      status = verified.status;
      transfer = { ...transfer, ...verified };
    } catch {
      /* keep the initiate status */
    }
  }

  if (status === 'success') {
    return {
      kind: 'paid',
      reference: input.reference,
      transferCode: transfer.transfer_code,
      accountName,
    };
  }

  if (transferIsPending(status)) {
    return {
      kind: 'pending',
      reference: input.reference,
      transferCode: transfer.transfer_code,
      transferStatus: status,
      accountName,
    };
  }

  return {
    kind: 'error',
    retryable: status !== 'otp',
    reference: input.reference,
    transferCode: transfer.transfer_code,
    transferStatus: status,
    message:
      status === 'otp'
        ? 'Paystack requires a transfer OTP. Disable transfer OTP in the Paystack dashboard, then retry.'
        : `Paystack returned transfer status "${status}". Retry after checking the Paystack dashboard.`,
  };
}

export { verifyTransfer };
