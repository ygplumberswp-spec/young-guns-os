import type {
  ProfitAnalyticsDashboard,
  ProfitAnalyticsPeriod,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchProfitAnalyticsDashboard(
  accessToken: string,
  period: ProfitAnalyticsPeriod = 'month',
  custom?: { fromDate: string; toDate: string },
): Promise<ProfitAnalyticsDashboard> {
  const qs = new URLSearchParams({ period });
  if (period === 'custom' && custom?.fromDate && custom?.toDate) {
    qs.set('fromDate', custom.fromDate);
    qs.set('toDate', custom.toDate);
  }
  return request<ProfitAnalyticsDashboard>(
    `/finance/profit-analytics/overview?${qs.toString()}`,
    { accessToken },
  );
}
