import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inclusiveDayCount,
  MAX_WORKFORCE_REPORT_PERIOD_DAYS,
  resolveWorkforceReportPeriod,
  WorkforceReportPeriodError,
} from './workforce-report-period.js';

test('resolveWorkforceReportPeriod accepts valid YYYY-MM-DD range', () => {
  const period = resolveWorkforceReportPeriod({
    periodStart: '2026-08-01',
    periodEnd: '2026-08-07',
  });
  assert.equal(period.periodStart, '2026-08-01');
  assert.equal(period.periodEnd, '2026-08-07');
  assert.equal(period.timezone, 'Africa/Johannesburg');
});

test('resolveWorkforceReportPeriod rejects start after end', () => {
  assert.throws(
    () =>
      resolveWorkforceReportPeriod({
        periodStart: '2026-08-10',
        periodEnd: '2026-08-01',
      }),
    (err: unknown) =>
      err instanceof WorkforceReportPeriodError && err.code === 'INVALID_RANGE',
  );
});

test('resolveWorkforceReportPeriod rejects period longer than maximum', () => {
  assert.throws(
    () =>
      resolveWorkforceReportPeriod({
        periodStart: '2026-01-01',
        periodEnd: '2026-06-01',
      }),
    (err: unknown) =>
      err instanceof WorkforceReportPeriodError && err.code === 'PERIOD_TOO_LONG',
  );
});

test('inclusiveDayCount matches calendar days', () => {
  assert.equal(inclusiveDayCount('2026-08-01', '2026-08-07'), 7);
  assert.equal(inclusiveDayCount('2026-08-01', '2026-08-01'), 1);
});

test('MAX_WORKFORCE_REPORT_PERIOD_DAYS is 93', () => {
  assert.equal(MAX_WORKFORCE_REPORT_PERIOD_DAYS, 93);
});
