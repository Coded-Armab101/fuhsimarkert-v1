
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { recordRoleSubscription } from '@/utils/paystack/recordSubscription';

/**
 * Confirms a role subscription payment and activates the role.
 *
 * Called from the Paystack Inline onSuccess callback.
 * The transaction is verified directly against Paystack before
 * the subscription is recorded and activated.
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
      return NextResponse.json(
        { error: 'You must be signed in to subscribe.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const reference =
      typeof body?.reference === 'string'
        ? body.reference.trim()
        : '';

    if (!reference) {
      return NextResponse.json(
        { error: 'Missing transaction reference.' },
        { status: 400 }
      );
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        {
          error:
            'Payments are not configured on the server (missing PAYSTACK_SECRET_KEY).',
        },
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

    if (
      !paystackResponse.ok ||
      paystackData?.status !== true ||
      transaction?.status !== 'success'
    ) {
      console.error(
        '[subscription/verify] Paystack verification failed:',
        paystackData
      );

      return NextResponse.json(
        {
          error:
            'Paystack could not confirm this payment as successful.',
        },
        { status: 400 }
      );
    }

    // Paystack may return metadata as a JSON string.
    let metadata: Record<string, any>;

    try {
      metadata =
        typeof transaction.metadata === 'string'
          ? JSON.parse(transaction.metadata || '{}')
          : transaction.metadata || {};
    } catch {
      return NextResponse.json(
        { error: 'Invalid payment metadata.' },
        { status: 400 }
      );
    }

    const userId = metadata.user_id;

    if (!userId || userId !== user.id) {
      return NextResponse.json(
        { error: 'This payment does not belong to your account.' },
        { status: 403 }
      );
    }

    // Verify the payment is for the expected subscription.
    if (metadata.purpose !== 'role_subscription') {
      return NextResponse.json(
        { error: 'This payment is not a valid role subscription.' },
        { status: 400 }
      );
    }

    if (metadata.plan_type !== 'seller') {
      return NextResponse.json(
        { error: 'Invalid subscription plan.' },
        { status: 400 }
      );
    }

    // Never activate a subscription using an assumed amount.
    // Paystack reports transaction.amount in the smallest currency unit.
    const expectedAmount = 150000;

    if (
      transaction.currency !== 'NGN' ||
      Number(transaction.amount) !== expectedAmount
    ) {
      return NextResponse.json(
        { error: 'The payment amount or currency is incorrect.' },
        { status: 400 }
      );
    }

    // Record the verified payment and activate the subscription.
    // If this fails, return an error instead of granting access
    // without a confirmed subscription record.
    const result = await recordRoleSubscription(admin, {
      reference,
      amount: Number(transaction.amount),
      currency: transaction.currency,
      metadata: {
        ...metadata,
        purpose: 'role_subscription',
        user_id: user.id,
        plan_type: 'seller',
        currency: 'NGN',
      },
    });

    return NextResponse.json({
      success: true,
      role: result.planType,
      expiresAt: result.expiresAt,
      redirectUrl: '/seller/verification',
    });
  } catch (err) {
    console.error(
      '[subscription/verify] Subscription verification error:',
      err
    );

    return NextResponse.json(
      { error: 'Could not verify or activate this subscription.' },
      { status: 500 }
    );
  }
}

