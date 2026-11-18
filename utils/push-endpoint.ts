/**
 * Validation for browser-supplied Web Push subscriptions.
 *
 * `web-push` performs an outbound HTTP request to the subscription endpoint.
 * Without validation a signed-in user could store `http://169.254.169.254/...`
 * or `https://internal-service.local/...` and turn "send a push notification"
 * into an SSRF primitive against the deployment's network. We therefore only
 * accept HTTPS endpoints on a known public push service, without credentials
 * or non-standard ports, and only well-formed VAPID keys.
 *
 * The allowlist is suffix-based so regional push hosts (e.g. wns2-eu.notify...)
 * keep working. Extend it deliberately when adding a new push provider.
 */

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 256;

/** Hostname suffixes operated by public Web Push services. */
const ALLOWED_PUSH_HOST_SUFFIXES = [
  // Firebase Cloud Messaging / Google
  'googleapis.com',
  'google.com',
  // Mozilla Push Service
  'mozilla.com',
  'mozilla.net',
  // Microsoft/WNS
  'windows.com',
  'microsoft.com',
  // Apple Push / iCloud
  'apple.com',
  'icloud.com',
  // Other public push relays
  'samsung.com',
  'huawei.com',
  'onesignal.com',
];

/** True for any literal IP address (v4, v6, or v4-mapped v6). */
function isIpLiteral(hostname: string): boolean {
  const bare = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) return true;
  if (bare.includes(':')) return true;
  // Decimal / octal / hex IP encodings still resolve without DNS.
  if (/^(0x[0-9a-f]+|[0-9]+)(\.(0x[0-9a-f]+|[0-9]+)){3}$/i.test(bare)) return true;
  return false;
}

function isAllowedPushHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return false;
  if (isIpLiteral(host)) return false;
  return ALLOWED_PUSH_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/** Base64url keys emitted by `PushSubscription.toJSON()` (padding optional). */
function isValidVapidKey(value: unknown, minLength: number): value is string {
  return typeof value === 'string' &&
    value.length >= minLength &&
    value.length <= MAX_KEY_LENGTH &&
    /^[A-Za-z0-9_-]+={0,2}$/.test(value);
}

export type ValidatedPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Return a normalised subscription, or `null` when any part is unsafe/malformed.
 */
export function validatePushSubscription(value: unknown): ValidatedPushSubscription | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const keys = candidate.keys && typeof candidate.keys === 'object'
    ? candidate.keys as Record<string, unknown>
    : {};

  const endpoint = candidate.endpoint;
  const p256dh = keys.p256dh;
  const auth = keys.auth;

  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH) {
    return null;
  }
  if (/\s/.test(endpoint)) return null;
  if (!isValidVapidKey(p256dh, 40) || !isValidVapidKey(auth, 16)) return null;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  // 443 is the only acceptable port; an explicit `:443` is normalised away by
  // the URL parser, while any other port is rejected.
  if (url.port !== '') return null;
  if (!isAllowedPushHost(url.hostname)) return null;

  return { endpoint: url.href, p256dh, auth };
}
