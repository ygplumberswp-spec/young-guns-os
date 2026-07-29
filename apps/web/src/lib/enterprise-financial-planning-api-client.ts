import { request, ApiClientError } from './api-client';
import type { EnterpriseFinancialPlanningDashboard, UpdateFpPlatformConfigRequest } from '@titan/shared';

export { ApiClientError as EnterpriseFinancialPlanningApiClientError };

export async function fetchFinancialPlanningDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseFinancialPlanningDashboard }>(
    '/enterprise-financial-planning/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function captureFinancialAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-financial-planning/analytics/capture', {
    method: 'POST',
    accessToken,
  });
  return data.analytics;
}

export async function syncFinancialAlerts(accessToken: string) {
  const data = await request<{ alerts: unknown[] }>('/enterprise-financial-planning/alerts/sync', {
    method: 'POST',
    accessToken,
  });
  return data.alerts;
}

export async function approveBudget(accessToken: string, budgetId: string) {
  const data = await request<{ budget: unknown }>(
    `/enterprise-financial-planning/budgets/${budgetId}/approve`,
    { method: 'POST', accessToken },
  );
  return data.budget;
}

export async function activateBudget(accessToken: string, budgetId: string) {
  const data = await request<{ budget: unknown }>(
    `/enterprise-financial-planning/budgets/${budgetId}/activate`,
    { method: 'POST', accessToken },
  );
  return data.budget;
}

export async function generateCashFlowProjection(accessToken: string) {
  const data = await request<{ projection: unknown }>('/enterprise-financial-planning/cash-flow/projections', {
    method: 'POST',
    accessToken,
  });
  return data.projection;
}

export async function testAccountingProvider(accessToken: string, providerId: string) {
  const data = await request<{ provider: unknown }>(
    `/enterprise-financial-planning/accounting/providers/${providerId}/test`,
    { method: 'POST', accessToken },
  );
  return data.provider;
}

export async function updateFinancialPlatformConfig(accessToken: string, body: UpdateFpPlatformConfigRequest) {
  const data = await request<{ platformConfig: unknown }>('/enterprise-financial-planning/platform-config', {
    method: 'PUT',
    accessToken,
    body,
  });
  return data.platformConfig;
}
