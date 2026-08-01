import type { IntegrationProviderAutoSyncStatus } from '@titan/shared';
import { request } from './api-client';

export async function fetchIntegrationAutoSyncStatuses(
  accessToken: string,
  options?: { signal?: AbortSignal },
) {
  const data = await request<{ statuses: IntegrationProviderAutoSyncStatus[] }>(
    '/integration-platform/auto-sync',
    { accessToken, signal: options?.signal },
  );
  return data.statuses;
}

export async function fetchIntegrationAutoSyncStatus(
  accessToken: string,
  providerKey: string,
) {
  const data = await request<{ status: IntegrationProviderAutoSyncStatus }>(
    `/integration-platform/auto-sync/${providerKey}`,
    { accessToken },
  );
  return data.status;
}

export async function runIntegrationAutoSyncRecovery(
  accessToken: string,
  providerKey: string,
) {
  const data = await request<{ result: unknown }>(
    `/integration-platform/auto-sync/${providerKey}/run`,
    {
      accessToken,
      method: 'POST',
      timeoutMs: 190_000,
    },
  );
  return data.result;
}
