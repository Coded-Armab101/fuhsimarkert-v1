import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { data, error: queryError } = await supabase
    .from('notifications')
    .select('id, type, title, message, order_id, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30);
  if (queryError) return NextResponse.json({ error: 'Could not load notifications.' }, { status: 500 });

  return NextResponse.json({ notifications: data ?? [] });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ error: 'Notification id is required.' }, { status: 400 });

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);
  if (updateError) return NextResponse.json({ error: 'Could not mark notification as read.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
