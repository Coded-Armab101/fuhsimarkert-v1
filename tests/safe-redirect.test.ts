import test from 'node:test';
import assert from 'node:assert/strict';
import { safeRedirectPath } from '../utils/safe-redirect.ts';

const ORIGIN = 'https://www.fuhsimarket.com.ng';

test('safeRedirectPath allows same-origin relative paths', () => {
  assert.equal(safeRedirectPath('/buyer', ORIGIN), '/buyer');
  assert.equal(safeRedirectPath('/seller/orders?tab=pending#top', ORIGIN), '/seller/orders?tab=pending#top');
  assert.equal(safeRedirectPath(null, ORIGIN), '/buyer');
  assert.equal(safeRedirectPath('', ORIGIN), '/buyer');
});

test('safeRedirectPath rejects open redirects, backslashes and exotic schemes', () => {
  const attacks = [
    '/\\evil.com',
    '/\\\\evil.com',
    '\\\\evil.com',
    '//evil.com',
    '///evil.com',
    'https://evil.com',
    'http://evil.com/path',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://www.fuhsimarket.com.ng.evil.com',
    'https://www.fuhsimarket.com.ng@evil.com',
  ];
  for (const value of attacks) {
    assert.equal(safeRedirectPath(value, ORIGIN), '/buyer', `expected fallback for ${JSON.stringify(value)}`);
  }
});

test('safeRedirectPath returns parsed components for encoded values', () => {
  assert.equal(safeRedirectPath('/%2f%2fevil.com', ORIGIN), '/%2f%2fevil.com');
  assert.equal(safeRedirectPath('/@evil.com', ORIGIN), '/@evil.com');
  assert.equal(
    safeRedirectPath('/buyer%0d%0aLocation:%20https://evil.com', ORIGIN),
    '/buyer%0d%0aLocation:%20https://evil.com',
  );
});
