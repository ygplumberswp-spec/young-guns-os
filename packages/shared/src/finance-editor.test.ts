import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLineAmounts,
  displayOfficialInvoiceNumber,
  displayOfficialQuoteNumber,
  findDuplicateCustomerHint,
  canEditInvoice,
} from './finance.js';

test('calculates line VAT in cents with 15% default bps', () => {
  assert.deepEqual(
    calculateLineAmounts({ quantity: 2, unitPriceCents: 1000, vatRateBps: 1500 }),
    { lineSubtotalCents: 2000, lineVatCents: 300, lineTotalCents: 2300, lineCostCents: 0 },
  );
});

test('uses Xero numbers as official display when present', () => {
  assert.equal(displayOfficialQuoteNumber({ xeroQuoteNumber: 'QU-001' }), 'QU-001');
  assert.equal(displayOfficialInvoiceNumber({ xeroInvoiceNumber: 'INV-001' }), 'INV-001');
});

test('shows pending draft text before Xero sync', () => {
  assert.equal(displayOfficialQuoteNumber({ xeroQuoteNumber: null }), 'Draft — Xero quote number pending');
  assert.equal(displayOfficialInvoiceNumber({ xeroInvoiceNumber: '' }), 'Draft — Xero invoice number pending');
});

test('detects duplicate customer names in search results', () => {
  const results = [{ name: 'Young Guns Plumbing', companyName: null }];
  assert.equal(findDuplicateCustomerHint('young guns plumbing', results), true);
  assert.equal(findDuplicateCustomerHint('New Customer', results), false);
});

test('blocks editing synced Xero invoices', () => {
  assert.equal(canEditInvoice({ status: 'draft', xeroInvoiceNumber: 'INV-9' }), false);
  assert.equal(canEditInvoice({ status: 'draft', numberAuthority: 'xero' }), false);
  assert.equal(canEditInvoice({ status: 'draft', sourceProvider: 'xero' }), false);
  assert.equal(canEditInvoice({ status: 'draft' }), true);
});

test('preserves quote line items when mapping to invoice input', () => {
  const quoteLines = [
    {
      category: 'labour' as const,
      description: 'Install geyser',
      quantity: 2,
      unitPriceCents: 150000,
      vatRateBps: 1500,
    },
    {
      category: 'materials' as const,
      description: 'Copper pipe',
      quantity: 1,
      unitPriceCents: 45000,
      vatRateBps: 1500,
    },
  ];

  const invoiceLines = quoteLines.map((line) => ({
    category: line.category,
    description: line.description,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    vatRateBps: line.vatRateBps,
  }));

  assert.equal(invoiceLines.length, 2);
  assert.equal(invoiceLines[0]?.description, 'Install geyser');
  assert.equal(invoiceLines[1]?.unitPriceCents, 45000);

  const subtotal = invoiceLines.reduce(
    (sum, line) => sum + calculateLineAmounts(line).lineSubtotalCents,
    0,
  );
  assert.equal(subtotal, 345000);
});
