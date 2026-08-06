import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertWorkforceReportAccess,
  resolveWorkforceReportAccess,
  WorkforceReportAccessError,
} from './workforce-report-access.js';

test('technician may access own activity report via self route', () => {
  const decision = resolveWorkforceReportAccess({
    actorUserId: 'tech-1',
    actorRoleName: 'Technician',
    permissions: ['mobile:read', 'jobs:read'],
    targetUserId: 'tech-1',
    reportKind: 'technician_activity',
    isSelfRoute: true,
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.scope, 'self');
});

test('technician denied another technician report', () => {
  assert.throws(
    () =>
      assertWorkforceReportAccess({
        actorUserId: 'tech-1',
        actorRoleName: 'Technician',
        permissions: ['mobile:read'],
        targetUserId: 'tech-2',
        reportKind: 'technician_activity',
        isSelfRoute: false,
      }),
    (err: unknown) => err instanceof WorkforceReportAccessError,
  );
});

test('technician denied workforce operations summary', () => {
  const decision = resolveWorkforceReportAccess({
    actorUserId: 'tech-1',
    actorRoleName: 'Technician',
    permissions: ['mobile:read'],
    targetUserId: null,
    reportKind: 'workforce_operations',
    isSelfRoute: false,
  });
  assert.equal(decision.allowed, false);
});

test('client denied all workforce reports', () => {
  const decision = resolveWorkforceReportAccess({
    actorUserId: 'client-1',
    actorRoleName: 'Client',
    permissions: ['portal.jobs:read'],
    targetUserId: 'client-1',
    reportKind: 'technician_activity',
    isSelfRoute: true,
  });
  assert.equal(decision.allowed, false);
});

test('owner may access workforce operations summary', () => {
  const decision = resolveWorkforceReportAccess({
    actorUserId: 'owner-1',
    actorRoleName: 'Company Owner',
    permissions: ['*'],
    targetUserId: null,
    reportKind: 'workforce_operations',
    isSelfRoute: false,
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.scope, 'workforce_summary');
});

test('office staff with workforce_intelligence:read may access team technician report', () => {
  const decision = resolveWorkforceReportAccess({
    actorUserId: 'office-1',
    actorRoleName: 'Admin',
    permissions: ['workforce_intelligence:read'],
    targetUserId: 'tech-2',
    reportKind: 'technician_timesheet',
    isSelfRoute: false,
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.scope, 'team');
});
