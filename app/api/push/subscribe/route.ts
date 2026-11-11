import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * Save a browser's Web Push subscription for the signed-in user.
 *
 * The browser creates the subscription with the VAPID public key from
 * /api/push/public-key, then posts it here. We authenticate with the cookie
 * client and write with the service role because `push_subscriptions` has no
 * RLS policies (server-only table).
 *
 * `endpoint` is unique table-wide, so re-subscribing the same device updates
 * the existing row instead of failing.
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

    const body = (await request.json().catch(() => null)) as
      | {
          subscription?: {
            endpoint?: string;
            keys?: { p256dh?: string; auth?: string };
          };
        }
      | null;

    const subscription = body?.subscription;
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Invalid push subscription.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: request.headers.get('user-agent'),
      },
      { onConflict: 'endpoint' },
    );

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[push/subscribe] failed', err);
    return NextResponse.json({ error: 'Could not save this device.' }, { status: 500 });
  }
}

/** Remove a device, for example when the user turns alerts off. */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
    if (!body?.endpoint) {
      return NextResponse.json({ error: 'Missing endpoint.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', body.endpoint)
      .eq('user_id', user.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[push/subscribe] delete failed', err);
    return NextResponse.json({ error: 'Could not remove this device.' }, { status: 500 });
  }
}
