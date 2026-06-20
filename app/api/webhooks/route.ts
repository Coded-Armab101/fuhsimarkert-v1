import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    
    // 🔒 SECURITY CHECK: Verify the request genuinely came from Paystack's official system
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
      .update(rawBody)
      .digest('hex');
      
    if (hash !== request.headers.get('x-paystack-signature')) {
      return NextResponse.json({ error: 'Unauthorized signature bypass attempt.' }, { status: 401 });
    }

    const event = JSON.parse(rawBody);

    // Only proceed if the transaction event is officially successful
    if (event.event === 'charge.success') {
      const supabase = await createClient();
      const sessionData = event.data;
      const metadata = sessionData.metadata; // Pulling back the data variables we sent in Step 2

      const buyerId = metadata.buyer_id;
      const productIds = metadata.product_ids; // This is our array of purchased items

      // 1. Fetch details for all purchased products to read their true names, prices, and seller IDs
      const { data: products } = await supabase
        .from('products')
        .select('id, title, price, seller_id')
        .in('id', productIds);

      if (products && products.length > 0) {
        // 2. Loop through each item and create an escrow record inside the orders table
        for (const product of products) {
          await supabase.from('orders').insert([
            {
              buyer_id: buyerId,
              seller_id: product.seller_id,
              product_name: product.title,
              amount: product.price, // Kept safely in Kobo
              status: 'locked',      // Locked in escrow safely
              paystack_reference: sessionData.reference
            }
          ]);

          // Optional: Mark the original product item as sold so it drops off the public shop feed
          await supabase
            .from('products')
            .update({ is_sold: true })
            .eq('id', product.id);
        }

        // 3. Clear the buyer's cart clean since they have completed the checkout
        await supabase
          .from('carts')
          .delete()
          .eq('user_id', buyerId);
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });

  } catch (err) {
    return NextResponse.json({ error: 'Webhook processing fault.' }, { status: 500 });
  }
}