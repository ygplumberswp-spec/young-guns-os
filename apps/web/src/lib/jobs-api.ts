import type { CreateJobRequest, JobDetail, JobsStats, JobSummary, UpdateJobRequest } from '@titan/shared';
import { request } from './api-client';

export async function fetchJobsStats(accessToken: string): Promise<JobsStats> {
  return request<JobsStats>('/jobs/stats', { accessToken });
}

export async function fetchJobs(accessToken: string): Promise<JobSummary[]> {
  const data = await request<{ jobs: JobSummary[] }>('/jobs', { accessToken });
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
