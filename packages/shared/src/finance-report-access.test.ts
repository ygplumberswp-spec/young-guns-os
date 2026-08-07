import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFinanceReportAccess,
  resolveFinanceReportAccess,
  FinanceReportAccessError,
} from './finance-report-access.js';

test('technician denied finance aggregate', () => {
  const decision = resolveFinanceReportAccess({
    actorUserId: 'tech-1',
    actorRoleName: 'Technician',
    permissions: ['jobs:read'],
    reportKind: 'finance_aggregate',
    targetCustomerId: null,
    isPortal: false,
  });
  assert.equal(decision.allowed, false);
});

test('owner may access finance aggregate', () => {
  const decision = resolveFinanceReportAccess({
    actorUserId: 'owner-1',
    actorRoleName: 'Company Owner',
    permissions: ['*'],
    reportKind: 'finance_aggregate',
    targetCustomerId: null,
    isPortal: false,
  });
  assert.equal(decision.allowed, true);
});

test('office with customers:read may access receivables', () => {
  const decision = resolveFinanceReportAccess({
    actorUserId: 'office-1',
    actorRoleName: 'Office Coordinator',
    permissions: ['customers:read'],
    reportKind: 'accounts_receivable',
    targetCustomerId: null,
    isPortal: false,
  });
  assert.equal(decision.allowed, true);
});

test('portal client may access own customer history only', () => {
  const decision = resolveFinanceReportAccess({
    actorUserId: 'portal-1',
    actorRoleName: 'Client',
    permissions: ['portal.jobs:read'],
    reportKind: 'customer_property_history',
    targetCustomerId: 'cust-a',
    portalCustomerId: 'cust-a',
    isPortal: true,
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.scope, 'customer_history_client');
});

test('portal client denied other customer history', () => {
  assert.throws(
    () =>
      assertFinanceReportAccess({
        actorUserId: 'portal-1',
        actorRoleName: 'Client',
        permissions: ['portal.jobs:read'],
        reportKind: 'customer_property_history',
        targetCustomerId: 'cust-b',
        portalCustomerId: 'cust-a',
        isPortal: true,
      }),
    (err: unknown) => err instanceof FinanceReportAccessError,
  );
});

test('portal denied internal finance reports', () => {
  const decision = resolveFinanceReportAccess({
    actorUserId: 'portal-1',
    actorRoleName: 'Client',
    permissions: ['portal.jobs:read'],
    reportKind: 'cashflow_collections',
    targetCustomerId: null,
    portalCustomerId: 'cust-a',
    isPortal: true,
  });
  assert.equal(decision.allowed, false);
});
