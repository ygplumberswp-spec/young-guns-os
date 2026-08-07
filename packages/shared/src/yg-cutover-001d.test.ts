import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  YG_CUTOVER_001D_DASHBOARD_DEFER_MS,
  YG_CUTOVER_001D_EXPERIENCE_SHELLS,
  YG_CUTOVER_001D_HEADER_VERIFICATION,
  YG_CUTOVER_001D_INTENTIONAL_SHELL_DIFFERENCES,
  YG_CUTOVER_001D_MANAGER_CORE_SURFACES,
  YG_CUTOVER_001D_OWNER_CORE_SURFACES,
  YG_CUTOVER_001D_PERF_DELTAS,
  YG_CUTOVER_001D_REGRESSION_BREAKPOINTS,
  YG_CUTOVER_001D_REUSED_WORK,
  YG_CUTOVER_001D_VIEWPORT_CAPABILITY_MISMATCHES,
} from './yg-cutover-001d.js';

describe('YG-CUTOVER-001D parity + performance contracts', () => {
  it('documents Owner/Manager/Technician/Client shells without viewport capability gates', () => {
    assert.equal(YG_CUTOVER_001D_EXPERIENCE_SHELLS.ownerManagerStaff.viewportCapabilityGate, false);
    assert.equal(YG_CUTOVER_001D_EXPERIENCE_SHELLS.technician.viewportCapabilityGate, false);
    assert.equal(YG_CUTOVER_001D_EXPERIENCE_SHELLS.client.viewportCapabilityGate, false);
    assert.equal(YG_CUTOVER_001D_VIEWPORT_CAPABILITY_MISMATCHES.length, 0);
    assert.ok(YG_CUTOVER_001D_INTENTIONAL_SHELL_DIFFERENCES.every((d) => d.viewportMismatch === false));
  });

  it('covers Owner and Manager core surface checklists', () => {
    assert.ok(YG_CUTOVER_001D_OWNER_CORE_SURFACES.includes('AURA'));
    assert.ok(YG_CUTOVER_001D_OWNER_CORE_SURFACES.includes('Finance'));
    assert.ok(YG_CUTOVER_001D_OWNER_CORE_SURFACES.includes('Fleet / Live Map'));
    assert.ok(YG_CUTOVER_001D_MANAGER_CORE_SURFACES.includes('AURA'));
    assert.ok(YG_CUTOVER_001D_MANAGER_CORE_SURFACES.includes('authorised finance'));
    assert.ok(YG_CUTOVER_001D_MANAGER_CORE_SURFACES.includes('team management allowed by RBAC'));
  });

  it('records progressive dashboard defer timings and 001D perf deltas', () => {
    assert.equal(YG_CUTOVER_001D_DASHBOARD_DEFER_MS.ops, 120);
    assert.equal(YG_CUTOVER_001D_DASHBOARD_DEFER_MS.fleet, 180);
    assert.equal(YG_CUTOVER_001D_DASHBOARD_DEFER_MS.financePulse, 250);
    assert.equal(YG_CUTOVER_001D_DASHBOARD_DEFER_MS.support, 320);
    assert.equal(YG_CUTOVER_001D_DASHBOARD_DEFER_MS.mapsWarmOn, 'deferFleet');
    assert.ok(YG_CUTOVER_001D_PERF_DELTAS.length >= 4);
    assert.ok(YG_CUTOVER_001D_REUSED_WORK.some((w) => w.includes('AURA')));
  });

  it('reuses header polish verification and regression breakpoints', () => {
    assert.equal(YG_CUTOVER_001D_HEADER_VERIFICATION.status, 'PASS_REUSED');
    for (const width of [360, 390, 430, 1920] as const) {
      assert.ok(YG_CUTOVER_001D_REGRESSION_BREAKPOINTS.includes(width));
    }
  });
});
