import type {
  OwnerFinancialCommandDashboard,
  OwnerFinancialCommandPeriod,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchOwnerFinancialCommandDashboard(
  accessToken: string,
  period: OwnerFinancialCommandPeriod = 'month',
): Promise<OwnerFinancialCommandDashboard> {
  const qs = new URLSearchParams({ period });
  return request<OwnerFinancialCommandDashboard>(
    `/finance/owner-command?${qs.toString()}`,
    { accessToken },
  );
}
