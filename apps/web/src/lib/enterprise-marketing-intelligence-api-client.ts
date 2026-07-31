import { request, ApiClientError } from './api-client';
import type {
  EnterpriseMarketingIntelligenceDashboard,
  UpdateMiPlatformConfigRequest,
} from '@titan/shared';

export { ApiClientError as EnterpriseMarketingIntelligenceApiClientError };

export async function fetchMarketingIntelligenceDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseMarketingIntelligenceDashboard }>(
    '/enterprise-marketing-intelligence/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function captureMarketingAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>(
    '/enterprise-marketing-intelligence/analytics/capture',
    {
      method: 'POST',
      accessToken,
    },
  );
  return data.analytics;
}

export async function syncMarketingAlerts(accessToken: string) {
  const data = await request<{ alerts: unknown[] }>(
    '/enterprise-marketing-intelligence/alerts/sync',
    {
      method: 'POST',
      accessToken,
    },
  );
  return data.alerts;
}

export async function testMarketingProvider(accessToken: string, providerId: string) {
  const data = await request<{ provider: unknown }>(
    `/enterprise-marketing-intelligence/providers/${providerId}/test`,
    { method: 'POST', accessToken },
  );
  return data.provider;
}

export async function updateMarketingPlatformConfig(
  accessToken: string,
  body: UpdateMiPlatformConfigRequest,
) {
  const data = await request<{ platformConfig: unknown }>(
    '/enterprise-marketing-intelligence/platform-config',
    {
      method: 'PUT',
      accessToken,
      body,
    },
  );
  return data.platformConfig;
}
