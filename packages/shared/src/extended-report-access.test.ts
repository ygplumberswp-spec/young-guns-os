import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertExtendedReportAccess,
  resolveExtendedReportAccess,
  ExtendedReportAccessError,
} from './extended-report-access.js';

test('technician denied fleet vehicle activity export', () => {
  const decision = resolveExtendedReportAccess({
    actorUserId: 'tech-1',
    actorRoleName: 'Technician',
    permissions: ['jobs:read'],
    reportKind: 'fleet_vehicle_activity',
    isPortal: false,
  });
  assert.equal(decision.allowed, false);
});

test('technician denied compliance register export', () => {
  assert.throws(
    () =>
      assertExtendedReportAccess({
        actorUserId: 'tech-1',
        actorRoleName: 'Technician',
        permissions: ['jobs:read'],
        reportKind: 'compliance_coc_register',
        isPortal: false,
      }),
    (err: unknown) => err instanceof ExtendedReportAccessError,
  );
});

test('fleet user may access fleet operations summary', () => {
  const decision = resolveExtendedReportAccess({
    actorUserId: 'ops-1',
    actorRoleName: 'Manager',
    permissions: ['fleet_intelligence:read'],
    reportKind: 'fleet_operations',
    isPortal: false,
  });
  assert.equal(decision.allowed, true);
});

test('portal denied fleet exports', () => {
  const decision = resolveExtendedReportAccess({
    actorUserId: 'portal-1',
    actorRoleName: 'Client',
    permissions: ['portal.jobs:read'],
    reportKind: 'fleet_operations',
    isPortal: true,
  });
  assert.equal(decision.allowed, false);
});

test('compliance officer may access COC register', () => {
  const decision = resolveExtendedReportAccess({
    actorUserId: 'comp-1',
    actorRoleName: 'Office Coordinator',
    permissions: ['legal_compliance:read'],
    reportKind: 'compliance_coc_register',
    isPortal: false,
  });
  assert.equal(decision.allowed, true);
});
