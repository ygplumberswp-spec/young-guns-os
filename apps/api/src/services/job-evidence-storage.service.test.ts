import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  decodeBase64Payload,
  JobEvidenceStorageError,
  JobEvidenceStorageService,
} from './job-evidence-storage.service.js';

describe('JobEvidenceStorageService.validate', () => {
  const service = new JobEvidenceStorageService(null);

  it('accepts a photo within the allowed MIME set and size limit', () => {
    assert.doesNotThrow(() =>
      service.validate({ kind: 'photo', mimeType: 'image/png', sizeBytes: 1024 }),
    );
  });

  it('rejects a photo with an unsupported MIME type', () => {
    assert.throws(
      () => service.validate({ kind: 'photo', mimeType: 'application/pdf', sizeBytes: 1024 }),
      (error: unknown) => error instanceof JobEvidenceStorageError && error.code === 'INVALID_FILE_TYPE',
    );
  });

  it('rejects a photo larger than the 8MB limit', () => {
    assert.throws(
      () =>
        service.validate({
          kind: 'photo',
          mimeType: 'image/jpeg',
          sizeBytes: 9 * 1024 * 1024,
        }),
      (error: unknown) => error instanceof JobEvidenceStorageError && error.code === 'FILE_TOO_LARGE',
    );
  });

  it('accepts a PDF document within the 10MB limit', () => {
    assert.doesNotThrow(() =>
      service.validate({ kind: 'document', mimeType: 'application/pdf', sizeBytes: 5 * 1024 * 1024 }),
    );
  });

  it('rejects a document larger than the 10MB limit', () => {
    assert.throws(
      () =>
        service.validate({
          kind: 'document',
          mimeType: 'application/pdf',
          sizeBytes: 11 * 1024 * 1024,
        }),
      (error: unknown) => error instanceof JobEvidenceStorageError && error.code === 'FILE_TOO_LARGE',
    );
  });

  it('accepts a signature PNG within the 1.5MB limit', () => {
    assert.doesNotThrow(() =>
      service.validate({ kind: 'signature', mimeType: 'image/png', sizeBytes: 512 * 1024 }),
    );
  });

  it('rejects a signature larger than the 1.5MB limit', () => {
    assert.throws(
      () =>
        service.validate({
          kind: 'signature',
          mimeType: 'image/png',
          sizeBytes: 2 * 1024 * 1024,
        }),
      (error: unknown) => error instanceof JobEvidenceStorageError && error.code === 'FILE_TOO_LARGE',
    );
  });

  it('rejects a signature with an unsupported MIME type', () => {
    assert.throws(
      () => service.validate({ kind: 'signature', mimeType: 'image/gif', sizeBytes: 1024 }),
      (error: unknown) => error instanceof JobEvidenceStorageError && error.code === 'INVALID_FILE_TYPE',
    );
  });

  it('rejects an empty file', () => {
    assert.throws(
      () => service.validate({ kind: 'photo', mimeType: 'image/png', sizeBytes: 0 }),
      (error: unknown) => error instanceof JobEvidenceStorageError && error.code === 'VALIDATION_ERROR',
    );
  });
});

describe('decodeBase64Payload', () => {
  it('decodes a plain base64 string', () => {
    const buffer = decodeBase64Payload(Buffer.from('hello world').toString('base64'));
    assert.equal(buffer.toString('utf8'), 'hello world');
  });

  it('strips a data-URL prefix before decoding', () => {
    const payload = `data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`;
    const buffer = decodeBase64Payload(payload);
    assert.equal(buffer.toString('utf8'), 'png-bytes');
  });
});

describe('JobEvidenceStorageService.store/read', () => {
  let storageRoot: string;
  let service: JobEvidenceStorageService;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'job-evidence-test-'));
    service = new JobEvidenceStorageService(storageRoot);
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('reports unconfigured storage when the root is null', async () => {
    const unconfigured = new JobEvidenceStorageService(null);
    assert.equal(unconfigured.isConfigured(), false);
    await assert.rejects(
      () =>
        unconfigured.store({
          companyId: 'company-1',
          jobId: 'job-1',
          kind: 'photo',
          mimeType: 'image/png',
          buffer: Buffer.from('data'),
        }),
      (error: unknown) => error instanceof JobEvidenceStorageError && error.code === 'STORAGE_NOT_CONFIGURED',
    );
  });

  it('stores a file and computes a stable sha256 checksum', async () => {
    const buffer = Buffer.from('evidence-bytes');
    const stored = await service.store({
      companyId: 'company-1',
      jobId: 'job-1',
      kind: 'photo',
      mimeType: 'image/png',
      buffer,
      originalFileName: 'before.png',
    });

    assert.equal(stored.companyId, 'company-1');
    assert.equal(stored.jobId, 'job-1');
    assert.equal(stored.sizeBytes, buffer.byteLength);
    assert.match(stored.storageKey, /^company-1\/job-1\/.+\.bin$/);
    assert.equal(stored.checksumSha256.length, 64);
  });

  it('round-trips a stored file via read()', async () => {
    const buffer = Buffer.from('round-trip-bytes');
    const stored = await service.store({
      companyId: 'company-2',
      jobId: 'job-2',
      kind: 'document',
      mimeType: 'application/pdf',
      buffer,
    });

    const { buffer: readBuffer, metadata } = await service.read({
      companyId: 'company-2',
      jobId: 'job-2',
      storageKey: stored.storageKey,
    });

    assert.deepEqual(readBuffer, buffer);
    assert.equal(metadata.checksumSha256, stored.checksumSha256);
  });

  it('rejects reading a storage key that does not belong to the given company/job', async () => {
    const stored = await service.store({
      companyId: 'company-3',
      jobId: 'job-3',
      kind: 'photo',
      mimeType: 'image/png',
      buffer: Buffer.from('data'),
    });

    await assert.rejects(
      () =>
        service.read({
          companyId: 'company-other',
          jobId: 'job-3',
          storageKey: stored.storageKey,
        }),
      (error: unknown) => error instanceof JobEvidenceStorageError && error.code === 'FORBIDDEN',
    );
  });

  it('rejects a storage key containing path traversal', async () => {
    await assert.rejects(
      () =>
        service.read({
          companyId: 'company-4',
          jobId: 'job-4',
          storageKey: 'company-4/job-4/../../etc/passwd',
        }),
      (error: unknown) => error instanceof JobEvidenceStorageError && error.code === 'FORBIDDEN',
    );
  });

  it('rejects reading a storage key that has no metadata on disk', async () => {
    await assert.rejects(
      () =>
        service.read({
          companyId: 'company-5',
          jobId: 'job-5',
          storageKey: 'company-5/job-5/does-not-exist.bin',
        }),
      (error: unknown) => error instanceof JobEvidenceStorageError && error.code === 'NOT_FOUND',
    );
  });
});
