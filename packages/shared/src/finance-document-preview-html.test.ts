import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFinanceDocumentPreviewHtml,
  buildFinanceDocumentPrintCss,
  isValidPdfBuffer,
} from './finance-document-preview-html.js';
import { buildFinanceDocumentPreviewModel } from './finance-document-preview.js';

test('preview HTML uses official Young Guns header and quote label', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'quote',
    customer: { name: 'Sea Point Body Corporate' },
    customerReference: 'PO-7781',
    status: 'draft',
    lines: [{ description: 'Call-out', quantity: 1, unitPriceCents: 45000, vatRateBps: 1500 }],
  });
  const html = buildFinanceDocumentPreviewHtml(model);
  assert.match(html, /Young Guns Plumbing/i);
  assert.match(html, /YGP/);
  assert.match(html, /QUOTE/);
  assert.match(html, /Prepared For/i);
  assert.match(html, /Quote Status/i);
  assert.match(html, /Draft — Xero quote number pending/);
  assert.match(html, /PO-7781/);
  assert.match(html, /Call-out/);
  assert.doesNotMatch(html, /fake.*qr/i);
});

test('invoice preview uses TAX INVOICE heading and dynamic status colour', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'invoice',
    status: 'overdue',
    lines: [{ description: 'Labour', quantity: 1, unitPriceCents: 10000, vatRateBps: 1500 }],
  });
  const html = buildFinanceDocumentPreviewHtml(model);
  assert.match(html, /TAX INVOICE/);
  assert.match(html, /Billed To/i);
  assert.match(html, /Invoice Status/i);
  assert.match(html, /Overdue/i);
  assert.doesNotMatch(html, />\s*PAID\s*</i);
});

test('print CSS is generated from document colour tokens', () => {
  const css = buildFinanceDocumentPrintCss();
  assert.match(css, /#1[fF]7[aA][eE][cC]|#04070[Dd]/);
  assert.match(css, /thead th/);
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
  assert.match(html, /ZAR 1[\s\u00a0]?610\.00/);
});

test('payment section hidden for finance preview drafts', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'invoice',
    lines: [{ description: 'Line', quantity: 1, unitPriceCents: 100, vatRateBps: 0 }],
  });
  const html = buildFinanceDocumentPreviewHtml(model);
  assert.doesNotMatch(html, /62847540459/);
});

test('preview HTML embeds document-engine photos selected for PDF', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'quote',
    lines: [{ description: 'Labour', quantity: 1, unitPriceCents: 10000, vatRateBps: 1500 }],
  });
  model.attachments = [
    {
      fileName: 'before.jpg',
      mimeType: 'image/jpeg',
      caption: 'Corroded pipe',
      dataUrl: 'data:image/jpeg;base64,YmVmb3Jl',
    },
  ];
  const html = buildFinanceDocumentPreviewHtml(model);
  assert.match(html, /Corroded pipe/);
  assert.match(html, /data:image\/jpeg;base64,YmVmb3Jl/);
});

test('footer includes Young Guns slogan', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'quote',
    lines: [{ description: 'Test', quantity: 1, unitPriceCents: 100, vatRateBps: 0 }],
  });
  const html = buildFinanceDocumentPreviewHtml(model);
  assert.match(html, /Your #2 Is Our #1 Priority/);
});

test('isValidPdfBuffer accepts genuine PDF signatures only', () => {
  assert.equal(isValidPdfBuffer(Buffer.from('%PDF-1.7\n')), true);
  assert.equal(isValidPdfBuffer(Buffer.from('not-a-pdf')), false);
});
