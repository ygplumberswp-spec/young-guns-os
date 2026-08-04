import { request } from './api-client';
import type {
  CreateJobDocumentPackRequest,
  JobDocumentPackDetail,
  JobDocumentPackSummary,
  SendJobDocumentPackRequest,
  UpdateJobDocumentPackRequest,
} from '@titan/shared';

export async function fetchJobDocumentPacks(
  accessToken: string,
  query?: { jobId?: string },
): Promise<JobDocumentPackSummary[]> {
  const params = new URLSearchParams();
  if (query?.jobId) params.set('jobId', query.jobId);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const data = await request<{ packs: JobDocumentPackSummary[] }>(
    `/job-document-packs${suffix}`,
    { accessToken },
  );
  return data.packs;
}

export async function fetchJobDocumentPack(
  accessToken: string,
  id: string,
): Promise<JobDocumentPackDetail> {
  const data = await request<{ pack: JobDocumentPackDetail }>(`/job-document-packs/${id}`, {
    accessToken,
  });
  return data.pack;
}

export async function createJobDocumentPack(
  accessToken: string,
  body: CreateJobDocumentPackRequest,
): Promise<JobDocumentPackDetail> {
  const data = await request<{ pack: JobDocumentPackDetail }>('/job-document-packs', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.pack;
}

export async function updateJobDocumentPack(
  accessToken: string,
  id: string,
  body: UpdateJobDocumentPackRequest,
): Promise<JobDocumentPackDetail> {
  const data = await request<{ pack: JobDocumentPackDetail }>(`/job-document-packs/${id}`, {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.pack;
}

export async function approveJobDocumentPackStep(
  accessToken: string,
  id: string,
): Promise<JobDocumentPackDetail> {
  const data = await request<{ pack: JobDocumentPackDetail }>(`/job-document-packs/${id}/approve`, {
    method: 'POST',
    accessToken,
    body: {},
  });
  return data.pack;
}

export async function sendJobDocumentPack(
  accessToken: string,
  id: string,
  body: SendJobDocumentPackRequest,
): Promise<JobDocumentPackDetail> {
  const data = await request<{ pack: JobDocumentPackDetail }>(`/job-document-packs/${id}/send`, {
    method: 'POST',
    accessToken,
    body,
  });
  return data.pack;
}
