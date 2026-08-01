import type {
  CartrackConnectionSummary,
  CartrackSyncResult,
  EmailConnectionSummary,
  EmailSyncResult,
  IntegrationVehicleMappingSummary,
  SaveCartrackConnectionRequest,
  SaveEmailConnectionRequest,
  SaveYocoConnectionRequest,
  StartXeroOAuthRequest,
  StartXeroOAuthResponse,
  UpdateIntegrationVehicleMappingRequest,
  XeroConnectionSummary,
  XeroConnectionTestResult,
  XeroSyncResult,
  XeroEntitySyncResult,
  XeroSyncLogSummary,
  XeroSyncStatusResponse,
  YocoConnectionSummary,
  YocoSyncResult,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchCartrackConnection(
  accessToken: string,
): Promise<CartrackConnectionSummary> {
  const data = await request<{ connection: CartrackConnectionSummary }>('/integrations/cartrack', {
    accessToken,
  });
  return data.connection;
}

export async function saveCartrackConnection(
  accessToken: string,
  body: SaveCartrackConnectionRequest,
): Promise<CartrackConnectionSummary> {
  const data = await request<{ connection: CartrackConnectionSummary }>('/integrations/cartrack', {
    method: 'PUT',
    accessToken,
    body,
  });
  return data.connection;
}

export async function disconnectCartrack(accessToken: string): Promise<CartrackConnectionSummary> {
  const data = await request<{ connection: CartrackConnectionSummary }>('/integrations/cartrack', {
    method: 'DELETE',
    accessToken,
  });
  return data.connection;
}

export async function fetchCartrackMappings(
  accessToken: string,
): Promise<IntegrationVehicleMappingSummary[]> {
  const data = await request<{ mappings: IntegrationVehicleMappingSummary[] }>(
    '/integrations/cartrack/mappings',
    { accessToken },
  );
  return data.mappings;
}

export async function updateCartrackMapping(
  accessToken: string,
  mappingId: string,
  body: UpdateIntegrationVehicleMappingRequest,
): Promise<IntegrationVehicleMappingSummary> {
  const data = await request<{ mapping: IntegrationVehicleMappingSummary }>(
    `/integrations/cartrack/mappings/${mappingId}`,
    {
      method: 'PATCH',
      accessToken,
      body,
    },
  );
  return data.mapping;
}

export async function syncCartrack(accessToken: string): Promise<CartrackSyncResult> {
  const data = await request<{ result: CartrackSyncResult }>('/integrations/cartrack/sync', {
    method: 'POST',
    accessToken,
  });
  return data.result;
}

export async function fetchXeroConnection(accessToken: string): Promise<XeroConnectionSummary> {
  const data = await request<{ connection: XeroConnectionSummary }>('/integrations/xero', {
    accessToken,
  });
  return data.connection;
}

export async function startXeroOAuth(
  accessToken: string,
  body: StartXeroOAuthRequest = {},
): Promise<StartXeroOAuthResponse> {
  const data = await request<StartXeroOAuthResponse>('/integrations/xero/oauth/start', {
    method: 'POST',
    accessToken,
    body,
  });
  return data;
}

export async function testXeroConnection(accessToken: string): Promise<XeroConnectionTestResult> {
  const data = await request<{ result: XeroConnectionTestResult }>('/integrations/xero/test', {
    method: 'POST',
    accessToken,
  });
  return data.result;
}

export async function disconnectXero(accessToken: string): Promise<XeroConnectionSummary> {
  const data = await request<{ connection: XeroConnectionSummary }>('/integrations/xero', {
    method: 'DELETE',
    accessToken,
  });
  return data.connection;
}

export async function syncXero(accessToken: string): Promise<XeroSyncResult & { queued?: boolean }> {
  const data = await request<{ result: XeroSyncResult & { queued?: boolean } }>(
    '/integrations/xero/sync',
    {
      method: 'POST',
      accessToken,
      timeoutMs: 15_000,
    },
  );
  return data.result;
}

export async function enqueueXeroImportSync(accessToken: string) {
  const data = await request<{
    jobId: string;
    status: 'queued' | 'running';
    message: string;
  }>('/integrations/xero/sync', {
    method: 'POST',
    accessToken,
    timeoutMs: 15_000,
  });
  return data;
}

export async function fetchXeroSyncStatus(accessToken: string): Promise<XeroSyncStatusResponse> {
  const data = await request<{ status: XeroSyncStatusResponse }>('/integrations/xero/sync/status', {
    accessToken,
  });
  return data.status;
}

export async function fetchXeroSyncLogs(accessToken: string): Promise<XeroSyncLogSummary[]> {
  const data = await request<{ logs: XeroSyncLogSummary[] }>('/integrations/xero/sync/logs', {
    accessToken,
  });
  return data.logs;
}

export async function syncXeroCustomers(accessToken: string): Promise<XeroEntitySyncResult> {
  const data = await request<{ result: XeroEntitySyncResult }>(
    '/integrations/xero/sync/customers',
    {
      method: 'POST',
      accessToken,
    },
  );
  return data.result;
}

export async function syncXeroQuotes(accessToken: string): Promise<XeroEntitySyncResult> {
  const data = await request<{ result: XeroEntitySyncResult }>('/integrations/xero/sync/quotes', {
    method: 'POST',
    accessToken,
  });
  return data.result;
}

export async function syncXeroInvoices(accessToken: string): Promise<XeroEntitySyncResult> {
  const data = await request<{ result: XeroEntitySyncResult }>('/integrations/xero/sync/invoices', {
    method: 'POST',
    accessToken,
  });
  return data.result;
}

export async function syncXeroPayments(accessToken: string): Promise<XeroEntitySyncResult> {
  const data = await request<{ result: XeroEntitySyncResult }>('/integrations/xero/sync/payments', {
    method: 'POST',
    accessToken,
  });
  return data.result;
}

export async function retryXeroSyncJob(
  accessToken: string,
  syncJobId: string,
): Promise<XeroEntitySyncResult> {
  const data = await request<{ result: XeroEntitySyncResult }>(
    `/integrations/xero/sync/retry/${syncJobId}`,
    {
      method: 'POST',
      accessToken,
    },
  );
  return data.result;
}

export async function fetchEmailConnection(accessToken: string): Promise<EmailConnectionSummary> {
  const data = await request<{ connection: EmailConnectionSummary }>('/integrations/email', {
    accessToken,
  });
  return data.connection;
}

export async function saveEmailConnection(
  accessToken: string,
  body: SaveEmailConnectionRequest,
): Promise<EmailConnectionSummary> {
  const data = await request<{ connection: EmailConnectionSummary }>('/integrations/email', {
    method: 'PUT',
    accessToken,
    body,
  });
  return data.connection;
}

export async function disconnectEmail(accessToken: string): Promise<EmailConnectionSummary> {
  const data = await request<{ connection: EmailConnectionSummary }>('/integrations/email', {
    method: 'DELETE',
    accessToken,
  });
  return data.connection;
}

export async function syncEmail(accessToken: string): Promise<EmailSyncResult> {
  const data = await request<{ result: EmailSyncResult }>('/integrations/email/sync', {
    method: 'POST',
    accessToken,
  });
  return data.result;
}

export async function fetchYocoConnection(accessToken: string): Promise<YocoConnectionSummary> {
  const data = await request<{ connection: YocoConnectionSummary }>('/integrations/yoco', {
    accessToken,
  });
  return data.connection;
}

export async function saveYocoConnection(
  accessToken: string,
  body: SaveYocoConnectionRequest,
): Promise<YocoConnectionSummary> {
  const data = await request<{ connection: YocoConnectionSummary }>('/integrations/yoco', {
    method: 'PUT',
    accessToken,
    body,
  });
  return data.connection;
}

export async function disconnectYoco(accessToken: string): Promise<YocoConnectionSummary> {
  const data = await request<{ connection: YocoConnectionSummary }>('/integrations/yoco', {
    method: 'DELETE',
    accessToken,
  });
  return data.connection;
}

export async function syncYoco(accessToken: string): Promise<YocoSyncResult> {
  const data = await request<{ result: YocoSyncResult }>('/integrations/yoco/sync', {
    method: 'POST',
    accessToken,
  });
  return data.result;
}
