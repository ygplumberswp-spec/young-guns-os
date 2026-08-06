import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  BankStatementStorageError,
  BankStatementStorageService,
} from './bank-statement-storage.service.js';
import { BANK_STATEMENT_MAX_FILE_BYTES } from '@titan/shared';

const SYNTHETIC_CSV = Buffer.from(`Date,Amount,Description
2026-01-15,100.00,Test row
`);

test('bank statement storage rejects oversized synthetic file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bank-stmt-storage-'));
  const service = new BankStatementStorageService(dir);
  const oversized = Buffer.alloc(BANK_STATEMENT_MAX_FILE_BYTES + 1, 0x20);
  await assert.rejects(
    () =>
      service.store({
        companyId: '11111111-1111-4111-8111-111111111111',
        batchId: '22222222-2222-4222-8222-222222222222',
        filename: 'big.csv',
        mimeType: 'text/csv',
        content: oversized,
      }),
    (error: unknown) => error instanceof BankStatementStorageError && error.code === 'FILE_TOO_LARGE',
  );
  await rm(dir, { recursive: true, force: true });
});

test('bank statement storage rejects invalid mime type', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bank-stmt-storage-'));
  const service = new BankStatementStorageService(dir);
  await assert.rejects(
    () =>
      service.store({
        companyId: '11111111-1111-4111-8111-111111111111',
        batchId: '22222222-2222-4222-8222-222222222222',
        filename: 'statement.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('%PDF'),
      }),
    (error: unknown) =>
      error instanceof BankStatementStorageError && error.code === 'INVALID_FILE_TYPE',
  );
  await rm(dir, { recursive: true, force: true });
});

test('bank statement storage stores synthetic CSV privately', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bank-stmt-storage-'));
  const service = new BankStatementStorageService(dir);
  const stored = await service.store({
    companyId: '11111111-1111-4111-8111-111111111111',
    batchId: '22222222-2222-4222-8222-222222222222',
    filename: '../../unsafe name.csv',
    mimeType: 'text/csv',
    content: SYNTHETIC_CSV,
  });
  assert.match(stored.sanitizedFilename, /^[_a-zA-Z0-9.-]+\.csv$/);
  assert.equal(stored.checksumSha256.length, 64);
  assert.ok(stored.storageKey.includes('bank-statements'));
  await rm(dir, { recursive: true, force: true });
});

test('bank statement storage not configured when root null', async () => {
  const service = new BankStatementStorageService(null);
  assert.equal(service.isConfigured(), false);
});
