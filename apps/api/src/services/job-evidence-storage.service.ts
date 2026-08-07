import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateEvidenceUploadMagicBytes } from '@titan/shared';

const PHOTO_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic']);
const DOCUMENT_MIME = new Set([
  ...PHOTO_MIME,
  'application/pdf',
  'image/svg+xml',
]);
const SIGNATURE_MIME = new Set(['image/png', 'image/svg+xml', 'image/jpeg']);
const MAGIC_CHECKED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'application/pdf',
]);

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 1.5 * 1024 * 1024;

export type JobEvidenceKind = 'photo' | 'document' | 'signature';

export type JobEvidenceStoredFile = {
  storageKey: string;
  fileId: string;
  companyId: string;
  jobId: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  createdAt: string;
};

export class JobEvidenceStorageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'JobEvidenceStorageError';
  }
}

function safeFileName(input: string | null | undefined): string {
  const base = (input ?? 'evidence.bin').trim() || 'evidence.bin';
  return base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

export class JobEvidenceStorageService {
  constructor(private readonly storageRoot: string | null) {}

  isConfigured(): boolean {
    return Boolean(this.storageRoot?.trim());
  }

  validate(input: { kind: JobEvidenceKind; mimeType: string; sizeBytes: number }): void {
    const mime = input.mimeType.toLowerCase();
    if (input.kind === 'photo' && !PHOTO_MIME.has(mime)) {
      throw new JobEvidenceStorageError(
        'INVALID_FILE_TYPE',
        'Photos must be PNG, JPEG, WebP, GIF or HEIC',
      );
    }
    if (input.kind === 'document' && !DOCUMENT_MIME.has(mime)) {
      throw new JobEvidenceStorageError(
        'INVALID_FILE_TYPE',
        'Documents must be an allowed image or PDF',
      );
    }
    if (input.kind === 'signature' && !SIGNATURE_MIME.has(mime)) {
      throw new JobEvidenceStorageError(
        'INVALID_FILE_TYPE',
        'Signatures must be PNG, JPEG or SVG',
      );
    }

    const max =
      input.kind === 'signature'
        ? MAX_SIGNATURE_BYTES
        : input.kind === 'photo'
          ? MAX_PHOTO_BYTES
          : MAX_DOCUMENT_BYTES;
    if (input.sizeBytes > max) {
      throw new JobEvidenceStorageError(
        'FILE_TOO_LARGE',
        `File exceeds the ${Math.round(max / (1024 * 1024))} MB limit for ${input.kind}`,
      );
    }
    if (input.sizeBytes <= 0) {
      throw new JobEvidenceStorageError('VALIDATION_ERROR', 'File is empty');
    }
  }

  async store(input: {
    companyId: string;
    jobId: string;
    kind: JobEvidenceKind;
    mimeType: string;
    buffer: Buffer;
    originalFileName?: string | null;
  }): Promise<JobEvidenceStoredFile> {
    if (!this.storageRoot) {
      throw new JobEvidenceStorageError(
        'STORAGE_NOT_CONFIGURED',
        'Job evidence storage is not configured',
      );
    }

    this.validate({
      kind: input.kind,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.byteLength,
    });

    const mime = input.mimeType.toLowerCase();
    if (MAGIC_CHECKED_MIME.has(mime) && !validateEvidenceUploadMagicBytes(mime, input.buffer)) {
      throw new JobEvidenceStorageError(
        'INVALID_FILE_CONTENTS',
        'File contents do not match the declared type',
      );
    }

    const fileId = randomUUID();
    const dir = join(this.storageRoot, input.companyId, input.jobId);
    await mkdir(dir, { recursive: true });

    const checksumSha256 = createHash('sha256').update(input.buffer).digest('hex');
    const createdAt = new Date().toISOString();
    const storageKey = `${input.companyId}/${input.jobId}/${fileId}.bin`;
    const filePath = join(this.storageRoot, storageKey);
    const metaPath = join(this.storageRoot, input.companyId, input.jobId, `${fileId}.json`);

    const metadata: JobEvidenceStoredFile & { originalFileName: string } = {
      storageKey,
      fileId,
      companyId: input.companyId,
      jobId: input.jobId,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.byteLength,
      checksumSha256,
      createdAt,
      originalFileName: safeFileName(input.originalFileName),
    };

    await writeFile(filePath, input.buffer);
    await writeFile(metaPath, JSON.stringify(metadata));

    return metadata;
  }

  async read(input: {
    companyId: string;
    jobId: string;
    storageKey: string;
  }): Promise<{ metadata: JobEvidenceStoredFile; buffer: Buffer }> {
    if (!this.storageRoot) {
      throw new JobEvidenceStorageError(
        'STORAGE_NOT_CONFIGURED',
        'Job evidence storage is not configured',
      );
    }

    if (
      !input.storageKey.startsWith(`${input.companyId}/${input.jobId}/`) ||
      input.storageKey.includes('..')
    ) {
      throw new JobEvidenceStorageError('FORBIDDEN', 'Invalid storage key for this job');
    }

    const filePath = join(this.storageRoot, input.storageKey);
    const fileId = input.storageKey.split('/').pop()?.replace(/\.bin$/, '');
    if (!fileId) {
      throw new JobEvidenceStorageError('NOT_FOUND', 'Evidence file not found');
    }
    const metaPath = join(this.storageRoot, input.companyId, input.jobId, `${fileId}.json`);

    let metadataRaw: string;
    try {
      metadataRaw = await readFile(metaPath, 'utf8');
    } catch {
      throw new JobEvidenceStorageError('NOT_FOUND', 'Evidence file not found');
    }

    const metadata = JSON.parse(metadataRaw) as JobEvidenceStoredFile;
    if (metadata.companyId !== input.companyId || metadata.jobId !== input.jobId) {
      throw new JobEvidenceStorageError('FORBIDDEN', 'Evidence does not belong to this tenant/job');
    }

    const buffer = await readFile(filePath);
    return { metadata, buffer };
  }
}

export function decodeBase64Payload(dataBase64: string): Buffer {
  const trimmed = dataBase64.trim();
  const withoutPrefix = trimmed.includes(',') ? trimmed.split(',').pop()! : trimmed;
  try {
    return Buffer.from(withoutPrefix, 'base64');
  } catch {
    throw new JobEvidenceStorageError('VALIDATION_ERROR', 'Invalid base64 payload');
  }
}
