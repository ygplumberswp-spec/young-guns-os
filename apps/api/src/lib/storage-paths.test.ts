import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  LOCAL_COMPANY_MEDIA_STORAGE_PATH,
  PRODUCTION_COMPANY_MEDIA_STORAGE_PATH,
  resolveStoragePath,
} from './storage-paths.js';

const previousNodeEnv = process.env.NODE_ENV;
const tempRoots: string[] = [];

afterEach(async () => {
  process.env.NODE_ENV = previousNodeEnv;
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('resolveStoragePath', () => {
  it('uses an absolute configured override', async () => {
    const root = await mkdtemp(join(tmpdir(), 'titan-storage-abs-'));
    tempRoots.push(root);
    const target = join(root, 'company-media');

    const resolved = resolveStoragePath({
      configuredPath: target,
      localRelativeDefault: LOCAL_COMPANY_MEDIA_STORAGE_PATH,
      productionAbsoluteDefault: PRODUCTION_COMPANY_MEDIA_STORAGE_PATH,
      label: 'company-media',
    });

    assert.equal(resolved, target);
    await writeFile(join(resolved, 'probe.txt'), 'ok');
  });

  it('falls back to the production absolute default when NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    const root = await mkdtemp(join(tmpdir(), 'titan-storage-prod-'));
    tempRoots.push(root);
    const productionDefault = join(root, 'prod-default');

    const resolved = resolveStoragePath({
      configuredPath: undefined,
      localRelativeDefault: LOCAL_COMPANY_MEDIA_STORAGE_PATH,
      productionAbsoluteDefault: productionDefault,
      label: 'company-media',
    });

    assert.equal(resolved, productionDefault);
    await writeFile(join(resolved, 'probe.txt'), 'ok');
  });

  it('creates nested directories for a configured absolute path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'titan-storage-nested-'));
    tempRoots.push(root);
    const target = join(root, 'a', 'b', 'c');

    const resolved = resolveStoragePath({
      configuredPath: target,
      localRelativeDefault: LOCAL_COMPANY_MEDIA_STORAGE_PATH,
      productionAbsoluteDefault: PRODUCTION_COMPANY_MEDIA_STORAGE_PATH,
      label: 'job-evidence',
    });

    assert.equal(resolved, target);
    await writeFile(join(resolved, 'probe.bin'), 'ok');
  });
});
