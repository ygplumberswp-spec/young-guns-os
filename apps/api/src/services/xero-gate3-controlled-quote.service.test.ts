import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

test('Gate 3 controlled quote service is scoped to single quote push', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'apps/api/src/services/xero-gate3-controlled-quote.service.ts'),
    'utf8',
  );
  assert.match(source, /XeroGate3ControlledQuoteService/);
  assert.match(source, /executeApprovedQuotePush/);
  assert.doesNotMatch(source, /syncQuotes\(/);
  assert.match(source, /TITAN XERO E2E TEST/);
  assert.match(source, /isDraft/);
});

test('executeApprovedQuotePush exists on sync service', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'apps/api/src/services/xero-sync.service.ts'),
    'utf8',
  );
  assert.match(source, /async executeApprovedQuotePush/);
  assert.match(source, /Pushed quote draft to Xero/);
});

test('xero client exposes fetchQuote for Gate 3 verification', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'apps/api/src/lib/xero.client.ts'), 'utf8');
  assert.match(source, /async fetchQuote\(/);
});
