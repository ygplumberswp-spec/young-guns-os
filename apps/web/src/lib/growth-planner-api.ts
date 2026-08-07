import type { GrowthPlannerPlan } from '@titan/shared';
import { request } from './api-client';

export async function fetchGrowthPlannerPlan(
  accessToken: string,
  month?: string,
): Promise<GrowthPlannerPlan> {
  const qs = new URLSearchParams();
  if (month) qs.set('month', month);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request<GrowthPlannerPlan>(`/finance/growth-planner${suffix}`, {
    accessToken,
  });
}
