import test from 'node:test';
import assert from 'node:assert/strict';
import { XeroMappingConflictService } from './xero-mapping-conflict.service.js';

test('XeroMappingConflictService blocks silent overwrite on number mismatch', () => {
  const service = new XeroMappingConflictService({} as never);
  const result = service.applyInvoiceMappingUpdate({
    companyId: 'co-1',
    entityId: 'inv-1',
    local: { invoiceNumber: 'TITAN-DRAFT', amountCents: 5000 },
    remote: { invoiceNumber: 'INV-100', amountCents: 5000 },
  });

  assert.equal(result.applied, false);
  assert.ok(result.conflict);
  assert.equal(result.conflict?.kind, 'official_number_mismatch');
});

test('XeroMappingConflictService allows matching invoice update', () => {
  const service = new XeroMappingConflictService({} as never);
  const result = service.applyInvoiceMappingUpdate({
    companyId: 'co-1',
    entityId: 'inv-1',
    local: { invoiceNumber: 'INV-100', amountCents: 5000 },
    remote: { invoiceNumber: 'INV-100', amountCents: 5000 },
  });

  assert.equal(result.applied, true);
  assert.equal(result.conflict, null);
});
