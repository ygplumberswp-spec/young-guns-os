import type {
  CreateMktAgentCampaignRequest,
  CreateMktAgentContentDraftRequest,
  CreateMktAgentGoalRequest,
  CreateMktAgentRecommendationRequest,
  DecideMktAgentDraftRequest,
  DecideMktAgentRecommendationRequest,
  GenerateMktAgentContentRequest,
  MktAgentAnalytics,
  MktAgentCampaignSummary,
  MktAgentContentDraftSummary,
  MktAgentDashboard,
  MktAgentGoalSummary,
  MktAgentRecommendationSummary,
  RequestMktAgentPublishRequest,
  UpdateMktAgentCampaignRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as MarketingAgentApiClientError };

export async function fetchMktAgentDashboard(accessToken: string) {
  const data = await request<{ dashboard: MktAgentDashboard }>(
    '/marketing-agent/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function fetchMktAgentAnalytics(accessToken: string) {
  const data = await request<{ analytics: MktAgentAnalytics }>(
    '/marketing-agent/analytics',
    { accessToken },
  );
  return data.analytics;
}

export async function createMktAgentCampaign(
  accessToken: string,
  body: CreateMktAgentCampaignRequest,
) {
  const data = await request<{ campaign: MktAgentCampaignSummary }>(
    '/marketing-agent/campaigns',
    { method: 'POST', accessToken, body },
  );
  return data.campaign;
}

export async function updateMktAgentCampaign(
  accessToken: string,
  campaignId: string,
  body: UpdateMktAgentCampaignRequest,
) {
  const data = await request<{ campaign: MktAgentCampaignSummary }>(
    `/marketing-agent/campaigns/${campaignId}`,
    { method: 'PATCH', accessToken, body },
  );
  return data.campaign;
}

export async function createMktAgentContentDraft(
  accessToken: string,
  body: CreateMktAgentContentDraftRequest,
) {
  const data = await request<{ draft: MktAgentContentDraftSummary }>(
    '/marketing-agent/content-drafts',
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function generateMktAgentContent(
  accessToken: string,
  body: GenerateMktAgentContentRequest,
) {
  const data = await request<{ draft: MktAgentContentDraftSummary }>(
    '/marketing-agent/content-drafts/generate',
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function decideMktAgentDraft(
  accessToken: string,
  draftId: string,
  body: DecideMktAgentDraftRequest,
) {
  const data = await request<{ draft: MktAgentContentDraftSummary }>(
    `/marketing-agent/content-drafts/${draftId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function requestMktAgentPublish(
  accessToken: string,
  draftId: string,
  body: RequestMktAgentPublishRequest = {},
) {
  const data = await request<{
    draft: MktAgentContentDraftSummary;
    published: false;
    gated: true;
    reason: string;
  }>(`/marketing-agent/content-drafts/${draftId}/publish`, {
    method: 'POST',
    accessToken,
    body,
  });
  return data;
}

export async function createMktAgentGoal(accessToken: string, body: CreateMktAgentGoalRequest) {
  const data = await request<{ goal: MktAgentGoalSummary }>('/marketing-agent/goals', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.goal;
}

export async function createMktAgentRecommendation(
  accessToken: string,
  body: CreateMktAgentRecommendationRequest,
) {
  const data = await request<{ recommendation: MktAgentRecommendationSummary }>(
    '/marketing-agent/recommendations',
    { method: 'POST', accessToken, body },
  );
  return data.recommendation;
}

export async function decideMktAgentRecommendation(
  accessToken: string,
  recommendationId: string,
  body: DecideMktAgentRecommendationRequest,
) {
  const data = await request<{ recommendation: MktAgentRecommendationSummary }>(
    `/marketing-agent/recommendations/${recommendationId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.recommendation;
}
