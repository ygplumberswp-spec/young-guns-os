import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapCustomerReferenceFromStorage,
  mapCustomerReferenceToStorage,
  mergeFinanceDocumentAddresses,
  normalizeFinanceDocumentAddresses,
  resolveInvoiceIssuedAtUpdate,
  resolveQuoteIssuedAtUpdate,
  toFinanceDocumentAddressSnapshot,
} from './finance-document-roundtrip.js';

test('normalizeFinanceDocumentAddresses trims and nulls empty strings', () => {
  assert.deepEqual(
    normalizeFinanceDocumentAddresses({
      billingAddress: '  12 Main Rd  ',
      siteAddress: '',
      postalAddress: undefined,
    }),
    {
      billingAddress: '12 Main Rd',
      siteAddress: null,
      postalAddress: null,
    },
  );
});

test('mergeFinanceDocumentAddresses preserves current values when omitted', () => {
  const current = {
    billingAddress: 'Billing',
    siteAddress: 'Site',
    postalAddress: 'Postal',
  };
  assert.deepEqual(mergeFinanceDocumentAddresses(current, undefined), current);
});

test('toFinanceDocumentAddressSnapshot keeps nulls for legacy rows', () => {
  assert.deepEqual(toFinanceDocumentAddressSnapshot({}), {
    billingAddress: null,
    siteAddress: null,
    postalAddress: null,
  });
});

test('resolveQuoteIssuedAtUpdate preserves existing date when omitted', () => {
  assert.equal(resolveQuoteIssuedAtUpdate(new Date('2026-08-01T00:00:00.000Z'), undefined, false), undefined);
});

test('resolveQuoteIssuedAtUpdate blocks immutable quotes', () => {
  assert.equal(resolveQuoteIssuedAtUpdate(new Date('2026-08-01T00:00:00.000Z'), '2026-08-02T00:00:00.000Z', true), undefined);
});

test('resolveInvoiceIssuedAtUpdate accepts explicit null', () => {
  assert.equal(resolveInvoiceIssuedAtUpdate(new Date('2026-08-01T00:00:00.000Z'), null), null);
});

test('customer reference storage is separate from invoice numbers', () => {
  assert.equal(mapCustomerReferenceToStorage(' PO-7781 '), 'PO-7781');
  assert.equal(mapCustomerReferenceFromStorage('PO-7781'), 'PO-7781');
  assert.equal(mapCustomerReferenceFromStorage(null), null);
});

test('quote round-trip field bundle survives merge operations', () => {
  const addresses = normalizeFinanceDocumentAddresses({
    billingAddress: 'Billing snapshot',
    siteAddress: 'Site snapshot',
    postalAddress: 'Postal snapshot',
  });
  const issuedAt = resolveQuoteIssuedAtUpdate(null, '2026-08-04T00:00:00.000Z', false);
  assert.ok(issuedAt instanceof Date);
  assert.equal(addresses.billingAddress, 'Billing snapshot');
});

test('invoice round-trip field bundle survives merge operations', () => {
  const customerReference = mapCustomerReferenceToStorage('Customer PO 991');
  const issuedAt = resolveInvoiceIssuedAtUpdate(null, '2026-08-04T00:00:00.000Z');
  assert.equal(customerReference, 'Customer PO 991');
  assert.ok(issuedAt instanceof Date);
});
