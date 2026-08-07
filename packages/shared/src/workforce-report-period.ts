/**
 * Workforce report period validation — server authority for date ranges.
 * Uses tenant timezone (default Africa/Johannesburg) for calendar boundaries.
 */

import { DEFAULT_COMPANY_LOCALE } from './localisation.js';

/** Maximum inclusive reporting period length (days). */
export const MAX_WORKFORCE_REPORT_PERIOD_DAYS = 93;

export type WorkforceReportPeriod = {
  periodStart: string;
  periodEnd: string;
  timezone: string;
  /** UTC instants for database queries */
  fromInstant: Date;
  toInstant: Date;
};

export class WorkforceReportPeriodError extends Error {
  constructor(
    public readonly code: 'INVALID_DATE' | 'INVALID_RANGE' | 'PERIOD_TOO_LONG',
    message: string,
  ) {
    super(message);
    this.name = 'WorkforceReportPeriodError';
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseCalendarDate(value: string, label: string): { y: number; m: number; d: number } {
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) {
    throw new WorkforceReportPeriodError('INVALID_DATE', `${label} must be YYYY-MM-DD`);
  }
  const [y, m, d] = trimmed.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    throw new WorkforceReportPeriodError('INVALID_DATE', `${label} is not a valid calendar date`);
  }
  return { y, m, d };
}

/** Inclusive day count between two YYYY-MM-DD strings. */
export function inclusiveDayCount(periodStart: string, periodEnd: string): number {
  const start = Date.parse(`${periodStart}T00:00:00.000Z`);
  const end = Date.parse(`${periodEnd}T00:00:00.000Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

/**
 * Resolve tenant-local calendar day to UTC query bounds.
 * Start: local midnight; End: local end-of-day (inclusive).
 */
export function localDayToUtcBounds(
  dateYmd: string,
  timezone: string,
): { start: Date; end: Date } {
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

  const { y, m, d } = parseCalendarDate(dateYmd, 'date');

  function utcForLocal(hour: number, minute: number, second: number): Date {
    const guess = new Date(Date.UTC(y, m - 1, d, hour, minute, second));
    const parts = formatter.formatToParts(guess);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value ?? '0');
    const localY = get('year');
    const localM = get('month');
    const localD = get('day');
    const localH = get('hour');
    const offsetMs =
      guess.getTime() -
      Date.UTC(localY, localM - 1, localD, localH, get('minute'), get('second'));
    return new Date(guess.getTime() - offsetMs);
  }

  const start = utcForLocal(0, 0, 0);
  const end = utcForLocal(23, 59, 59);
  return { start, end };
}

export function resolveWorkforceReportPeriod(input: {
  periodStart: unknown;
  periodEnd: unknown;
  timezone?: string | null;
}): WorkforceReportPeriod {
  if (typeof input.periodStart !== 'string' || typeof input.periodEnd !== 'string') {
    throw new WorkforceReportPeriodError(
      'INVALID_DATE',
      'periodStart and periodEnd query parameters are required (YYYY-MM-DD)',
    );
  }

  const timezone = input.timezone?.trim() || DEFAULT_COMPANY_LOCALE.timezone;
  parseCalendarDate(input.periodStart, 'periodStart');
  parseCalendarDate(input.periodEnd, 'periodEnd');

  if (input.periodStart > input.periodEnd) {
    throw new WorkforceReportPeriodError(
      'INVALID_RANGE',
      'periodStart must be on or before periodEnd',
    );
  }

  const days = inclusiveDayCount(input.periodStart, input.periodEnd);
  if (days > MAX_WORKFORCE_REPORT_PERIOD_DAYS) {
    throw new WorkforceReportPeriodError(
      'PERIOD_TOO_LONG',
      `Reporting period may not exceed ${MAX_WORKFORCE_REPORT_PERIOD_DAYS} days`,
    );
  }

  const fromBounds = localDayToUtcBounds(input.periodStart, timezone);
  const toBounds = localDayToUtcBounds(input.periodEnd, timezone);

  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    timezone,
    fromInstant: fromBounds.start,
    toInstant: toBounds.end,
  };
}

export function formatWorkforcePeriodLabel(period: Pick<WorkforceReportPeriod, 'periodStart' | 'periodEnd' | 'timezone'>): string {
  return `${period.periodStart} to ${period.periodEnd} (${period.timezone})`;
}
