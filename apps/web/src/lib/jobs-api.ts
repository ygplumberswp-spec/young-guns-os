import type {
  AssignJobCrewRequest,
  AuthorizeJobMaterialLineRequest,
  CreateJobRequest,
  JobCrewMemberSummary,
  JobDetail,
  JobExecutionSummary,
  JobMaterialLineSummary,
  JobsStats,
  JobSummary,
  JobVehicleAssignmentSummary,
  ReturnJobMaterialLineRequest,
  UpdateJobRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchJobsStats(accessToken: string): Promise<JobsStats> {
  return request<JobsStats>('/jobs/stats', { accessToken });
}

export async function fetchTodaysJobs(accessToken: string): Promise<JobSummary[]> {
  const data = await request<{ jobs: JobSummary[] }>('/jobs/today', { accessToken });
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

export async function fetchJobExecution(
  accessToken: string,
  jobId: string,
): Promise<JobExecutionSummary> {
  const data = await request<{ summary: JobExecutionSummary }>(`/jobs/${jobId}/execution`, {
    accessToken,
  });
  return data.summary;
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

export function newJobsClientActionId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
