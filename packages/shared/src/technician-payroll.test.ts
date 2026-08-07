import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAYROLL_SETUP_INCOMPLETE,
  TECHNICIAN_ONBOARDING_STEPS,
  canViewTechnicianPayroll,
  computeTechnicianPeriodWages,
  deriveInternalHourlyCostCents,
  resolveBlendedOvertimeMultiplier,
  resolveEffectivePayrollTerm,
  splitNormalAndOvertimeMinutes,
  validateTechnicianPayrollTermInput,
} from './technician-payroll.js';

describe('technician payroll', () => {
  it('derives hourly cost from monthly salary and working calendar', () => {
    // R15,000 / ((5*8*52)/12) ≈ R15,000 / 173.333 ≈ R86.54/h = 8654 cents
    const hourly = deriveInternalHourlyCostCents(1_500_000, {
      workingDaysPerWeek: 5,
      workingHoursPerDay: 8,
    });
    assert.equal(hourly, 8654);
  });

  it('resolves effective-dated salary changes without rewriting history', () => {
    const terms = [
      { id: 'a', effectiveFrom: '2026-01-01', effectiveTo: '2026-08-31' },
      { id: 'b', effectiveFrom: '2026-09-01', effectiveTo: null },
    ];
    assert.equal(resolveEffectivePayrollTerm(terms, '2026-08-15')?.id, 'a');
    assert.equal(resolveEffectivePayrollTerm(terms, '2026-09-01')?.id, 'b');
    assert.equal(resolveEffectivePayrollTerm(terms, '2025-12-01'), null);
  });

  it('splits overtime and blends multiplier so job allocation matches OT economics', () => {
    const split = splitNormalAndOvertimeMinutes(600, 8); // 10h
    assert.equal(split.normalMinutes, 480);
    assert.equal(split.overtimeMinutes, 120);
    const blended = resolveBlendedOvertimeMultiplier({
      durationMinutes: 600,
      dailyThresholdHours: 8,
      overtimeMultiplierBps: 15_000,
    });
    assert.ok(Math.abs(blended - 1.1) < 1e-9);
  });

  it('computes period wages with salary as payroll expense and job labour as allocation only', () => {
    const wages = computeTechnicianPeriodWages({
      term: {
        monthlySalaryCents: 1_500_000,
        workingDaysPerWeek: 5,
        workingHoursPerDay: 8,
        overtimeDailyThresholdHours: 8,
        overtimeMultiplierBps: 15_000,
      },
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      workedMinutes: 600,
      overtimeMinutes: 120,
    });
    assert.equal(wages.setupStatus, 'complete');
    assert.equal(wages.monthlySalaryCents, 1_500_000);
    assert.ok((wages.overtimeAmountCents ?? 0) > 0);
    assert.equal(wages.totalWagesCents, (wages.monthlySalaryCents ?? 0) + (wages.overtimeAmountCents ?? 0));
    assert.equal(wages.doubleCountGuard.doNotSumSalaryPlusJobLabour, true);
    assert.ok((wages.jobLabourAllocationCents ?? 0) > 0);
  });

  it('returns PAYROLL SETUP INCOMPLETE instead of inventing wages', () => {
    const wages = computeTechnicianPeriodWages({
      term: null,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      workedMinutes: 480,
    });
    assert.equal(wages.setupStatus, 'incomplete');
    assert.equal(wages.setupLabel, PAYROLL_SETUP_INCOMPLETE);
    assert.equal(wages.totalWagesCents, null);
    assert.equal(wages.jobLabourAllocationCents, null);
  });

  it('hides payroll from Technician and Client roles', () => {
    assert.equal(canViewTechnicianPayroll(['finance:write'], 'Technician'), false);
    assert.equal(canViewTechnicianPayroll(['*'], 'Client'), false);
    assert.equal(canViewTechnicianPayroll(['finance:write'], 'Company Owner'), true);
    assert.equal(canViewTechnicianPayroll(['finance:write'], 'Accountant'), true);
  });

  it('validates onboarding payroll payload and keeps onboarding step order', () => {
    assert.deepEqual(TECHNICIAN_ONBOARDING_STEPS, [
      'account_details',
      'technician_role',
      'monthly_salary',
      'working_hours_overtime',
      'activate_access',
    ]);
    const ok = validateTechnicianPayrollTermInput({
      monthlySalaryCents: 1_700_000,
      effectiveFrom: '2026-09-01',
      workingDaysPerWeek: 5,
      workingHoursPerDay: 8,
    });
    assert.equal(ok.ok, true);
    const bad = validateTechnicianPayrollTermInput({
      monthlySalaryCents: 0,
      effectiveFrom: '2026-09-01',
    });
    assert.equal(bad.ok, false);
  });
});
