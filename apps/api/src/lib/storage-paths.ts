import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(sourceDir, '../..');
/** Monorepo root (`apps/api` → repo root). */
export const repoRoot = resolve(apiRoot, '../..');

/** Production/container defaults — created and owned by the runtime user in Dockerfile.api. */
export const PRODUCTION_COMPANY_MEDIA_STORAGE_PATH = '/var/lib/titan/storage/company-media';
export const PRODUCTION_JOB_EVIDENCE_STORAGE_PATH = '/var/lib/titan/storage/job-evidence';

/** Local-dev relative defaults (resolved against the monorepo root). */
export const LOCAL_COMPANY_MEDIA_STORAGE_PATH = 'storage/company-media';
export const LOCAL_JOB_EVIDENCE_STORAGE_PATH = 'storage/job-evidence';

export type ResolveStoragePathInput = {
  configuredPath?: string | null;
  localRelativeDefault: string;
  productionAbsoluteDefault: string;
  label: string;
};

/**
 * Resolve a filesystem storage root.
 * - Env override wins (absolute, or relative to the monorepo root).
 * - In production, fall back to a container-owned absolute path.
 * - Otherwise fall back to a repo-relative local path.
 */
export function resolveStoragePath(input: ResolveStoragePathInput): string {
  const trimmed = input.configuredPath?.trim();
  let target: string;

  if (trimmed && trimmed.length > 0) {
    target = trimmed;
  } else if (process.env.NODE_ENV === 'production') {
    target = input.productionAbsoluteDefault;
  } else {
    target = input.localRelativeDefault;
  }

  const resolved = isAbsolute(target) ? target : resolve(repoRoot, target);
  ensureWritableStorageDir(resolved, input.label);
  return resolved;
}

export function ensureWritableStorageDir(absolutePath: string, label: string): void {
  try {
    mkdirSync(absolutePath, { recursive: true });
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : undefined;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `Unable to create ${label} storage directory at ${absolutePath}.`,
        code ? `code=${code}.` : null,
        'Ensure the path is writable by the non-root runtime user,',
        'or set the matching *_STORAGE_PATH environment variable.',
        detail,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }
}
