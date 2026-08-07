import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');

describe('JPE-004B browser-safe financial fingerprint boundary', () => {
  it('shared fingerprint module has no Node-only crypto import', () => {
    const source = readFileSync(join(srcDir, 'job-financial-fingerprint.ts'), 'utf8');
    assert.doesNotMatch(source, /from ['"]node:crypto['"]/);
    assert.doesNotMatch(source, /require\(['"]node:crypto['"]\)/);
  });

  it('shared barrel does not export server-only hash module', () => {
    const source = readFileSync(join(srcDir, 'index.ts'), 'utf8');
    assert.doesNotMatch(source, /job-financial-fingerprint-hash/);
  });
});
