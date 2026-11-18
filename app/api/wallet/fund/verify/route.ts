import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { accountIsActive } from '@/utils/account';
import { verifyTransaction } from '@/utils/paystack/api';
import { recordWalletFunding } from '@/utils/paystack/recordWalletFunding';

export async function GET(request: Request) {
  try {
    const reference = new URL(request.url).searchParams.get('reference')?.trim();
    if (!reference) return NextResponse.json({ error: 'Missing funding reference.' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    if (!(await accountIsActive(supabase, user.id))) {
      return NextResponse.json({ error: 'This account is suspended.' }, { status: 403 });
    }

    const transaction = await verifyTransaction(reference);
    const metadata = typeof transaction.metadata === 'string'
      ? JSON.parse(transaction.metadata || '{}') as Record<string, unknown>
      : transaction.metadata || {};
    if (metadata.user_id !== user.id) {
      return NextResponse.json({ error: 'This funding payment belongs to another account.' }, { status: 403 });
    }
    if (transaction.status !== 'success') {
      return NextResponse.json({ status: transaction.status, reference });
    }

    const result = await recordWalletFunding(createAdminClient(), transaction);
    return NextResponse.json({
      ok: true,
      status: 'success',
      reference,
      credit_kobo: result.creditKobo,
      processing_fee_kobo: result.processingFeeKobo,
    });
  } catch (error) {
    console.error('[wallet/fund/verify] failed', error);
    return NextResponse.json({ error: 'Could not verify wallet funding.' }, { status: 500 });
  }
}
