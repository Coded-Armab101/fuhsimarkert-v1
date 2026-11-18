import test from 'node:test';
import assert from 'node:assert/strict';
import { safeImageSrc, productImageFileError, MAX_PRODUCT_IMAGE_BYTES } from '../utils/safeImage.ts';

/**
 * `safeImageSrc()` guards every untrusted image URL rendered in an <img src>.
 * These cases document the schemes and encoding tricks it must reject.
 */
test('safeImageSrc rejects unsafe schemes', () => {
  const unsafe = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'DATA:image/svg+xml,<svg onload=alert(1)>',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
    'http://example.com/a.png', // only https: / blob: are allowed
  ];
  for (const value of unsafe) {
    assert.equal(safeImageSrc(value), null, `expected null for ${JSON.stringify(value)}`);
  }
});

test('safeImageSrc rejects protocol-relative and backslash URLs', () => {
  for (const value of ['//evil.example/a.png', '///evil.example/a.png', '\\\\evil.example\\a.png']) {
    assert.equal(safeImageSrc(value), null, `expected null for ${JSON.stringify(value)}`);
  }
});

test('safeImageSrc rejects whitespace, control chars and empty values', () => {
  for (const value of [
    '',
    '   ',
    'https://example.com/a\u0000.png',
    'https://example.com/a\n.png',
    'java\tscript:alert(1)',
    'https://example.com/a b.png',
    null,
    undefined,
  ]) {
    assert.equal(safeImageSrc(value as string | null | undefined), null);
  }
});

test('safeImageSrc allows valid HTTPS and blob URLs', () => {
  assert.equal(safeImageSrc('https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(
    safeImageSrc('https://abc.supabase.co/storage/v1/object/public/product-images/seller/a.png'),
    'https://abc.supabase.co/storage/v1/object/public/product-images/seller/a.png',
  );
  assert.equal(safeImageSrc('blob:https://example.com/1234-uuid'), 'blob:https://example.com/1234-uuid');
  assert.equal(safeImageSrc(' /images/local.png '), '/images/local.png');
});

test('productImageFileError enforces type and size at the client edge', () => {
  const valid = { type: 'image/jpeg', size: 1024 } as File;
  assert.equal(productImageFileError(valid), null);

  const wrongType = { type: 'text/html', size: 1024 } as File;
  assert.match(productImageFileError(wrongType)!, /Only JPG/);

  const tooBig = { type: 'image/png', size: MAX_PRODUCT_IMAGE_BYTES + 1 } as File;
  assert.match(productImageFileError(tooBig)!, /4MB/);
});
