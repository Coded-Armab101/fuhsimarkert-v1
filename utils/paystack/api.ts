/**
 * Minimal, dependency-free Paystack REST client.
 *
 * Used by the refund path (card refunds) and the payout path (transfers). The
 * secret key is read from PAYSTACK_SECRET_KEY and never leaves the server.
 */

const PAYSTACK_BASE = 'https://api.paystack.co';

export function paystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

type PaystackEnvelope<T> = {
  status: boolean;
  message?: string;
  data?: T;
};

export class PaystackRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'PaystackRequestError';
  }
}

async function paystackRequest<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not configured');

  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: init.method || 'GET',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });

  const json = (await res.json().catch(() => ({}))) as PaystackEnvelope<T>;
  if (!res.ok || json.status === false || json.data === undefined) {
    throw new PaystackRequestError(
      json.message || `Paystack request failed (${res.status})`,
      res.status,
    );
  }
  return json.data;
}

export type PaystackTransaction = {
  id: number;
  reference: string;
  status: 'success' | 'failed' | 'abandoned' | string;
  amount: number;
  currency: string;
  channel?: string | null;
  paid_at?: string | null;
  customer?: { email?: string | null } | null;
  metadata?: Record<string, unknown> | null;
};

export type PaystackBank = {
  id: number;
  name: string;
  slug: string;
  code: string;
  currency: string;
  active?: boolean;
  type?: string;
};

export type PaystackRecipient = {
  recipient_code: string;
  name: string;
  account_number: string;
  bank_code?: string | null;
  currency: string;
};

export type PaystackTransfer = {
  id: number;
  transfer_code: string;
  reference: string;
  amount: number;
  status: 'pending' | 'success' | 'failed' | 'reversed' | 'otp' | 'queued' | 'processing' | 'abandoned' | string;
  currency: string;
  reason?: string | null;
};

export type PaystackRefund = {
  id: number;
  status: string;
  amount: number;
  currency: string;
  reference?: string | null;
  transaction?: { reference?: string | null; id?: number | null } | null;
};

export async function verifyTransaction(reference: string): Promise<PaystackTransaction> {
  return paystackRequest<PaystackTransaction>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
}

export async function listBanks(currency = 'NGN'): Promise<PaystackBank[]> {
  return paystackRequest<PaystackBank[]>(
    `/bank?currency=${encodeURIComponent(currency)}&perPage=200`,
  );
}

export async function resolveAccountNumber(
  accountNumber: string,
  bankCode: string,
): Promise<{ account_number: string; account_name: string }> {
  return paystackRequest(
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
  );
}

export async function createTransferRecipient(input: {
  name: string;
  accountNumber: string;
  bankCode: string;
  currency?: string;
}): Promise<PaystackRecipient> {
  return paystackRequest<PaystackRecipient>('/transferrecipient', {
    method: 'POST',
    body: {
      type: 'nuban',
      name: input.name,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: input.currency || 'NGN',
    },
  });
}

export async function initiateTransfer(input: {
  amountKobo: number;
  recipientCode: string;
  reference: string;
  reason?: string;
}): Promise<PaystackTransfer> {
  return paystackRequest<PaystackTransfer>('/transfer', {
    method: 'POST',
    body: {
      source: 'balance',
      amount: input.amountKobo,
      recipient: input.recipientCode,
      reference: input.reference,
      reason: input.reason || 'FuhsiMarket seller payout',
    },
  });
}

export async function verifyTransfer(reference: string): Promise<PaystackTransfer> {
  return paystackRequest<PaystackTransfer>(`/transfer/verify/${encodeURIComponent(reference)}`);
}

export async function refundTransaction(input: {
  reference: string;
  amountKobo?: number;
  refundReference: string;
}): Promise<PaystackRefund> {
  return paystackRequest<PaystackRefund>('/refund', {
    method: 'POST',
    body: {
      transaction: input.reference,
      reference: input.refundReference,
      ...(Number.isSafeInteger(input.amountKobo) && (input.amountKobo as number) > 0
        ? { amount: input.amountKobo }
        : {}),
    },
  });
}

export async function fetchRefund(reference: string): Promise<PaystackRefund> {
  return paystackRequest<PaystackRefund>(`/refund/${encodeURIComponent(reference)}`);
}
