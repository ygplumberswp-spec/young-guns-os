import type {
  CreateDispatchActionRequest,
  CreateDispatchCallbackRequest,
  CreateDispatchEmergencyAssessmentRequest,
  CreateDispatchReceptionistSummaryRequest,
  DispatchActionSummary,
  DispatchCallbackRequestSummary,
  DispatchEmergencyAssessmentSummary,
  DispatchOperationsDashboard,
  DispatchRecommendationSummary,
  DispatchReceptionistSummaryRecord,
  DispatchTechnicianMatchSummary,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as DispatchIntelligenceApiClientError };

export async function fetchDispatchDashboard(accessToken: string) {
  const data = await request<{ dashboard: DispatchOperationsDashboard }>(
    '/dispatch-intelligence/dashboard',
    {
      accessToken,
    },
  );
  return data.dashboard;
}

export async function fetchCallQueue(accessToken: string) {
  const data = await request<{ callQueue: DispatchOperationsDashboard['callQueue'] }>(
    '/dispatch-intelligence/call-queue',
    { accessToken },
  );
  return data.callQueue;
}

export async function fetchTechnicianMatching(accessToken: string, jobId?: string) {
  const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : '';
  const data = await request<{ matches: DispatchTechnicianMatchSummary[] }>(
    `/dispatch-intelligence/technician-matching${query}`,
    { accessToken },
  );
  return data.matches;
}

export async function fetchDispatchRecommendations(accessToken: string) {
  const data = await request<{ recommendations: DispatchRecommendationSummary[] }>(
    '/dispatch-intelligence/recommendations',
    { accessToken },
  );
  return data.recommendations;
}

export async function generateDispatchRecommendations(accessToken: string) {
  const data = await request<{ recommendations: DispatchRecommendationSummary[] }>(
    '/dispatch-intelligence/recommendations/generate',
    { accessToken, method: 'POST', body: {} },
  );
  return data.recommendations;
}

export async function fetchCallbackQueue(accessToken: string) {
  const data = await request<{ callbacks: DispatchCallbackRequestSummary[] }>(
    '/dispatch-intelligence/callbacks',
    {
      accessToken,
    },
  );
  return data.callbacks;
}

export async function fetchEmergencyAssessments(accessToken: string) {
  const data = await request<{ assessments: DispatchEmergencyAssessmentSummary[] }>(
    '/dispatch-intelligence/emergency',
    { accessToken },
  );
  return data.assessments;
}

export async function fetchDispatchActions(accessToken: string) {
  const data = await request<{ actions: DispatchActionSummary[] }>(
    '/dispatch-intelligence/actions',
    { accessToken },
  );
  return data.actions;
}

export async function fetchReceptionistSummaries(accessToken: string) {
  const data = await request<{ summaries: DispatchReceptionistSummaryRecord[] }>(
    '/dispatch-intelligence/receptionist',
    { accessToken },
  );
  return data.summaries;
}

export async function createDispatchCallback(
  accessToken: string,
  body: CreateDispatchCallbackRequest,
) {
  const data = await request<{ callback: DispatchCallbackRequestSummary }>(
    '/dispatch-intelligence/callbacks',
    {
      accessToken,
      method: 'POST',
      body,
    },
  );
  return data.callback;
}

export async function createDispatchAction(accessToken: string, body: CreateDispatchActionRequest) {
  const data = await request<{ action: DispatchActionSummary }>('/dispatch-intelligence/actions', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.action;
}

export async function createReceptionistSummary(
  accessToken: string,
  body: CreateDispatchReceptionistSummaryRequest,
) {
  const data = await request<{ summary: DispatchReceptionistSummaryRecord }>(
    '/dispatch-intelligence/receptionist',
    {
      accessToken,
      method: 'POST',
      body,
    },
  );
  return data.summary;
}

export async function createEmergencyAssessment(
  accessToken: string,
  body: CreateDispatchEmergencyAssessmentRequest,
) {
  const data = await request<{ assessment: DispatchEmergencyAssessmentSummary }>(
    '/dispatch-intelligence/emergency',
    {
      accessToken,
      method: 'POST',
      body,
    },
  );
  return data.assessment;
}
