import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Remember that a user dismissed an announcement so it never shows again.
 * The (broadcast_id, user_id) primary key makes this idempotent.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { broadcastId?: unknown };
    const broadcastId = typeof body.broadcastId === 'string' ? body.broadcastId : '';
    if (!UUID_PATTERN.test(broadcastId)) {
      return NextResponse.json({ error: 'Missing broadcast id.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from('broadcast_dismissals').upsert(
      { broadcast_id: broadcastId, user_id: user.id },
      { onConflict: 'broadcast_id,user_id', ignoreDuplicates: true },
    );

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[broadcasts/dismiss] POST failed', err);
    return NextResponse.json({ error: 'Could not dismiss the announcement.' }, { status: 500 });
  }
}
