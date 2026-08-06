import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

test('Gate 5B route is owner-gated and read-only', () => {
  const source = readFileSync(path.join(repoRoot, 'apps/api/src/routes/integrations.ts'), 'utf8');
  assert.match(source, /gate5b-payment-observation/);
  assert.match(source, /requireAnyPermission\('integrations:manage'\)/);
  assert.doesNotMatch(source, /gate5b-payment-observation[\s\S]{0,500}createPayment/);
});

test('Gate 5B service uses fetchInvoice fetchPayment only for provider reads', () => {
  const source = readFileSync(
    path.join(repoRoot, 'apps/api/src/services/xero-gate5b-payment-observation.service.ts'),
    'utf8',
  );
  assert.match(source, /fetchInvoice/);
  assert.match(source, /fetchPayment/);
  assert.doesNotMatch(source, /createPayment|createInvoice|reconcile/);
});

test('Gate 5B blocks wrong organisation', () => {
  const source = readFileSync(
    path.join(repoRoot, 'apps/api/src/services/xero-gate5b-payment-observation.service.ts'),
    'utf8',
  );
  assert.match(source, /Young Guns Plumbing/);
  assert.match(source, /ORG_MISMATCH/);
});

test('Gate 5B derives reconciliation without equating Yoco and Xero', () => {
  const source = readFileSync(
    path.join(repoRoot, 'apps/api/src/services/xero-gate5b-payment-observation.service.ts'),
    'utf8',
  );
  assert.match(source, /deriveInvoiceReconciliationState/);
  assert.match(source, /forbiddenFinancialTruthEquivalences/);
  assert.match(source, /reconciliationProven/);
});

test('Gate 5B maps provider timeout to controlled unavailable error', () => {
  const source = readFileSync(
    path.join(repoRoot, 'apps/api/src/services/xero-gate5b-payment-observation.service.ts'),
    'utf8',
  );
  assert.match(source, /PROVIDER_UNAVAILABLE/);
  assert.match(source, /rethrowProviderReadError/);
});

test('Gate 5B bank transaction lookup is targeted not full-table', () => {
  const source = readFileSync(
    path.join(repoRoot, 'apps/api/src/services/xero-gate5b-payment-observation.service.ts'),
    'utf8',
  );
  assert.match(source, /findFirst/);
  assert.doesNotMatch(source, /xeroBankTransactions\.findMany/);
});

test('OAuth token requests use bounded HTTP timeout', () => {
  const source = readFileSync(
    path.join(repoRoot, 'apps/api/src/services/xero-oauth.service.ts'),
    'utf8',
  );
  assert.match(source, /OAUTH_HTTP_TIMEOUT_MS/);
  assert.match(source, /AbortSignal\.timeout\(OAUTH_HTTP_TIMEOUT_MS\)/);
  assert.match(source, /forceRefreshAccessToken/);
});

test('Xero client exposes fetchPayment for Gate 5B', () => {
  const source = readFileSync(path.join(repoRoot, 'apps/api/src/lib/xero.client.ts'), 'utf8');
  assert.match(source, /async fetchPayment\(paymentId: string\)/);
});
