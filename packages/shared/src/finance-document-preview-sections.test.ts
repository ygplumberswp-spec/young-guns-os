import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldHideFinancePreviewPaymentOptions,
  shouldShowFinancePreviewReviewSection,
  shouldShowFinancePreviewWorkCompleted,
  shouldShowFinancePreviewWarranty,
  shouldShowFinancePreviewMaintenance,
  shouldShowFinancePreviewCoc,
  sanitizeFinancePreviewPaymentUrl,
  sanitizeFinancePreviewReviewUrl,
  groupFinancePreviewAttachments,
  formatVerifiedWebsiteDisplay,
} from './finance-document-preview-sections.js';

test('payment options hidden on draft invoices by default', () => {
  assert.equal(
    shouldHideFinancePreviewPaymentOptions({ kind: 'invoice', status: 'draft' }),
    true,
  );
});

test('payment options visible on sent invoices', () => {
  assert.equal(
    shouldHideFinancePreviewPaymentOptions({ kind: 'invoice', status: 'sent' }),
    false,
  );
});

test('payment options hidden on quotes', () => {
  assert.equal(
    shouldHideFinancePreviewPaymentOptions({ kind: 'quote', status: 'sent' }),
    true,
  );
});

test('draft payment override via showPaymentDetails', () => {
  assert.equal(
    shouldHideFinancePreviewPaymentOptions({
      kind: 'invoice',
      status: 'draft',
      showPaymentDetails: true,
    }),
    false,
  );
});

test('review section only on sent invoice lifecycle statuses', () => {
  assert.equal(shouldShowFinancePreviewReviewSection({ kind: 'invoice', status: 'sent' }), true);
  assert.equal(shouldShowFinancePreviewReviewSection({ kind: 'invoice', status: 'draft' }), false);
  assert.equal(shouldShowFinancePreviewReviewSection({ kind: 'quote', status: 'sent' }), false);
});

test('work completed invoice-only when populated', () => {
  assert.equal(
    shouldShowFinancePreviewWorkCompleted({ kind: 'invoice', workCompleted: 'Done' }),
    true,
  );
  assert.equal(
    shouldShowFinancePreviewWorkCompleted({ kind: 'quote', workCompleted: 'Done' }),
    false,
  );
  assert.equal(
    shouldShowFinancePreviewWorkCompleted({ kind: 'invoice', workCompleted: '  ' }),
    false,
  );
});

test('warranty and maintenance visibility', () => {
  assert.equal(shouldShowFinancePreviewWarranty({ text: '12 month workmanship' }), true);
  assert.equal(shouldShowFinancePreviewWarranty({ text: '  ' }), false);
  assert.equal(
    shouldShowFinancePreviewMaintenance({ items: [{ label: 'Annual service' }] }),
    true,
  );
});

test('coc visible only when attached on invoices', () => {
  const attached = {
    status: 'attached' as const,
    documentId: 'doc-1',
    jobId: 'job-1',
    fileName: 'coc.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 100,
    downloadPath: '/api/v1/jobs/job-1/evidence/doc-1/content',
  };
  assert.equal(shouldShowFinancePreviewCoc('invoice', attached), true);
  assert.equal(shouldShowFinancePreviewCoc('invoice', { status: 'not_attached' }), false);
  assert.equal(shouldShowFinancePreviewCoc('quote', attached), false);
});

test('sanitize payment URL accepts yoco only', () => {
  assert.equal(
    sanitizeFinancePreviewPaymentUrl('https://pay.yoco.com/checkout/abc'),
    'https://pay.yoco.com/checkout/abc',
  );
  assert.equal(sanitizeFinancePreviewPaymentUrl('https://evil.example/pay'), null);
});

test('sanitize review URL accepts google domains only', () => {
  assert.equal(
    sanitizeFinancePreviewReviewUrl('https://g.page/r/young-guns-plumbing/review'),
    'https://g.page/r/young-guns-plumbing/review',
  );
  assert.equal(sanitizeFinancePreviewReviewUrl('http://g.page/review'), null);
  assert.equal(sanitizeFinancePreviewReviewUrl('https://evil.example/review'), null);
});

test('group attachments by role and mime type', () => {
  const grouped = groupFinancePreviewAttachments([
    {
      fileName: 'before.jpg',
      mimeType: 'image/jpeg',
      caption: null,
      dataUrl: 'data:image/jpeg;base64,x',
      role: 'before',
    },
    {
      fileName: 'after.jpg',
      mimeType: 'image/jpeg',
      caption: null,
      dataUrl: 'data:image/jpeg;base64,y',
      role: 'after',
    },
    {
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      caption: null,
      dataUrl: null,
    },
  ]);
  assert.equal(grouped.before.length, 1);
  assert.equal(grouped.after.length, 1);
  assert.equal(grouped.files.length, 1);
});

test('formatVerifiedWebsiteDisplay adds https when missing', () => {
  assert.equal(formatVerifiedWebsiteDisplay('younggunsplumbing.co.za'), 'https://younggunsplumbing.co.za');
  assert.equal(formatVerifiedWebsiteDisplay('https://younggunsplumbing.co.za'), 'https://younggunsplumbing.co.za');
  assert.equal(formatVerifiedWebsiteDisplay(''), null);
});
