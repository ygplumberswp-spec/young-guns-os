import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFinanceDocumentPreviewModel,
  financeDocumentPreviewFilename,
} from './finance-document-preview.js';

test('preview model uses Xero pending numbers and never TITAN internal ids', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'quote',
    lines: [{ description: 'Labour', quantity: 1, unitPriceCents: 65000, vatRateBps: 1500 }],
  });
  assert.equal(model.documentNumber, 'Draft — Xero quote number pending');
  assert.doesNotMatch(model.documentNumber, /TITAN-/i);
  assert.equal(model.title, '');
  assert.equal(model.hideTitle, true);
  assert.equal(model.downloadFilename, 'YGP-Draft-Quote.pdf');
});

test('preview model includes current line totals and VAT mode', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'invoice',
    lines: [
      { description: 'Call-out', quantity: 1, unitPriceCents: 50000, vatRateBps: 1500 },
      { description: 'Parts', quantity: 2, unitPriceCents: 10000, vatRateBps: 1500 },
    ],
  });
  assert.equal(model.totals.subtotalCents, 70000);
  assert.equal(model.totals.vatCents, 10500);
  assert.equal(model.totals.totalCents, 80500);
  assert.equal(model.vatRateLabel, 'VAT (15%)');
  assert.equal(model.lineItems.length, 2);
});

test('preview model hides payment options and uses zero VAT label when applicable', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'invoice',
    lines: [{ description: 'Export item', quantity: 1, unitPriceCents: 10000, vatRateBps: 0 }],
  });
  assert.equal(model.vatRateLabel, 'VAT (0%)');
  assert.equal(model.hidePaymentOptions, true);
  const paymentSection = model.sections.find((section) => section.kind === 'payment_options');
  assert.equal(paymentSection?.visible, false);
});

test('preview model carries customer, reference, addresses and notes sections', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'quote',
    customer: { name: 'Sea Point Body Corporate', email: 'office@example.com' },
    customerReference: 'PO-7781',
    issuedAt: '2026-08-04',
    dueDate: '2026-08-18',
    addresses: {
      billingAddress: '1 Main Rd, Sea Point',
      siteAddress: '12 Ocean View, Sea Point',
      postalAddress: 'PO Box 44, Cape Town',
    },
    notes: 'Please confirm access with the caretaker.',
    paymentTerms: '50% deposit on acceptance.',
    lines: [{ description: 'Drain clearance', quantity: 1, unitPriceCents: 250000, vatRateBps: 1500 }],
  });

  assert.equal(model.customer?.name, 'Sea Point Body Corporate');
  assert.equal(model.customerReference, 'PO-7781');
  assert.equal(model.documentAddresses.siteAddress, '12 Ocean View, Sea Point');
  assert.equal(model.property.addressLine, '12 Ocean View, Sea Point');
  const scope = model.sections.find((section) => section.kind === 'scope_of_work');
  assert.equal((scope?.payload as { text?: string }).text, 'Please confirm access with the caretaker.');
  const terms = model.sections.find((section) => section.kind === 'terms_exclusions');
  assert.match((terms?.payload as { text?: string }).text ?? '', /50% deposit/);
});

test('official Xero numbers pass through when present on edit preview', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'invoice',
    xeroInvoiceNumber: 'INV-1044',
    lines: [{ description: 'Service', quantity: 1, unitPriceCents: 10000, vatRateBps: 1500 }],
  });
  assert.equal(model.documentNumber, 'INV-1044');
  assert.equal(financeDocumentPreviewFilename('invoice'), 'YGP-Draft-Invoice.pdf');
});
