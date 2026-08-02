import type { AnalyticsDashboardQuery, AnalyticsPeriod } from '@titan/shared';
import { AnalyticsError } from './analytics.service.js';

export type ResolvedRange = {
  period: AnalyticsPeriod;
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
};

export function resolveRange(query: AnalyticsDashboardQuery): ResolvedRange {
  const period = query.period ?? 'monthly';
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : defaultFrom(period, to);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new AnalyticsError('VALIDATION_ERROR', 'Invalid date range');
  }

  const durationMs = to.getTime() - from.getTime();
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - durationMs);

  return { period, from, to, previousFrom, previousTo };
}

function defaultFrom(period: AnalyticsPeriod, to: Date): Date {
  const from = new Date(to);
  if (period === 'daily') from.setDate(from.getDate() - 1);
  else if (period === 'weekly') from.setDate(from.getDate() - 7);
  else from.setMonth(from.getMonth() - 1);
  from.setHours(0, 0, 0, 0);
  return from;
}
