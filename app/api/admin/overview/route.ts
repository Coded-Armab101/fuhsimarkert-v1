import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { loadAdminOverview } from '@/utils/admin/metrics';

/**
 * Operator overview: signups, order activity, money in escrow, platform profit
 * and seller balances, plus the alerts that need attention.
 *
 * Authorization: profiles.is_admin = true. All reads use the service-role client
 * because the aggregate spans tables that RLS protects.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: adminProfile } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (adminProfile?.is_admin !== true) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const overview = await loadAdminOverview(admin);
    return NextResponse.json(overview);
  } catch (err) {
    console.error('[admin/overview] failed', err);
    return NextResponse.json(
      { error: 'Could not load the operator overview.' },
      { status: 500 },
    );
  }
}
