import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

test('Gate 2 route is owner-gated and read-only', () => {
  const source = readFileSync(path.join(repoRoot, 'apps/api/src/routes/integrations.ts'), 'utf8');
  assert.match(source, /gate2-readonly-proof/);
  assert.match(source, /requireAnyPermission\('integrations:manage'\)/);
  assert.doesNotMatch(source, /gate2-readonly-proof[\s\S]{0,400}syncCustomers/);
});

test('Gate 2 service uses fetchContact fetchInvoice listAttachments only', () => {
  const source = readFileSync(
    path.join(repoRoot, 'apps/api/src/services/xero-gate2-readonly-proof.service.ts'),
    'utf8',
  );
  assert.match(source, /fetchContact/);
  assert.match(source, /fetchInvoice/);
  assert.match(source, /listAttachments/);
  assert.doesNotMatch(source, /createContact|createInvoice|createPayment|updateContact/);
});

test('Gate 2 blocks wrong organisation', () => {
  const source = readFileSync(
    path.join(repoRoot, 'apps/api/src/services/xero-gate2-readonly-proof.service.ts'),
    'utf8',
  );
  assert.match(source, /Young Guns Plumbing/);
  assert.match(source, /ORG_MISMATCH/);
});

test('Attachment insufficient scope surfaces Gate 1 requirement', () => {
  const source = readFileSync(
    path.join(repoRoot, 'apps/api/src/services/xero-gate2-readonly-proof.service.ts'),
    'utf8',
  );
  assert.match(source, /ATTACHMENT_SCOPE_INSUFFICIENT/);
  assert.match(source, /Gate 1 reconnect required/);
});

test('Xero client exposes fetchContact for Gate 2', () => {
  const source = readFileSync(path.join(repoRoot, 'apps/api/src/lib/xero.client.ts'), 'utf8');
  assert.match(source, /async fetchContact\(contactId: string\)/);
});
