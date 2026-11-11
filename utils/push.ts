import type { SupabaseClient } from '@supabase/supabase-js';
import { sendNotification, setVapidDetails } from 'web-push';

/**
 * Server-side Web Push helper.
 *
 * Only called from trusted server code (order recording), so it uses a
 * service-role Supabase client. VAPID keys are read from the environment:
 *
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  — also sent to the browser by /api/push/public-key
 *   VAPID_PRIVATE_KEY             — server only, never expose
 *   VAPID_SUBJECT                 — mailto: or https: contact (defaults below)
 *
 * If the keys are missing the app keeps working; pushes are simply skipped and
 * a warning is logged. That keeps local development and first deploys safe.
 */

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

let vapidReady: boolean | null = null;

function hasVapidKeys(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  if (!hasVapidKeys()) {
    vapidReady = false;
    return false;
  }

  try {
    setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:hello@fuhsimarket.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string,
    );
    vapidReady = true;
  } catch (err) {
    console.warn('[push] invalid VAPID configuration, push disabled', err);
    vapidReady = false;
  }
  return vapidReady;
}

export function pushConfigured(): boolean {
  return configureVapid();
}

/**
 * Send one notification to every device registered by the given users.
 * Stale endpoints (404/410 from the push service) are deleted automatically.
 * Never throws: a push failure must never roll back an order.
 */
export async function sendPushToUsers(
  admin: SupabaseClient,
  userIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0 || !configureVapid()) {
    return { sent: 0, failed: 0 };
  }

  let subscriptions: PushSubscriptionRow[] = [];
  try {
    const { data, error } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', uniqueUserIds);
    if (error) throw error;
    subscriptions = (data as PushSubscriptionRow[] | null) ?? [];
  } catch (err) {
    console.warn('[push] could not load subscriptions', err);
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const staleIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) staleIds.push(subscription.id);
        else console.warn('[push] send failed', statusCode ?? err);
      }
    }),
  );

  if (staleIds.length > 0) {
    try {
      await admin.from('push_subscriptions').delete().in('id', staleIds);
    } catch (err) {
      console.warn('[push] could not remove stale subscriptions', err);
    }
  }

  return { sent, failed };
}
