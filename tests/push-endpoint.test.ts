import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePushSubscription } from '../utils/push-endpoint.ts';

const P256DH = 'A'.repeat(87); // base64url-encoded 65-byte VAPID key
const AUTH = 'B'.repeat(22); // base64url-encoded 16-byte auth secret

function subscription(endpoint: string, p256dh = P256DH, auth = AUTH) {
  return { endpoint, keys: { p256dh, auth } };
}

test('validatePushSubscription accepts real public push-service endpoints', () => {
  const fcm = validatePushSubscription(subscription('https://fcm.googleapis.com/fcm/send/abc123'));
  assert.ok(fcm);
  assert.equal(fcm.endpoint, 'https://fcm.googleapis.com/fcm/send/abc123');
  assert.ok(
    validatePushSubscription(subscription('https://wns2-eu.notify.windows.com/?token=abc')),
  );
  assert.ok(
    validatePushSubscription(subscription('https://updates.push.services.mozilla.com/wpush/v2/abc')),
  );
});

test('validatePushSubscription rejects SSRF endpoints', () => {
  const bad = [
    'http://fcm.googleapis.com/fcm/send/abc', // not HTTPS
    'https://user:pass@fcm.googleapis.com/x', // credentials
    'https://fcm.googleapis.com:8443/x', // unexpected port
    'https://localhost/x',
    'https://internal.local/x',
    'https://127.0.0.1/x',
    'https://[::1]/x',
    'https://169.254.169.254/latest/meta-data/',
    'https://fcm.googleapis.com.evil.com/x', // lookalike suffix
    'https://evilgoogleapis.com/x',
    'javascript:alert(1)',
    `https://fcm.googleapis.com/${'a'.repeat(3000)}`, // too long
    'https://fcm.googleapis.com/a b', // whitespace
  ];
  for (const endpoint of bad) {
    assert.equal(validatePushSubscription(subscription(endpoint)), null, `expected null for ${endpoint}`);
  }
});

test('validatePushSubscription rejects malformed VAPID keys', () => {
  assert.equal(validatePushSubscription(subscription('https://fcm.googleapis.com/x', 'short', AUTH)), null);
  assert.equal(validatePushSubscription(subscription('https://fcm.googleapis.com/x', P256DH, 'short')), null);
  assert.equal(validatePushSubscription(subscription('https://fcm.googleapis.com/x', 'not base64!!', AUTH)), null);
  assert.equal(validatePushSubscription({ endpoint: 'https://fcm.googleapis.com/x' }), null);
  assert.equal(validatePushSubscription(null), null);
});
