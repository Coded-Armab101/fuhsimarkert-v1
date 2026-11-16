import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { hasActiveRole, type RoleProfile } from '@/utils/roles';

/**
 * Broadcasts currently due for the signed-in user.
 *
 * Reads run through the service-role client because broadcasts have RLS with no
 * client policies. The caller is authenticated with the cookie client first,
 * then the role is derived from their profile so an announcement can target
 * everyone, buyers, or approved sellers.
 */

type ActiveBroadcast = {
  id: string;
  title: string;
  message: string;
  audience: 'all' | 'buyers' | 'sellers';
  starts_at: string;
  ends_at: string | null;
};

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
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('is_admin, is_approved_seller, user_persona, is_seller, seller_active, subscription_expires_at')
      .eq('id', user.id)
      .maybeSingle<RoleProfile>();
    if (profileError) throw profileError;

    const isSeller =
      profile?.is_admin === true ||
      profile?.is_approved_seller === true ||
      hasActiveRole(profile, 'seller');
    const visibleAudiences = isSeller ? ['all', 'sellers'] : ['all', 'buyers'];

    const now = new Date().toISOString();
    const { data, error } = await admin
      .from('broadcasts')
      .select('id, title, message, audience, starts_at, ends_at')
      .eq('is_active', true)
      .lte('starts_at', now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .in('audience', visibleAudiences)
      .order('created_at', { ascending: false })
      // Fetch a bounded history before removing dismissals. Limiting to five
      // first could hide an older unread message when the five newest were all
      // already dismissed by this user.
      .limit(100);

    if (error) throw error;

    const rows = (data || []) as ActiveBroadcast[];
    if (rows.length === 0) {
      return NextResponse.json(
        { broadcasts: [] },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const { data: dismissals, error: dismissalsError } = await admin
      .from('broadcast_dismissals')
      .select('broadcast_id')
      .eq('user_id', user.id)
      .in('broadcast_id', rows.map((row) => row.id));
    if (dismissalsError) throw dismissalsError;

    const dismissed = new Set(
      (dismissals || []).map((row) => (row as { broadcast_id: string }).broadcast_id),
    );

    return NextResponse.json(
      { broadcasts: rows.filter((row) => !dismissed.has(row.id)).slice(0, 5) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err) {
    console.error('[broadcasts/active] GET failed', err);
    return NextResponse.json({ error: 'Could not load announcements.' }, { status: 500 });
  }
}
