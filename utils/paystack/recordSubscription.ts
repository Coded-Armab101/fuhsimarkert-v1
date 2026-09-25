import type { SupabaseClient } from '@supabase/supabase-js';
import { ROLE_PLANS, isRolePlan, PLAN_DURATION_DAYS } from '@/utils/plans';

export type RoleSubscriptionTransaction = {
  reference: string;
  amount: number;
  currency?: string;
  metadata?: unknown;
};

/**
 * Idempotently activates a paid role subscription.
 * Only call this after the Paystack webhook signature / API verification has
 * established that the transaction is genuinely successful.
 */
export async function recordRoleSubscription(
  admin: SupabaseClient,
  transaction: RoleSubscriptionTransaction,
): Promise<{ userId: string; planType: keyof typeof ROLE_PLANS; expiresAt: string; alreadyRecorded: boolean }> {
  const reference = transaction.reference.trim();
  if (!reference || !Number.isSafeInteger(Number(transaction.amount)) || Number(transaction.amount) <= 0) {
    throw new Error('invalid subscription transaction');
  }

  const metadata = typeof transaction.metadata === 'string'
    ? JSON.parse(transaction.metadata || '{}')
    : (transaction.metadata || {}) as Record<string, unknown>;
  const userId = typeof metadata.user_id === 'string' ? metadata.user_id : '';
  const planType = metadata.plan_type;

  if (!userId || metadata.purpose !== 'role_subscription' || metadata.currency !== 'NGN' || !isRolePlan(planType)) {
    throw new Error('invalid subscription metadata');
  }
  if (transaction.currency !== 'NGN' || Number(transaction.amount) < ROLE_PLANS[planType].amount) {
    throw new Error('subscription payment amount mismatch');
  }

  const { data: existing, error: existingError } = await admin
    .from('subscriptions')
    .select('user_id, plan_type, expires_at')
    .eq('reference', reference)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    if (existing.user_id !== userId) throw new Error('subscription reference belongs to another account');
    return {
      userId,
      planType: existing.plan_type as keyof typeof ROLE_PLANS,
      expiresAt: existing.expires_at,
      alreadyRecorded: true,
    };
  }

  const expiresAt = new Date(Date.now() + PLAN_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Insert the immutable payment ledger first. The unique reference prevents
  // webhook + browser verification races from activating twice.
  const { error: ledgerError } = await admin.from('subscriptions').insert({
    user_id: userId,
    reference,
    plan_type: planType,
    amount_kobo: Number(transaction.amount),
    expires_at: expiresAt,
  });
  if (ledgerError) {
    // A concurrent verifier may have won the unique-reference race.
    const { data: raced } = await admin.from('subscriptions')
      .select('user_id, plan_type, expires_at')
      .eq('reference', reference)
      .maybeSingle();
    if (raced && raced.user_id === userId) {
      return { userId, planType: raced.plan_type as keyof typeof ROLE_PLANS, expiresAt: raced.expires_at, alreadyRecorded: true };
    }
    throw ledgerError;
  }

  const { error: profileError } = await admin.from('profiles').upsert({
    id: userId,
    user_persona: planType,
    is_seller: true,
    seller_active: true,
    subscription_expires_at: expiresAt,
    is_approved_seller: false,
    verification_status: 'pending',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (profileError) throw profileError;

  return { userId, planType, expiresAt, alreadyRecorded: false };
}
