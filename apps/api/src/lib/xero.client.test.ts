import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  resolveRateLimitDelayMs,
  XERO_RATE_LIMIT_READ_MAX_DELAY_MS,
  XERO_RATE_LIMIT_READ_MAX_RETRIES,
  XERO_REQUEST_TIMEOUT_MS,
} from './xero.client.js';

const clientSource = readFileSync(fileURLToPath(new URL('./xero.client.ts', import.meta.url)), 'utf8');

test('resolveRateLimitDelayMs honours Retry-After with 5 minute cap', () => {
  assert.equal(resolveRateLimitDelayMs('45', 1), 45_000);
  assert.equal(resolveRateLimitDelayMs('99999', 1), 5 * 60_000);
  assert.equal(resolveRateLimitDelayMs(null, 2), 4_000);
});

test('provider read timeout default is 20 seconds', () => {
  assert.equal(XERO_REQUEST_TIMEOUT_MS, 20_000);
});

test('rate-limit read path allows one retry up to 60 seconds', () => {
  assert.equal(XERO_RATE_LIMIT_READ_MAX_RETRIES, 1);
  assert.equal(XERO_RATE_LIMIT_READ_MAX_DELAY_MS, 60_000);
  const retryAfterDelay = resolveRateLimitDelayMs('45', 1);
  assert.equal(retryAfterDelay, 45_000);
  assert.ok(retryAfterDelay <= XERO_RATE_LIMIT_READ_MAX_DELAY_MS);
});

test('XeroClient exposes single auth retry on 401', () => {
  assert.match(clientSource, /onAuthRetry/);
  assert.match(clientSource, /allowAuthRetry/);
  assert.match(clientSource, /after one auth retry/);
  assert.doesNotMatch(clientSource, /while \(true\)/);
});

test('XeroClient bounds rate-limit retries to one controlled retry', () => {
  assert.match(clientSource, /XERO_RATE_LIMIT_READ_MAX_RETRIES/);
  assert.match(clientSource, /XERO_RATE_LIMIT_READ_MAX_DELAY_MS/);
});
