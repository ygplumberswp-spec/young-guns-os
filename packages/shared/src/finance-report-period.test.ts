import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FinanceReportPeriodError,
  resolveFinanceReportPeriod,
  resolveAccountsReceivableSnapshotDate,
} from './finance-report-period.js';

test('finance report period rejects invalid date format', () => {
  assert.throws(
    () =>
      resolveFinanceReportPeriod({
        reportKind: 'finance_aggregate',
        periodStart: '2026-13-01',
        periodEnd: '2026-08-05',
      }),
    (err: unknown) => err instanceof FinanceReportPeriodError,
  );
});

test('finance report period rejects start after end', () => {
  assert.throws(
    () =>
      resolveFinanceReportPeriod({
        reportKind: 'finance_aggregate',
        periodStart: '2026-08-10',
        periodEnd: '2026-08-01',
      }),
    (err: unknown) =>
      err instanceof FinanceReportPeriodError && err.code === 'INVALID_RANGE',
  );
});

test('finance aggregate period max 366 days', () => {
  assert.throws(
    () =>
      resolveFinanceReportPeriod({
        reportKind: 'finance_aggregate',
        periodStart: '2024-01-01',
        periodEnd: '2026-01-01',
      }),
    (err: unknown) =>
      err instanceof FinanceReportPeriodError && err.code === 'PERIOD_TOO_LONG',
  );
});

test('customer history allows longer period', () => {
  const period = resolveFinanceReportPeriod({
    reportKind: 'customer_property_history',
    periodStart: '2024-01-01',
    periodEnd: '2025-12-31',
  });
  assert.equal(period.reportKind, 'customer_property_history');
});

test('accounts receivable snapshot defaults to today', () => {
  const snap = resolveAccountsReceivableSnapshotDate({});
  assert.match(snap.snapshotDate, /^\d{4}-\d{2}-\d{2}$/);
});
