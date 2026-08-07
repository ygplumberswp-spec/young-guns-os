/**
 * Finance report period validation — server authority for date ranges.
 */

import { DEFAULT_COMPANY_LOCALE } from './localisation.js';
import type { FinanceReportKind } from './finance-report.js';

export const FINANCE_REPORT_MAX_DAYS: Record<FinanceReportKind, number> = {
  finance_aggregate: 366,
  cashflow_collections: 366,
  accounts_receivable: 366,
  customer_property_history: 365 * 5,
};

export type FinanceReportPeriod = {
  periodStart: string;
  periodEnd: string;
  timezone: string;
  fromInstant: Date;
  toInstant: Date;
  reportKind: FinanceReportKind;
};

export class FinanceReportPeriodError extends Error {
  constructor(
    public readonly code: 'INVALID_DATE' | 'INVALID_RANGE' | 'PERIOD_TOO_LONG',
    message: string,
  ) {
    super(message);
    this.name = 'FinanceReportPeriodError';
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseCalendarDate(value: string, label: string): void {
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) {
    throw new FinanceReportPeriodError('INVALID_DATE', `${label} must be YYYY-MM-DD`);
  }
  const [y, m, d] = trimmed.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    throw new FinanceReportPeriodError('INVALID_DATE', `${label} is not a valid calendar date`);
  }
}

function inclusiveDayCount(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00.000Z`);
  const b = Date.parse(`${end}T00:00:00.000Z`);
  return Math.floor((b - a) / 86_400_000) + 1;
}

function localDayBounds(dateYmd: string, timezone: string): { start: Date; end: Date } {
  const [y, m, d] = dateYmd.split('-').map(Number);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  function utcForLocal(hour: number, minute: number, second: number): Date {
    const guess = new Date(Date.UTC(y, m - 1, d, hour, minute, second));
    const parts = formatter.formatToParts(guess);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value ?? '0');
    const offsetMs =
      guess.getTime() -
      Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return new Date(guess.getTime() - offsetMs);
  }

  return { start: utcForLocal(0, 0, 0), end: utcForLocal(23, 59, 59) };
}

export function resolveFinanceReportPeriod(input: {
  reportKind: FinanceReportKind;
  periodStart: unknown;
  periodEnd: unknown;
  timezone?: string | null;
}): FinanceReportPeriod {
  if (typeof input.periodStart !== 'string' || typeof input.periodEnd !== 'string') {
    throw new FinanceReportPeriodError(
      'INVALID_DATE',
      'periodStart and periodEnd query parameters are required (YYYY-MM-DD)',
    );
  }

  const timezone = input.timezone?.trim() || DEFAULT_COMPANY_LOCALE.timezone;
  parseCalendarDate(input.periodStart, 'periodStart');
  parseCalendarDate(input.periodEnd, 'periodEnd');

  if (input.periodStart > input.periodEnd) {
    throw new FinanceReportPeriodError(
      'INVALID_RANGE',
      'periodStart must be on or before periodEnd',
    );
  }

  const maxDays = FINANCE_REPORT_MAX_DAYS[input.reportKind];
  const days = inclusiveDayCount(input.periodStart, input.periodEnd);
  if (days > maxDays) {
    throw new FinanceReportPeriodError(
      'PERIOD_TOO_LONG',
      `Reporting period may not exceed ${maxDays} days for ${input.reportKind}`,
    );
  }

  const fromBounds = localDayBounds(input.periodStart, timezone);
  const toBounds = localDayBounds(input.periodEnd, timezone);

  return {
    reportKind: input.reportKind,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    timezone,
    fromInstant: fromBounds.start,
    toInstant: toBounds.end,
  };
}

export function resolveAccountsReceivableSnapshotDate(input: {
  snapshotDate?: unknown;
  timezone?: string | null;
}): { snapshotDate: string; timezone: string; asOf: Date } {
  const timezone = input.timezone?.trim() || DEFAULT_COMPANY_LOCALE.timezone;
  const snapshotDate =
    typeof input.snapshotDate === 'string' && input.snapshotDate.trim()
      ? input.snapshotDate.trim()
      : new Date().toISOString().slice(0, 10);
  parseCalendarDate(snapshotDate, 'snapshotDate');
  const bounds = localDayBounds(snapshotDate, timezone);
  return { snapshotDate, timezone, asOf: bounds.end };
}
