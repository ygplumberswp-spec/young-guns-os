import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';
import {
  CHROMIUM_CANDIDATE_PATHS,
  resolveChromiumExecutablePath,
} from './chromium-executable.js';

const previousEnv = process.env.PUPPETEER_EXECUTABLE_PATH;

afterEach(() => {
  if (previousEnv === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH;
  else process.env.PUPPETEER_EXECUTABLE_PATH = previousEnv;
});

describe('resolveChromiumExecutablePath', () => {
  it('ignores invalid PUPPETEER_EXECUTABLE_PATH and falls back to candidates or none', async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = '/nonexistent/chromium-for-test';
    const resolution = await resolveChromiumExecutablePath();
    if (resolution.source === 'env') {
      assert.fail('Invalid env path must not be selected');
    }
    assert.ok(['candidate', 'bundled', 'none'].includes(resolution.source));
  });

  it('prefers PUPPETEER_EXECUTABLE_PATH when executable', async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = process.execPath;
    const resolution = await resolveChromiumExecutablePath();
    assert.equal(resolution.executablePath, process.execPath);
    assert.equal(resolution.source, 'env');
  });

  it('documents stable candidate paths for container images', () => {
    assert.ok(CHROMIUM_CANDIDATE_PATHS.includes('/usr/bin/chromium'));
  });
});
