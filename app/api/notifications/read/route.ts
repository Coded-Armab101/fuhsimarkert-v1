import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Mark the signed-in user's notifications as read. Uses the cookie client so
 * RLS restricts the update to rows where user_id = auth.uid(); the column-level
 * grant added in 20261122_notifications_inbox.sql prevents changing anything
 * except `read_at`.
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

    const body = await request.json().catch(() => null);
    const ids = body && Array.isArray(body.ids)
      ? body.ids.filter((id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))
      : null;

    let query = supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);
    if (ids && ids.length > 0) query = query.in('id', ids);

    const { error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[notifications/read] failed', err);
    return NextResponse.json({ error: 'Could not mark notifications read.' }, { status: 500 });
  }
}
