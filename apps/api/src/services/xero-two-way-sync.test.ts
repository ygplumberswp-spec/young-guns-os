import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveImportedInvoiceNumber } from './xero-sync.service.js';

test('repeated import mapping key is stable via xero invoice id', () => {
  const xeroId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const first = resolveImportedInvoiceNumber('INV-2001', xeroId);
  const second = resolveImportedInvoiceNumber('INV-2001', xeroId);
  assert.equal(first, second);
  assert.equal(first, 'INV-2001');
});

test('official number from Xero only — no TITAN placeholder on write path helper', () => {
  const xeroId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const fallback = resolveImportedInvoiceNumber(null, xeroId);
  assert.match(fallback, /^XERO-/);
  assert.doesNotMatch(fallback, /TITAN/i);
});
