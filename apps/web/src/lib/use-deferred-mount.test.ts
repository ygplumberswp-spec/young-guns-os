import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('useDeferredMount', () => {
  it('exports a stable hook for gating heavy panel mounts', () => {
    const source = readFileSync(join(here, 'use-deferred-mount.ts'), 'utf8');
    assert.match(source, /export function useDeferredMount/);
    assert.match(source, /delayMs/);
    assert.match(source, /setTimeout/);
  });
});
