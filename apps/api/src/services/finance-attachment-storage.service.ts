import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateFinanceAttachmentFile } from '@titan/shared';

export type FinanceAttachmentStoredFile = {
  storageKey: string;
  fileId: string;
  companyId: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  originalFileName: string;
  createdAt: string;
};

export class FinanceAttachmentStorageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FinanceAttachmentStorageError';
  }
}

function safeFileName(input: string | null | undefined): string {
  const base = (input ?? 'attachment.bin').trim() || 'attachment.bin';
  return base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

export class FinanceAttachmentStorageService {
  constructor(private readonly storageRoot: string | null) {}

  isConfigured(): boolean {
    return Boolean(this.storageRoot?.trim());
  }

  async store(input: {
    companyId: string;
    mimeType: string;
    buffer: Buffer;
    originalFileName?: string | null;
  }): Promise<FinanceAttachmentStoredFile> {
    if (!this.storageRoot) {
      throw new FinanceAttachmentStorageError(
        'STORAGE_NOT_CONFIGURED',
        'Finance attachment storage is not configured',
      );
    }

    const validation = validateFinanceAttachmentFile({
      mimeType: input.mimeType,
      sizeBytes: input.buffer.byteLength,
    });
    if (!validation.ok) {
      throw new FinanceAttachmentStorageError(validation.code, validation.message);
    }

    const fileId = randomUUID();
    const dir = join(this.storageRoot, input.companyId);
    await mkdir(dir, { recursive: true });

    const checksumSha256 = createHash('sha256').update(input.buffer).digest('hex');
    const createdAt = new Date().toISOString();
    const storageKey = `${input.companyId}/${fileId}.bin`;
    const filePath = join(this.storageRoot, storageKey);
    const metaPath = join(dir, `${fileId}.json`);

    const metadata: FinanceAttachmentStoredFile = {
      storageKey,
      fileId,
      companyId: input.companyId,
      mimeType: input.mimeType.toLowerCase(),
      sizeBytes: input.buffer.byteLength,
      checksumSha256,
      originalFileName: safeFileName(input.originalFileName),
      createdAt,
    };

    await writeFile(filePath, input.buffer);
    await writeFile(metaPath, JSON.stringify(metadata));

    return metadata;
  }

  async read(input: {
    companyId: string;
    storageKey: string;
  }): Promise<{ metadata: FinanceAttachmentStoredFile; buffer: Buffer }> {
    if (!this.storageRoot) {
      throw new FinanceAttachmentStorageError(
        'STORAGE_NOT_CONFIGURED',
        'Finance attachment storage is not configured',
      );
    }

    if (!input.storageKey.startsWith(`${input.companyId}/`) || input.storageKey.includes('..')) {
      throw new FinanceAttachmentStorageError('FORBIDDEN', 'Invalid storage key for this tenant');
    }

    const fileId = input.storageKey.split('/').pop()?.replace(/\.bin$/, '');
    if (!fileId) {
      throw new FinanceAttachmentStorageError('NOT_FOUND', 'Attachment file not found');
    }

    const metaPath = join(this.storageRoot, input.companyId, `${fileId}.json`);
    let metadataRaw: string;
    try {
      metadataRaw = await readFile(metaPath, 'utf8');
    } catch {
      throw new FinanceAttachmentStorageError('NOT_FOUND', 'Attachment file not found');
    }

    const metadata = JSON.parse(metadataRaw) as FinanceAttachmentStoredFile;
    if (metadata.companyId !== input.companyId) {
      throw new FinanceAttachmentStorageError('FORBIDDEN', 'Attachment does not belong to this tenant');
    }

    const buffer = await readFile(join(this.storageRoot, input.storageKey));
    return { metadata, buffer };
  }
}

export function decodeFinanceAttachmentBase64(dataBase64: string): Buffer {
  const trimmed = dataBase64.trim();
  const withoutPrefix = trimmed.includes(',') ? trimmed.split(',').pop()! : trimmed;
  try {
    return Buffer.from(withoutPrefix, 'base64');
  } catch {
    throw new FinanceAttachmentStorageError('VALIDATION_ERROR', 'Invalid base64 payload');
  }
}
