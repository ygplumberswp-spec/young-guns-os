/**
 * Shared timesheet row aggregation for workforce PDF exports.
 * Uses recorded wi_timesheets and mobile_time_entries — never invents wages.
 */

import { parseHours } from './payroll-timesheet-intelligence.js';
import type { TimesheetDailyRow } from './workforce-report.js';

export type RawTimesheetRecord = {
  periodStart: string;
  periodEnd: string;
  status: string;
  standardHours: string | number;
  overtimeHours: string | number;
  travelHours: string | number;
  breakHours?: string | number | null;
  clockInAt: string | Date | null;
  clockOutAt: string | Date | null;
  jobNumber: string | null;
};

export type RawMobileTimeEntry = {
  entryType: string;
  startedAt: string | Date;
  endedAt: string | Date | null;
  durationMinutes: number | null;
  jobNumber: string | null;
};

export type OvertimePolicySnapshot = {
  configured: boolean;
  standardWeeklyHours: number | null;
  overtimeDailyThresholdHours: number | null;
  note: string;
};

export function defaultOvertimePolicyNote(policy: OvertimePolicySnapshot): string {
  if (!policy.configured) {
    return 'Overtime classification unavailable — overtime rules are not configured. Recorded hours only.';
  }
  return `Overtime uses configured tenant rules (daily threshold ${policy.overtimeDailyThresholdHours ?? '—'} h). No wage values are calculated.`;
}

function toIsoDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
}

function toTimeLabel(value: string | Date | null): string | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(11, 16);
}

function dayOfWeek(dateYmd: string): number {
  return new Date(`${dateYmd}T12:00:00.000Z`).getUTCDay();
}

export function buildTimesheetDailyRows(input: {
  periodStart: string;
  periodEnd: string;
  timesheets: RawTimesheetRecord[];
  mobileEntries: RawMobileTimeEntry[];
  policy: OvertimePolicySnapshot;
}): TimesheetDailyRow[] {
  const rowsByDate = new Map<string, TimesheetDailyRow>();
  const { policy } = input;

  for (const ts of input.timesheets) {
    const date = ts.periodStart;
    const existing = rowsByDate.get(date) ?? emptyDailyRow(date);
    const flags = [...existing.flags];

    const clockIn = toTimeLabel(ts.clockInAt) ?? existing.clockIn;
    const clockOut = toTimeLabel(ts.clockOutAt) ?? existing.clockOut;

    const standard = parseHours(ts.standardHours);
    const overtime = parseHours(ts.overtimeHours);
    const travel = parseHours(ts.travelHours);
    const breakH = ts.breakHours != null ? parseHours(ts.breakHours) : 0;
    const workingMinutes = Math.round((standard + overtime + travel) * 60);

    if (ts.clockInAt && !ts.clockOutAt) flags.push('Missing clock-out');
    if (workingMinutes < 0) flags.push('Negative duration flagged');

    const dow = dayOfWeek(date);
    let saturdayHours = existing.saturdayHours;
    let sundayHolidayHours = existing.sundayHolidayHours;
    if (dow === 6) saturdayHours = (saturdayHours ?? 0) + standard + overtime;
    if (dow === 0) sundayHolidayHours = (sundayHolidayHours ?? 0) + standard + overtime;

    rowsByDate.set(date, {
      date,
      clockIn,
      clockOut,
      breakMinutes: breakH > 0 ? Math.round(breakH * 60) : existing.breakMinutes,
      workingMinutes: (existing.workingMinutes ?? 0) + workingMinutes,
      regularHours: policy.configured
        ? (existing.regularHours ?? 0) + standard
        : null,
      overtimeHours: policy.configured
        ? (existing.overtimeHours ?? 0) + overtime
        : null,
      saturdayHours,
      sundayHolidayHours,
      status: ts.status,
      jobReference: ts.jobNumber ?? existing.jobReference,
      flags: [...new Set(flags)],
    });
  }

  for (const entry of input.mobileEntries) {
    const date = toIsoDate(entry.startedAt);
    if (date < input.periodStart || date > input.periodEnd) continue;
    const existing = rowsByDate.get(date) ?? emptyDailyRow(date);
    const flags = [...existing.flags];

    if (entry.entryType === 'break' && entry.durationMinutes != null) {
      existing.breakMinutes = (existing.breakMinutes ?? 0) + entry.durationMinutes;
    } else if (entry.entryType === 'clock_in') {
      existing.clockIn = existing.clockIn ?? toTimeLabel(entry.startedAt);
    } else if (entry.entryType === 'clock_out') {
      existing.clockOut = existing.clockOut ?? toTimeLabel(entry.endedAt ?? entry.startedAt);
    } else if (entry.entryType === 'job_time' && entry.durationMinutes != null) {
      existing.workingMinutes = (existing.workingMinutes ?? 0) + entry.durationMinutes;
      if (entry.jobNumber) existing.jobReference = entry.jobNumber;
    }

    if (entry.startedAt && !entry.endedAt && entry.entryType !== 'clock_in') {
      flags.push('Open mobile entry');
    }

    existing.flags = [...new Set(flags)];
    rowsByDate.set(date, existing);
  }

  const allDates: string[] = [];
  let cursor = input.periodStart;
  while (cursor <= input.periodEnd) {
    allDates.push(cursor);
    const next = new Date(`${cursor}T12:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }

  return allDates.map((date) => rowsByDate.get(date) ?? emptyDailyRow(date));
}

function emptyDailyRow(date: string): TimesheetDailyRow {
  return {
    date,
    clockIn: null,
    clockOut: null,
    breakMinutes: null,
    workingMinutes: null,
    regularHours: null,
    overtimeHours: null,
    saturdayHours: null,
    sundayHolidayHours: null,
    status: null,
    jobReference: null,
    flags: [],
  };
}

export function summarizeTimesheetRows(rows: TimesheetDailyRow[]): {
  workingHours: number | null;
  regularHours: number | null;
  overtimeHours: number | null;
  breakHours: number | null;
  missingEntries: number;
  incompleteEntries: number;
} {
  let workingMinutes = 0;
  let regular = 0;
  let overtime = 0;
  let breakMin = 0;
  let hasWorking = false;
  let hasRegular = false;
  let hasOvertime = false;
  let hasBreak = false;
  let missing = 0;
  let incomplete = 0;

  for (const row of rows) {
    const hasAny =
      row.clockIn ||
      row.clockOut ||
      row.workingMinutes != null ||
      row.regularHours != null ||
      row.overtimeHours != null;
    if (!hasAny) missing += 1;
    if (row.flags.some((f) => f.includes('Missing') || f.includes('Open'))) incomplete += 1;

    if (row.workingMinutes != null) {
      workingMinutes += row.workingMinutes;
      hasWorking = true;
    }
    if (row.regularHours != null) {
      regular += row.regularHours;
      hasRegular = true;
    }
    if (row.overtimeHours != null) {
      overtime += row.overtimeHours;
      hasOvertime = true;
    }
    if (row.breakMinutes != null) {
      breakMin += row.breakMinutes;
      hasBreak = true;
    }
  }

  return {
    workingHours: hasWorking ? Math.round((workingMinutes / 60) * 100) / 100 : null,
    regularHours: hasRegular ? Math.round(regular * 100) / 100 : null,
    overtimeHours: hasOvertime ? Math.round(overtime * 100) / 100 : null,
    breakHours: hasBreak ? Math.round((breakMin / 60) * 100) / 100 : null,
    missingEntries: missing,
    incompleteEntries: incomplete,
  };
}
