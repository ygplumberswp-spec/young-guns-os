import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertExtendedReportAccess,
  resolveExtendedReportAccess,
} from '@titan/shared';

test('technician denied fleet operations summary', () => {
  assert.throws(() =>
    assertExtendedReportAccess({
      actorUserId: 'tech-1',
      actorRoleName: 'Technician',
      permissions: ['mobile:read'],
      reportKind: 'fleet_operations',
      isPortal: false,
    }),
  );
});

test('manager may access fleet vehicle activity', () => {
  const decision = resolveExtendedReportAccess({
    actorUserId: 'mgr-1',
    actorRoleName: 'Manager',
    permissions: ['fleet_intelligence:read'],
    reportKind: 'fleet_vehicle_activity',
    isPortal: false,
  });
  assert.equal(decision.allowed, true);
});

test('portal denied compliance register', () => {
  const decision = resolveExtendedReportAccess({
    actorUserId: 'portal-1',
    actorRoleName: 'Client',
    permissions: ['portal.jobs:read'],
    reportKind: 'compliance_coc_register',
    isPortal: true,
  });
  assert.equal(decision.allowed, false);
});
