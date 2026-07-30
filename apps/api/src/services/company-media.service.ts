import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export type CompanyMediaKind = 'logo' | 'profile_image';

export type CompanyMediaFile = {
  id: string;
  companyId: string;
  kind: CompanyMediaKind;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export class CompanyMediaError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CompanyMediaError';
  }
}

export class CompanyMediaService {
  constructor(private readonly storageRoot: string | null) {}

  isConfigured(): boolean {
    return Boolean(this.storageRoot?.trim());
  }

  async storeMedia(input: {
    companyId: string;
    kind: CompanyMediaKind;
    mimeType: string;
    buffer: Buffer;
  }): Promise<CompanyMediaFile> {
    if (!this.storageRoot) {
      throw new CompanyMediaError(
        'STORAGE_NOT_CONFIGURED',
        'Company media storage is not configured. Set COMPANY_MEDIA_STORAGE_PATH on the API server.',
      );
    }

    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
      throw new CompanyMediaError(
        'INVALID_FILE_TYPE',
        'Only PNG, JPEG, WebP, and GIF images are supported.',
      );
    }

    if (input.buffer.byteLength > MAX_FILE_BYTES) {
      throw new CompanyMediaError('FILE_TOO_LARGE', 'Image must be 2 MB or smaller.');
    }

    const fileId = randomUUID();
    const companyDir = join(this.storageRoot, input.companyId);
    await mkdir(companyDir, { recursive: true });

    const filePath = join(companyDir, `${fileId}.bin`);
    const metaPath = join(companyDir, `${fileId}.json`);
    const createdAt = new Date().toISOString();

    const metadata: CompanyMediaFile = {
      id: fileId,
      companyId: input.companyId,
      kind: input.kind,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.byteLength,
      createdAt,
    };

    await writeFile(filePath, input.buffer);
    await writeFile(metaPath, JSON.stringify(metadata));

    return metadata;
  }

  async getMedia(
    companyId: string,
    fileId: string,
  ): Promise<{ metadata: CompanyMediaFile; buffer: Buffer }> {
    if (!this.storageRoot) {
      throw new CompanyMediaError(
        'STORAGE_NOT_CONFIGURED',
        'Company media storage is not configured.',
      );
    }

    const metaPath = join(this.storageRoot, companyId, `${fileId}.json`);
    const filePath = join(this.storageRoot, companyId, `${fileId}.bin`);

    let metadataRaw: string;
    try {
      metadataRaw = await readFile(metaPath, 'utf8');
    } catch {
      throw new CompanyMediaError('NOT_FOUND', 'Media file not found');
    }

    const metadata = JSON.parse(metadataRaw) as CompanyMediaFile;
    if (metadata.companyId !== companyId) {
      throw new CompanyMediaError('FORBIDDEN', 'Media file does not belong to this tenant');
    }

    const buffer = await readFile(filePath);
    return { metadata, buffer };
  }

  async deleteMedia(companyId: string, fileId: string): Promise<void> {
    if (!this.storageRoot) {
      throw new CompanyMediaError(
        'STORAGE_NOT_CONFIGURED',
        'Company media storage is not configured.',
      );
    }

    const metaPath = join(this.storageRoot, companyId, `${fileId}.json`);
    const filePath = join(this.storageRoot, companyId, `${fileId}.bin`);

    await rm(metaPath, { force: true });
    await rm(filePath, { force: true });
  }

  createEtag(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  }
}
