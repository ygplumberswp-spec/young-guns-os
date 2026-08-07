import type {
  OperatingProfitDashboard,
  OperatingProfitPeriod,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchOperatingProfitDashboard(
  accessToken: string,
  period: OperatingProfitPeriod = 'month',
  custom?: { fromDate: string; toDate: string },
): Promise<OperatingProfitDashboard> {
  const qs = new URLSearchParams({ period });
  if (period === 'custom' && custom?.fromDate && custom?.toDate) {
    qs.set('fromDate', custom.fromDate);
    qs.set('toDate', custom.toDate);
  }
  return request<OperatingProfitDashboard>(
    `/finance/operating-profit/summary?${qs.toString()}`,
    { accessToken },
  );
}
