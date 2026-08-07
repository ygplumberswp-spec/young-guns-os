/**
 * Extended report period validation — fleet activity and compliance register date ranges.
 */

import { DEFAULT_COMPANY_LOCALE } from './localisation.js';
import type { ExtendedReportKind } from './extended-report.js';
import { inclusiveDayCount, localDayToUtcBounds } from './workforce-report-period.js';

export const EXTENDED_FLEET_MAX_PERIOD_DAYS = 93;
export const EXTENDED_REGISTER_MAX_PERIOD_DAYS = 366;

export type ExtendedReportPeriod = {
  periodStart: string;
  periodEnd: string;
  timezone: string;
  fromInstant: Date;
  toInstant: Date;
  reportKind: ExtendedReportKind;
};

export class ExtendedReportPeriodError extends Error {
  constructor(
    public readonly code: 'INVALID_DATE' | 'INVALID_RANGE' | 'PERIOD_TOO_LONG',
    message: string,
  ) {
    super(message);
    this.name = 'ExtendedReportPeriodError';
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseCalendarDate(value: string, label: string): void {
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) {
    throw new ExtendedReportPeriodError('INVALID_DATE', `${label} must be YYYY-MM-DD`);
  }
  const [y, m, d] = trimmed.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    throw new ExtendedReportPeriodError('INVALID_DATE', `${label} is not a valid calendar date`);
  }
}

export function resolveExtendedReportPeriod(input: {
  reportKind: ExtendedReportKind;
  periodStart: unknown;
  periodEnd: unknown;
  timezone?: string | null;
}): ExtendedReportPeriod {
  if (typeof input.periodStart !== 'string' || typeof input.periodEnd !== 'string') {
    throw new ExtendedReportPeriodError(
      'INVALID_DATE',
      'periodStart and periodEnd query parameters are required (YYYY-MM-DD)',
    );
  }

  const timezone = input.timezone?.trim() || DEFAULT_COMPANY_LOCALE.timezone;
  parseCalendarDate(input.periodStart, 'periodStart');
  parseCalendarDate(input.periodEnd, 'periodEnd');

  if (input.periodStart > input.periodEnd) {
    throw new ExtendedReportPeriodError(
      'INVALID_RANGE',
      'periodStart must be on or before periodEnd',
    );
  }

  const maxDays =
    input.reportKind === 'compliance_coc_register'
      ? EXTENDED_REGISTER_MAX_PERIOD_DAYS
      : EXTENDED_FLEET_MAX_PERIOD_DAYS;
  const days = inclusiveDayCount(input.periodStart, input.periodEnd);
  if (days > maxDays) {
    throw new ExtendedReportPeriodError(
      'PERIOD_TOO_LONG',
      `Reporting period may not exceed ${maxDays} days for ${input.reportKind}`,
    );
  }

  const fromBounds = localDayToUtcBounds(input.periodStart, timezone);
  const toBounds = localDayToUtcBounds(input.periodEnd, timezone);

  return {
    reportKind: input.reportKind,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    timezone,
    fromInstant: fromBounds.start,
    toInstant: toBounds.end,
  };
}

export function formatExtendedPeriodLabel(
  period: Pick<ExtendedReportPeriod, 'periodStart' | 'periodEnd' | 'timezone'>,
): string {
  return `${period.periodStart} to ${period.periodEnd} (${period.timezone})`;
}
