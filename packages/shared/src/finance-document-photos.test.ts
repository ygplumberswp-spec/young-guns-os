import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultDocumentPhotoIncludeInPdf,
  documentPhotoIncludedInPdf,
  documentPhotosForPdfPreview,
  setDocumentPhotoIncludeInPdf,
} from './document-engine.js';
import { validateFinancePhotoMagicBytes } from './finance-document-photo-utils.js';

const samplePhoto = {
  id: 'p1',
  documentationId: '11111111-1111-4111-8111-111111111111',
  jobId: '22222222-2222-4222-8222-222222222222',
  role: 'additional' as const,
  caption: null,
  position: 0,
  fileName: 'site.jpg',
  mimeType: 'image/jpeg',
};

test('documentPhotoIncludedInPdf defaults images to included and pdfs to listed only when opted in', () => {
  assert.equal(defaultDocumentPhotoIncludeInPdf('image/jpeg'), true);
  assert.equal(defaultDocumentPhotoIncludeInPdf('application/pdf'), false);
  assert.equal(documentPhotoIncludedInPdf(samplePhoto), true);
  assert.equal(
    documentPhotoIncludedInPdf({ ...samplePhoto, mimeType: 'application/pdf', includeInPdf: true }),
    true,
  );
});

test('setDocumentPhotoIncludeInPdf toggles finance PDF selection without duplicating bytes', () => {
  const updated = setDocumentPhotoIncludeInPdf([samplePhoto], 'p1', false);
  assert.equal(updated[0]?.includeInPdf, false);
  assert.deepEqual(documentPhotosForPdfPreview(updated), []);
});

test('validateFinancePhotoMagicBytes accepts JPEG signature', () => {
  assert.equal(validateFinancePhotoMagicBytes('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00])), true);
});

test('validateFinancePhotoMagicBytes rejects mismatched content', () => {
  assert.equal(validateFinancePhotoMagicBytes('image/jpeg', Buffer.from('not-a-jpeg')), false);
  assert.equal(validateFinancePhotoMagicBytes('application/pdf', Buffer.from('html')), false);
});
