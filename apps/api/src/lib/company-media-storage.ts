import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(sourceDir, '../..');
/** Monorepo root (`apps/api` → repo root). */
export const repoRoot = resolve(apiRoot, '../..');

export function resolveCompanyMediaStoragePath(configuredPath?: string | null): string {
  const trimmed = configuredPath?.trim();
  const target = trimmed && trimmed.length > 0 ? trimmed : 'storage/company-media';
  const resolved = isAbsolute(target) ? target : resolve(repoRoot, target);

  mkdirSync(resolved, { recursive: true });
  return resolved;
}
