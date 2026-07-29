import { request, ApiClientError } from './api-client';
import type {
  EnterpriseUnifiedCommunicationsDashboard,
  UcPlatformConfigSummary,
  UpdateUcPlatformConfigRequest,
} from '@titan/shared';

export { ApiClientError as EnterpriseCommunicationsApiClientError };

export async function fetchUnifiedCommunicationsDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseUnifiedCommunicationsDashboard }>(
    '/enterprise-communications/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function syncCommunicationTimeline(accessToken: string) {
  const data = await request<{ timeline: unknown[] }>('/enterprise-communications/timeline/sync', {
    method: 'POST',
    accessToken,
  });
  return data.timeline;
}

export async function captureCommunicationsAnalytics(accessToken: string) {
  const data = await request<{ snapshot: unknown }>('/enterprise-communications/analytics/capture', {
    method: 'POST',
    accessToken,
  });
  return data.snapshot;
}

export async function createCommunicationProvider(
  accessToken: string,
  body: { channel: string; providerKey: string; name: string; endpointUrl?: string },
) {
  const data = await request<{ provider: unknown }>('/enterprise-communications/providers', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.provider;
}

export async function createOutboundCallCampaign(
  accessToken: string,
  body: { campaignType: string; subject: string; scriptTemplate?: string },
) {
  const data = await request<{ campaign: unknown }>('/enterprise-communications/outbound-campaigns', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.campaign;
}

export async function updateCommunicationsPlatformConfig(accessToken: string, body: UpdateUcPlatformConfigRequest) {
  const data = await request<{ config: UcPlatformConfigSummary }>('/enterprise-communications/config', {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.config;
}

export async function fetchCustomerCommunicationCenter(accessToken: string, customerId: string) {
  const data = await request<{ center: unknown }>(`/enterprise-communications/customers/${customerId}/center`, {
    accessToken,
  });
  return data.center;
}
