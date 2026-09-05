import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { ROLE_PLANS, isRolePlan, PLAN_DURATION_DAYS } from '@/utils/plans';

/**
 * Confirms a role subscription payment and activates the role.
 *
 * Called from the Paystack Inline `onSuccess` callback. The transaction is
 * re-checked against Paystack's API with the secret key, so a fabricated
 * reference cannot unlock a role. The plan is read from the transaction's
 * metadata, which was written server side during /api/subscription/initialize.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'You must be signed in to subscribe.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const reference = typeof body?.reference === 'string' ? body.reference.trim() : '';

    if (!reference) {
      return NextResponse.json({ error: 'Missing transaction reference.' }, { status: 400 });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Payments are not configured on the server (missing PAYSTACK_SECRET_KEY).' },
        { status: 500 }
      );
    }

    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );

    const paystackData = await paystackResponse.json();
    const transaction = paystackData?.data;

    if (!paystackResponse.ok || transaction?.status !== 'success') {
      console.error('Paystack verification failed:', paystackData);
      return NextResponse.json(
        { error: 'Paystack could not confirm this payment as successful.' },
        { status: 400 }
      );
    }

    // Paystack sometimes returns metadata as a JSON string.
    const metadata =
      typeof transaction.metadata === 'string'
        ? JSON.parse(transaction.metadata || '{}')
        : transaction.metadata || {};

    if (metadata.user_id && metadata.user_id !== user.id) {
      return NextResponse.json(
        { error: 'This payment belongs to a different account.' },
        { status: 403 }
      );
    }

    const planType = metadata.plan_type;

    if (!isRolePlan(planType)) {
      return NextResponse.json(
        { error: 'This payment is not linked to a role subscription.' },
        { status: 400 }
      );
    }

    if (Number(transaction.amount) < ROLE_PLANS[planType].amount) {
      return NextResponse.json(
        { error: 'Amount paid is below the price of this plan.' },
        { status: 400 }
      );
    }

    const expiresAt = new Date(
      Date.now() + PLAN_DURATION_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    // Activate the role first so a failure here leaves no ledger row behind; a
    // retry will then re-run this upsert cleanly. This MUST use the service-role
    // client: role-activation fields (is_seller, seller_active,
    // subscription_expires_at, is_approved_seller, verification_status) are
    // server-trusted and protected from self-editing by an RLS safety trigger.
    // Writing them with the user token would be rejected by that trigger.
    const { error: profileError } = await admin
      .from('profiles')
      .upsert(
        {
          id: user.id,
          user_persona: planType,
          is_seller: true,
          seller_active: true,
          subscription_expires_at: expiresAt,
          // A paid seller must complete identity verification before /seller
          // unlocks. Set pending here; the buyer profile shows the onboarding
          // form and an admin approves/rejects the submission.
          is_approved_seller: false,
          verification_status: 'pending',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (profileError) {
      console.error('Profile activation failed:', profileError);
      return NextResponse.json(
        { error: 'Payment confirmed but the role could not be saved. Contact support.' },
        { status: 500 }
      );
    }

    // FIX 5: record the payment in a `subscriptions` ledger, one entry per
    // unique Paystack reference, bound to THIS user. This stops the same paid
    // reference being replayed to activate another account or to extend a role.
    const { error: ledgerError } = await admin
      .from('subscriptions')
      .insert({
        user_id: user.id,
        reference,
        plan_type: planType,
        amount_kobo: Number(transaction.amount),
        expires_at: expiresAt,
      });

    if (ledgerError) {
      // UNIQUE(reference) collision -> this reference was already used, by this
      // user (benign retry) or by someone else (replay attempt). Reject the
      // replay; permit an idempotent retry only for the same paying user.
      const { data: existing } = await admin
        .from('subscriptions')
        .select('user_id')
        .eq('reference', reference)
        .maybeSingle();
      if (existing && existing.user_id !== user.id) {
        return NextResponse.json(
          { error: 'This payment reference was already used for another account.' },
          { status: 403 }
        );
      }
      // Same user retrying the same paid reference: benign, return success.
      return NextResponse.json({ success: true, role: planType, expiresAt });
    }

    return NextResponse.json({
      success: true,
      role: planType,
      expiresAt,
    });
  } catch (err) {
    console.error('Subscription verification error:', err);
    return NextResponse.json({ error: 'Could not verify this payment.' }, { status: 500 });
  }
}
