import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FINANCE_ATTACHMENT_ACCEPT,
  normaliseUploadMimeType,
  validateClientAttachmentFile,
} from './finance-attachment-utils.js';

const featureRoot = dirname(fileURLToPath(import.meta.url));

test('finance attachment accept string covers required mobile-friendly mime types', () => {
  assert.match(FINANCE_ATTACHMENT_ACCEPT, /image\/jpeg/);
  assert.match(FINANCE_ATTACHMENT_ACCEPT, /image\/png/);
  assert.match(FINANCE_ATTACHMENT_ACCEPT, /image\/webp/);
  assert.match(FINANCE_ATTACHMENT_ACCEPT, /image\/heic/);
  assert.match(FINANCE_ATTACHMENT_ACCEPT, /application\/pdf/);
  assert.match(FINANCE_ATTACHMENT_ACCEPT, /\.heic/);
});

test('normaliseUploadMimeType infers HEIC from filename when browser omits mime type', () => {
  const file = { name: 'site-photo.HEIC', type: '', size: 1024 } as File;
  assert.equal(normaliseUploadMimeType(file), 'image/heic');
});

test('validateClientAttachmentFile mirrors shared server limits', () => {
  const ok = { name: 'photo.jpg', type: 'image/jpeg', size: 1024 } as File;
  assert.equal(validateClientAttachmentFile(ok), null);

  const badType = { name: 'notes.txt', type: 'text/plain', size: 100 } as File;
  assert.match(validateClientAttachmentFile(badType) ?? '', /JPG, PNG, WebP, HEIC or PDF/);
});

test('attachments API client exposes tenant-scoped content URLs', () => {
  const apiSource = readFileSync(join(featureRoot, 'finance-attachments-api.ts'), 'utf8');
  assert.match(apiSource, /\/finance\/attachments\/\$\{attachmentId\}\/content/);
  assert.match(apiSource, /linkStagingJobEvidence/);
  assert.match(apiSource, /linkStagingAttachmentsToDocument/);
});
