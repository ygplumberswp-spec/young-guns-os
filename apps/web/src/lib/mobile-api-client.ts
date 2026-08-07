import type {
  CreateJobVariationRequest,
  FlushOfflineActionsRequest,
  FlushOfflineActionsResponse,
  JobCompletionGateResult,
  JobDetail,
  JobEvidenceContentResponse,
  JobMaterialLineSummary,
  JobRescheduleReason,
  JobVariationSummary,
  JobVisitRollup,
  JobVisitSummary,
  JobWorkflowAction,
  JobWorkflowTransitionRequest,
  MobileJobDocumentationSummary,
  MobileJobExecutionWorkspace,
  MobileRouteIntelligence,
  MobileTimeEntrySummary,
  MobileWorkforceDashboard,
  MobileWorkforceInventoryCentre,
  MobileWorkforceJobList,
  MobileWorkforceNotificationCentre,
  MobileOfflineBundle,
  MobileSyncProcessResult,
  MobileWorkforceRequestSummary,
  NotificationSummary,
  RecordJobMaterialLineRequest,
  StillBusyInput,
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
  body: {
    entryType: string;
    jobId?: string;
    notes?: string;
    clientActionId?: string;
    startedAt?: string;
    endedAt?: string;
  },
) {
  const data = await request<{ entry: MobileTimeEntrySummary }>(
    '/mobile/technician/workforce/time',
    { accessToken, method: 'POST', body },
  );
  return data.entry;
}

export async function startMobileTimedEntry(
  accessToken: string,
  body: { entryType: 'job_time' | 'travel'; jobId?: string; notes?: string; clientActionId?: string },
) {
  const data = await request<{ entry: MobileTimeEntrySummary }>(
    '/mobile/technician/workforce/time/start',
    { accessToken, method: 'POST', body },
  );
  return data.entry;
}

export async function stopMobileTimeEntry(
  accessToken: string,
  timeEntryId: string,
  body: { clientActionId?: string } = {},
) {
  const data = await request<{ entry: MobileTimeEntrySummary }>(
    `/mobile/technician/workforce/time/${timeEntryId}/stop`,
    { accessToken, method: 'POST', body },
  );
  return data.entry;
}

export async function pauseMobileTimeEntry(accessToken: string, timeEntryId: string) {
  const data = await request<{ entry: MobileTimeEntrySummary }>(
    `/mobile/technician/workforce/time/${timeEntryId}/pause`,
    { accessToken, method: 'POST', body: {} },
  );
  return data.entry;
}

export async function resumeMobileTimeEntry(accessToken: string, timeEntryId: string) {
  const data = await request<{ entry: MobileTimeEntrySummary }>(
    `/mobile/technician/workforce/time/${timeEntryId}/resume`,
    { accessToken, method: 'POST', body: {} },
  );
  return data.entry;
}

export async function fetchMobilePaymentStrip(accessToken: string, jobId: string) {
  const data = await request<{ strip: import('@titan/shared').TechnicianInvoicePaymentStrip | null }>(
    `/mobile/technician/jobs/${jobId}/payment-strip`,
    { accessToken },
  );
  return data.strip;
}

export async function recordMobileOnSitePayment(
  accessToken: string,
  jobId: string,
  body: {
    invoiceId: string;
    customerId: string;
    amountCents: number;
    method: 'card_terminal' | 'payment_link_qr' | 'other_authorised';
    providerTerminal?: string | null;
    paymentReference: string;
    paidAt?: string;
  },
) {
  const data = await request<{ payment: unknown }>(
    `/mobile/technician/jobs/${jobId}/on-site-payment`,
    { accessToken, method: 'POST', body },
  );
  return data.payment;
}

export async function fetchMobileArrivalPrompt(
  accessToken: string,
  jobId: string,
  query: {
    cartrackAvailable?: boolean;
    proximityMatch?: boolean;
    ignitionOff?: boolean;
    jobNumber?: string | null;
  } = {},
) {
  const params = new URLSearchParams();
  if (query.cartrackAvailable) params.set('cartrackAvailable', 'true');
  if (query.proximityMatch) params.set('proximityMatch', 'true');
  if (query.ignitionOff) params.set('ignitionOff', 'true');
  if (query.jobNumber) params.set('jobNumber', query.jobNumber);
  const qs = params.toString();
  const data = await request<{ prompt: import('@titan/shared').CartrackArrivalPrompt }>(
    `/mobile/technician/jobs/${jobId}/arrival-prompt${qs ? `?${qs}` : ''}`,
    { accessToken },
  );
  return data.prompt;
}

export async function fetchActiveMobileTimeEntries(accessToken: string) {
  const data = await request<{ entries: MobileTimeEntrySummary[] }>(
    '/mobile/technician/workforce/time/active',
    { accessToken },
  );
  return data.entries;
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

export async function stillBusyMobileJob(
  accessToken: string,
  jobId: string,
  body: Omit<StillBusyInput, 'clientActionId'>,
) {
  const data = await request<{
    job: JobDetail;
    visit: JobVisitSummary;
  }>(`/mobile/technician/jobs/${jobId}/still-busy`, {
    accessToken,
    method: 'POST',
    body: {
      ...body,
      clientActionId: newClientActionId('still-busy'),
    },
  });
  return data;
}

export async function requestMobileJobReschedule(
  accessToken: string,
  jobId: string,
  body: {
    reason: JobRescheduleReason;
    notes: string;
    proposedScheduledAt?: string | null;
  },
) {
  const data = await request<{ request: MobileWorkforceRequestSummary; job: JobDetail }>(
    `/mobile/technician/jobs/${jobId}/reschedule-request`,
    {
      accessToken,
      method: 'POST',
      body: {
        ...body,
        clientActionId: newClientActionId('reschedule'),
      },
    },
  );
  return data;
}

export async function fetchMobileJobVisits(accessToken: string, jobId: string) {
  return request<{ visits: JobVisitSummary[]; rollup: JobVisitRollup }>(
    `/mobile/technician/jobs/${jobId}/visits`,
    { accessToken },
  );
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
  options?: { clientActionId?: string },
) {
  const data = await request<{
    job: JobDetail;
    snapshotId?: string;
    paperless?: {
      issues: Array<{ code: string; severity: string; message: string }>;
      readyForDraftInvoice: boolean;
      draftInvoice: {
        id: string;
        invoiceNumber: string | null;
        totalCents: number;
        status: string;
      } | null;
      ownerNotifyMessage: string | null;
    };
  }>(`/mobile/technician/jobs/${jobId}/complete-gated`, {
    accessToken,
    method: 'POST',
    body: {
      ...body,
      clientActionId: options?.clientActionId ?? newClientActionId('complete'),
    },
  });
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

export async function fetchMobileCaptureChecklist(accessToken: string, jobId: string) {
  const data = await request<{ checklist: import('@titan/shared').TechnicianCompletionChecklist }>(
    `/mobile/technician/jobs/${jobId}/capture-checklist`,
    { accessToken },
  );
  return data.checklist;
}

export async function createMobileDirectCost(
  accessToken: string,
  jobId: string,
  body: {
    category: string;
    description: string;
    amountCents?: number | null;
    receiptDocumentId?: string | null;
    notes?: string | null;
    clientActionId?: string;
  },
) {
  const data = await request<{ directCost: { id: string; description: string; amountCents: number } }>(
    `/mobile/technician/jobs/${jobId}/direct-costs`,
    {
      accessToken,
      method: 'POST',
      body: { ...body, clientActionId: body.clientActionId ?? newClientActionId('direct-cost') },
    },
  );
  return data.directCost;
}

export async function returnMobileMaterialLine(
  accessToken: string,
  jobId: string,
  materialLineId: string,
  body: { quantity: number; reason: string; clientActionId?: string },
) {
  const data = await request<{ materialLine: JobMaterialLineSummary }>(
    `/mobile/technician/jobs/${jobId}/material-lines/${materialLineId}/return`,
    {
      accessToken,
      method: 'POST',
      body: { ...body, clientActionId: body.clientActionId ?? newClientActionId('material-return') },
    },
  );
  return data.materialLine;
}
