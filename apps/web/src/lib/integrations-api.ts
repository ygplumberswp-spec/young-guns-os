import type {
  CartrackConnectionSummary,
  CartrackSyncResult,
  EmailConnectionSummary,
  EmailSyncResult,
  FleetTrackingContext,
  FleetVehicleTrailResponse,
  IntegrationVehicleMappingSummary,
  ResendConnectionSummary,
  ResendDeliverySummary,
  ResendSyncResult,
  SaveCartrackConnectionRequest,
  SaveEmailConnectionRequest,
  SaveResendConnectionRequest,
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
  XeroFinanceFreshnessSummary,
  XeroIncrementalQuoteRefreshResult,
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

export async function validateCartrackCredentials(
  accessToken: string,
  body: SaveCartrackConnectionRequest,
) {
  const data = await request<{ result: { valid: boolean; message: string } }>(
    '/integrations/cartrack/credentials/validate',
    {
      method: 'POST',
      accessToken,
      body,
    },
  );
  return data.result;
}

export async function replaceCartrackCredentials(
  accessToken: string,
  body: SaveCartrackConnectionRequest,
): Promise<CartrackConnectionSummary> {
  const data = await request<{ connection: CartrackConnectionSummary }>(
    '/integrations/cartrack/credentials',
    {
      method: 'PUT',
      accessToken,
      body,
    },
  );
  return data.connection;
}

export async function verifyStoredCartrackConnection(
  accessToken: string,
): Promise<CartrackConnectionSummary> {
  const data = await request<{ connection: CartrackConnectionSummary }>(
    '/integrations/cartrack/verify-stored',
    {
      method: 'POST',
      accessToken,
    },
  );
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

export async function fetchCartrackTracking(accessToken: string): Promise<FleetTrackingContext> {
  const data = await request<{ tracking: FleetTrackingContext }>(
    '/integrations/cartrack/tracking',
    {
      accessToken,
      // Provider-backed — never block Fleet/Live Ops shells indefinitely.
      timeoutMs: 15_000,
    },
  );
  return data.tracking;
}

/**
 * Stored Cartrack readings for one vehicle, used to draw the breadcrumb trail behind a
 * followed vehicle. Points are provider readings only — never interpolated.
 */
export async function fetchCartrackVehicleTrail(
  accessToken: string,
  vehicleId: string,
  options: { maxPoints?: number } = {},
): Promise<FleetVehicleTrailResponse> {
  const query = options.maxPoints ? `?maxPoints=${options.maxPoints}` : '';
  const data = await request<{ trail: FleetVehicleTrailResponse }>(
    `/integrations/cartrack/vehicles/${encodeURIComponent(vehicleId)}/trail${query}`,
    { accessToken, timeoutMs: 15_000 },
  );
  return data.trail;
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
  // POST /integrations/xero/sync verifies the org, then enqueues the real import job.
  const data = await request<{
    result: XeroSyncResult & { queued?: boolean; message?: string };
    jobId: string;
    status: 'queued' | 'running';
    message: string;
  }>('/integrations/xero/sync', {
    method: 'POST',
    accessToken,
    timeoutMs: 15_000,
  });
  return {
    jobId: data.jobId,
    status: data.status,
    message: data.message,
  };
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

export async function fetchXeroImportRecoveryPreview(accessToken: string) {
  const data = await request<{ preview: Record<string, unknown> }>(
    '/integrations/xero/sync/recovery-preview',
    { accessToken },
  );
  return data.preview;
}

export async function recoverStaleXeroImport(accessToken: string) {
  return request<Record<string, unknown>>('/integrations/xero/sync/recover-stale', {
    method: 'POST',
    accessToken,
  });
}

export async function clearFailedXeroImport(accessToken: string, syncJobId: string) {
  return request<{ syncJobId: string; status: string }>(
    `/integrations/xero/sync/clear-failed/${syncJobId}`,
    {
      method: 'POST',
      accessToken,
    },
  );
}

export async function fetchXeroCustomerMappingReport(accessToken: string) {
  const data = await request<{ report: import('@titan/shared').XeroCustomerMappingReport }>(
    '/integrations/xero/customer-mappings/report',
    { accessToken },
  );
  return data.report;
}

export async function applyDeterministicXeroCustomerMappings(
  accessToken: string,
  dryRun: boolean,
) {
  return request<Record<string, unknown>>('/integrations/xero/customer-mappings/apply-deterministic', {
    method: 'POST',
    accessToken,
    body: { dryRun },
  });
}

export async function fetchXeroWriteApprovals(
  accessToken: string,
  status?: string,
): Promise<import('@titan/shared').XeroWriteApprovalQueueItem[]> {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await request<{ items: import('@titan/shared').XeroWriteApprovalQueueItem[] }>(
    `/integrations/xero/write-approvals${suffix}`,
    { accessToken },
  );
  return data.items;
}

export async function requestXeroWriteApproval(
  accessToken: string,
  input: {
    writeOperation: 'invoice_create' | 'payment_create' | 'contact_update';
    entityId: string;
    notes?: string;
  },
): Promise<import('@titan/shared').XeroWriteApprovalQueueItem> {
  const data = await request<{ item: import('@titan/shared').XeroWriteApprovalQueueItem }>(
    '/integrations/xero/write-approvals',
    { method: 'POST', accessToken, body: input },
  );
  return data.item;
}

export async function approveXeroWriteApproval(
  accessToken: string,
  approvalId: string,
): Promise<import('@titan/shared').XeroWriteApprovalQueueItem> {
  const data = await request<{ item: import('@titan/shared').XeroWriteApprovalQueueItem }>(
    `/integrations/xero/write-approvals/${approvalId}/approve`,
    { method: 'POST', accessToken },
  );
  return data.item;
}

export async function rejectXeroWriteApproval(
  accessToken: string,
  approvalId: string,
  reason?: string,
): Promise<import('@titan/shared').XeroWriteApprovalQueueItem> {
  const data = await request<{ item: import('@titan/shared').XeroWriteApprovalQueueItem }>(
    `/integrations/xero/write-approvals/${approvalId}/reject`,
    { method: 'POST', accessToken, body: { reason } },
  );
  return data.item;
}

export async function cancelXeroWriteApproval(
  accessToken: string,
  approvalId: string,
): Promise<import('@titan/shared').XeroWriteApprovalQueueItem> {
  const data = await request<{ item: import('@titan/shared').XeroWriteApprovalQueueItem }>(
    `/integrations/xero/write-approvals/${approvalId}/cancel`,
    { method: 'POST', accessToken },
  );
  return data.item;
}

export async function executeXeroWriteApproval(
  accessToken: string,
  approvalId: string,
): Promise<{
  approval: import('@titan/shared').XeroWriteApprovalQueueItem;
  result: Record<string, unknown>;
}> {
  return request(`/integrations/xero/write-approvals/${approvalId}/execute`, {
    method: 'POST',
    accessToken,
  });
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

export async function fetchResendConnection(accessToken: string): Promise<ResendConnectionSummary> {
  const data = await request<{ connection: ResendConnectionSummary }>('/integrations/resend', {
    accessToken,
  });
  return data.connection;
}

export async function saveResendConnection(
  accessToken: string,
  body: SaveResendConnectionRequest,
): Promise<ResendConnectionSummary> {
  const data = await request<{ connection: ResendConnectionSummary }>('/integrations/resend', {
    method: 'PUT',
    accessToken,
    body,
  });
  return data.connection;
}

export async function disconnectResend(accessToken: string): Promise<ResendConnectionSummary> {
  const data = await request<{ connection: ResendConnectionSummary }>('/integrations/resend', {
    method: 'DELETE',
    accessToken,
  });
  return data.connection;
}

export async function syncResend(accessToken: string): Promise<ResendSyncResult> {
  const data = await request<{ result: ResendSyncResult }>('/integrations/resend/sync', {
    method: 'POST',
    accessToken,
  });
  return data.result;
}

export async function fetchResendDeliveries(
  accessToken: string,
): Promise<ResendDeliverySummary[]> {
  const data = await request<{ deliveries: ResendDeliverySummary[] }>(
    '/integrations/resend/deliveries',
    { accessToken },
  );
  return data.deliveries;
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

export async function fetchXeroFinanceFreshness(
  accessToken: string,
): Promise<XeroFinanceFreshnessSummary> {
  return request<XeroFinanceFreshnessSummary>('/integrations/xero/finance-freshness', {
    accessToken,
  });
}

export async function refreshXeroQuotesIncremental(
  accessToken: string,
): Promise<XeroIncrementalQuoteRefreshResult> {
  return request<XeroIncrementalQuoteRefreshResult>(
    '/integrations/xero/quotes/incremental-refresh',
    { method: 'POST', accessToken },
  );
}
