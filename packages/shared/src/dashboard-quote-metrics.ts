/**
 * DASH-001A — Dashboard quote metric definitions.
 * Awaiting customer approval and follow-ups due are independently calculated.
 */
import { sfiDaysBetween } from './sales-followup-intelligence.js';

/** Quotes issued to the customer and awaiting accept/decline. */
export const DASHBOARD_QUOTE_AWAITING_CUSTOMER_STATUSES = ['sent', 'viewed'] as const;

export type DashboardQuoteAwaitingCustomerStatus =
  (typeof DASHBOARD_QUOTE_AWAITING_CUSTOMER_STATUSES)[number];

export type DashboardQuoteMetricRow = {
  status: string;
  issuedAt: string | null;
  validUntil: string | null;
  scheduledFollowUpAt?: string | null;
  responseStatus?: string | null;
};

export type DashboardQuoteMetricOptions = {
  now?: Date;
  staleQuoteDays?: number;
};

const DEFAULT_STALE_QUOTE_DAYS = 7;

const TERMINAL_QUOTE_STATUSES = new Set([
  'accepted',
  'declined',
  'expired',
  'converted',
  'cancelled',
  'superseded',
]);

function isActiveCustomerQuote(row: DashboardQuoteMetricRow, now: Date): boolean {
  if (TERMINAL_QUOTE_STATUSES.has(row.status)) return false;
  if (!DASHBOARD_QUOTE_AWAITING_CUSTOMER_STATUSES.includes(row.status as DashboardQuoteAwaitingCustomerStatus)) {
    return false;
  }
  if (!row.issuedAt) return false;
  if (row.status === 'expired') return false;
  if (row.validUntil) {
    const expiry = new Date(row.validUntil);
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() < now.getTime()) return false;
  }
  return true;
}

/** Active quote genuinely waiting for customer acceptance or rejection. */
export function isQuoteAwaitingCustomerApproval(
  row: DashboardQuoteMetricRow,
  options: DashboardQuoteMetricOptions = {},
): boolean {
  const now = options.now ?? new Date();
  return isActiveCustomerQuote(row, now);
}

/**
 * Follow-up is due when a scheduled date has passed, or the stale-quote rule
 * applies and the customer has not responded.
 */
export function isQuoteFollowUpDue(
  row: DashboardQuoteMetricRow,
  options: DashboardQuoteMetricOptions = {},
): boolean {
  const now = options.now ?? new Date();
  if (!isActiveCustomerQuote(row, now)) return false;

  if (row.scheduledFollowUpAt) {
    const scheduled = new Date(row.scheduledFollowUpAt);
    if (!Number.isNaN(scheduled.getTime()) && scheduled.getTime() <= now.getTime()) {
      return true;
    }
  }

  const staleDays = options.staleQuoteDays ?? DEFAULT_STALE_QUOTE_DAYS;
  const daysSinceIssued = sfiDaysBetween(row.issuedAt, now);
  if (daysSinceIssued === null || daysSinceIssued < staleDays) return false;
  if (row.responseStatus === 'responded') return false;
  return true;
}

export function countQuotesAwaitingCustomerApproval(
  rows: readonly DashboardQuoteMetricRow[],
  options: DashboardQuoteMetricOptions = {},
): number {
  return rows.filter((row) => isQuoteAwaitingCustomerApproval(row, options)).length;
}

export function countQuotesFollowUpDue(
  rows: readonly DashboardQuoteMetricRow[],
  options: DashboardQuoteMetricOptions = {},
): number {
  return rows.filter((row) => isQuoteFollowUpDue(row, options)).length;
}
