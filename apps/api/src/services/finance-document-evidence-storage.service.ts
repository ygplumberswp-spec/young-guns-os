import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildFinanceDirectStorageKey,
  validateFinanceDirectUpload,
} from '@titan/shared';

export type FinanceDocumentEvidenceStoredFile = {
  storageKey: string;
  fileId: string;
  companyId: string;
  scope: 'staging' | 'document';
  scopeId: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  originalFileName: string;
  createdAt: string;
};

export class FinanceDocumentEvidenceStorageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FinanceDocumentEvidenceStorageError';
  }
}

function safeFileName(input: string | null | undefined): string {
  const base = (input ?? 'attachment.bin').trim() || 'attachment.bin';
  return base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

export class FinanceDocumentEvidenceStorageService {
  constructor(private readonly storageRoot: string | null) {}

  isConfigured(): boolean {
    return Boolean(this.storageRoot?.trim());
  }

  async store(input: {
    companyId: string;
    scope: 'staging' | 'document';
    scopeId: string;
    mimeType: string;
    buffer: Buffer;
    originalFileName?: string | null;
  }): Promise<FinanceDocumentEvidenceStoredFile> {
    if (!this.storageRoot) {
      throw new FinanceDocumentEvidenceStorageError(
        'STORAGE_NOT_CONFIGURED',
        'Finance document evidence storage is not configured',
      );
    }

    const validation = validateFinanceDirectUpload({
      mimeType: input.mimeType,
      buffer: input.buffer,
    });
    if (!validation.ok) {
      throw new FinanceDocumentEvidenceStorageError(validation.code, validation.message);
    }

    const fileId = randomUUID();
    const storageKey = buildFinanceDirectStorageKey({
      companyId: input.companyId,
      scope: input.scope,
      scopeId: input.scopeId,
      fileId,
    });

    const dir = join(
      this.storageRoot,
      input.companyId,
      'finance',
      input.scope,
      input.scopeId,
    );
    await mkdir(dir, { recursive: true });

    const checksumSha256 = createHash('sha256').update(input.buffer).digest('hex');
    const createdAt = new Date().toISOString();
    const metadata: FinanceDocumentEvidenceStoredFile = {
      storageKey,
      fileId,
      companyId: input.companyId,
      scope: input.scope,
      scopeId: input.scopeId,
      mimeType: input.mimeType.toLowerCase(),
      sizeBytes: input.buffer.byteLength,
      checksumSha256,
      originalFileName: safeFileName(input.originalFileName),
      createdAt,
    };

    await writeFile(join(this.storageRoot, storageKey), input.buffer);
    await writeFile(join(dir, `${fileId}.json`), JSON.stringify(metadata));

    return metadata;
  }

  async read(input: {
    companyId: string;
    storageKey: string;
  }): Promise<{ metadata: FinanceDocumentEvidenceStoredFile; buffer: Buffer }> {
    if (!this.storageRoot) {
      throw new FinanceDocumentEvidenceStorageError(
        'STORAGE_NOT_CONFIGURED',
        'Finance document evidence storage is not configured',
      );
    }

    if (
      !input.storageKey.startsWith(`${input.companyId}/finance/`) ||
      input.storageKey.includes('..')
    ) {
      throw new FinanceDocumentEvidenceStorageError('FORBIDDEN', 'Invalid storage key for this tenant');
    }

    const parts = input.storageKey.split('/');
    const fileId = parts[parts.length - 1]?.replace(/\.bin$/, '');
    const scope = parts[2];
    const scopeId = parts[3];
    if (!fileId || !scope || !scopeId) {
      throw new FinanceDocumentEvidenceStorageError('NOT_FOUND', 'Evidence file not found');
    }

    const metaPath = join(
      this.storageRoot,
      input.companyId,
      'finance',
      scope,
      scopeId,
      `${fileId}.json`,
    );

    let metadataRaw: string;
    try {
      metadataRaw = await readFile(metaPath, 'utf8');
    } catch {
      throw new FinanceDocumentEvidenceStorageError('NOT_FOUND', 'Evidence file not found');
    }

    const metadata = JSON.parse(metadataRaw) as FinanceDocumentEvidenceStoredFile;
    if (metadata.companyId !== input.companyId || metadata.storageKey !== input.storageKey) {
      throw new FinanceDocumentEvidenceStorageError('FORBIDDEN', 'Evidence does not belong to this tenant');
    }

    const buffer = await readFile(join(this.storageRoot, input.storageKey));
    return { metadata, buffer };
  }
}

export function decodeFinanceDocumentEvidenceBase64(dataBase64: string): Buffer {
  const trimmed = dataBase64.trim();
  const withoutPrefix = trimmed.includes(',') ? trimmed.split(',').pop()! : trimmed;
  try {
    return Buffer.from(withoutPrefix, 'base64');
  } catch {
    throw new FinanceDocumentEvidenceStorageError('VALIDATION_ERROR', 'Invalid base64 payload');
  }
}
