import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveExtendedReportPeriod,
  ExtendedReportPeriodError,
  EXTENDED_FLEET_MAX_PERIOD_DAYS,
} from './extended-report-period.js';

test('fleet period rejects range longer than 93 days', () => {
  assert.throws(
    () =>
      resolveExtendedReportPeriod({
        reportKind: 'fleet_operations',
        periodStart: '2026-01-01',
        periodEnd: '2026-06-01',
      }),
    (err: unknown) => err instanceof ExtendedReportPeriodError && err.code === 'PERIOD_TOO_LONG',
  );
});

test('fleet period accepts 30 day window', () => {
  const period = resolveExtendedReportPeriod({
    reportKind: 'fleet_vehicle_activity',
    periodStart: '2026-07-01',
    periodEnd: '2026-07-30',
  });
  assert.equal(period.periodStart, '2026-07-01');
  assert.equal(period.timezone, 'Africa/Johannesburg');
});

test('register allows up to 366 days', () => {
  const end = new Date('2026-08-05T00:00:00.000Z');
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (EXTENDED_FLEET_MAX_PERIOD_DAYS - 1));
  const period = resolveExtendedReportPeriod({
    reportKind: 'compliance_coc_register',
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  });
  assert.equal(period.reportKind, 'compliance_coc_register');
});
