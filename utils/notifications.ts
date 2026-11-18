import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPushToUsers } from '@/utils/push';

/**
 * One place that records an in-app notification AND sends a Web Push to the
 * affected users. Previously only new seller orders sent a push, and buyers
 * never received an in-app row at all — both sides now get the same alerts.
 *
 * All callers are server-side (service-role client). Notification failures are
 * best-effort and never block the money/order transition that triggered them.
 */
export type NotifyUsersInput = {
  userIds: string[];
  /** The order row to attach the notice to. Use one row per checkout for buyers
   *  so a multi-product order produces a single buyer notification. */
  orderId: string;
  type: string;
  title: string;
  message: string;
  url: string;
  tag?: string;
};

export async function notifyUsers(admin: SupabaseClient, input: NotifyUsersInput): Promise<void> {
  const userIds = Array.from(new Set(input.userIds.filter(Boolean)));
  if (userIds.length === 0 || !input.orderId) return;

  // 1) Persistent inbox row — works even when push is not configured or the
  //    user has not installed the PWA yet.
  try {
    const rows = userIds.map((userId) => ({
      user_id: userId,
      order_id: input.orderId,
      type: input.type,
      title: input.title,
      message: input.message,
      url: input.url,
    }));
    const { error } = await admin.from('notifications').upsert(rows, {
      onConflict: 'user_id,order_id,type',
      ignoreDuplicates: true,
    });
    if (error) console.warn('[notify] could not store notification', error);
  } catch (err) {
    console.warn('[notify] could not store notification', err);
  }

  // 2) Web Push — independent of the DB write so a transient storage error
  //    still gets the user's attention. Callers guard against duplicate events.
  try {
    await sendPushToUsers(admin, userIds, {
      title: input.title,
      body: input.message,
      url: input.url,
      tag: input.tag || `${input.type}-${input.orderId}`,
    });
  } catch (err) {
    console.warn('[notify] push failed', err);
  }
}
