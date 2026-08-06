import test from 'node:test';
import assert from 'node:assert/strict';
import {
  XERO_FINANCIAL_TRUTH_MATRIX,
  forbiddenFinancialTruthEquivalences,
} from './xero-financial-truth-matrix.js';

test('financial truth matrix defines twelve distinct lifecycle states', () => {
  assert.equal(XERO_FINANCIAL_TRUTH_MATRIX.length, 12);
  const states = new Set(XERO_FINANCIAL_TRUTH_MATRIX.map((row) => row.state));
  assert.equal(states.size, 12);
});

test('quote created is not equivalent to quote sent or accepted', () => {
  const forbidden = forbiddenFinancialTruthEquivalences('quote_created_titan');
  assert.ok(forbidden.includes('quote_sent_customer'));
  assert.ok(forbidden.includes('quote_accepted'));
});

test('Yoco payment completed is not equivalent to Xero reconciled', () => {
  const forbidden = forbiddenFinancialTruthEquivalences('yoco_payment_completed');
  assert.ok(forbidden.includes('xero_payment_reconciled'));
  assert.ok(forbidden.includes('invoice_fully_settled'));
});

test('bank transaction imported is not equivalent to reconciliation', () => {
  const forbidden = forbiddenFinancialTruthEquivalences('bank_transaction_imported');
  assert.ok(forbidden.includes('xero_payment_reconciled'));
});

test('invoice issued in Xero is not equivalent to cash collected', () => {
  const forbidden = forbiddenFinancialTruthEquivalences('invoice_created_xero');
  assert.ok(forbidden.includes('yoco_payment_completed'));
  assert.ok(forbidden.includes('invoice_fully_settled'));
});
