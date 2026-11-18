import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('wallet_balance_summary', { p_user_id: user.id });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      total_kobo: Number(row?.total_kobo) || 0,
      withdrawable_kobo: Number(row?.withdrawable_kobo) || 0,
      held_kobo: Number(row?.held_kobo) || 0,
      next_release_at: row?.next_release_at || null,
    });
  } catch (error) {
    console.error('[wallet/summary] failed', error);
    return NextResponse.json({ error: 'Could not load wallet balance.' }, { status: 500 });
  }
}
