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

test('invoice work completed and warranty sections render in HTML', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'invoice',
    status: 'sent',
    showPaymentDetails: true,
    workCompleted: 'Installed new mixer and tested all outlets.',
    warranty: { text: 'Workmanship warranty applies to installed fittings only.', months: 12 },
    recommendedMaintenance: {
      text: 'Annual geyser service recommended.',
      items: [{ label: 'Geyser anode inspection' }],
    },
    lines: [{ description: 'Labour', quantity: 1, unitPriceCents: 65000, vatRateBps: 1500 }],
  });
  const html = buildFinanceDocumentPreviewHtml(model);
  assert.match(html, /Installed new mixer/);
  assert.match(html, /Workmanship warranty applies/);
  assert.match(html, /Annual geyser service/);
  assert.match(html, /Geyser anode inspection/);
});

test('work completed hidden on quotes even when text supplied', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'quote',
    workCompleted: 'Should not appear on quote PDF',
    lines: [{ description: 'Line', quantity: 1, unitPriceCents: 100, vatRateBps: 0 }],
  });
  const html = buildFinanceDocumentPreviewHtml(model);
  assert.doesNotMatch(html, /Should not appear on quote PDF/);
});

test('yoco payment link renders when genuine URL supplied', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'invoice',
    status: 'sent',
    showPaymentDetails: true,
    paymentUrl: 'https://pay.yoco.com/checkout/test-invoice',
    lines: [{ description: 'Line', quantity: 1, unitPriceCents: 10000, vatRateBps: 1500 }],
  });
  const html = buildFinanceDocumentPreviewHtml(model);
  assert.match(html, /pay\.yoco\.com/);
  assert.match(html, /Pay securely with Yoco/);
});

test('unsafe yoco URL rejected from preview model', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'invoice',
    status: 'sent',
    showPaymentDetails: true,
    paymentUrl: 'https://evil.example/phish',
    lines: [{ description: 'Line', quantity: 1, unitPriceCents: 100, vatRateBps: 0 }],
  });
  assert.equal(model.paymentUrl, null);
});

test('before and after photos render in separate subsections', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'invoice',
    lines: [{ description: 'Line', quantity: 1, unitPriceCents: 100, vatRateBps: 0 }],
  });
  model.attachments = [
    {
      fileName: 'before.jpg',
      mimeType: 'image/jpeg',
      caption: 'Corroded pipe',
      dataUrl: 'data:image/jpeg;base64,YmVmb3Jl',
      role: 'before',
    },
    {
      fileName: 'after.jpg',
      mimeType: 'image/jpeg',
      caption: 'New pipe',
      dataUrl: 'data:image/jpeg;base64,YWZ0ZXI=',
      role: 'after',
    },
  ];
  const html = buildFinanceDocumentPreviewHtml(model);
  assert.match(html, /Before/);
  assert.match(html, /After/);
  assert.match(html, /Corroded pipe/);
});

test('non-image attachments render as file references not broken images', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'invoice',
    lines: [{ description: 'Line', quantity: 1, unitPriceCents: 100, vatRateBps: 0 }],
  });
  model.attachments = [
    {
      fileName: 'certificate.pdf',
      mimeType: 'application/pdf',
      caption: 'CoC scan',
      dataUrl: null,
      role: 'additional',
    },
  ];
  const html = buildFinanceDocumentPreviewHtml(model);
  assert.match(html, /certificate\.pdf/);
  assert.doesNotMatch(html, /data:application\/pdf/);
});

test('long line item table serializes without truncation', () => {
  const lines = Array.from({ length: 30 }, (_, index) => ({
    description: `Line item ${index + 1} — extended description for wrap testing`,
    quantity: 1,
    unitPriceCents: 1000 + index,
    vatRateBps: 1500,
  }));
  const model = buildFinanceDocumentPreviewModel({ kind: 'invoice', lines });
  const html = buildFinanceDocumentPreviewHtml(model);
  assert.match(html, /Line item 1/);
  assert.match(html, /Line item 30/);
});

test('contact help section renders verified Young Guns contact details', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'quote',
    lines: [{ description: 'Line', quantity: 1, unitPriceCents: 100, vatRateBps: 0 }],
  });
  const html = buildFinanceDocumentPreviewHtml(model);
  assert.match(html, /066 234 6301/);
  assert.match(html, /ygplumberswp@gmail\.com/);
});

test('coc section renders only when genuinely attached', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'invoice',
    status: 'sent',
    coc: {
      status: 'attached',
      documentId: 'doc-coc-1',
      jobId: 'job-1',
      fileName: 'coc-2026.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      downloadPath: '/api/v1/jobs/job-1/evidence/doc-coc-1/content',
    },
    lines: [{ description: 'Line', quantity: 1, unitPriceCents: 100, vatRateBps: 0 }],
  });
  const html = buildFinanceDocumentPreviewHtml(model);
  assert.match(html, /Certificate of Compliance: coc-2026\.pdf/);
  assert.match(html, /attached to this job record/i);
  assert.doesNotMatch(html, /\/api\/v1\/jobs/);
});

test('coc section hidden when status is not attached', () => {
  const model = buildFinanceDocumentPreviewModel({
    kind: 'invoice',
    coc: { status: 'not_attached' },
    lines: [{ description: 'Line', quantity: 1, unitPriceCents: 100, vatRateBps: 0 }],
  });
  const html = buildFinanceDocumentPreviewHtml(model);
  assert.doesNotMatch(html, /Certificate attached/i);
});
