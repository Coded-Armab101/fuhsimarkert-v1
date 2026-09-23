import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { recordRoleSubscription } from '@/utils/paystack/recordSubscription';

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

    if (metadata.user_id !== user.id) {
      return NextResponse.json(
        { error: 'This payment belongs to a different account.' },
        { status: 403 }
      );
    }

    if (metadata.purpose !== 'role_subscription' || metadata.currency !== 'NGN') {
      return NextResponse.json({ error: 'This payment is not a valid role subscription transaction.' }, { status: 400 });
    }

    try {
      const result = await recordRoleSubscription(admin, {
        reference,
        amount: Number(transaction.amount),
        currency: transaction.currency,
        metadata,
      });
      return NextResponse.json({ success: true, role: result.planType, expiresAt: result.expiresAt });
    } catch (err) {
      console.error('[subscription/verify] subscription activation failed', { reference, err });
      return NextResponse.json({ error: 'Payment was verified but the subscription could not be activated.' }, { status: 500 });
    }
  } catch (err) {
    console.error('Subscription verification error:', err);
    return NextResponse.json({ error: 'Could not verify this payment.' }, { status: 500 });
  }
}
