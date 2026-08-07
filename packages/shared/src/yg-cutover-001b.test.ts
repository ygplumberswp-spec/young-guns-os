import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  YG_CUTOVER_001B_GOOGLE_MAPS_EVIDENCE,
  YG_CUTOVER_001B_MANAGER_RBAC_MATRIX,
  YG_CUTOVER_001B_MOBILE_BREAKPOINTS,
} from './yg-cutover-001b.js';

describe('YG-CUTOVER-001B Manager acceptance contracts', () => {
  it('covers required responsive breakpoints', () => {
    assert.deepEqual([...YG_CUTOVER_001B_MOBILE_BREAKPOINTS], [360, 390, 430, 768, 1024, 1366, 1920]);
  });

  it('does not elevate Manager to Company Owner', () => {
    assert.equal(YG_CUTOVER_001B_MANAGER_RBAC_MATRIX.elevatedToOwner, false);
    assert.equal(YG_CUTOVER_001B_MANAGER_RBAC_MATRIX.canonicalRoleName, 'Manager');
    assert.equal(YG_CUTOVER_001B_MANAGER_RBAC_MATRIX.teamAndAccess.canAssignRoles, false);
    assert.equal(YG_CUTOVER_001B_MANAGER_RBAC_MATRIX.aura.privilegedDecide, false);
    assert.equal(YG_CUTOVER_001B_MANAGER_RBAC_MATRIX.aura.dashboardPrimarySurface, true);
    assert.equal(YG_CUTOVER_001B_MANAGER_RBAC_MATRIX.aura.ownerOnlyFinanceViaAura, false);
  });

  it('documents Manager finance visibility from finance:read/write', () => {
    assert.equal(YG_CUTOVER_001B_MANAGER_RBAC_MATRIX.financeVisibility.granted, true);
    assert.match(YG_CUTOVER_001B_MANAGER_RBAC_MATRIX.financeVisibility.why, /finance:read/);
    assert.ok(YG_CUTOVER_001B_MANAGER_RBAC_MATRIX.canAccess.some((s) => /Team & Access/i.test(s)));
  });

  it('records Google Maps as rendering evidence only', () => {
    assert.equal(YG_CUTOVER_001B_GOOGLE_MAPS_EVIDENCE.status, 'rendering_evidence_only');
    assert.equal(YG_CUTOVER_001B_GOOGLE_MAPS_EVIDENCE.authority.fleetGps, 'Cartrack');
    assert.ok(YG_CUTOVER_001B_GOOGLE_MAPS_EVIDENCE.notDeclaredComplete.length >= 4);
  });
});
