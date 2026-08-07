import test from 'node:test';
import assert from 'node:assert/strict';
import {
  displayOfficialInvoiceNumber,
  displayOfficialQuoteNumber,
  legacyFinanceDocumentTitle,
} from './finance.js';

test('title-free legacy DB title uses customer name or empty string only', () => {
  assert.equal(legacyFinanceDocumentTitle('Young Guns Plumbing'), 'Young Guns Plumbing');
  assert.equal(legacyFinanceDocumentTitle('  '), '');
  assert.equal(legacyFinanceDocumentTitle(undefined), '');
  assert.doesNotMatch(legacyFinanceDocumentTitle(undefined), /untitled/i);
});

test('Xero is the only official numbering authority in staff-facing labels', () => {
  assert.equal(displayOfficialQuoteNumber({ xeroQuoteNumber: 'QU-1001' }), 'QU-1001');
  assert.equal(displayOfficialInvoiceNumber({ xeroInvoiceNumber: 'INV-1001' }), 'INV-1001');
  assert.equal(displayOfficialQuoteNumber({ xeroQuoteNumber: null }), 'Draft — Xero quote number pending');
  assert.equal(displayOfficialInvoiceNumber({ xeroInvoiceNumber: '' }), 'Draft — Xero invoice number pending');
  assert.doesNotMatch(displayOfficialQuoteNumber({ xeroQuoteNumber: null }), /TITAN-/i);
  assert.doesNotMatch(displayOfficialQuoteNumber({ xeroQuoteNumber: null }), /Q-000/i);
});

test('legacy title helper never fabricates Untitled placeholders', () => {
  assert.equal(legacyFinanceDocumentTitle(null), '');
  assert.equal(legacyFinanceDocumentTitle(''), '');
  assert.equal(legacyFinanceDocumentTitle('   '), '');
});
