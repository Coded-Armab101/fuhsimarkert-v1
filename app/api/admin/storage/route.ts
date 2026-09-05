import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * Admin tool to view and adjust per-seller storage quotas.
 *
 * GET  – list sellers with their current storage_quota (and an optional used
 *        byte count supplied by the client, which writes it back for display).
 * POST – set a seller's storage_quota in bytes (NULL = unlimited).
 *
 * Authorization: caller must have profiles.is_admin = true.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
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

    const { data, error } = await admin
      .from('profiles')
      .select('id, full_name, storage_quota, user_persona')
      .eq('user_persona', 'seller')
      .order('full_name', { ascending: true });
    if (error) throw error;

    return NextResponse.json({
      sellers: (data || []).map((s) => ({ ...s, storage_quota: s.storage_quota != null ? Number(s.storage_quota) : null })),
    });
  } catch (err) {
    console.error('[admin/storage] error:', err);
    return NextResponse.json({ error: 'Could not load seller storage.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const sellerId = String(body?.sellerId || '');
    // quotaMb: number of MB; 0 or null means "unlimited".
    const quotaMb = Number(body?.quotaMb);
    if (!sellerId) {
      return NextResponse.json({ error: 'sellerId is required.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
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

    const storageQuota =
      !Number.isFinite(quotaMb) || quotaMb <= 0
        ? null // unlimited
        : Math.round(quotaMb * 1024 * 1024);

    const { error } = await admin
      .from('profiles')
      .update({ storage_quota: storageQuota })
      .eq('id', sellerId)
      .eq('user_persona', 'seller');
    if (error) throw error;

    return NextResponse.json({ ok: true, sellerId, storage_quota: storageQuota });
  } catch (err) {
    console.error('[admin/storage] error:', err);
    return NextResponse.json({ error: 'Could not update storage quota.' }, { status: 500 });
  }
}