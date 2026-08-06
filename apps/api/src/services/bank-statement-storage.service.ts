import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BANK_STATEMENT_MAX_FILE_BYTES,
  sanitizeBankStatementFilename,
} from '@titan/shared';

const ALLOWED_MIME = new Set(['text/csv', 'application/csv', 'text/plain']);

export class BankStatementStorageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BankStatementStorageError';
  }
}

export type StoredBankStatementFile = {
  storageKey: string;
  sanitizedFilename: string;
  checksumSha256: string;
  sizeBytes: number;
  mimeType: string;
};

export class BankStatementStorageService {
  constructor(private readonly storageRoot: string | null) {}

  isConfigured(): boolean {
    return Boolean(this.storageRoot?.trim());
  }

  async store(input: {
    companyId: string;
    batchId: string;
    filename: string;
    mimeType: string;
    content: Buffer;
  }): Promise<StoredBankStatementFile> {
    if (!this.storageRoot?.trim()) {
      throw new BankStatementStorageError('STORAGE_NOT_CONFIGURED', 'Bank statement storage is not configured');
    }

    const mime = input.mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
    const sanitizedFilename = sanitizeBankStatementFilename(input.filename);
    if (!ALLOWED_MIME.has(mime) && !sanitizedFilename.toLowerCase().endsWith('.csv')) {
      throw new BankStatementStorageError('INVALID_FILE_TYPE', 'Only CSV bank statements are supported');
    }
    if (input.content.byteLength > BANK_STATEMENT_MAX_FILE_BYTES) {
      throw new BankStatementStorageError('FILE_TOO_LARGE', 'Bank statement file exceeds the size limit');
    }
    if (input.content.byteLength === 0) {
      throw new BankStatementStorageError('EMPTY_FILE', 'Bank statement file is empty');
    }

    const checksumSha256 = createHash('sha256').update(input.content).digest('hex');
    const fileId = randomUUID();
    const storageKey = join(
      this.storageRoot,
      'bank-statements',
      input.companyId,
      input.batchId,
      `${fileId}-${sanitizedFilename}`,
    );
    await mkdir(join(this.storageRoot, 'bank-statements', input.companyId, input.batchId), {
      recursive: true,
    });
    await writeFile(storageKey, input.content, { mode: 0o600 });

    return {
      storageKey,
      sanitizedFilename,
      checksumSha256,
      sizeBytes: input.content.byteLength,
      mimeType: mime || 'text/csv',
    };
  }
}
