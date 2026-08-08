import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PROCUREMENT_E2E_UI_HANDOFFS,
  assertRow118SafetyGates,
  assertRoyalCapeUnchangedForRow118,
  canManageProcurementE2e,
  canViewProcurementE2eInternals,
  runProcurementE2eFixture,
} from './procurement-e2e-usability.js';

describe('Row 118 procurement E2E usability', () => {
  it('fixture journey stages 1–21 pass; exactly-once cost/profit', () => {
    const result = runProcurementE2eFixture();
    assert.equal(result.failCount, 0, JSON.stringify(result.stages.filter((s) => s.result === 'BLOCKED_BY_REAL_DATA')));
    assert.equal(result.stages.length, 21);
    assert.equal(result.jpePostedOnce, true);
    assert.equal(result.duplicateBlocked, true);
    assert.equal(result.xeroBillStatus, 'XERO_BILL_NOT_LINKED');
    assert.equal(result.profitabilityReflectsActual, true);
    assert.equal(result.cleanup, true);
    assert.ok(result.stages.every((s) => s.result === 'PASS' || s.result === 'GAP_FIXED'));
    assert.ok(result.stages.some((s) => s.name === 'approve_po' && s.result === 'GAP_FIXED'));
  });

  it('UI handoffs defined; RBAC; Royal Cape; safety', () => {
    assert.ok(PROCUREMENT_E2E_UI_HANDOFFS.length >= 4);
    assert.ok(
      PROCUREMENT_E2E_UI_HANDOFFS.some((h) =>
        h.api.includes('job-procurement-chains/from-proposal'),
      ),
    );
    assert.equal(canManageProcurementE2e({ roleName: 'owner' }), true);
    assert.equal(canManageProcurementE2e({ roleName: 'technician' }), false);
    assert.equal(canViewProcurementE2eInternals({ roleName: 'client' }), false);
    assertRoyalCapeUnchangedForRow118({
      totalCents: 4_272_250,
      pricingPresentationMode: 'ITEMISED',
    });
    assert.equal(assertRow118SafetyGates({ row92AutomationEnabled: false }).row117NotStarted, true);
  });
});
