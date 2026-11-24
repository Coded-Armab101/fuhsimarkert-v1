import test from 'node:test';
import assert from 'node:assert/strict';
import {
  paystackTransferFeeKobo,
  PLATFORM_TRANSFER_FEE_SOURCE,
  platformTransferFeeNote,
  sellerWithdrawalDebitKobo,
} from '../utils/payment-fees.ts';

test('Paystack transfer/stamp fee bands are unchanged', () => {
  assert.equal(paystackTransferFeeKobo(0), 0);
  assert.equal(paystackTransferFeeKobo(100_000), 1_000); // ₦1,000 → ₦10
  assert.equal(paystackTransferFeeKobo(500_000), 1_000); // ₦5,000 → ₦10
  assert.equal(paystackTransferFeeKobo(500_001), 2_500); // above ₦5,000 → ₦25
  assert.equal(paystackTransferFeeKobo(999_999), 2_500); // below ₦10,000: no stamp
  assert.equal(paystackTransferFeeKobo(1_000_000), 7_500); // ₦25 + ₦50 stamp
  assert.equal(paystackTransferFeeKobo(5_000_000), 7_500);
  assert.equal(paystackTransferFeeKobo(5_000_001), 10_000); // ₦50 + ₦50 stamp
  assert.equal(paystackTransferFeeKobo(10_000_000), 10_000);
});

test('provider transfer cost is attributed to the platform commission', () => {
  assert.equal(PLATFORM_TRANSFER_FEE_SOURCE, 'platform_commission');
});

test('seller withdrawal debit is exactly the bank amount', () => {
  for (const bankAmountKobo of [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000]) {
    const fee = paystackTransferFeeKobo(bankAmountKobo);
    assert.ok(fee > 0);
    assert.equal(sellerWithdrawalDebitKobo(bankAmountKobo), bankAmountKobo);
    assert.notEqual(sellerWithdrawalDebitKobo(bankAmountKobo), bankAmountKobo + fee);
  }
  assert.equal(sellerWithdrawalDebitKobo(-500), 0);
});

test('fee note tells the seller the platform pays and shows the exact debit', () => {
  const note = platformTransferFeeNote(7_500, 1_000_000);
  assert.match(note, /₦75/);
  assert.match(note, /covered by FuhsiMarket from our commission/);
  assert.match(note, /debited only ₦10,000/);
});
