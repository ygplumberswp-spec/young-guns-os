import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRequestedReportAudience,
  resolvePortalReportAudience,
  resolveStaffReportAudience,
} from '@titan/shared';

test('technician jobs:read cannot escalate to internal via query audience', () => {
  const decision = resolveStaffReportAudience({
    companyId: 'tenant-a',
    userId: 'tech-1',
    roleName: 'Technician',
    permissions: ['jobs:read'],
    requestedAudience: 'internal',
    jobAssignedUserId: 'tech-1',
    isAssignedToJob: true,
  });
  assert.equal(decision.effectiveAudience, 'technician');
  assert.equal(decision.audienceEscalationAttempt, true);
});

test('guest permissions are denied', () => {
  assert.throws(
    () =>
      resolveStaffReportAudience({
        companyId: 'tenant-a',
        userId: 'guest',
        roleName: 'Guest',
        permissions: ['portal:read'],
        requestedAudience: 'client',
        jobAssignedUserId: null,
        isAssignedToJob: false,
      }),
    (error: unknown) => error instanceof Error && error.name === 'ReportAudienceError',
  );
});

test('portal permission required for portal export resolution', () => {
  assert.throws(
    () =>
      resolvePortalReportAudience({
        companyId: 'tenant-a',
        customerId: 'cust-1',
        permissions: ['portal.dashboard:read'],
        resourceCustomerId: 'cust-1',
        requestedAudience: null,
      }),
    (error: unknown) => error instanceof Error && error.name === 'ReportAudienceError',
  );
});

test('unknown audience values are rejected by parser', () => {
  assert.equal(parseRequestedReportAudience('INTERNAL'), 'internal');
  assert.equal(parseRequestedReportAudience('superuser'), null);
});
