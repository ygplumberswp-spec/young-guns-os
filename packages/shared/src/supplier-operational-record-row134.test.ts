import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertRow134SafetyGates,
  canViewSupplierFinancialInternals,
  projectSupplierOperationalRecord,
  runSupplierOperationalRecordFixture,
  SUPPLIER_RECORD_ROYAL_CAPE,
} from './supplier-operational-record-row134.js';
import type { SupplierSummary } from './procurement.js';

describe('Row 134 supplier operational record', () => {
  it('fixture proves identity/prices/orders/bills/lead/docs/RBAC', () => {
    const report = runSupplierOperationalRecordFixture();
    assert.equal(report.pass, true, JSON.stringify(report.proofs));
    assert.equal(report.xeroWrites, 0);
    assert.equal(report.record.fabricated, false);
    assert.equal(SUPPLIER_RECORD_ROYAL_CAPE.royalCapeQuoteNumber, 'QU-0183');
    assert.equal(assertRow134SafetyGates({ row92AutomationEnabled: false }).fabricated, false);
  });

  it('absent fields stay NOT_AVAILABLE/UNKNOWN; no preferred invention', () => {
    const supplier: SupplierSummary = {
      id: 's1',
      name: 'Bare Supplier',
      contactName: null,
      email: null,
      phone: null,
      address: null,
      notes: null,
      status: 'active',
      supplierCode: null,
      category: null,
      sourceProvider: null,
      sourceExternalId: null,
      productCount: 0,
      purchaseOrderCount: 0,
      completedOrderCount: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    const rec = projectSupplierOperationalRecord({ supplier });
    assert.equal(rec.contacts.availability, 'NOT_AVAILABLE');
    assert.equal(rec.category.availability, 'NOT_AVAILABLE');
    assert.equal(rec.preferred.availability, 'NOT_AVAILABLE');
    assert.equal(rec.leadTimeDays.availability, 'UNKNOWN');
    assert.equal(rec.documents.availability, 'NOT_AVAILABLE');
    assert.equal(canViewSupplierFinancialInternals({ roleName: 'technician' }), false);
    assert.equal(canViewSupplierFinancialInternals({ roleName: 'owner' }), true);
  });
});
