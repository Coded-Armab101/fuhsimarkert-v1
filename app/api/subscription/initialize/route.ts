import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ROLE_PLANS, isRolePlan } from '@/utils/plans';
import { rateLimit, PAYMENT_INIT_LIMIT } from '@/utils/rate-limit';

/**
 * Starts a role subscription payment.
 *
 * The amount and the plan metadata are set HERE (server side) so the browser
 * cannot pay a smaller amount and claim a higher role. The client only receives
 * an access_code, which it hands to Paystack Inline via resumeTransaction().
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.email) {
      return NextResponse.json({ error: 'You must be signed in to subscribe.' }, { status: 401 });
    }

    const limit = rateLimit({ key: `subscription-init:${user.id}`, ...PAYMENT_INIT_LIMIT });
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many payment attempts. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const planType = body?.planType;

    if (!isRolePlan(planType)) {
      return NextResponse.json({ error: 'Unknown subscription plan.' }, { status: 400 });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Payments are not configured on the server (missing PAYSTACK_SECRET_KEY).' },
        { status: 500 }
      );
    }

    const plan = ROLE_PLANS[planType];

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        amount: plan.amount,
        currency: 'NGN',
        metadata: {
          purpose: 'role_subscription',
          user_id: user.id,
          plan_type: planType,
          custom_fields: [
            { display_name: 'Plan', variable_name: 'plan_type', value: plan.label },
          ],
        },
      }),
    });

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status || !paystackData.data?.access_code) {
      console.error('Paystack initialize failed:', paystackData);
      // Don't forward Paystack's message — it can echo account/config detail.
      return NextResponse.json(
        { error: 'Could not start the payment session.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      accessCode: paystackData.data.access_code,
      reference: paystackData.data.reference,
      amount: plan.amount,
    });
  } catch (err) {
    console.error('Subscription initialize error:', err);
    return NextResponse.json({ error: 'Could not start the payment session.' }, { status: 500 });
  }
}
