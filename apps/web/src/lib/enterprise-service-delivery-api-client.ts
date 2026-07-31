import { request, ApiClientError } from './api-client';
import type {
  EnterpriseServiceDeliveryDashboard,
  UpdateSdPlatformConfigRequest,
} from '@titan/shared';

export { ApiClientError as EnterpriseServiceDeliveryApiClientError };

export async function fetchServiceDeliveryDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseServiceDeliveryDashboard }>(
    '/enterprise-service-delivery/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function captureServiceAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>(
    '/enterprise-service-delivery/analytics/capture',
    {
      method: 'POST',
      accessToken,
    },
  );
  return data.analytics;
}

export async function syncServiceAlerts(accessToken: string) {
  const data = await request<{ alerts: unknown[] }>('/enterprise-service-delivery/alerts/sync', {
    method: 'POST',
    accessToken,
  });
  return data.alerts;
}

export async function updateServicePlatformConfig(
  accessToken: string,
  body: UpdateSdPlatformConfigRequest,
) {
  const data = await request<{ platformConfig: unknown }>(
    '/enterprise-service-delivery/platform-config',
    {
      method: 'PUT',
      accessToken,
      body,
    },
  );
  return data.platformConfig;
}
