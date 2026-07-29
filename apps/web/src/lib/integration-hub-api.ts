import type {
  CreateIntegrationWebhookEndpointRequest,
  IntegrationHubDashboard,
  IntegrationSyncJobDetail,
  IntegrationSyncJobSummary,
  IntegrationWebhookEndpointDetail,
  IntegrationWebhookEndpointSummary,
  IntegrationWebhookEventSummary,
  UpdateIntegrationWebhookEndpointRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchIntegrationHubDashboard(
  accessToken: string,
): Promise<IntegrationHubDashboard> {
  const data = await request<{ dashboard: IntegrationHubDashboard }>('/integrations/hub/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function fetchIntegrationSyncJobs(
  accessToken: string,
): Promise<IntegrationSyncJobSummary[]> {
  const data = await request<{ syncJobs: IntegrationSyncJobSummary[] }>(
    '/integrations/hub/sync-jobs',
    { accessToken },
  );
  return data.syncJobs;
}

export async function fetchIntegrationSyncJob(
  accessToken: string,
  syncJobId: string,
): Promise<IntegrationSyncJobDetail> {
  const data = await request<{ syncJob: IntegrationSyncJobDetail }>(
    `/integrations/hub/sync-jobs/${syncJobId}`,
    { accessToken },
  );
  return data.syncJob;
}

export async function fetchIntegrationWebhookEndpoints(
  accessToken: string,
): Promise<IntegrationWebhookEndpointSummary[]> {
  const data = await request<{ endpoints: IntegrationWebhookEndpointSummary[] }>(
    '/integrations/hub/webhooks/endpoints',
    { accessToken },
  );
  return data.endpoints;
}

export async function createIntegrationWebhookEndpoint(
  accessToken: string,
  body: CreateIntegrationWebhookEndpointRequest,
): Promise<IntegrationWebhookEndpointDetail> {
  const data = await request<{ endpoint: IntegrationWebhookEndpointDetail }>(
    '/integrations/hub/webhooks/endpoints',
    {
      method: 'POST',
      accessToken,
      body,
    },
  );
  return data.endpoint;
}

export async function updateIntegrationWebhookEndpoint(
  accessToken: string,
  endpointId: string,
  body: UpdateIntegrationWebhookEndpointRequest,
): Promise<IntegrationWebhookEndpointSummary> {
  const data = await request<{ endpoint: IntegrationWebhookEndpointSummary }>(
    `/integrations/hub/webhooks/endpoints/${endpointId}`,
    {
      method: 'PATCH',
      accessToken,
      body,
    },
  );
  return data.endpoint;
}

export async function deleteIntegrationWebhookEndpoint(
  accessToken: string,
  endpointId: string,
): Promise<void> {
  await request(`/integrations/hub/webhooks/endpoints/${endpointId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function fetchIntegrationWebhookEvents(
  accessToken: string,
): Promise<IntegrationWebhookEventSummary[]> {
  const data = await request<{ events: IntegrationWebhookEventSummary[] }>(
    '/integrations/hub/webhooks/events',
    { accessToken },
  );
  return data.events;
}
