import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { DocumentPhoto } from '@titan/shared';
import {
  financeStagingEvidenceRetentionMs,
  FINANCE_STAGING_EVIDENCE_RETENTION_DAYS_DEFAULT,
} from '@titan/shared';
import type { FinanceDocumentEvidenceStoredFile } from './finance-document-evidence-storage.service.js';

export type FinanceStagingCleanupCandidate = {
  companyId: string;
  scopeId: string;
  fileId: string;
  storageKey: string;
  createdAt: string;
  ageMs: number;
};

export type FinanceStagingCleanupResult = {
  dryRun: boolean;
  retentionDays: number;
  scannedMetadataFiles: number;
  eligible: number;
  deleted: number;
  preservedRecent: number;
  preservedReferenced: number;
  preservedInvalid: number;
  rejectedPath: number;
  candidates: FinanceStagingCleanupCandidate[];
};

function isFinanceStagingMetadataPath(storageRoot: string, absolutePath: string): boolean {
  const normalizedRoot = resolve(storageRoot);
  const normalizedPath = resolve(absolutePath);
  if (!normalizedPath.startsWith(`${normalizedRoot}${normalizedRoot.endsWith('/') ? '' : '/'}`)) {
    return false;
  }
  const relative = normalizedPath.slice(normalizedRoot.length).replace(/^\/+/, '');
  const parts = relative.split('/');
  // {companyId}/finance/staging/{scopeId}/{fileId}.json
  return parts.length === 5 && parts[1] === 'finance' && parts[2] === 'staging' && parts[4].endsWith('.json');
}

function parseMetadata(raw: string): FinanceDocumentEvidenceStoredFile | null {
  try {
    const parsed = JSON.parse(raw) as FinanceDocumentEvidenceStoredFile;
    if (
      !parsed.companyId ||
      !parsed.fileId ||
      !parsed.storageKey ||
      parsed.scope !== 'staging' ||
      !parsed.createdAt
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function collectReferencedFinanceDirectStorageKeys(
  photosRows: Array<{ photos: unknown }>,
): Set<string> {
  const referenced = new Set<string>();
  for (const row of photosRows) {
    if (!Array.isArray(row.photos)) continue;
    for (const item of row.photos) {
      const photo = item as DocumentPhoto;
      if (photo.source === 'finance_direct' && photo.storageKey?.trim()) {
        referenced.add(photo.storageKey.trim());
      }
    }
  }
  return referenced;
}

export class FinanceDocumentStagingCleanupService {
  constructor(private readonly storageRoot: string) {}

  async cleanup(input: {
    referencedStorageKeys: Set<string>;
    retentionDays?: number;
    dryRun?: boolean;
    companyId?: string;
    now?: Date;
  }): Promise<FinanceStagingCleanupResult> {
    const retentionDays = input.retentionDays ?? FINANCE_STAGING_EVIDENCE_RETENTION_DAYS_DEFAULT;
    const retentionMs = financeStagingEvidenceRetentionMs(retentionDays);
    const dryRun = input.dryRun ?? false;
    const now = input.now ?? new Date();
    const result: FinanceStagingCleanupResult = {
      dryRun,
      retentionDays,
      scannedMetadataFiles: 0,
      eligible: 0,
      deleted: 0,
      preservedRecent: 0,
      preservedReferenced: 0,
      preservedInvalid: 0,
      rejectedPath: 0,
      candidates: [],
    };

    const companyIds = input.companyId
      ? [input.companyId]
      : await readdir(this.storageRoot).catch(() => []);

    for (const companyId of companyIds) {
      const stagingRoot = join(this.storageRoot, companyId, 'finance', 'staging');
      let scopeIds: string[];
      try {
        scopeIds = await readdir(stagingRoot);
      } catch {
        continue;
      }

      for (const scopeId of scopeIds) {
        const scopeDir = join(stagingRoot, scopeId);
        let entries: string[];
        try {
          entries = await readdir(scopeDir);
        } catch {
          continue;
        }

        for (const entry of entries) {
          if (!entry.endsWith('.json')) continue;
          const metaPath = join(scopeDir, entry);
          if (!isFinanceStagingMetadataPath(this.storageRoot, metaPath)) {
            result.rejectedPath += 1;
            continue;
          }

          result.scannedMetadataFiles += 1;
          let metadata: FinanceDocumentEvidenceStoredFile | null;
          try {
            metadata = parseMetadata(await readFile(metaPath, 'utf8'));
          } catch {
            result.preservedInvalid += 1;
            continue;
          }
          if (!metadata) {
            result.preservedInvalid += 1;
            continue;
          }

          if (metadata.companyId !== companyId || metadata.scope !== 'staging') {
            result.preservedInvalid += 1;
            continue;
          }

          const createdAtMs = Date.parse(metadata.createdAt);
          if (!Number.isFinite(createdAtMs)) {
            result.preservedInvalid += 1;
            continue;
          }

          const ageMs = now.getTime() - createdAtMs;
          if (ageMs < retentionMs) {
            result.preservedRecent += 1;
            continue;
          }

          if (input.referencedStorageKeys.has(metadata.storageKey)) {
            result.preservedReferenced += 1;
            continue;
          }

          result.eligible += 1;
          result.candidates.push({
            companyId,
            scopeId,
            fileId: metadata.fileId,
            storageKey: metadata.storageKey,
            createdAt: metadata.createdAt,
            ageMs,
          });

          if (dryRun) continue;

          const binPath = join(this.storageRoot, metadata.storageKey);
          if (!isFinanceStagingMetadataPath(this.storageRoot, metaPath)) {
            result.rejectedPath += 1;
            continue;
          }

          // Ensure bin file is under the same tenant staging tree before deletion.
          const binResolved = resolve(binPath);
          const stagingPrefix = resolve(join(this.storageRoot, companyId, 'finance', 'staging'));
          if (!binResolved.startsWith(stagingPrefix)) {
            result.rejectedPath += 1;
            continue;
          }

          await rm(metaPath, { force: true });
          await rm(binPath, { force: true });
          result.deleted += 1;
        }
      }
    }

    return result;
  }

  /** Read-only scan helper for diagnostics — never deletes. */
  async scanExpired(input: {
    referencedStorageKeys: Set<string>;
    retentionDays?: number;
    companyId?: string;
    now?: Date;
  }): Promise<FinanceStagingCleanupResult> {
    return this.cleanup({ ...input, dryRun: true });
  }
}

export async function countFinanceStagingFiles(storageRoot: string): Promise<number> {
  let count = 0;
  const companyIds = await readdir(storageRoot).catch(() => []);
  for (const companyId of companyIds) {
    const stagingRoot = join(storageRoot, companyId, 'finance', 'staging');
    const scopeIds = await readdir(stagingRoot).catch(() => []);
    for (const scopeId of scopeIds) {
      const scopeDir = join(stagingRoot, scopeId);
      const entries: string[] = await readdir(scopeDir).catch(() => []);
      count += entries.filter((name) => name.endsWith('.json')).length;
    }
  }
  return count;
}

export async function isStorageRootWritable(storageRoot: string): Promise<boolean> {
  try {
    const probe = join(storageRoot, '.write-probe');
    await stat(storageRoot);
    const { writeFile, rm } = await import('node:fs/promises');
    await writeFile(probe, 'ok');
    await rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}
