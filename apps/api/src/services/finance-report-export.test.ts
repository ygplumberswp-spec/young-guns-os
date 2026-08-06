import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFinanceReportAccess,
  resolveFinanceReportAccess,
  FinanceReportAccessError,
} from '@titan/shared';

test('technician denied cashflow collections export', () => {
  assert.throws(
    () =>
      assertFinanceReportAccess({
        actorUserId: 'tech-1',
        actorRoleName: 'Technician',
        permissions: ['mobile:read'],
        reportKind: 'cashflow_collections',
        targetCustomerId: null,
        isPortal: false,
      }),
    (err: unknown) => err instanceof FinanceReportAccessError,
  );
});

test('finance user may access aggregate report', () => {
  const decision = resolveFinanceReportAccess({
    actorUserId: 'fin-1',
    actorRoleName: 'Accountant',
    permissions: ['finance:read'],
    reportKind: 'finance_aggregate',
    targetCustomerId: null,
    isPortal: false,
  });
  assert.equal(decision.allowed, true);
});

test('office without finance permission denied aggregate', () => {
  const decision = resolveFinanceReportAccess({
    actorUserId: 'office-1',
    actorRoleName: 'Office Coordinator',
    permissions: ['jobs:read'],
    reportKind: 'finance_aggregate',
    targetCustomerId: null,
    isPortal: false,
  });
  assert.equal(decision.allowed, false);
});
