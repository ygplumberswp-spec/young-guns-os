import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoRoot } from './company-media-storage.js';

const sourceDir = dirname(fileURLToPath(import.meta.url));
void sourceDir;

export function resolveJobEvidenceStoragePath(configuredPath?: string | null): string {
  const trimmed = configuredPath?.trim();
  const target = trimmed && trimmed.length > 0 ? trimmed : 'storage/job-evidence';
  const resolved = isAbsolute(target) ? target : resolve(repoRoot, target);
  mkdirSync(resolved, { recursive: true });
  return resolved;
}
