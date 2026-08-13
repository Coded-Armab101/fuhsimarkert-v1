import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { reference, userId, expiresAt } = await req.json();

    if (!reference || !userId) {
      return NextResponse.json(
        { error: 'Missing required reference or userId.' },
        { status: 400 }
      );
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    // 1. Verify directly with Paystack API
    if (secretKey) {
      const paystackRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const paystackData = await paystackRes.json();

      if (!paystackRes.ok || paystackData.data?.status !== 'success') {
        console.error('Paystack verification failed:', paystackData);
        return NextResponse.json(
          { error: 'Payment verification failed at Paystack.' },
          { status: 400 }
        );
      }
    }

    // 2. Set subscription expiration date (30 days)
    const subscriptionEndDate = expiresAt
      ? new Date(expiresAt)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // 3. Update profile status in database
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        is_seller: true,
        seller_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Profile update error:', profileError);
    }

    // 4. Create/Update seller_subscriptions entry
    const { error: subError } = await supabaseAdmin
      .from('seller_subscriptions')
      .upsert({
        user_id: userId,
        paystack_reference: reference,
        status: 'active',
        expires_at: subscriptionEndDate.toISOString(),
        created_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (subError) {
      console.error('Subscription record error:', subError);
      // Fallback update directly to profiles table
      await supabaseAdmin
        .from('profiles')
        .update({
          subscription_expires_at: subscriptionEndDate.toISOString(),
        })
        .eq('id', userId);
    }

    return NextResponse.json({
      success: true,
      message: 'Seller subscription successfully activated!',
    });
  } catch (error: any) {
    console.error('Unhandled Verification Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}