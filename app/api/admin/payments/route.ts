import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  productEscrowRef,
  recordOrder,
  type RecordOrderInput,
  type RecordOrderLine,
} from '@/utils/paystack/recordOrder';
import { buyerServiceFeeKobo } from '@/utils/pricing';
import { notifyUsers } from '@/utils/notifications';

/**
 * Admin-only recovery for a buyer who paid but whose order never appeared.
 *
 * The browser verify route cannot be reused: it requires the buyer's cookie and
 * insists the Paystack metadata buyer_id matches that cookie. This route is
 * authenticated as an administrator and works from the frozen checkout attempt
 * written by `/api/paystack` BEFORE Paystack was initialised.
 *
 * Two paths:
 *  - `recheck`: ask Paystack to verify the reference. Only a real successful
 *    transaction with a matching buyer, amount, currency and purpose is recorded.
 *  - `confirm_manual`: last-resort override after an operator checked the bank
 *    transfer receipt. Requires an evidence note and an explicit attestation.
 *
 * Both paths are idempotent: recordOrder is keyed on the reference, a conditional
 * status update makes confirmation a single-winner claim, and every action is
 * written to an append-only audit table.
 */

type AttemptStatus = 'initialized' | 'initialize_failed' | 'confirmed_paystack' | 'confirmed_manual';

type ParsedAttempt = {
  reference: string;
  buyerId: string;
  buyerEmail: string | null;
  status: AttemptStatus;
  productIds: string[];
  items: RecordOrderLine[];
  expectedTotalKobo: number;
  gatewayPrincipalKobo: number;
  processingFeeKobo: number;
  gatewayChargeKobo: number;
  walletKobo: number;
  deliveryType: 'pickup' | 'delivery';
  deliveryFeeKobo: number;
  buyerFeeKobo: number;
  receiverName: string | null;
  receiverPhone: string | null;
  matricNumber: string | null;
  deliveryAddress: string | null;
  createdAt: string;
};

type RecoveryCheck = {
  reference: string;
  items: RecordOrderLine[];
  deliveryFeeKobo: number;
  buyerFeeKobo: number;
};

type AdminContext =
  | { admin: SupabaseClient; user: { id: string } }
  | { error: string; status: number };

const CONFIRMED: AttemptStatus[] = ['confirmed_paystack', 'confirmed_manual'];
const OPEN: AttemptStatus[] = ['initialized', 'initialize_failed'];

function text(value: unknown, max = 1000): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function int(value: unknown): number {
  return Number(value);
}

function validInt(value: number, min = 0): boolean {
  return Number.isSafeInteger(value) && value >= min;
}

function parseAttempt(row: Record<string, unknown>): ParsedAttempt | null {
  const reference = text(row.reference, 200);
  const buyerId = text(row.buyer_id, 200);
  if (!reference || !buyerId || !/^[A-Za-z0-9_-]{1,200}$/.test(reference)) return null;

  const rawProductIds = row.product_ids;
  const rawItems = row.checkout_items;
  if (!Array.isArray(rawProductIds) || !Array.isArray(rawItems)) return null;

  const productIds = rawProductIds.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
  if (productIds.length !== rawProductIds.length || new Set(productIds).size !== productIds.length) {
    return null;
  }

  const items: RecordOrderLine[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;
    const productId = text(item.product_id, 200);
    if (!productId) return null;
    const quantity = int(item.quantity);
    const unitPriceKobo = int(item.unit_price_kobo);
    if (!validInt(quantity, 1) || !validInt(unitPriceKobo, 0)) return null;
    items.push({
      productId,
      variantKey: typeof item.variant_key === 'string' ? item.variant_key : '',
      size: text(item.size, 100),
      color: text(item.color, 100),
      quantity,
      unitPriceKobo,
    });
  }

  const lineKeys = items.map((item) => `${item.productId}::${item.variantKey}`);
  if (items.length === 0 || new Set(lineKeys).size !== items.length) return null;
  if (new Set(items.map((item) => item.productId)).size !== productIds.length) return null;
  if (items.some((item) => !productIds.includes(item.productId))) return null;

  const status = text(row.status, 40);
  const deliveryType = row.delivery_type === 'delivery'
    ? 'delivery'
    : row.delivery_type === 'pickup'
      ? 'pickup'
      : null;
  if (!status || !CONFIRMED.includes(status as AttemptStatus) && !OPEN.includes(status as AttemptStatus)) {
    return null;
  }
  if (!deliveryType) return null;

  const expectedTotalKobo = int(row.expected_total_kobo);
  const gatewayPrincipalKobo = int(row.gateway_principal_kobo);
  const processingFeeKobo = int(row.processing_fee_kobo);
  const gatewayChargeKobo = int(row.gateway_charge_kobo);
  const walletKobo = int(row.wallet_kobo ?? 0);
  const deliveryFeeKobo = int(row.delivery_fee_kobo ?? 0);
  const buyerFeeKobo = int(row.buyer_fee_kobo ?? 0);

  if (!validInt(expectedTotalKobo, 1) || !validInt(gatewayPrincipalKobo, 1) ||
      !validInt(processingFeeKobo, 0) || !validInt(gatewayChargeKobo, 1) ||
      !validInt(walletKobo, 0) || !validInt(deliveryFeeKobo, 0) || !validInt(buyerFeeKobo, 0)) {
    return null;
  }

  const goodsKobo = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceKobo,
    0,
  );
  if (!Number.isSafeInteger(goodsKobo) || goodsKobo <= 0) return null;
  if (goodsKobo + deliveryFeeKobo + buyerFeeKobo !== expectedTotalKobo ||
      gatewayPrincipalKobo + walletKobo !== expectedTotalKobo ||
      gatewayChargeKobo !== gatewayPrincipalKobo + processingFeeKobo ||
      buyerFeeKobo !== buyerServiceFeeKobo(goodsKobo)) {
    return null;
  }

  return {
    reference,
    buyerId,
    buyerEmail: text(row.buyer_email, 320),
    status: status as AttemptStatus,
    productIds,
    items,
    expectedTotalKobo,
    gatewayPrincipalKobo,
    processingFeeKobo,
    gatewayChargeKobo,
    walletKobo,
    deliveryType,
    deliveryFeeKobo,
    buyerFeeKobo,
    receiverName: text(row.receiver_name, 200),
    receiverPhone: text(row.receiver_phone, 50),
    matricNumber: text(row.matric_number, 100),
    deliveryAddress: text(row.delivery_address, 500),
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

function toListItem(row: Record<string, unknown>) {
  const parsed = parseAttempt(row);
  return {
    reference: String(row.reference),
    buyer_id: String(row.buyer_id),
    buyer_email: text(row.buyer_email, 320),
    status: String(row.status),
    item_count: parsed?.items.length ?? 0,
    expected_total_kobo: Number(row.expected_total_kobo),
    gateway_charge_kobo: Number(row.gateway_charge_kobo),
    wallet_kobo: Number(row.wallet_kobo ?? 0),
    paystack_checked_at: text(row.paystack_checked_at, 40),
    confirmed_at: text(row.confirmed_at, 40),
    confirmed_by: text(row.confirmed_by, 200),
    confirmation_note: text(row.confirmation_note, 1000),
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

async function requireAdmin(): Promise<AdminContext> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: 'Unauthorized.', status: 401 };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.is_admin !== true) return { error: 'Forbidden.', status: 403 };
  return { admin, user: { id: user.id } };
}

/** Is every paid line AND its escrow ledger already present for this reference? */
async function isFullyRecorded(
  admin: SupabaseClient,
  check: RecoveryCheck,
): Promise<{ exists: boolean; orderId: string | null; complete: boolean }> {
  const { data: orders, error } = await admin
    .from('orders')
    .select('id, product_id, variant_key')
    .eq('order_ref', check.reference);
  if (error) throw error;

  const rows = orders ?? [];
  const expectedKeys = check.items.map((item) => `${item.productId}::${item.variantKey}`);
  const recordedKeys = new Set(
    rows.map((row) => `${row.product_id}::${(row.variant_key as string | null) ?? ''}`),
  );
  const completeOrders =
    rows.length === check.items.length && expectedKeys.every((key) => recordedKeys.has(key));

  let complete = completeOrders;
  if (complete) {
    const expectedEscrowRefs = [
      ...check.items.map((item) =>
        productEscrowRef(check.reference, item.productId, item.variantKey)),
      ...(check.deliveryFeeKobo > 0 ? [`${check.reference}:DELIVERY`] : []),
      ...(check.buyerFeeKobo > 0 ? [`${check.reference}:FEES`] : []),
    ];
    const { data: escrows, error: escrowError } = await admin
      .from('escrow_transactions')
      .select('gateway_ref')
      .in('gateway_ref', expectedEscrowRefs);
    if (escrowError) throw escrowError;
    const found = new Set((escrows ?? []).map((row) => row.gateway_ref));
    complete = expectedEscrowRefs.every((ref) => found.has(ref));
  }

  return { exists: rows.length > 0, orderId: rows[0]?.id ?? null, complete };
}

/**
 * recordOrder already tolerates webhook/verify races. Apply the same retry +
 * full-state check here so a partially recorded order is completed, not paid
 * twice. Throws only when the order is genuinely still missing.
 */
async function recordWithRecovery(admin: SupabaseClient, input: RecordOrderInput): Promise<void> {
  const check: RecoveryCheck = {
    reference: input.reference,
    items: input.items,
    deliveryFeeKobo: input.deliveryFeeKobo,
    buyerFeeKobo: buyerServiceFeeKobo(
      input.items.reduce((sum, item) => sum + item.quantity * item.unitPriceKobo, 0),
    ),
  };
  try {
    await recordOrder(admin, input);
    return;
  } catch (first) {
    try {
      await recordOrder(createAdminClient(), input);
      return;
    } catch (retry) {
      const state = await isFullyRecorded(admin, check);
      if (state.complete) return;
      console.error('[admin/payments] order recording failed', {
        reference: input.reference,
        first: first instanceof Error ? first.message : String(first),
        retry: retry instanceof Error ? retry.message : String(retry),
      });
      throw first;
    }
  }
}

/** Conditional update: only one admin can move a still-open attempt forward. */
async function claimAttempt(
  admin: SupabaseClient,
  attempt: ParsedAttempt,
  status: Extract<AttemptStatus, 'confirmed_paystack' | 'confirmed_manual'>,
  actorId: string,
  note: string | null,
  paystackStatus: string | null,
): Promise<boolean> {
  const { data, error } = await admin
    .from('checkout_attempts')
    .update({
      status,
      confirmed_at: new Date().toISOString(),
      confirmed_by: actorId,
      confirmation_note: note,
      paystack_status: paystackStatus,
    })
    .eq('reference', attempt.reference)
    .in('status', OPEN)
    .select('reference');
  if (error) throw error;
  return Boolean(data?.length);
}

async function writeAudit(
  admin: SupabaseClient,
  input: {
    reference: string;
    actorId: string;
    eventType: 'recheck_success' | 'recheck_failed' | 'manual_confirmed' | 'already_recorded';
    note: string | null;
    paystackStatus: string | null;
  },
): Promise<void> {
  const { error } = await admin.from('manual_payment_confirmation_events').insert({
    attempt_reference: input.reference,
    actor_id: input.actorId,
    actor_role: 'admin',
    event_type: input.eventType,
    note: input.note,
    paystack_status: input.paystackStatus,
  });
  if (error) console.error('[admin/payments] audit write failed', error.message);
}

export async function GET() {
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const { data, error } = await ctx.admin
      .from('checkout_attempts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ attempts: (data ?? []).map((row) => toListItem(row)) });
  } catch (error) {
    console.error('[admin/payments] list failed', error);
    return NextResponse.json({ error: 'Could not load payment attempts.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const action = body.action === 'recheck' || body.action === 'confirm_manual'
    ? body.action
    : null;
  const reference = text(body.reference, 200);
  const note = text(body.note, 1000) ?? '';
  const attested = body.attested === true;
  if (!action || !reference || !/^[A-Za-z0-9_-]{1,200}$/.test(reference)) {
    return NextResponse.json(
      { error: 'A valid action and transaction reference are required.' },
      { status: 400 },
    );
  }
  if (action === 'confirm_manual' && (note.length < 10 || !attested)) {
    return NextResponse.json(
      { error: 'Manual confirmation requires an evidence note of at least 10 characters and an attestation.' },
      { status: 400 },
    );
  }

  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { admin, user } = ctx;

  try {
    const { data: row, error: attemptError } = await admin
      .from('checkout_attempts')
      .select('*')
      .eq('reference', reference)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!row) return NextResponse.json({ error: 'Payment attempt not found.' }, { status: 404 });

    const attempt = parseAttempt(row as Record<string, unknown>);
    if (!attempt) {
      return NextResponse.json({ error: 'The stored payment snapshot is invalid.' }, { status: 400 });
    }
    if (CONFIRMED.includes(attempt.status)) {
      return NextResponse.json(
        { error: 'This payment has already been confirmed. No further action is needed.' },
        { status: 409 },
      );
    }

    const existing = await isFullyRecorded(admin, attempt);
    if (existing.complete) {
      const claimed = await claimAttempt(
        admin,
        attempt,
        action === 'confirm_manual' ? 'confirmed_manual' : 'confirmed_paystack',
        user.id,
        'Orders were already fully recorded when support reviewed this attempt.',
        null,
      );
      await writeAudit(admin, {
        reference: attempt.reference,
        actorId: user.id,
        eventType: 'already_recorded',
        note: 'Order and escrow rows already existed; no money was moved by this action.',
        paystackStatus: null,
      });
      return NextResponse.json({ ok: true, alreadyRecorded: true, claimed });
    }

    let providerFeeKobo = 0;
    let paymentChannel: string | null = null;
    let paidAt: string | null = null;
    let paystackStatus = '';
    let confirmedStatus: 'confirmed_paystack' | 'confirmed_manual';

    if (action === 'recheck') {
      const paystackReply = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(attempt.reference)}`,
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } },
      );
      const payload = await paystackReply.json();
      if (!payload?.status || !payload?.data) {
        return NextResponse.json({ ok: false, message: 'Paystack could not be reached. Try again shortly.' });
      }

      const transaction = payload.data as Record<string, unknown>;
      paystackStatus = text(transaction.status, 40) || 'unknown';
      await admin
        .from('checkout_attempts')
        .update({
          paystack_checked_at: new Date().toISOString(),
          paystack_status: paystackStatus,
        })
        .eq('reference', attempt.reference);

      if (transaction.status !== 'success') {
        await writeAudit(admin, {
          reference: attempt.reference,
          actorId: user.id,
          eventType: 'recheck_failed',
          note: `Paystack reported: ${paystackStatus}`,
          paystackStatus,
        });
        return NextResponse.json({
          ok: false,
          status: paystackStatus,
          message: `Paystack still reports this payment as ${paystackStatus}. Ask the buyer to confirm the transfer before using manual verification.`,
        });
      }

      let meta: Record<string, unknown> = {};
      try {
        const rawMeta = transaction.metadata;
        meta = typeof rawMeta === 'string'
          ? JSON.parse(rawMeta || '{}')
          : (rawMeta as Record<string, unknown>) || {};
      } catch {
        return NextResponse.json({ error: 'Paystack returned invalid metadata.' }, { status: 400 });
      }

      if (text(meta.buyer_id, 200) !== attempt.buyerId ||
          meta.purpose !== 'marketplace_checkout' ||
          meta.currency !== 'NGN' ||
          text(transaction.reference, 200) !== attempt.reference ||
          transaction.currency !== 'NGN' ||
          int(transaction.amount) !== attempt.gatewayChargeKobo) {
        console.error('[admin/payments] recheck integrity mismatch', { reference: attempt.reference });
        return NextResponse.json(
          { error: 'The Paystack transaction does not match this checkout attempt.' },
          { status: 400 },
        );
      }

      providerFeeKobo = Math.max(0, Math.floor(int(transaction.fees) || 0));
      if (!Number.isSafeInteger(providerFeeKobo) ||
          providerFeeKobo > attempt.processingFeeKobo ||
          attempt.gatewayChargeKobo - providerFeeKobo < attempt.gatewayPrincipalKobo) {
        return NextResponse.json(
          { error: 'Paystack reported an unexpected processing fee for this transaction.' },
          { status: 400 },
        );
      }
      paymentChannel = text(transaction.channel, 100);
      paidAt = text(transaction.paid_at, 40);
      confirmedStatus = 'confirmed_paystack';
    } else {
      paystackStatus = 'manual_confirmation';
      paymentChannel = 'manual_bank_transfer';
      paidAt = new Date().toISOString();
      confirmedStatus = 'confirmed_manual';
    }

    const input: RecordOrderInput = {
      buyerId: attempt.buyerId,
      reference: attempt.reference,
      productIds: attempt.productIds,
      items: attempt.items,
      deliveryType: attempt.deliveryType,
      deliveryFeeKobo: attempt.deliveryFeeKobo,
      receiverName: attempt.receiverName,
      receiverPhone: attempt.receiverPhone,
      matricNumber: attempt.matricNumber,
      deliveryAddress: attempt.deliveryAddress,
      walletKobo: attempt.walletKobo,
      gatewayAmountKobo: attempt.gatewayPrincipalKobo,
      gatewayGrossKobo: attempt.gatewayChargeKobo,
      processingFeeKobo: attempt.processingFeeKobo,
      // A manual override has no provider fee evidence; record zero rather than
      // inventing a Paystack fee. The evidence note makes this auditable.
      providerFeeKobo,
      paymentChannel,
      paidAt,
    };

    await recordWithRecovery(admin, input);

    const won = await claimAttempt(
      admin,
      attempt,
      confirmedStatus,
      user.id,
      action === 'confirm_manual'
        ? note
        : `Paystack recheck confirmed (${paystackStatus}).`,
      paystackStatus,
    );
    await writeAudit(admin, {
      reference: attempt.reference,
      actorId: user.id,
      eventType: won
        ? action === 'confirm_manual' ? 'manual_confirmed' : 'recheck_success'
        : 'already_recorded',
      note: won
        ? note || `Paystack recheck confirmed (${paystackStatus}).`
        : 'Another confirmation completed this attempt first.',
      paystackStatus,
    });

    if (won && !existing.exists) {
      const finalState = await isFullyRecorded(admin, attempt);
      if (finalState.orderId) {
        try {
          await notifyUsers(admin, {
            userIds: [attempt.buyerId],
            orderId: finalState.orderId,
            type: 'payment_verified_by_support',
            title: 'Payment verified',
            message: 'Support verified your payment. Your order is now safely held in escrow.',
            url: '/buyer/orders',
          });
        } catch (notifyError) {
          console.warn('[admin/payments] buyer notification failed', notifyError);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      alreadyRecorded: !won,
      status: won ? confirmedStatus : attempt.status,
      message: won
        ? action === 'confirm_manual'
          ? 'Payment confirmed manually. The buyer’s order is now in escrow.'
          : 'Paystack confirmed the payment. The buyer’s order is now in escrow.'
        : 'This attempt had already been confirmed by another action.',
    });
  } catch (error) {
    console.error('[admin/payments] action failed', error);
    return NextResponse.json({ error: 'Could not process this payment action.' }, { status: 500 });
  }
}
