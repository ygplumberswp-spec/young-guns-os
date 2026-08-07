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

test('resolveRateLimitDelayMs parses HTTP-date Retry-After', () => {
  const future = new Date(Date.now() + 30_000).toUTCString();
  const delay = resolveRateLimitDelayMs(future, 1);
  assert.ok(delay >= 25_000 && delay <= 35_000);
});

test('rate-limit read path allows one inline retry up to 30 seconds', () => {
  assert.equal(XERO_RATE_LIMIT_READ_MAX_RETRIES, 1);
  assert.equal(XERO_RATE_LIMIT_READ_MAX_DELAY_MS, 120_000);
  const retryAfterDelay = resolveRateLimitDelayMs('25', 1);
  assert.equal(retryAfterDelay, 25_000);
  assert.ok(retryAfterDelay <= 30_000);
});

test('XeroClient exposes single auth retry on 401', () => {
  assert.match(clientSource, /onAuthRetry/);
  assert.match(clientSource, /allowAuthRetry/);
  assert.match(clientSource, /after one auth retry/);
  assert.doesNotMatch(clientSource, /while \(true\)/);
});

test('XeroClient fails fast when Retry-After exceeds inline wait budget', () => {
  assert.match(clientSource, /XERO_RATE_LIMIT_RETRY_BUDGET_MS/);
  assert.match(clientSource, /inline wait exceeds/);
});

test('XeroClient organisation probe uses dedicated once-only HTTP path', () => {
  assert.match(clientSource, /probeOrganisationOnce/);
  assert.match(clientSource, /organisationProbeHttpOnce/);
  assert.match(clientSource, /providerCallCount: 1/);
  assert.doesNotMatch(clientSource, /async probeOrganisationOnce[\s\S]{0,800}apiRequest\(/);
  assert.doesNotMatch(clientSource, /organisationProbeHttpOnce[\s\S]{0,800}apiRequestOnce\(/);
});
