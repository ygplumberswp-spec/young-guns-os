import { request, ApiClientError } from './api-client';
import type { EnterpriseSalesIntelligenceDashboard, UpdateSiPlatformConfigRequest } from '@titan/shared';

export { ApiClientError as EnterpriseSalesIntelligenceApiClientError };

export async function fetchSalesIntelligenceDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseSalesIntelligenceDashboard }>(
    '/enterprise-sales-intelligence/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function captureSalesAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-sales-intelligence/analytics/capture', {
    method: 'POST',
    accessToken,
  });
  return data.analytics;
}

export async function syncSalesAlerts(accessToken: string) {
  const data = await request<{ alerts: unknown[] }>('/enterprise-sales-intelligence/alerts/sync', {
    method: 'POST',
    accessToken,
  });
  return data.alerts;
}

export async function testCrmProvider(accessToken: string, providerId: string) {
  const data = await request<{ provider: unknown }>(
    `/enterprise-sales-intelligence/crm/providers/${providerId}/test`,
    { method: 'POST', accessToken },
  );
  return data.provider;
}

export async function updateSalesPlatformConfig(accessToken: string, body: UpdateSiPlatformConfigRequest) {
  const data = await request<{ platformConfig: unknown }>('/enterprise-sales-intelligence/platform-config', {
    method: 'PUT',
    accessToken,
    body,
  });
  return data.platformConfig;
}
