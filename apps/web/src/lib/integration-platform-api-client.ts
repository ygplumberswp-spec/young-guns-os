import type {
  CreateIntegrationPlatformActionRequest,
  IntegrationConnectorSummary,
  IntegrationDeveloperDiagnosticSummary,
  IntegrationGatewayTraceSummary,
  IntegrationMonitoringSummary,
  IntegrationPlatformActionSummary,
  IntegrationPlatformExecutiveDashboard,
  IntegrationSyncConflictSummary,
  IntegrationSyncScheduleSummary,
  RunIntegrationDiagnosticRequest,
  UpdateIntegrationSyncScheduleRequest,
  XeroImportSyncResult,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as IntegrationPlatformApiClientError };

export async function fetchIntegrationPlatformDashboard(
  accessToken: string,
  options?: {
    includeVault?: boolean;
    refreshConnectors?: boolean;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
) {
  const params = new URLSearchParams();
  if (options?.includeVault) {
    params.set('includeVault', 'true');
  }
  if (options?.refreshConnectors) {
    params.set('refreshConnectors', 'true');
  }
  const query = params.toString();
  const path = query
    ? `/integration-platform/dashboard?${query}`
    : '/integration-platform/dashboard';
  const data = await request<{ dashboard: IntegrationPlatformExecutiveDashboard }>(path, {
    accessToken,
    signal: options?.signal,
    timeoutMs: options?.timeoutMs ?? 20_000,
  });
  return data.dashboard;
}

export async function fetchIntegrationVault(accessToken: string) {
  const data = await request<{
    vaultEntries: IntegrationPlatformExecutiveDashboard['vaultEntries'];
  }>('/integration-platform/vault', { accessToken });
  return data.vaultEntries;
}

export async function fetchIntegrationConnectors(accessToken: string) {
  const data = await request<{ connectors: IntegrationConnectorSummary[] }>(
    '/integration-platform/connectors',
    {
      accessToken,
    },
  );
  return data.connectors;
}

export async function syncIntegrationConnectors(accessToken: string) {
  const data = await request<{
    connectors: IntegrationConnectorSummary[];
    xeroSync: XeroImportSyncResult | null;
  }>('/integration-platform/connectors/sync', {
    accessToken,
    method: 'POST',
    // Align with server overall import budget (90s) plus small network buffer.
    timeoutMs: 100_000,
  });
  return data;
}

export async function fetchIntegrationMonitoring(accessToken: string) {
  const data = await request<{ monitoring: IntegrationMonitoringSummary }>(
    '/integration-platform/monitoring',
    {
      accessToken,
    },
  );
  return data.monitoring;
}

export async function fetchIntegrationTraces(accessToken: string) {
  const data = await request<{ traces: IntegrationGatewayTraceSummary[] }>(
    '/integration-platform/traces',
    {
      accessToken,
    },
  );
  return data.traces;
}

export async function fetchIntegrationSchedules(accessToken: string) {
  const data = await request<{ schedules: IntegrationSyncScheduleSummary[] }>(
    '/integration-platform/schedules',
    {
      accessToken,
    },
  );
  return data.schedules;
}

export async function updateIntegrationSchedule(
  accessToken: string,
  connectorId: string,
  body: UpdateIntegrationSyncScheduleRequest,
) {
  const data = await request<{ schedule: IntegrationSyncScheduleSummary }>(
    `/integration-platform/connectors/${connectorId}/schedule`,
    { accessToken, method: 'PUT', body },
  );
  return data.schedule;
}

export async function fetchIntegrationConflicts(accessToken: string) {
  const data = await request<{ conflicts: IntegrationSyncConflictSummary[] }>(
    '/integration-platform/conflicts',
    {
      accessToken,
    },
  );
  return data.conflicts;
}

export async function fetchIntegrationPlatformActions(accessToken: string) {
  const data = await request<{ actions: IntegrationPlatformActionSummary[] }>(
    '/integration-platform/actions',
    {
      accessToken,
    },
  );
  return data.actions;
}

export async function createIntegrationPlatformAction(
  accessToken: string,
  body: CreateIntegrationPlatformActionRequest,
) {
  const data = await request<{ action: IntegrationPlatformActionSummary }>(
    '/integration-platform/actions',
    {
      accessToken,
      method: 'POST',
      body,
    },
  );
  return data.action;
}

export async function runIntegrationDiagnostic(
  accessToken: string,
  body: RunIntegrationDiagnosticRequest,
) {
  const data = await request<{ diagnostic: IntegrationDeveloperDiagnosticSummary }>(
    '/integration-platform/diagnostics/run',
    { accessToken, method: 'POST', body },
  );
  return data.diagnostic;
}

export async function retryConnectorSync(accessToken: string, connectorId: string) {
  return request<{ syncJobId: string | null }>(
    `/integration-platform/connectors/${connectorId}/retry-sync`,
    {
      accessToken,
      method: 'POST',
    },
  );
}
