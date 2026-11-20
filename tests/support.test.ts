import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWhatsappUrl, normalizeWhatsappNumber } from '../utils/support.ts';

test('normalizeWhatsappNumber strips formatting and adds the NG country code', () => {
  assert.equal(normalizeWhatsappNumber('+234 803 123 4567'), '2348031234567');
  assert.equal(normalizeWhatsappNumber('08031234567'), '2348031234567');
  assert.equal(normalizeWhatsappNumber('(0803) 123-4567'), '2348031234567');
  assert.equal(normalizeWhatsappNumber(' 2348031234567 '), '2348031234567');
});

test('normalizeWhatsappNumber rejects missing or implausible numbers', () => {
  for (const value of ['', '   ', 'call me', '123', '12345678901234567890', null, undefined]) {
    assert.equal(normalizeWhatsappNumber(value), null, `expected rejection for ${JSON.stringify(value)}`);
  }
});

test('buildWhatsappUrl encodes the message and refuses an unconfigured number', () => {
  assert.equal(buildWhatsappUrl(null, 'hello'), null);
  const url = buildWhatsappUrl('2348031234567', 'I paid for order FHSI-123 but it has not reflected.');
  assert.equal(
    url,
    'https://wa.me/2348031234567?text=I%20paid%20for%20order%20FHSI-123%20but%20it%20has%20not%20reflected.',
  );
});

test('buildWhatsappUrl uses a default message and caps very long text', () => {
  const url = buildWhatsappUrl('2348031234567');
  assert.ok(url?.startsWith('https://wa.me/2348031234567?text=Hello%20FuhsiMarket%20support'));
  const longUrl = buildWhatsappUrl('2348031234567', 'x'.repeat(2000));
  const encoded = longUrl?.split('?text=')[1] ?? '';
  assert.ok(encoded.length <= 600 * 3);
});
