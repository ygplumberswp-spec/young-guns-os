import { request } from './api-client';
import type {
  CompletionReportDetail,
  CompletionReportEmailDraftResult,
  CompletionReportPreview,
  CompletionReportSummary,
  CreateCompletionReportRequest,
  PrepareCompletionReportEmailRequest,
  UpdateCompletionReportRequest,
} from '@titan/shared';

export async function fetchCompletionReportPreview(
  accessToken: string,
  jobId: string,
): Promise<CompletionReportPreview> {
  const data = await request<{ preview: CompletionReportPreview }>(
    `/completion-reports/preview?jobId=${encodeURIComponent(jobId)}`,
    { accessToken },
  );
  return data.preview;
}

export async function fetchCompletionReports(
  accessToken: string,
  query?: { jobId?: string },
): Promise<CompletionReportSummary[]> {
  const params = new URLSearchParams();
  if (query?.jobId) params.set('jobId', query.jobId);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const data = await request<{ reports: CompletionReportSummary[] }>(
    `/completion-reports${suffix}`,
    { accessToken },
  );
  return data.reports;
}

export async function fetchCompletionReport(
  accessToken: string,
  id: string,
): Promise<CompletionReportDetail> {
  const data = await request<{ report: CompletionReportDetail }>(`/completion-reports/${id}`, {
    accessToken,
  });
  return data.report;
}

export async function createCompletionReport(
  accessToken: string,
  body: CreateCompletionReportRequest,
): Promise<CompletionReportDetail> {
  const data = await request<{ report: CompletionReportDetail }>('/completion-reports', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.report;
}

export async function updateCompletionReport(
  accessToken: string,
  id: string,
  body: UpdateCompletionReportRequest,
): Promise<CompletionReportDetail> {
  const data = await request<{ report: CompletionReportDetail }>(`/completion-reports/${id}`, {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.report;
}

export async function generateCompletionReport(
  accessToken: string,
  id: string,
): Promise<CompletionReportDetail> {
  const data = await request<{ report: CompletionReportDetail }>(
    `/completion-reports/${id}/generate`,
    { method: 'POST', accessToken, body: {} },
  );
  return data.report;
}

export async function markCompletionReportReady(
  accessToken: string,
  id: string,
): Promise<CompletionReportDetail> {
  const data = await request<{ report: CompletionReportDetail }>(
    `/completion-reports/${id}/ready`,
    { method: 'POST', accessToken, body: {} },
  );
  return data.report;
}

export async function prepareCompletionReportEmail(
  accessToken: string,
  id: string,
  body: PrepareCompletionReportEmailRequest = {},
): Promise<CompletionReportEmailDraftResult> {
  const data = await request<{ emailDraft: CompletionReportEmailDraftResult }>(
    `/completion-reports/${id}/prepare-email`,
    { method: 'POST', accessToken, body },
  );
  return data.emailDraft;
}

export async function addCompletionReportTimelineNote(
  accessToken: string,
  id: string,
): Promise<CompletionReportDetail> {
  const data = await request<{ report: CompletionReportDetail }>(
    `/completion-reports/${id}/timeline-note`,
    { method: 'POST', accessToken, body: {} },
  );
  return data.report;
}

export async function cancelCompletionReport(
  accessToken: string,
  id: string,
): Promise<CompletionReportDetail> {
  const data = await request<{ report: CompletionReportDetail }>(
    `/completion-reports/${id}/cancel`,
    { method: 'POST', accessToken, body: {} },
  );
  return data.report;
}
