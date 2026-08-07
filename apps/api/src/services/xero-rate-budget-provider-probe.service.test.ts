import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

test('provider probe route is owner-gated and isolated', () => {
  const source = readFileSync(path.join(repoRoot, 'apps/api/src/routes/integrations.ts'), 'utf8');
  assert.match(source, /rate-budget\/provider-probe/);
  assert.match(source, /requireAnyPermission\('integrations:manage'\)/);
  assert.doesNotMatch(source, /provider-probe[\s\S]{0,600}gate5b-payment-observation/);
});

test('provider probe service uses probeOrganisationOnce only', () => {
  const source = readFileSync(
    path.join(repoRoot, 'apps/api/src/services/xero-rate-budget-provider-probe.service.ts'),
    'utf8',
  );
  assert.match(source, /probeOrganisationOnce/);
  assert.match(source, /owner_proof_read/);
  assert.doesNotMatch(source, /fetchInvoice|fetchPayment|refreshTargeted|importInvoice/);
});

test('XeroClient probe path bypasses apiRequest retry loop', () => {
  const source = readFileSync(path.join(repoRoot, 'apps/api/src/lib/xero.client.ts'), 'utf8');
  assert.match(source, /probeOrganisationOnce/);
  assert.match(source, /organisationProbeHttpOnce/);
  assert.match(source, /providerCallCount: 1/);
  assert.doesNotMatch(
    source,
    /async probeOrganisationOnce[\s\S]{0,800}apiRequest\(/,
  );
  assert.doesNotMatch(
    source,
    /organisationProbeHttpOnce[\s\S]{0,600}allowAuthRetry/,
  );
  assert.doesNotMatch(
    source,
    /organisationProbeHttpOnce[\s\S]{0,800}apiRequestOnce\(/,
  );
});
