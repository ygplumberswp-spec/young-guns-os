import type {
  AnalyzeCiCallRequest,
  CiCustomerHistoryLookup,
  CiInsightsView,
  CiLeadDraftSummary,
  CiOwnerDashboard,
  DecideCiLeadDraftRequest,
  ExtractCiLeadDraftRequest,
  LookupCiCustomerHistoryRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as CallIntelligenceApiClientError };

export async function fetchCiDashboard(accessToken: string) {
  const data = await request<{ dashboard: CiOwnerDashboard }>('/call-intelligence/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function analyzeCiCall(accessToken: string, body: AnalyzeCiCallRequest) {
  return request<{
    summary: CiOwnerDashboard['recentSummaries'][number];
    sentiment: CiOwnerDashboard['sentimentOverview'];
    analysisId: string;
  }>('/call-intelligence/analyze', { method: 'POST', accessToken, body });
}

export async function lookupCiCustomerHistory(
  accessToken: string,
  body: LookupCiCustomerHistoryRequest,
) {
  const data = await request<{ history: CiCustomerHistoryLookup }>(
    '/call-intelligence/customer-history',
    { method: 'POST', accessToken, body },
  );
  return data.history;
}

export async function fetchCiInsights(accessToken: string) {
  const data = await request<{ insights: CiInsightsView }>('/call-intelligence/insights', {
    accessToken,
  });
  return data.insights;
}

export async function fetchCiLeadDrafts(accessToken: string) {
  const data = await request<{ drafts: CiLeadDraftSummary[] }>('/call-intelligence/lead-drafts', {
    accessToken,
  });
  return data.drafts;
}

export async function extractCiLeadDraft(accessToken: string, body: ExtractCiLeadDraftRequest) {
  const data = await request<{ draft: CiLeadDraftSummary }>('/call-intelligence/lead-drafts', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.draft;
}

export async function decideCiLeadDraft(
  accessToken: string,
  draftId: string,
  body: DecideCiLeadDraftRequest,
) {
  const data = await request<{ draft: CiLeadDraftSummary }>(
    `/call-intelligence/lead-drafts/${draftId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}
