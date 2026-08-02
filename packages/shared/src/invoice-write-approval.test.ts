import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeInvoiceWriteExpectedEffect,
  isProviderWriteAuthorized,
  VOID_ELIGIBLE_INVOICE_STATUSES,
} from '@titan/shared';

test('VOID_ELIGIBLE_INVOICE_STATUSES excludes draft and cancelled', () => {
  assert.ok(!VOID_ELIGIBLE_INVOICE_STATUSES.includes('draft' as never));
  assert.ok(!VOID_ELIGIBLE_INVOICE_STATUSES.includes('cancelled' as never));
  assert.ok(VOID_ELIGIBLE_INVOICE_STATUSES.includes('sent'));
});

test('describeInvoiceWriteExpectedEffect for void mentions invoice number', () => {
  const effect = describeInvoiceWriteExpectedEffect('invoice_void', {
    displayNumber: 'INV-001',
    outstandingCents: 5000,
  });
  assert.match(effect, /INV-001/);
  assert.match(effect, /Void/i);
});

test('describeInvoiceWriteExpectedEffect for credit note mentions amount', () => {
  const effect = describeInvoiceWriteExpectedEffect('credit_note_create', {
    displayNumber: 'INV-002',
    outstandingCents: 10000,
    creditAmountCents: 2500,
  });
  assert.match(effect, /2500/);
  assert.match(effect, /credit note/i);
});

test('isProviderWriteAuthorized defaults false unless env set', () => {
  const original = process.env.TITAN_XERO_PROVIDER_WRITES_AUTHORIZED;
  delete process.env.TITAN_XERO_PROVIDER_WRITES_AUTHORIZED;
  assert.equal(isProviderWriteAuthorized(), false);
  process.env.TITAN_XERO_PROVIDER_WRITES_AUTHORIZED = 'true';
  assert.equal(isProviderWriteAuthorized(), true);
  if (original === undefined) delete process.env.TITAN_XERO_PROVIDER_WRITES_AUTHORIZED;
  else process.env.TITAN_XERO_PROVIDER_WRITES_AUTHORIZED = original;
});
