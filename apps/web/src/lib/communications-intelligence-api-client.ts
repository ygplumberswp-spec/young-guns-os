import type {
  CommIntelAnalyticsDashboard,
  CommIntelCallSummary,
  CommIntelDraftActionSummary,
  CommIntelEmailThreadSummary,
  CommIntelSmsRecordSummary,
  CommIntelTimelineEntry,
  CommIntelUnifiedDashboard,
  CreateCommIntelDraftActionRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as CommunicationsIntelligenceApiClientError };

export async function fetchCommunicationsIntelligenceDashboard(accessToken: string) {
  const data = await request<{ dashboard: CommIntelUnifiedDashboard }>(
    '/communications-intelligence/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function fetchCommunicationsIntelligenceAnalytics(accessToken: string) {
  const data = await request<{ analytics: CommIntelAnalyticsDashboard }>(
    '/communications-intelligence/analytics',
    { accessToken },
  );
  return data.analytics;
}

export async function fetchCommunicationsTimeline(accessToken: string, customerId?: string) {
  const query = customerId ? `?customerId=${encodeURIComponent(customerId)}` : '';
  const data = await request<{ timeline: CommIntelTimelineEntry[] }>(
    `/communications-intelligence/timeline${query}`,
    { accessToken },
  );
  return data.timeline;
}

export async function fetchCommunicationsCallHistory(accessToken: string) {
  const data = await request<{ calls: CommIntelCallSummary[] }>('/communications-intelligence/calls', {
    accessToken,
  });
  return data.calls;
}

export async function fetchCommunicationsEmailThreads(accessToken: string) {
  const data = await request<{ threads: CommIntelEmailThreadSummary[] }>(
    '/communications-intelligence/email-threads',
    { accessToken },
  );
  return data.threads;
}

export async function fetchCommunicationsSmsRecords(accessToken: string) {
  const data = await request<{ records: CommIntelSmsRecordSummary[] }>(
    '/communications-intelligence/sms',
    { accessToken },
  );
  return data.records;
}

export async function fetchCommunicationsDrafts(accessToken: string) {
  const data = await request<{ drafts: CommIntelDraftActionSummary[] }>(
    '/communications-intelligence/drafts',
    { accessToken },
  );
  return data.drafts;
}

export async function createCommunicationsDraft(
  accessToken: string,
  body: CreateCommIntelDraftActionRequest,
) {
  const data = await request<{ draft: CommIntelDraftActionSummary }>(
    '/communications-intelligence/drafts',
    { accessToken, method: 'POST', body },
  );
  return data.draft;
}
