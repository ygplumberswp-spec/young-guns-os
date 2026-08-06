import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

test('Gate 4 controlled invoice service is scoped to single invoice push', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'apps/api/src/services/xero-gate4-controlled-invoice.service.ts'),
    'utf8',
  );
  assert.match(source, /XeroGate4ControlledInvoiceService/);
  assert.match(source, /executeApprovedInvoicePush/);
  assert.doesNotMatch(source, /syncInvoices\(/);
  assert.match(source, /TITAN XERO E2E TEST/);
  assert.match(source, /OFFICIAL_NUMBER_MISSING/);
});

test('executeApprovedInvoicePush stores official Xero invoice number', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'apps/api/src/services/xero-sync.service.ts'),
    'utf8',
  );
  assert.match(source, /async executeApprovedInvoicePush/);
  assert.match(source, /Pushed invoice draft to Xero/);
  assert.match(source, /numberAuthority: 'xero'/);
});
