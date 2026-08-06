import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const apply0176 = readFileSync(
  join(repoRoot, 'packages/db/scripts/apply-0176-staging-only.mjs'),
  'utf8',
);

test('0176 staging apply script requires staging ref and recent backup gate', () => {
  assert.match(apply0176, /STAGING_REF = 'cpkuwtaipjxeipvbssvn'/);
  assert.match(apply0176, /BACKUP_DIR = '\/home\/ubuntu\/titan-staging-backups'/);
  assert.match(apply0176, /missing_or_stale_backup/);
  assert.match(apply0176, /DATABASE_URL must target staging ref/);
  assert.doesNotMatch(apply0176, /drizzle-kit migrate/i);
});
