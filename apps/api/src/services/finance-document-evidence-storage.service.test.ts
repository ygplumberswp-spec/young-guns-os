import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  FinanceDocumentEvidenceStorageService,
  FinanceDocumentEvidenceStorageError,
} from './finance-document-evidence-storage.service.js';

test('finance document evidence storage rejects path traversal keys', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'finance-evidence-'));
  const service = new FinanceDocumentEvidenceStorageService(dir);
  const companyId = '11111111-1111-4111-8111-111111111111';

  await assert.rejects(
    () =>
      service.read({
        companyId,
        storageKey: `${companyId}/finance/staging/../other/file.bin`,
      }),
    (error: unknown) => error instanceof FinanceDocumentEvidenceStorageError && error.code === 'FORBIDDEN',
  );
});

test('finance document evidence storage enforces tenant isolation on read', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'finance-evidence-'));
  const service = new FinanceDocumentEvidenceStorageService(dir);
  const ownerCompany = '11111111-1111-4111-8111-111111111111';
  const otherCompany = '22222222-2222-4222-8222-222222222222';
  const scopeId = 'draft-quote-abc';

  const stored = await service.store({
    companyId: ownerCompany,
    scope: 'staging',
    scopeId,
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
    originalFileName: 'photo.jpg',
  });

  await assert.rejects(
    () =>
      service.read({
        companyId: otherCompany,
        storageKey: stored.storageKey,
      }),
    (error: unknown) => error instanceof FinanceDocumentEvidenceStorageError,
  );
});

test('finance document evidence storage rejects invalid mime content', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'finance-evidence-'));
  const service = new FinanceDocumentEvidenceStorageService(dir);

  await assert.rejects(
    () =>
      service.store({
        companyId: '11111111-1111-4111-8111-111111111111',
        scope: 'staging',
        scopeId: 'draft-1',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('not-a-jpeg'),
        originalFileName: 'bad.jpg',
      }),
    (error: unknown) => error instanceof FinanceDocumentEvidenceStorageError,
  );
});

test('finance document evidence storage round-trips staged file bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'finance-evidence-'));
  const service = new FinanceDocumentEvidenceStorageService(dir);
  const companyId = '11111111-1111-4111-8111-111111111111';
  const payload = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

  const stored = await service.store({
    companyId,
    scope: 'staging',
    scopeId: 'draft-quote-xyz',
    mimeType: 'image/jpeg',
    buffer: payload,
    originalFileName: 'site-photo.jpg',
  });

  const { buffer, metadata } = await service.read({ companyId, storageKey: stored.storageKey });
  assert.equal(metadata.mimeType, 'image/jpeg');
  assert.equal(metadata.originalFileName, 'site-photo.jpg');
  assert.deepEqual(buffer, payload);
});
