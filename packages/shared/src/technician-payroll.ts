/**
 * Technician monthly salary → derived internal hourly labour cost,
 * overtime, job labour allocation, and payroll-setup gates.
 *
 * MONTHLY SALARY is the actual payroll expense.
 * Job labour cost is an ALLOCATION of that payroll for profitability —
 * never count salary expense + allocated job labour as two company expenses.
 *
 * Salary / wage figures are Owner / Finance / Admin only — never Technician or Client.
 */

import { canViewFinanceProfit } from './finance-tenant-pricebook.js';

export const PAYROLL_SETUP_INCOMPLETE = 'PAYROLL SETUP INCOMPLETE';

export const TECHNICIAN_ONBOARDING_STEPS = [
  'account_details',
  'technician_role',
  'monthly_salary',
  'working_hours_overtime',
  'activate_access',
] as const;

export type TechnicianOnboardingStep = (typeof TECHNICIAN_ONBOARDING_STEPS)[number];

export const TECHNICIAN_ONBOARDING_STEP_LABELS: Record<TechnicianOnboardingStep, string> = {
  account_details: 'Account Details',
  technician_role: 'Technician Role',
  monthly_salary: 'Monthly Salary',
  working_hours_overtime: 'Working Hours / Overtime',
  activate_access: 'Activate Access',
};

/** Default SA-style calendar: 5×8h → ~173.33 hours/month. */
export const DEFAULT_WORKING_DAYS_PER_WEEK = 5;
export const DEFAULT_WORKING_HOURS_PER_DAY = 8;
export const DEFAULT_OVERTIME_DAILY_THRESHOLD_HOURS = 8;
/** 1.5× expressed as basis points. */
export const DEFAULT_OVERTIME_MULTIPLIER_BPS = 15_000;

export type TechnicianPayrollSetupStatus = 'complete' | 'incomplete';

export type TechnicianWorkingCalendar = {
  workingDaysPerWeek: number;
  workingHoursPerDay: number;
};

export type TechnicianOvertimeRules = {
  dailyThresholdHours: number;
  /** Multiplier in basis points (15000 = 1.5×). */
  multiplierBps: number;
};

export type TechnicianPayrollTermInput = {
  monthlySalaryCents: number;
  effectiveFrom: string;
  workingDaysPerWeek?: number;
  workingHoursPerDay?: number;
  overtimeDailyThresholdHours?: number;
  overtimeMultiplierBps?: number;
  payrollReference?: string | null;
  notes?: string | null;
};

export type TechnicianPayrollTermSummary = {
  id: string;
  userId: string;
  monthlySalaryCents: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  workingDaysPerWeek: number;
  workingHoursPerDay: number;
  overtimeDailyThresholdHours: number;
  overtimeMultiplierBps: number;
  /** Derived internal normal hourly labour cost (cents). */
  derivedHourlyCostCents: number;
  payrollReference: string | null;
  notes: string | null;
  createdByUserId: string | null;
  createdAt: string;
};

export type TechnicianPayrollProfileSummary = {
  userId: string;
  setupStatus: TechnicianPayrollSetupStatus;
  setupLabel: string | null;
  currentTerm: TechnicianPayrollTermSummary | null;
  terms: TechnicianPayrollTermSummary[];
};

/** Invite-time / onboarding payroll draft (stored on invite until accept). */
export type TechnicianPayrollInviteSetup = {
  monthlySalaryCents: number;
  effectiveFrom: string;
  workingDaysPerWeek: number;
  workingHoursPerDay: number;
  overtimeDailyThresholdHours: number;
  overtimeMultiplierBps: number;
  payrollReference?: string | null;
  notes?: string | null;
};

export type TechnicianPeriodWageBreakdown = {
  setupStatus: TechnicianPayrollSetupStatus;
  setupLabel: string | null;
  periodStart: string;
  periodEnd: string;
  monthlySalaryCents: number | null;
  derivedHourlyCostCents: number | null;
  normalMinutes: number;
  overtimeMinutes: number;
  normalHours: number;
  overtimeHours: number;
  /** Additive OT pay on top of monthly salary (null when setup incomplete). */
  overtimeAmountCents: number | null;
  /** Actual payroll expense for the period (salary + OT), not job allocation. */
  totalWagesCents: number | null;
  /**
   * Job labour allocation for the same hours — for JPE only.
   * Must not be added to totalWages as a second company expense.
   */
  jobLabourAllocationCents: number | null;
  doubleCountGuard: {
    salaryIsPayrollExpense: true;
    jobLabourIsAllocationOnly: true;
    doNotSumSalaryPlusJobLabour: true;
  };
};

export function canViewTechnicianPayroll(
  permissions: readonly string[],
  roleName?: string | null,
): boolean {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  return canViewFinanceProfit(permissions, roleName);
}

export function normaliseWorkingCalendar(input?: Partial<TechnicianWorkingCalendar> | null): TechnicianWorkingCalendar {
  const days = Number(input?.workingDaysPerWeek);
  const hours = Number(input?.workingHoursPerDay);
  return {
    workingDaysPerWeek:
      Number.isFinite(days) && days > 0 && days <= 7 ? days : DEFAULT_WORKING_DAYS_PER_WEEK,
    workingHoursPerDay:
      Number.isFinite(hours) && hours > 0 && hours <= 24 ? hours : DEFAULT_WORKING_HOURS_PER_DAY,
  };
}

export function normaliseOvertimeRules(input?: Partial<TechnicianOvertimeRules> | null): TechnicianOvertimeRules {
  const threshold = Number(input?.dailyThresholdHours);
  const bps = Number(input?.multiplierBps);
  return {
    dailyThresholdHours:
      Number.isFinite(threshold) && threshold > 0 && threshold <= 24
        ? threshold
        : DEFAULT_OVERTIME_DAILY_THRESHOLD_HOURS,
    multiplierBps:
      Number.isFinite(bps) && bps >= 10_000 && bps <= 50_000
        ? Math.round(bps)
        : DEFAULT_OVERTIME_MULTIPLIER_BPS,
  };
}

export function overtimeMultiplierFromBps(multiplierBps: number): number {
  return Math.max(1, multiplierBps / 10_000);
}

/** Expected paid hours in a month from the working calendar (52/12 weeks). */
export function expectedMonthlyWorkingHours(calendar: TechnicianWorkingCalendar): number {
  const weekly = calendar.workingDaysPerWeek * calendar.workingHoursPerDay;
  return (weekly * 52) / 12;
}

/**
 * Derive internal normal hourly labour cost from monthly salary + working calendar.
 * Returns null when inputs are incomplete / invalid — never invent a wage.
 */
export function deriveInternalHourlyCostCents(
  monthlySalaryCents: number,
  calendar: TechnicianWorkingCalendar,
): number | null {
  if (!Number.isFinite(monthlySalaryCents) || monthlySalaryCents <= 0) return null;
  const hours = expectedMonthlyWorkingHours(calendar);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return Math.round(monthlySalaryCents / hours);
}

export function isTechnicianPayrollTermComplete(input: {
  monthlySalaryCents?: number | null;
  workingDaysPerWeek?: number | null;
  workingHoursPerDay?: number | null;
  /** When provided, must be a real date; omit for pure calculation checks. */
  effectiveFrom?: string | null;
}): boolean {
  if (
    input.effectiveFrom !== undefined &&
    input.effectiveFrom !== null &&
    !input.effectiveFrom.trim()
  ) {
    return false;
  }
  if (!Number.isFinite(input.monthlySalaryCents) || (input.monthlySalaryCents ?? 0) <= 0) return false;
  const calendar = normaliseWorkingCalendar({
    workingDaysPerWeek: input.workingDaysPerWeek ?? undefined,
    workingHoursPerDay: input.workingHoursPerDay ?? undefined,
  });
  return deriveInternalHourlyCostCents(input.monthlySalaryCents ?? 0, calendar) != null;
}

export function technicianPayrollSetupLabel(complete: boolean): string | null {
  return complete ? null : PAYROLL_SETUP_INCOMPLETE;
}

export function resolveEffectivePayrollTerm<T extends { effectiveFrom: string; effectiveTo: string | null }>(
  terms: readonly T[],
  asOfDate: string,
): T | null {
  const asOf = asOfDate.slice(0, 10);
  const applicable = terms
    .filter((term) => term.effectiveFrom.slice(0, 10) <= asOf)
    .filter((term) => !term.effectiveTo || term.effectiveTo.slice(0, 10) >= asOf)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return applicable[0] ?? null;
}

export function splitNormalAndOvertimeMinutes(
  durationMinutes: number,
  dailyThresholdHours: number,
): { normalMinutes: number; overtimeMinutes: number } {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return { normalMinutes: 0, overtimeMinutes: 0 };
  }
  const thresholdMinutes = Math.max(0, Math.round(dailyThresholdHours * 60));
  const normalMinutes = Math.min(durationMinutes, thresholdMinutes);
  return {
    normalMinutes,
    overtimeMinutes: Math.max(0, durationMinutes - normalMinutes),
  };
}

/**
 * Single multiplier that preserves OT economics when applied to the whole entry:
 * cost = hours × hourly × multiplier ≡ normalHours×hourly + otHours×hourly×otRate
 */
export function resolveBlendedOvertimeMultiplier(input: {
  durationMinutes: number;
  dailyThresholdHours: number;
  overtimeMultiplierBps: number;
}): number {
  const { normalMinutes, overtimeMinutes } = splitNormalAndOvertimeMinutes(
    input.durationMinutes,
    input.dailyThresholdHours,
  );
  if (input.durationMinutes <= 0) return 1;
  if (overtimeMinutes <= 0) return 1;
  const ot = overtimeMultiplierFromBps(input.overtimeMultiplierBps);
  return (normalMinutes * 1 + overtimeMinutes * ot) / input.durationMinutes;
}

export function computeJobLabourAllocationCents(input: {
  durationMinutes: number;
  hourlyCostCents: number;
  overtimeMultiplier?: number;
}): number {
  if (input.durationMinutes <= 0 || input.hourlyCostCents < 0) return 0;
  const hours = input.durationMinutes / 60;
  const multiplier = input.overtimeMultiplier && input.overtimeMultiplier > 0 ? input.overtimeMultiplier : 1;
  return Math.round(hours * input.hourlyCostCents * multiplier);
}

export function computeTechnicianPeriodWages(input: {
  term: {
    monthlySalaryCents: number;
    workingDaysPerWeek: number;
    workingHoursPerDay: number;
    overtimeDailyThresholdHours: number;
    overtimeMultiplierBps: number;
  } | null;
  periodStart: string;
  periodEnd: string;
  /** Authoritative timer/timesheet minutes in the period (all jobs). */
  workedMinutes: number;
  /**
   * Optional pre-split OT minutes. When omitted, OT is estimated from a single
   * blended day using the daily threshold (conservative for incomplete day rolls).
   */
  overtimeMinutes?: number;
}): TechnicianPeriodWageBreakdown {
  const doubleCountGuard = {
    salaryIsPayrollExpense: true as const,
    jobLabourIsAllocationOnly: true as const,
    doNotSumSalaryPlusJobLabour: true as const,
  };

  const worked = Math.max(0, Math.round(input.workedMinutes));
  if (!input.term || !isTechnicianPayrollTermComplete(input.term)) {
    return {
      setupStatus: 'incomplete',
      setupLabel: PAYROLL_SETUP_INCOMPLETE,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      monthlySalaryCents: null,
      derivedHourlyCostCents: null,
      normalMinutes: worked,
      overtimeMinutes: 0,
      normalHours: worked / 60,
      overtimeHours: 0,
      overtimeAmountCents: null,
      totalWagesCents: null,
      jobLabourAllocationCents: null,
      doubleCountGuard,
    };
  }

  const calendar = normaliseWorkingCalendar(input.term);
  const hourly = deriveInternalHourlyCostCents(input.term.monthlySalaryCents, calendar);
  if (hourly == null) {
    return {
      setupStatus: 'incomplete',
      setupLabel: PAYROLL_SETUP_INCOMPLETE,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      monthlySalaryCents: null,
      derivedHourlyCostCents: null,
      normalMinutes: worked,
      overtimeMinutes: 0,
      normalHours: worked / 60,
      overtimeHours: 0,
      overtimeAmountCents: null,
      totalWagesCents: null,
      jobLabourAllocationCents: null,
      doubleCountGuard,
    };
  }

  const overtimeMinutes =
    typeof input.overtimeMinutes === 'number' && Number.isFinite(input.overtimeMinutes)
      ? Math.max(0, Math.round(input.overtimeMinutes))
      : splitNormalAndOvertimeMinutes(worked, input.term.overtimeDailyThresholdHours).overtimeMinutes;
  const normalMinutes = Math.max(0, worked - overtimeMinutes);
  const otMult = overtimeMultiplierFromBps(input.term.overtimeMultiplierBps);
  const overtimeAmountCents = Math.round((overtimeMinutes / 60) * hourly * otMult);
  const blended = resolveBlendedOvertimeMultiplier({
    durationMinutes: worked,
    dailyThresholdHours: input.term.overtimeDailyThresholdHours,
    overtimeMultiplierBps: input.term.overtimeMultiplierBps,
  });

  return {
    setupStatus: 'complete',
    setupLabel: null,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    monthlySalaryCents: input.term.monthlySalaryCents,
    derivedHourlyCostCents: hourly,
    normalMinutes,
    overtimeMinutes,
    normalHours: normalMinutes / 60,
    overtimeHours: overtimeMinutes / 60,
    overtimeAmountCents,
    totalWagesCents: input.term.monthlySalaryCents + overtimeAmountCents,
    jobLabourAllocationCents: computeJobLabourAllocationCents({
      durationMinutes: worked,
      hourlyCostCents: hourly,
      overtimeMultiplier: blended,
    }),
    doubleCountGuard,
  };
}

export function validateTechnicianPayrollTermInput(
  input: TechnicianPayrollTermInput,
): { ok: true; value: TechnicianPayrollInviteSetup } | { ok: false; message: string } {
  const monthlySalaryCents = Math.round(Number(input.monthlySalaryCents));
  if (!Number.isFinite(monthlySalaryCents) || monthlySalaryCents <= 0) {
    return { ok: false, message: 'Monthly salary must be greater than zero' };
  }
  const effectiveFrom = input.effectiveFrom?.trim().slice(0, 10) ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    return { ok: false, message: 'Effective start date is required (YYYY-MM-DD)' };
  }
  const calendar = normaliseWorkingCalendar({
    workingDaysPerWeek: input.workingDaysPerWeek,
    workingHoursPerDay: input.workingHoursPerDay,
  });
  const overtime = normaliseOvertimeRules({
    dailyThresholdHours: input.overtimeDailyThresholdHours,
    multiplierBps: input.overtimeMultiplierBps,
  });
  if (deriveInternalHourlyCostCents(monthlySalaryCents, calendar) == null) {
    return { ok: false, message: PAYROLL_SETUP_INCOMPLETE };
  }
  return {
    ok: true,
    value: {
      monthlySalaryCents,
      effectiveFrom,
      workingDaysPerWeek: calendar.workingDaysPerWeek,
      workingHoursPerDay: calendar.workingHoursPerDay,
      overtimeDailyThresholdHours: overtime.dailyThresholdHours,
      overtimeMultiplierBps: overtime.multiplierBps,
      payrollReference: input.payrollReference?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  };
}

export function buildTechnicianPayrollTermSummary(input: {
  id: string;
  userId: string;
  monthlySalaryCents: number;
  effectiveFrom: string | Date;
  effectiveTo: string | Date | null;
  workingDaysPerWeek: number;
  workingHoursPerDay: number;
  overtimeDailyThresholdHours: number;
  overtimeMultiplierBps: number;
  payrollReference: string | null;
  notes: string | null;
  createdByUserId: string | null;
  createdAt: string | Date;
}): TechnicianPayrollTermSummary {
  const calendar = normaliseWorkingCalendar({
    workingDaysPerWeek: input.workingDaysPerWeek,
    workingHoursPerDay: input.workingHoursPerDay,
  });
  const toDate = (value: string | Date) =>
    typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  const toIso = (value: string | Date) =>
    typeof value === 'string' ? value : value.toISOString();

  return {
    id: input.id,
    userId: input.userId,
    monthlySalaryCents: input.monthlySalaryCents,
    effectiveFrom: toDate(input.effectiveFrom),
    effectiveTo: input.effectiveTo ? toDate(input.effectiveTo) : null,
    workingDaysPerWeek: calendar.workingDaysPerWeek,
    workingHoursPerDay: calendar.workingHoursPerDay,
    overtimeDailyThresholdHours: input.overtimeDailyThresholdHours,
    overtimeMultiplierBps: input.overtimeMultiplierBps,
    derivedHourlyCostCents:
      deriveInternalHourlyCostCents(input.monthlySalaryCents, calendar) ?? 0,
    payrollReference: input.payrollReference,
    notes: input.notes,
    createdByUserId: input.createdByUserId,
    createdAt: toIso(input.createdAt),
  };
}
