import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTechnicianSelfBinding,
  resolveWorkforceReportAccess,
  WorkforceReportAccessError,
} from '@titan/shared';

test('self route rejects mismatched technician user id in URL', () => {
  assert.throws(
    () => assertTechnicianSelfBinding('tech-a', 'tech-b', true),
    (err: unknown) => err instanceof WorkforceReportAccessError,
  );
});

test('workforce operations requires elevated permission for office without ops', () => {
  const decision = resolveWorkforceReportAccess({
    actorUserId: 'office-1',
    actorRoleName: 'Office Coordinator',
    permissions: ['jobs:read'],
    targetUserId: null,
    reportKind: 'workforce_operations',
    isSelfRoute: false,
  });
  assert.equal(decision.allowed, false);
});

test('technician productivity self-access allowed', () => {
  const decision = resolveWorkforceReportAccess({
    actorUserId: 'tech-1',
    actorRoleName: 'Technician',
    permissions: ['mobile:read'],
    targetUserId: 'tech-1',
    reportKind: 'technician_productivity',
    isSelfRoute: true,
  });
  assert.equal(decision.allowed, true);
});
