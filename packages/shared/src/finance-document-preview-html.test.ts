import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFinanceDocumentPreviewHtml,
  isValidPdfBuffer,
} from './finance-document-preview-html.js';
import { buildFinanceDocumentPreviewModel } from './finance-document-preview.js';

test('preview HTML includes Young Guns branding and draft numbering', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'quote',
    customer: { name: 'Sea Point Body Corporate' },
    customerReference: 'PO-7781',
    lines: [{ description: 'Call-out', quantity: 1, unitPriceCents: 45000, vatRateBps: 1500 }],
  });
  const html = buildFinanceDocumentPreviewHtml(model);
  assert.match(html, /Young Guns Plumbing/i);
  assert.match(html, /Draft — Xero quote number pending/);
  assert.match(html, /PO-7781/);
  assert.match(html, /Call-out/);
  assert.doesNotMatch(html, /<title>.*TITAN/i);
});

test('preview HTML serializes VAT totals from the shared preview model', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'invoice',
    lines: [
      { description: 'Labour', quantity: 2, unitPriceCents: 65000, vatRateBps: 1500 },
      { description: 'Parts', quantity: 1, unitPriceCents: 10000, vatRateBps: 1500 },
    ],
  });
  const html = buildFinanceDocumentPreviewHtml(model);
  assert.match(html, /VAT \(15%\)/);
  assert.match(html, /ZAR 1[\s\u00a0]?400\.00/);
  assert.match(html, /ZAR 210\.00/);
  assert.match(html, /ZAR 1[\s\u00a0]?610\.00/);
});

test('isValidPdfBuffer accepts genuine PDF signatures only', () => {
  assert.equal(isValidPdfBuffer(Buffer.from('%PDF-1.7\n')), true);
  assert.equal(isValidPdfBuffer(Buffer.from('not-a-pdf')), false);
  assert.equal(isValidPdfBuffer(Buffer.from('%PD')), false);
});
