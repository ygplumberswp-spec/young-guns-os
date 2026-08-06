import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { constants } from 'node:fs';
import {
  collectReferencedFinanceDirectStorageKeys,
  FinanceDocumentStagingCleanupService,
} from './finance-document-staging-cleanup.service.js';
import { FinanceDocumentEvidenceStorageService } from './finance-document-evidence-storage.service.js';

const companyId = '11111111-1111-4111-8111-111111111111';
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

async function seedStagedFile(
  root: string,
  storage: FinanceDocumentEvidenceStorageService,
  scopeId: string,
  createdAt?: string,
) {
  const stored = await storage.store({
    companyId,
    scope: 'staging',
    scopeId,
    mimeType: 'image/jpeg',
    buffer: jpeg,
    originalFileName: 'staged.jpg',
  });
  if (createdAt) {
    const metaPath = join(root, companyId, 'finance', 'staging', scopeId, `${stored.fileId}.json`);
    const metadata = JSON.parse(await readFile(metaPath, 'utf8'));
    metadata.createdAt = createdAt;
    await writeFile(metaPath, JSON.stringify(metadata));
  }
  return stored;
}

test('finance staging cleanup selects expired staged file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'finance-cleanup-expired-'));
  const storage = new FinanceDocumentEvidenceStorageService(dir);
  const cleanup = new FinanceDocumentStagingCleanupService(dir);
  const stored = await seedStagedFile(dir, storage, 'draft-old', '2020-01-01T00:00:00.000Z');

  const result = await cleanup.cleanup({
    referencedStorageKeys: new Set(),
    retentionDays: 7,
    now: new Date('2026-01-01T00:00:00.000Z'),
  });

  assert.equal(result.eligible, 1);
  assert.equal(result.deleted, 1);
  await assert.rejects(() => access(join(dir, stored.storageKey), constants.F_OK));
});

test('finance staging cleanup preserves recent staged file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'finance-cleanup-recent-'));
  const storage = new FinanceDocumentEvidenceStorageService(dir);
  const cleanup = new FinanceDocumentStagingCleanupService(dir);
  await seedStagedFile(dir, storage, 'draft-recent', new Date().toISOString());

  const result = await cleanup.cleanup({
    referencedStorageKeys: new Set(),
    retentionDays: 7,
    now: new Date(),
  });

  assert.equal(result.preservedRecent, 1);
  assert.equal(result.deleted, 0);
});

test('finance staging cleanup preserves linked document file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'finance-cleanup-linked-'));
  const storage = new FinanceDocumentEvidenceStorageService(dir);
  const cleanup = new FinanceDocumentStagingCleanupService(dir);
  const stored = await seedStagedFile(dir, storage, 'draft-linked', '2020-01-01T00:00:00.000Z');

  const result = await cleanup.cleanup({
    referencedStorageKeys: new Set([stored.storageKey]),
    retentionDays: 7,
    now: new Date('2026-01-01T00:00:00.000Z'),
  });

  assert.equal(result.preservedReferenced, 1);
  assert.equal(result.deleted, 0);
});

test('finance staging cleanup never removes job evidence paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'finance-cleanup-job-'));
  const cleanup = new FinanceDocumentStagingCleanupService(dir);
  const jobEvidencePath = join(dir, companyId, 'jobs', 'job-1', 'photo.bin');
  await mkdir(join(dir, companyId, 'jobs', 'job-1'), { recursive: true });
  await writeFile(jobEvidencePath, jpeg);

  const result = await cleanup.cleanup({
    referencedStorageKeys: new Set(),
    retentionDays: 1,
    now: new Date('2026-01-01T00:00:00.000Z'),
  });

  assert.equal(result.deleted, 0);
  await access(jobEvidencePath, constants.F_OK);
});

test('finance staging cleanup rejects path traversal outside staging root', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'finance-cleanup-traversal-'));
  const cleanup = new FinanceDocumentStagingCleanupService(dir);
  const evilDir = join(dir, companyId, 'finance', 'document', 'evil');
  await mkdir(evilDir, { recursive: true });
  await writeFile(join(evilDir, 'x.json'), '{}');

  const result = await cleanup.cleanup({
    referencedStorageKeys: new Set(),
    retentionDays: 1,
    now: new Date('2026-01-01T00:00:00.000Z'),
  });

  assert.equal(result.deleted, 0);
});

test('finance staging cleanup dry run performs no deletion', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'finance-cleanup-dry-'));
  const storage = new FinanceDocumentEvidenceStorageService(dir);
  const cleanup = new FinanceDocumentStagingCleanupService(dir);
  const stored = await seedStagedFile(dir, storage, 'draft-dry', '2020-01-01T00:00:00.000Z');

  const result = await cleanup.cleanup({
    referencedStorageKeys: new Set(),
    retentionDays: 7,
    dryRun: true,
    now: new Date('2026-01-01T00:00:00.000Z'),
  });

  assert.equal(result.eligible, 1);
  assert.equal(result.deleted, 0);
  await access(join(dir, stored.storageKey), constants.F_OK);
});

test('finance staging cleanup remains safe when repeated', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'finance-cleanup-repeat-'));
  const storage = new FinanceDocumentEvidenceStorageService(dir);
  const cleanup = new FinanceDocumentStagingCleanupService(dir);
  await seedStagedFile(dir, storage, 'draft-repeat', '2020-01-01T00:00:00.000Z');

  const first = await cleanup.cleanup({
    referencedStorageKeys: new Set(),
    retentionDays: 7,
    now: new Date('2026-01-01T00:00:00.000Z'),
  });
  const second = await cleanup.cleanup({
    referencedStorageKeys: new Set(),
    retentionDays: 7,
    now: new Date('2026-01-01T00:00:00.000Z'),
  });

  assert.equal(first.deleted, 1);
  assert.equal(second.deleted, 0);
  assert.equal(second.eligible, 0);
});

test('finance staging cleanup respects tenant-scoped company filter', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'finance-cleanup-tenant-'));
  const storageA = new FinanceDocumentEvidenceStorageService(dir);
  const storageB = new FinanceDocumentEvidenceStorageService(dir);
  const companyB = '22222222-2222-4222-8222-222222222222';

  await seedStagedFile(dir, storageA, 'draft-a', '2020-01-01T00:00:00.000Z');
  const storedB = await storageB.store({
    companyId: companyB,
    scope: 'staging',
    scopeId: 'draft-b',
    mimeType: 'image/jpeg',
    buffer: jpeg,
  });

  const cleanup = new FinanceDocumentStagingCleanupService(dir);
  const result = await cleanup.cleanup({
    referencedStorageKeys: new Set(),
    retentionDays: 7,
    companyId,
    now: new Date('2026-01-01T00:00:00.000Z'),
  });

  assert.equal(result.eligible, 1);
  assert.equal(result.deleted, 1);
  await access(join(dir, storedB.storageKey), constants.F_OK);
});

test('collectReferencedFinanceDirectStorageKeys extracts finance_direct keys only', () => {
  const keys = collectReferencedFinanceDirectStorageKeys([
    {
      photos: [
        { source: 'finance_direct', storageKey: 'a/finance/staging/x/y.bin' },
        { source: 'job_evidence', storageKey: 'ignored' },
        { source: 'finance_direct', storageKey: '' },
      ],
    },
  ]);
  assert.deepEqual([...keys], ['a/finance/staging/x/y.bin']);
});
