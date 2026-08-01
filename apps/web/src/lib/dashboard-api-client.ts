import type { ExecutiveDashboardSummary } from '@titan/shared';
import { request } from './api-client';

export async function fetchExecutiveDashboardSummary(
  accessToken: string,
): Promise<ExecutiveDashboardSummary> {
  return request<ExecutiveDashboardSummary>('/dashboard/executive-summary', { accessToken });
}
