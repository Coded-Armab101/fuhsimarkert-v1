import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buyerServiceFeeKobo,
  discountedUnitPriceKobo,
  normalizeDiscountPercent,
  sellerCommissionKobo,
} from '../utils/pricing.ts';

test('normalizeDiscountPercent clamps to 0–100 and rounds whole percentages', () => {
  assert.equal(normalizeDiscountPercent(0), 0);
  assert.equal(normalizeDiscountPercent(100), 100);
  assert.equal(normalizeDiscountPercent(25), 25);
  assert.equal(normalizeDiscountPercent('20'), 20);
  assert.equal(normalizeDiscountPercent(-10), 0);
  assert.equal(normalizeDiscountPercent(150), 100);
  assert.equal(normalizeDiscountPercent('not-a-number'), 0);
  assert.equal(normalizeDiscountPercent(null), 0);
});

test('discountedUnitPriceKobo applies the discount to integer kobo', () => {
  assert.equal(discountedUnitPriceKobo({ price: 500_000, discount_percent: 0 }), 500_000);
  assert.equal(discountedUnitPriceKobo({ price: 500_000, discount_percent: 10 }), 450_000);
  // 199,999 × 75% = 149,999.25 → rounded to the nearest whole kobo.
  assert.equal(discountedUnitPriceKobo({ price: 199_999, discount_percent: 25 }), 149_999);
  assert.equal(discountedUnitPriceKobo({ price: '500000', discount_percent: '15' }), 425_000);
  assert.equal(discountedUnitPriceKobo({ price: 500_000, discount_percent: 100 }), 0);
  assert.equal(discountedUnitPriceKobo({ price: 0, discount_percent: 20 }), 0);
});

test('fees are computed from the discounted goods total', () => {
  const listPrice = 500_000;
  const discounted = discountedUnitPriceKobo({ price: listPrice, discount_percent: 20 });
  assert.equal(discounted, 400_000);
  // ₦4,000 goods still falls in the first buyer-fee tier (₦50).
  assert.equal(buyerServiceFeeKobo(discounted), 5_000);
  // Seller commission is taken from the discounted amount, not the list price.
  assert.equal(sellerCommissionKobo(discounted), 12_000);
});
