'use client';

/**
 * Browser helpers for PWA order alerts.
 *
 * Flow: register `public/sw.js` → ask notification permission → subscribe with
 * the VAPID public key from /api/push/public-key → post the subscription to
 * /api/push/subscribe. All calls are no-ops when the browser cannot do push
 * (older iOS, unsupported browsers) so the UI can degrade gracefully.
 */

export type PushState =
  | 'checking'
  | 'unsupported'
  | 'unconfigured'
  | 'default'
  | 'granted'
  | 'denied'
  | 'subscribed'
  | 'error';

function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (err) {
    console.warn('[push] service worker registration failed', err);
    return null;
  }
}

async function fetchPublicKey(): Promise<string | null> {
  try {
    const response = await fetch('/api/push/public-key', { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as { enabled?: boolean; publicKey?: string | null };
    return data.enabled && data.publicKey ? data.publicKey : null;
  } catch {
    return null;
  }
}

export async function currentPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';

  const publicKey = await fetchPublicKey();
  if (!publicKey) return 'unconfigured';

  try {
    const registration =
      (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker());
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription && Notification.permission === 'granted') return 'subscribed';
  } catch (err) {
    console.warn('[push] could not read subscription', err);
  }

  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return 'default';
}

/**
 * Must be called from a user gesture (a button click) — especially on iOS,
 * where Safari refuses permission prompts that are not user-initiated.
 */
export async function enablePushNotifications(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';

  const publicKey = await fetchPublicKey();
  if (!publicKey) return 'unconfigured';

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'denied') return 'denied';
    if (permission !== 'granted') return 'default';

    const registration =
      (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker());
    if (!registration) return 'error';

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    if (!response.ok) return 'error';

    return 'subscribed';
  } catch (err) {
    console.warn('[push] could not enable notifications', err);
    return 'error';
  }
}
