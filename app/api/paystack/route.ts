import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server'; // Assumes your helper is configured here

export async function POST(request: Request) {
  try {
    // 1. Establish secure, authenticated server-side session context
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized system access request.' }, { status: 401 });
    }

    // 2. Fetch the true database parameters for this user's current items
    const { data: cartItems, error: cartError } = await supabase
      .from('carts')
      .select(`
        product_id,
        products ( price )
      `)
      .eq('user_id', user.id);

    if (cartError || !cartItems || cartItems.length === 0) {
      return NextResponse.json({ error: 'Shopping cart ledger is empty.' }, { status: 400 });
    }

    // 3. Compute absolute pricing metrics in Kobo on the server side
    const trueTotalKobo = cartItems.reduce((acc, item: any) => {
      return acc + (item.products?.price || 0);
    }, 0);

    if (trueTotalKobo <= 0) {
      return NextResponse.json({ error: 'Invalid financial amount calculation.' }, { status: 400 });
    }

    // 4. Dispatch a hidden credentialed request to Paystack's API engine
    // Inside your app/api/paystack/route.ts POST function:
const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: user.email,
    amount: trueTotalKobo,
    callback_url: `${process.env.NEXT_PUBLIC_SITE_URL}/buyer/orders`,
    // ⚡ CRITICAL CRITERIA: This metadata structure maps the transaction assets
    metadata: {
      buyer_id: user.id,
      product_ids: cartItems.map((item: any) => item.product_id) // Array of IDs being purchased
    }
  }),
});

    const paystackData = await paystackResponse.json();

    if (!paystackData.status) {
      return NextResponse.json({ error: 'Failed to initialize system transaction with Paystack.' }, { status: 500 });
    }

    // Pass the secure authorization portal link back out to the UI
    return NextResponse.json({ authorization_url: paystackData.data.authorization_url });

  } catch (err) {
    return NextResponse.json({ error: 'Internal system gateway exception occurred.' }, { status: 500 });
  }
}