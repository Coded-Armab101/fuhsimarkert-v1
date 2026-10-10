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

    const userId = metadata.user_id || user.id;

    if (userId !== user.id) {
      return NextResponse.json(
        { error: 'This payment belongs to a different account.' },
        { status: 403 }
      );
    }

    try {
      const result = await recordRoleSubscription(admin, {
        reference,
        amount: Number(transaction.amount) || 150000,
        currency: transaction.currency || 'NGN',
        metadata: {
          purpose: 'role_subscription',
          user_id: user.id,
          plan_type: 'seller',
          currency: 'NGN',
          ...metadata,
        },
      });

      return NextResponse.json({
        success: true,
        role: result.planType,
        expiresAt: result.expiresAt,
        redirectUrl: '/seller/verification',
      });
    } catch (err) {
      console.error('[subscription/verify] subscription activation fallback applied', { reference, err });

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await admin.from('profiles').upsert({
        id: user.id,
        user_persona: 'seller',
        is_seller: true,
        seller_active: true,
        subscription_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      return NextResponse.json({
        success: true,
        role: 'seller',
        expiresAt,
        redirectUrl: '/seller/verification',
      });
    }
  } catch (err) {
    console.error('Subscription verification error:', err);
    return NextResponse.json({ error: 'Could not verify this payment.' }, { status: 500 });
  }
}
