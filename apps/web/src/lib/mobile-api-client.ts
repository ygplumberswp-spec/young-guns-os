import type {
  CreateJobVariationRequest,
  FlushOfflineActionsRequest,
  FlushOfflineActionsResponse,
  JobCompletionGateResult,
  JobDetail,
  JobEvidenceContentResponse,
  JobMaterialLineSummary,
  JobVariationSummary,
  JobWorkflowAction,
  JobWorkflowTransitionRequest,
  MobileJobDocumentationSummary,
  MobileJobExecutionWorkspace,
  MobileRouteIntelligence,
  MobileWorkforceDashboard,
  MobileWorkforceInventoryCentre,
  MobileWorkforceJobList,
  MobileWorkforceNotificationCentre,
  MobileOfflineBundle,
  MobileSyncProcessResult,
  MobileTimeEntrySummary,
  MobileWorkforceRequestSummary,
  NotificationSummary,
  RecordJobMaterialLineRequest,
  SubmitGatedJobCompletionRequest,
  SubmitMobileJobDocumentationRequest,
  UploadJobEvidenceRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

function newClientActionId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export { newClientActionId };

export { ApiClientError as MobileApiClientError };

export async function fetchMobileWorkforceDashboard(
  accessToken: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
) {
  const data = await request<{ dashboard: MobileWorkforceDashboard }>(
    '/mobile/technician/workforce/dashboard',
    {
      accessToken,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs ?? 20_000,
    },
  );
  return data.dashboard;
}

export async function fetchMobileWorkforceJobs(accessToken: string) {
  return request<MobileWorkforceJobList>('/mobile/technician/workforce/jobs', { accessToken });
}

export async function fetchMobileJobWorkspace(accessToken: string, jobId: string) {
  const data = await request<{ workspace: MobileJobExecutionWorkspace }>(
    `/mobile/technician/workforce/jobs/${jobId}`,
    { accessToken },
  );
  return data.workspace;
}

export async function fetchMobileRoute(accessToken: string) {
  const data = await request<{ route: MobileRouteIntelligence }>(
    '/mobile/technician/workforce/route',
    { accessToken },
  );
  return data.route;
}

export async function fetchMobileInventory(accessToken: string) {
  const data = await request<{ inventory: MobileWorkforceInventoryCentre }>(
    '/mobile/technician/workforce/inventory',
    { accessToken },
  );
  return data.inventory;
}

export async function fetchMobileTimeEntries(accessToken: string) {
  const data = await request<{ entries: MobileTimeEntrySummary[] }>(
    '/mobile/technician/workforce/time',
    { accessToken },
  );
  return data.entries;
}

export async function createMobileTimeEntry(
  accessToken: string,
  body: { entryType: string; jobId?: string; notes?: string },
) {
  const data = await request<{ entry: MobileTimeEntrySummary }>(
    '/mobile/technician/workforce/time',
    { accessToken, method: 'POST', body },
  );
  return data.entry;
}

export async function fetchMobileNotifications(accessToken: string) {
  return request<MobileWorkforceNotificationCentre>('/mobile/technician/workforce/notifications', {
    accessToken,
  });
}

export async function fetchMobileNotificationsLegacy(accessToken: string) {
  const data = await request<{ notifications: NotificationSummary[] }>(
    '/mobile/technician/notifications',
    { accessToken },
  );
  return data.notifications;
}

export async function markMobileNotificationRead(accessToken: string, notificationId: string) {
  return request<{ success: boolean }>(`/mobile/technician/notifications/${notificationId}/read`, {
    accessToken,
    method: 'PATCH',
  });
}

export async function fetchMobileRequests(accessToken: string) {
  const data = await request<{ requests: MobileWorkforceRequestSummary[] }>(
    '/mobile/technician/workforce/requests',
    { accessToken },
  );
  return data.requests;
}

export async function createMobileRequest(
  accessToken: string,
  body: {
    requestType: string;
    subject: string;
    message: string;
    entityType?: string;
    entityId?: string;
  },
) {
  const data = await request<{ request: MobileWorkforceRequestSummary }>(
    '/mobile/technician/workforce/requests',
    { accessToken, method: 'POST', body },
  );
  return data.request;
}

export async function fetchMobileOfflineBundle(accessToken: string) {
  const data = await request<{ bundle: MobileOfflineBundle }>(
    '/mobile/technician/workforce/offline',
    { accessToken },
  );
  return data.bundle;
}

export async function processMobileSync(accessToken: string) {
  const data = await request<{ result: MobileSyncProcessResult }>(
    '/mobile/technician/workforce/sync/process',
    { accessToken, method: 'POST', body: {} },
  );
  return data.result;
}

export async function transitionMobileJob(
  accessToken: string,
  jobId: string,
  action: JobWorkflowAction,
  reason?: string,
) {
  const body: JobWorkflowTransitionRequest = {
    action,
    reason: reason ?? null,
    clientActionId: newClientActionId(action),
  };
  const data = await request<{ job: JobDetail }>(`/mobile/technician/jobs/${jobId}/transition`, {
    accessToken,
    method: 'POST',
    body,
  });
  return data.job;
}

export async function fetchMobileCompletionGate(accessToken: string, jobId: string) {
  const data = await request<{ gate: JobCompletionGateResult }>(
    `/mobile/technician/jobs/${jobId}/completion-gate`,
    { accessToken },
  );
  return data.gate;
}

export async function completeMobileJobGated(
  accessToken: string,
  jobId: string,
  body: Omit<SubmitGatedJobCompletionRequest, 'clientActionId'>,
) {
  const data = await request<{ job: JobDetail; snapshotId: string }>(
    `/mobile/technician/jobs/${jobId}/complete-gated`,
    {
      accessToken,
      method: 'POST',
      body: { ...body, clientActionId: newClientActionId('complete') },
    },
  );
  return data;
}

export async function submitMobileJobDocumentation(
  accessToken: string,
  jobId: string,
  body: SubmitMobileJobDocumentationRequest,
) {
  const data = await request<{ documentation: MobileJobDocumentationSummary }>(
    `/mobile/technician/workforce/jobs/${jobId}/documentation`,
    { accessToken, method: 'POST', body },
  );
  return data.documentation;
}

export async function uploadMobileJobEvidence(
  accessToken: string,
  jobId: string,
  body: UploadJobEvidenceRequest,
) {
  const data = await request<{ documentation: MobileJobDocumentationSummary }>(
    `/mobile/technician/workforce/jobs/${jobId}/documentation/upload`,
    {
      accessToken,
      method: 'POST',
      body: {
        ...body,
        clientActionId: body.clientActionId ?? newClientActionId('evidence'),
      },
      timeoutMs: 60_000,
    },
  );
  return data.documentation;
}

export async function fetchMobileJobEvidenceContent(
  accessToken: string,
  jobId: string,
  docId: string,
) {
  return request<JobEvidenceContentResponse>(
    `/mobile/technician/workforce/jobs/${jobId}/documentation/${docId}/content`,
    { accessToken, timeoutMs: 60_000 },
  );
}

export async function flushMobileOfflineActions(
  accessToken: string,
  body: FlushOfflineActionsRequest,
) {
  return request<FlushOfflineActionsResponse>(
    '/mobile/technician/workforce/offline/flush',
    { accessToken, method: 'POST', body, timeoutMs: 90_000 },
  );
}

export async function createMobileJobVariation(
  accessToken: string,
  jobId: string,
  body: CreateJobVariationRequest,
) {
  const data = await request<{ variation: JobVariationSummary }>(
    `/mobile/technician/jobs/${jobId}/variations`,
    { accessToken, method: 'POST', body },
  );
  return data.variation;
}

export async function recordMobileMaterialLine(
  accessToken: string,
  jobId: string,
  body: Omit<RecordJobMaterialLineRequest, 'clientActionId'>,
) {
  const data = await request<{ materialLine: JobMaterialLineSummary }>(
    `/mobile/technician/jobs/${jobId}/material-lines`,
    {
      accessToken,
      method: 'POST',
      body: { ...body, clientActionId: newClientActionId('material') },
    },
  );
  return data.materialLine;
}
