import type { BudgetControlDashboard, BudgetControlPlan } from '@titan/shared';
import { request } from './api-client';

export async function fetchBudgetControlDashboard(
  accessToken: string,
  month?: string,
): Promise<BudgetControlDashboard> {
  const qs = new URLSearchParams();
  if (month) qs.set('month', month);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request<BudgetControlDashboard>(`/finance/budget-control${suffix}`, {
    accessToken,
  });
}

export type UpsertBudgetPlanBody = {
  revenueTargetCents?: number | null;
  grossMarginTargetPct?: number | null;
  grossProfitTargetCents?: number | null;
  overheadBudgetCents?: number | null;
  operatingProfitTargetCents?: number | null;
  cashCollectionTargetCents?: number | null;
  notes?: string | null;
  overheadLines?: Array<{ category: string; budgetCents: number }>;
};

export async function upsertBudgetControlPlan(
  accessToken: string,
  month: string,
  body: UpsertBudgetPlanBody,
): Promise<BudgetControlPlan> {
  return request<BudgetControlPlan>(`/finance/budget-control/${month}`, {
    accessToken,
    method: 'PUT',
    body,
  });
}
