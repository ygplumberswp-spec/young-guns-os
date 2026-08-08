import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertRow127AcceptanceGate,
  assertRow127SafetyGates,
  defaultProcureToPayFixtureIds,
  PROCURE_TO_PAY_ROYAL_CAPE,
  PROCURE_TO_PAY_STEPS,
  proveProcureToPayCoverage,
  runProcureToPayFixture,
} from './procure-to-pay-row127.js';
import {
  approveSupplierApPayment,
  recordDeliveryInspection,
  resolveProcurementNeedFromBoqJob,
} from './job-procurement-chain.js';

describe('Row 127 procure-to-pay closed hops', () => {
  it('fixture closes Need→PR→Inspection→AP approval→reconciliation with no NOT_AVAILABLE', () => {
    const report = runProcureToPayFixture();
    assert.equal(report.pass, true);
    assert.equal(report.xeroWrites, 0);
    assert.equal(report.moneyMovement, 0);
    assert.equal(report.cleanup, true);
    assert.equal(report.jpePostedOnce, true);
    assert.equal(report.duplicateBlocked, true);
    assert.equal(report.wrongJobBlocked, true);
    assert.equal(report.techDenied, true);
    assert.equal(report.clientDenied, true);
    assert.equal(report.tenantIsolated, true);
    assert.ok(report.auditTrail.length >= PROCURE_TO_PAY_STEPS.length);
    assert.equal(report.reconciliation?.state, 'RECONCILED');

    assert.deepEqual(
      report.hops.map((h) => h.step),
      [...PROCURE_TO_PAY_STEPS],
    );
    for (const hop of report.hops) {
      assert.notEqual(hop.status, 'NOT_AVAILABLE', hop.step);
      assert.notEqual(hop.hopResult, 'BLOCKED', hop.step);
      assert.ok(hop.hopResult === 'PASS' || hop.hopResult === 'GAP_FIXED', hop.step);
    }

    assertRow127AcceptanceGate(report.hops);
    assert.equal(
      assertRow127SafetyGates({ row92AutomationEnabled: false }).moneyMovement,
      0,
    );
  });

  it('Need rejects free-text-only; inspection gates; AP cannot initiate payment', () => {
    const freeText = resolveProcurementNeedFromBoqJob({
      companyId: 'c1',
      jobId: null,
      expectedJobCompanyId: 'c1',
      boqImportId: null,
      boqImportRowId: null,
      freeTextOnly: true,
    });
    assert.equal(freeText.ok, false);

    const rejected = recordDeliveryInspection({
      companyId: 'c1',
      deliveryEvidenceId: 'd1',
      purchaseOrderId: 'po1',
      purchaseOrderLineId: 'pol1',
      jobId: 'j1',
      expectedJobId: 'j1',
      outcome: 'rejected',
      inspectedByUserId: 'u1',
      inspectedAt: '2026-08-08T00:00:00.000Z',
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.inspection?.allowsInventoryCost, false);

    assert.throws(() => {
      const r = approveSupplierApPayment({
        companyId: 'c1',
        supplierInvoiceEvidenceId: 's1',
        amountCents: 100,
        roleName: 'owner',
        approverUserId: 'u1',
        approvedAt: '2026-08-08T00:00:00.000Z',
        initiatePayment: true,
      });
      if (!r.ok) throw new Error('blocked');
    });

    const ids = defaultProcureToPayFixtureIds();
    assert.equal(PROCURE_TO_PAY_ROYAL_CAPE.royalCapeQuoteNumber, 'QU-0183');
    void ids;
  });

  it('coverage defaults have no NOT_AVAILABLE for required hops', () => {
    const cells = proveProcureToPayCoverage();
    assertRow127AcceptanceGate(cells);
    assert.equal(cells.find((c) => c.step === 'need')?.hopResult, 'GAP_FIXED');
    assert.equal(cells.find((c) => c.step === 'purchase_request')?.hopResult, 'GAP_FIXED');
    assert.equal(cells.find((c) => c.step === 'inspection')?.hopResult, 'GAP_FIXED');
    assert.equal(cells.find((c) => c.step === 'payment_approval')?.hopResult, 'GAP_FIXED');
    assert.equal(cells.find((c) => c.step === 'reconciliation')?.hopResult, 'GAP_FIXED');
  });
});
