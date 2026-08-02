import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  YOUNG_GUNS_PAYROLL_RULES,
  calculateYoungGunsDailyHours,
  aggregateYoungGunsHoursFromPairs,
} from './young-guns-payroll.js';

describe('Young Guns payroll rules', () => {
  it('documents expected rule constants', () => {
    assert.equal(YOUNG_GUNS_PAYROLL_RULES.shiftStart, '07:00');
    assert.equal(YOUNG_GUNS_PAYROLL_RULES.shiftEnd, '17:00');
    assert.equal(YOUNG_GUNS_PAYROLL_RULES.lunchDeductionMinutes, 30);
    assert.equal(YOUNG_GUNS_PAYROLL_RULES.overtimeAfter, '17:00');
    assert.equal(YOUNG_GUNS_PAYROLL_RULES.saturdayAllOvertime, true);
    assert.equal(YOUNG_GUNS_PAYROLL_RULES.payrollChangesRequireApproval, true);
    assert.equal(YOUNG_GUNS_PAYROLL_RULES.correctionsAudited, true);
  });

  it('deducts 30-minute lunch on a full weekday shift', () => {
    const result = calculateYoungGunsDailyHours({
      clockInAt: new Date('2026-08-04T05:00:00.000Z'), // 07:00 SAST
      clockOutAt: new Date('2026-08-04T15:00:00.000Z'), // 17:00 SAST
    });
    assert.equal(result.breakHours, 0.5);
    assert.ok(result.standardHours >= 9);
    assert.equal(result.overtimeHours, 0);
    assert.equal(result.saturdayOvertime, false);
  });

  it('counts overtime after 17:00 on weekdays', () => {
    const result = calculateYoungGunsDailyHours({
      clockInAt: new Date('2026-08-04T05:00:00.000Z'), // 07:00 SAST
      clockOutAt: new Date('2026-08-04T17:00:00.000Z'), // 19:00 SAST
    });
    assert.ok(result.overtimeHours >= 1.5);
    assert.equal(result.saturdayOvertime, false);
  });

  it('treats Saturday hours as overtime', () => {
    const result = calculateYoungGunsDailyHours({
      clockInAt: new Date('2026-08-01T05:00:00.000Z'), // Saturday 07:00 SAST
      clockOutAt: new Date('2026-08-01T13:00:00.000Z'), // Saturday 15:00 SAST
    });
    assert.equal(result.standardHours, 0);
    assert.ok(result.overtimeHours > 0);
    assert.equal(result.saturdayOvertime, true);
  });

  it('aggregates multiple clock pairs', () => {
    const result = aggregateYoungGunsHoursFromPairs([
      {
        clockInAt: new Date('2026-08-04T05:00:00.000Z'),
        clockOutAt: new Date('2026-08-04T11:00:00.000Z'),
      },
      {
        clockInAt: new Date('2026-08-04T12:00:00.000Z'),
        clockOutAt: new Date('2026-08-04T15:00:00.000Z'),
      },
    ]);
    assert.ok(result.standardHours + result.overtimeHours > 0);
  });
});
