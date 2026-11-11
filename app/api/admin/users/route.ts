import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { loadAdminUsers } from '@/utils/admin/metrics';

/**
 * Operator people directory: every profile with role, verification state,
 * wallet balance and simple buyer/seller activity totals.
 *
 * Query params:
 *   q      – case-insensitive name or id search
 *   limit  – max rows returned (default 200, capped at 500)
 *
 * Authorization: profiles.is_admin = true.
 */
export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q') || '';
    const requestedLimit = Number(searchParams.get('limit'));
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500)
      : 200;

    const result = await loadAdminUsers(admin, search, limit);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[admin/users] failed', err);
    return NextResponse.json({ error: 'Could not load the user directory.' }, { status: 500 });
  }
}
