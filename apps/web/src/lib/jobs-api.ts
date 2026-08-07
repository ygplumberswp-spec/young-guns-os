import type {
  AssignJobCrewRequest,
  AuthorizeJobMaterialLineRequest,
  CreateJobRequest,
  JobCostingSummary,
  JobCrewMemberSummary,
  JobDetail,
  JobExecutionSummary,
  JobMaterialLineSummary,
  JobsStats,
  JobSummary,
  JobTimelineEventSummary,
  JobVehicleAssignmentSummary,
  ReturnJobMaterialLineRequest,
  UpdateJobRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchJobsStats(accessToken: string): Promise<JobsStats> {
  return request<JobsStats>('/jobs/stats', { accessToken });
}

export async function fetchTodaysJobs(
  accessToken: string,
  options?: { includeCompleted?: boolean },
): Promise<JobSummary[]> {
  const params = new URLSearchParams();
  if (options?.includeCompleted) params.set('includeCompleted', '1');
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const data = await request<{ jobs: JobSummary[] }>(`/jobs/today${query}`, { accessToken });
  return data.jobs;
}

export async function fetchJobs(accessToken: string, search?: string): Promise<JobSummary[]> {
  const query = search?.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
  const data = await request<{ jobs: JobSummary[] }>(`/jobs${query}`, { accessToken });
  return data.jobs;
}

export async function fetchJob(accessToken: string, jobId: string): Promise<JobDetail> {
  const data = await request<{ job: JobDetail }>(`/jobs/${jobId}`, { accessToken });
  return data.job;
}

export async function createJob(accessToken: string, body: CreateJobRequest): Promise<JobDetail> {
  const data = await request<{ job: JobDetail }>('/jobs', {
    method: 'POST',
    accessToken,
    body,
  });

  return data.job;
}

export async function updateJob(
  accessToken: string,
  jobId: string,
  body: UpdateJobRequest,
): Promise<JobDetail> {
  const data = await request<{ job: JobDetail }>(`/jobs/${jobId}`, {
    method: 'PATCH',
    accessToken,
    body,
  });

  return data.job;
}

export async function deleteJob(accessToken: string, jobId: string): Promise<void> {
  await request<Record<string, never>>(`/jobs/${jobId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function fetchJobExecution(
  accessToken: string,
  jobId: string,
): Promise<JobExecutionSummary> {
  const data = await request<{ summary: JobExecutionSummary }>(`/jobs/${jobId}/execution`, {
    accessToken,
  });
  return data.summary;
}

export async function fetchJobVisitsRollup(accessToken: string, jobId: string) {
  return request<{
    visits: import('@titan/shared').JobVisitSummary[];
    rollup: import('@titan/shared').JobVisitRollup;
  }>(`/jobs/${jobId}/visits`, { accessToken });
}

export async function approveJobRescheduleRequest(
  accessToken: string,
  requestId: string,
  body: {
    scheduledAt: string;
    scheduledEndAt?: string | null;
    notes?: string | null;
  },
) {
  return request<{ job: import('@titan/shared').JobDetail; requestId: string }>(
    `/jobs/reschedule-requests/${requestId}/approve`,
    {
      accessToken,
      method: 'POST',
      body: {
        ...body,
        clientActionId: newJobsClientActionId('approve-reschedule'),
      },
    },
  );
}

export async function prepareOwnerQuickCall(
  accessToken: string,
  body: import('@titan/shared').OwnerQuickCallIntakeRequest,
) {
  return request<import('@titan/shared').QuickIntakePrepareResult>('/jobs/intake/quick-call', {
    accessToken,
    method: 'POST',
    body: { ...body, prepareOnly: true },
  });
}

export async function createOwnerQuickCallJob(
  accessToken: string,
  body: import('@titan/shared').OwnerQuickCallIntakeRequest,
) {
  return request<import('@titan/shared').QuickIntakeCreateResult>('/jobs/intake/quick-call', {
    accessToken,
    method: 'POST',
    body,
  });
}

export async function uploadOfficeJobEvidence(
  accessToken: string,
  jobId: string,
  body: {
    documentationType: 'photo' | 'document' | 'inspection_form';
    title: string;
    mimeType: string;
    dataBase64: string;
    fileName?: string;
    evidencePhase?: 'before' | 'during' | 'after' | 'signature' | 'document';
    attachmentCategory?: string | null;
    clientVisible?: boolean;
    clientActionId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ id: string; fileName: string | null; mimeType: string | null; sizeBytes: number | null }> {
  const data = await request<{
    documentation: {
      id: string;
      fileName: string | null;
      mimeType: string | null;
      sizeBytes: number | null;
    };
  }>(`/jobs/${jobId}/evidence/upload`, {
    method: 'POST',
    accessToken,
    body: {
      ...body,
      // Never request client exposure from office upload path.
      clientVisible: false,
    },
  });
  return data.documentation;
}

export function jobEvidenceContentUrl(jobId: string, documentationId: string): string {
  return `/api/v1/jobs/${jobId}/evidence/${documentationId}/content`;
}

export async function fetchJobTimeline(
  accessToken: string,
  jobId: string,
): Promise<JobTimelineEventSummary[]> {
  const data = await request<{ events: JobTimelineEventSummary[] }>(`/jobs/${jobId}/timeline`, {
    accessToken,
  });
  return data.events;
}

export async function assignJobCrew(
  accessToken: string,
  jobId: string,
  body: AssignJobCrewRequest,
) {
  return request<{
    crew: JobCrewMemberSummary[];
    vehicle: JobVehicleAssignmentSummary | null;
  }>(`/jobs/${jobId}/crew`, {
    accessToken,
    method: 'PUT',
    body,
  });
}

export async function reopenJob(accessToken: string, jobId: string, reason: string) {
  const data = await request<{ job: JobDetail }>(`/jobs/${jobId}/reopen`, {
    accessToken,
    method: 'POST',
    body: { reason },
  });
  return data.job;
}

export async function fetchPendingMaterialRequests(
  accessToken: string,
): Promise<JobMaterialLineSummary[]> {
  const data = await request<{ materialLines: JobMaterialLineSummary[] }>('/jobs/materials/pending', {
    accessToken,
  });
  return data.materialLines;
}

export async function fetchJobMaterialLines(
  accessToken: string,
  jobId: string,
): Promise<JobMaterialLineSummary[]> {
  const data = await request<{ materialLines: JobMaterialLineSummary[] }>(
    `/jobs/${jobId}/materials`,
    { accessToken },
  );
  return data.materialLines;
}

export async function authorizeJobMaterialLine(
  accessToken: string,
  jobId: string,
  materialLineId: string,
  body: AuthorizeJobMaterialLineRequest,
): Promise<JobMaterialLineSummary> {
  const data = await request<{ materialLine: JobMaterialLineSummary }>(
    `/jobs/${jobId}/materials/${materialLineId}/authorize`,
    { accessToken, method: 'POST', body },
  );
  return data.materialLine;
}

export async function returnJobMaterialLine(
  accessToken: string,
  jobId: string,
  materialLineId: string,
  body: ReturnJobMaterialLineRequest,
): Promise<JobMaterialLineSummary> {
  const data = await request<{ materialLine: JobMaterialLineSummary }>(
    `/jobs/${jobId}/materials/${materialLineId}/return`,
    { accessToken, method: 'POST', body },
  );
  return data.materialLine;
}

export async function receiveUnusedDirectPurchase(
  accessToken: string,
  jobId: string,
  materialLineId: string,
  body: {
    quantity: number;
    inventoryItemId: string;
    locationId: string;
    reason: string;
    clientActionId: string;
    unitCostCents?: number | null;
  },
): Promise<JobMaterialLineSummary> {
  const data = await request<{ materialLine: JobMaterialLineSummary }>(
    `/jobs/${jobId}/materials/${materialLineId}/receive-unused`,
    { accessToken, method: 'POST', body },
  );
  return data.materialLine;
}

export async function resolveJobMaterialStockVariance(
  accessToken: string,
  jobId: string,
  materialLineId: string,
  body: {
    resolutionNotes: string;
    clientActionId: string;
    correctedFulfilledQuantity?: number | null;
  },
): Promise<JobMaterialLineSummary> {
  const data = await request<{ materialLine: JobMaterialLineSummary }>(
    `/jobs/${jobId}/materials/${materialLineId}/resolve-variance`,
    { accessToken, method: 'POST', body },
  );
  return data.materialLine;
}

export async function fetchStockVarianceMaterialLines(
  accessToken: string,
): Promise<JobMaterialLineSummary[]> {
  const data = await request<{ materialLines: JobMaterialLineSummary[] }>(
    `/jobs/materials/stock-variances`,
    { accessToken },
  );
  return data.materialLines;
}

export async function fetchJobCostingSummary(
  accessToken: string,
  jobId: string,
): Promise<JobCostingSummary> {
  const data = await request<{ summary: JobCostingSummary }>(`/jobs/${jobId}/costing`, {
    accessToken,
  });
  return data.summary;
}

export async function fetchJobProfitability(
  accessToken: string,
  jobId: string,
): Promise<import('@titan/shared').JobProfitabilityResult> {
  const data = await request<{ profitability: import('@titan/shared').JobProfitabilityResult }>(
    `/jobs/${jobId}/profitability`,
    { accessToken },
  );
  return data.profitability;
}

export async function recalculateJobProfitability(
  accessToken: string,
  jobId: string,
): Promise<import('@titan/shared').JobProfitabilityResult> {
  const data = await request<{ profitability: import('@titan/shared').JobProfitabilityResult }>(
    `/jobs/${jobId}/profitability/recalculate`,
    { accessToken, method: 'POST' },
  );
  return data.profitability;
}

export async function createJobCostAdjustment(
  accessToken: string,
  jobId: string,
  body: import('@titan/shared').CreateJobProfitabilityAdjustmentRequest,
): Promise<import('@titan/shared').JobProfitabilityAdjustmentSummary> {
  const data = await request<{ adjustment: import('@titan/shared').JobProfitabilityAdjustmentSummary }>(
    `/jobs/${jobId}/cost-adjustments`,
    { accessToken, method: 'POST', body },
  );
  return data.adjustment;
}

export async function fetchJobCostChecklist(
  accessToken: string,
  jobId: string,
): Promise<import('@titan/shared').JobCostChecklist> {
  const data = await request<{ checklist: import('@titan/shared').JobCostChecklist }>(
    `/jobs/${jobId}/cost-checklist`,
    { accessToken },
  );
  return data.checklist;
}

export function newJobsClientActionId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
