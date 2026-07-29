import { request, ApiClientError } from './api-client';
import type {
  EnterpriseMobilePlatformDashboard,
  MobileDispatcherWorkspace,
  MobilePlatformConfigSummary,
  UpdateMobilePlatformConfigRequest,
} from '@titan/shared';

export { ApiClientError as EnterpriseMobileApiClientError };

export async function fetchMobilePlatformDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseMobilePlatformDashboard }>('/enterprise-mobile/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function fetchMobileDispatcherWorkspace(accessToken: string) {
  const data = await request<{ workspace: MobileDispatcherWorkspace }>('/enterprise-mobile/dispatcher', {
    accessToken,
  });
  return data.workspace;
}

export async function registerMobileDevice(
  accessToken: string,
  body: { deviceKey: string; deviceName?: string; platform?: string },
) {
  const data = await request<{ device: unknown }>('/enterprise-mobile/devices/register', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.device;
}

export async function processMobileSync(accessToken: string, deviceId?: string) {
  return request<{ history: unknown; result: unknown }>('/enterprise-mobile/sync/process', {
    method: 'POST',
    accessToken,
    body: deviceId ? { deviceId } : {},
  });
}

export async function captureMobileFieldIntelligence(accessToken: string) {
  const data = await request<{ snapshot: unknown }>('/enterprise-mobile/field-intelligence/capture', {
    method: 'POST',
    accessToken,
  });
  return data.snapshot;
}

export async function updateMobilePlatformConfig(accessToken: string, body: UpdateMobilePlatformConfigRequest) {
  const data = await request<{ config: MobilePlatformConfigSummary }>('/enterprise-mobile/config', {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.config;
}

export async function createMobileFleetProvider(
  accessToken: string,
  body: { providerType: string; name: string; endpointUrl?: string; isActive?: boolean },
) {
  const data = await request<{ provider: unknown }>('/enterprise-mobile/fleet-providers', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.provider;
}

export async function revokeMobileDevice(accessToken: string, deviceId: string) {
  const data = await request<{ device: unknown }>(`/enterprise-mobile/devices/${deviceId}/revoke`, {
    method: 'POST',
    accessToken,
  });
  return data.device;
}
