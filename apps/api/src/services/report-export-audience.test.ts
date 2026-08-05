import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRequestedReportAudience,
  resolvePortalReportAudience,
  resolveStaffReportAudience,
} from '@titan/shared';

test('assigned technician requesting internal is clamped to technician', () => {
  const decision = resolveStaffReportAudience({
    companyId: 't1',
    userId: 'tech-a',
    roleName: 'Technician',
    permissions: ['jobs:read', 'mobile:read'],
    requestedAudience: 'internal',
    jobAssignedUserId: 'tech-a',
    isAssignedToJob: true,
  });
  assert.equal(decision.effectiveAudience, 'technician');
});

test('client staff role always receives client audience', () => {
  const decision = resolveStaffReportAudience({
    companyId: 't1',
    userId: 'client-u',
    roleName: 'Client',
    permissions: ['documents:read'],
    requestedAudience: 'technician',
    jobAssignedUserId: null,
    isAssignedToJob: false,
  });
  assert.equal(decision.effectiveAudience, 'client');
});

test('owner may request any permitted audience', () => {
  for (const audience of ['internal', 'client', 'technician'] as const) {
    const decision = resolveStaffReportAudience({
      companyId: 't1',
      userId: 'owner',
      roleName: 'Company Owner',
      permissions: ['*'],
      requestedAudience: audience,
      jobAssignedUserId: null,
      isAssignedToJob: false,
    });
    assert.equal(decision.effectiveAudience, audience);
  }
});

test('invalid audience string is detected by parser', () => {
  assert.equal(parseRequestedReportAudience('%69nternal'), null);
  assert.equal(parseRequestedReportAudience(''), null);
});

test('portal client requesting technician audience is clamped to client', () => {
  const decision = resolvePortalReportAudience({
    companyId: 't1',
    customerId: 'cust-1',
    permissions: ['portal.jobs:read'],
    resourceCustomerId: 'cust-1',
    requestedAudience: 'technician',
  });
  assert.equal(decision.effectiveAudience, 'client');
  assert.equal(decision.audienceEscalationAttempt, true);
});
