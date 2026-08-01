import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildXeroWriteIdempotencyKey,
  detectXeroMappingConflict,
  estimateXeroTwoWayCompletion,
  resolveOfficialXeroInvoiceNumber,
  XERO_TWO_WAY_ENTITY_MATRIX,
} from './xero-two-way-sync.js';

test('buildXeroWriteIdempotencyKey is stable for same inputs', () => {
  const keyA = buildXeroWriteIdempotencyKey({
    companyId: 'co-1',
    operation: 'invoice_create',
    entityId: 'inv-1',
  });
  const keyB = buildXeroWriteIdempotencyKey({
    companyId: 'co-1',
    operation: 'invoice_create',
    entityId: 'inv-1',
  });
  assert.equal(keyA, keyB);
  assert.equal(keyA.length, 32);
});

test('detectXeroMappingConflict surfaces official number mismatch', () => {
  const conflict = detectXeroMappingConflict({
    entityType: 'invoice',
    local: { invoiceNumber: 'TITAN-001', amountCents: 10000 },
    remote: { invoiceNumber: 'INV-8842', amountCents: 10000 },
  });
  assert.ok(conflict);
  assert.equal(conflict?.kind, 'official_number_mismatch');
  assert.match(conflict!.message, /conflict/i);
});

test('resolveOfficialXeroInvoiceNumber never invents when Xero number absent', () => {
  assert.equal(
    resolveOfficialXeroInvoiceNumber({
      xeroAssignedNumber: null,
      xeroInvoiceId: '11111111-2222-3333-4444-555555555555',
    }),
    null,
  );
  assert.equal(
    resolveOfficialXeroInvoiceNumber({
      xeroAssignedNumber: 'INV-9001',
      xeroInvoiceId: '11111111-2222-3333-4444-555555555555',
    }),
    'INV-9001',
  );
});

test('entity matrix covers credit notes and supplier bills as stubs', () => {
  const credit = XERO_TWO_WAY_ENTITY_MATRIX.find((row) => row.entity === 'credit_note');
  const bill = XERO_TWO_WAY_ENTITY_MATRIX.find((row) => row.entity === 'supplier_bill');
  assert.equal(credit?.xeroToTitan, 'stub');
  assert.equal(bill?.xeroToTitan, 'stub');
});

test('estimateXeroTwoWayCompletion reports read ahead of write', () => {
  const { readPathPercent, writePathPercent } = estimateXeroTwoWayCompletion();
  assert.ok(readPathPercent > writePathPercent);
  assert.ok(readPathPercent >= 70);
  assert.ok(writePathPercent <= 40);
});
