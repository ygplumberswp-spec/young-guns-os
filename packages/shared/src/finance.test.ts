import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEffectiveAmountPaidCents,
  resolveEffectiveInvoiceOutstandingCents,
  resolveEffectiveInvoiceTotalCents,
} from './finance.js';

test('resolveEffectiveInvoiceTotalCents prefers total_cents over amount_cents', () => {
  assert.equal(
    resolveEffectiveInvoiceTotalCents({ amountCents: 10000, totalCents: 247250 }),
    247250,
  );
  assert.equal(resolveEffectiveInvoiceTotalCents({ amountCents: 10000, totalCents: 0 }), 10000);
});

test('resolveEffectiveAmountPaidCents avoids false-zero when payments exist', () => {
  assert.equal(
    resolveEffectiveAmountPaidCents({ amountPaidCents: 0, allocatedPaymentsCents: 50000 }),
    50000,
  );
  assert.equal(
    resolveEffectiveAmountPaidCents({ amountPaidCents: 75000, allocatedPaymentsCents: 50000 }),
    75000,
  );
  assert.equal(resolveEffectiveAmountPaidCents({ amountPaidCents: 0, allocatedPaymentsCents: 0 }), 0);
});

test('resolveEffectiveInvoiceOutstandingCents handles partial and multiple payments', () => {
  assert.equal(
    resolveEffectiveInvoiceOutstandingCents({
      amountCents: 247250,
      totalCents: 247250,
      amountPaidCents: 0,
      allocatedPaymentsCents: 100000,
    }),
    147250,
  );
  assert.equal(
    resolveEffectiveInvoiceOutstandingCents({
      amountCents: 226639,
      totalCents: 226639,
      amountPaidCents: 226639,
      allocatedPaymentsCents: 100000,
    }),
    0,
  );
});
