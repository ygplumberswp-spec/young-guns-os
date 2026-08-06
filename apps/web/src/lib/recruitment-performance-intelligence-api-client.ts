import type {
  AcknowledgeRpiInsightRequest,
  CreateRpiAuraInsightRequest,
  CreateRpiCandidateRequest,
  CreateRpiHiringDraftRequest,
  CreateRpiInterviewDraftRequest,
  DecideRpiHiringDraftRequest,
  DecideRpiInterviewDraftRequest,
  DecideRpiRecommendationRequest,
  RefreshRpiRecommendationsRequest,
  RpiAuraInsightSummary,
  RpiCandidateSummary,
  RpiHiringDraftSummary,
  RpiInterviewDraftSummary,
  RpiOwnerDashboard,
  RpiRecommendationDraftSummary,
  RpiSelfPerformanceView,
  RpiSettings,
  UpdateRpiSettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as RecruitmentPerformanceIntelligenceApiClientError };

export async function fetchRpiDashboard(accessToken: string) {
  const data = await request<{ dashboard: RpiOwnerDashboard }>(
    '/recruitment-performance-intelligence/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function fetchRpiSelfPerformance(accessToken: string) {
  const data = await request<{ view: RpiSelfPerformanceView }>(
    '/recruitment-performance-intelligence/me',
    { accessToken },
  );
  return data.view;
}

export async function createRpiCandidate(
  accessToken: string,
  body: CreateRpiCandidateRequest,
) {
  const data = await request<{ candidate: RpiCandidateSummary }>(
    '/recruitment-performance-intelligence/candidates',
    { method: 'POST', accessToken, body },
  );
  return data.candidate;
}

export async function createRpiHiringDraft(
  accessToken: string,
  body: CreateRpiHiringDraftRequest,
) {
  const data = await request<{ draft: RpiHiringDraftSummary }>(
    '/recruitment-performance-intelligence/hiring-drafts',
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function decideRpiHiringDraft(
  accessToken: string,
  draftId: string,
  body: DecideRpiHiringDraftRequest,
) {
  const data = await request<{ draft: RpiHiringDraftSummary }>(
    `/recruitment-performance-intelligence/hiring-drafts/${draftId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function createRpiInterviewDraft(
  accessToken: string,
  body: CreateRpiInterviewDraftRequest,
) {
  const data = await request<{ draft: RpiInterviewDraftSummary }>(
    '/recruitment-performance-intelligence/interview-drafts',
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function decideRpiInterviewDraft(
  accessToken: string,
  draftId: string,
  body: DecideRpiInterviewDraftRequest,
) {
  const data = await request<{ draft: RpiInterviewDraftSummary }>(
    `/recruitment-performance-intelligence/interview-drafts/${draftId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function refreshRpiRecommendations(
  accessToken: string,
  body: RefreshRpiRecommendationsRequest = {},
) {
  const data = await request<{
    created: number;
    recommendations: RpiRecommendationDraftSummary[];
  }>('/recruitment-performance-intelligence/recommendations/refresh', {
    method: 'POST',
    accessToken,
    body,
  });
  return data;
}

export async function decideRpiRecommendation(
  accessToken: string,
  recommendationId: string,
  body: DecideRpiRecommendationRequest,
) {
  const data = await request<{ recommendation: RpiRecommendationDraftSummary }>(
    `/recruitment-performance-intelligence/recommendations/${recommendationId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.recommendation;
}

export async function updateRpiSettings(accessToken: string, body: UpdateRpiSettingsRequest) {
  const data = await request<{ settings: RpiSettings }>(
    '/recruitment-performance-intelligence/settings',
    { method: 'PATCH', accessToken, body },
  );
  return data.settings;
}

export async function createRpiAuraInsight(
  accessToken: string,
  body: CreateRpiAuraInsightRequest,
) {
  const data = await request<{ insight: RpiAuraInsightSummary }>(
    '/recruitment-performance-intelligence/aura-insights',
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function acknowledgeRpiInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgeRpiInsightRequest,
) {
  const data = await request<{ insight: RpiAuraInsightSummary }>(
    `/recruitment-performance-intelligence/aura-insights/${insightId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}