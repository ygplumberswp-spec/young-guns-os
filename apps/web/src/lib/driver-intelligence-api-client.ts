import type {
  AcknowledgeDriInsightRequest,
  CreateDriAuraInsightRequest,
  DecideDriRecommendationRequest,
  DriAuraInsightSummary,
  DriDashboard,
  DriRecommendationSummary,
  DriSettings,
  RefreshDriRecommendationsRequest,
  UpdateDriSettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as DriverIntelligenceApiClientError };

export async function fetchDriDashboard(accessToken: string) {
  const data = await request<{ dashboard: DriDashboard }>('/driver-intelligence/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function refreshDiRecommendations(
  accessToken: string,
  body: RefreshDriRecommendationsRequest = {},
) {
  const data = await request<{ created: number; recommendations: DriRecommendationSummary[] }>(
    '/driver-intelligence/recommendations/refresh',
    { method: 'POST', accessToken, body },
  );
  return data;
}

export async function decideDiRecommendation(
  accessToken: string,
  recommendationId: string,
  body: DecideDriRecommendationRequest,
) {
  const data = await request<{ recommendation: DriRecommendationSummary }>(
    `/driver-intelligence/recommendations/${recommendationId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.recommendation;
}

export async function updateDriSettings(accessToken: string, body: UpdateDriSettingsRequest) {
  const data = await request<{ settings: DriSettings }>('/driver-intelligence/settings', {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.settings;
}

export async function createDiAuraInsight(
  accessToken: string,
  body: CreateDriAuraInsightRequest,
) {
  const data = await request<{ insight: DriAuraInsightSummary }>(
    '/driver-intelligence/aura-insights',
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function acknowledgeDiInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgeDriInsightRequest,
) {
  const data = await request<{ insight: DriAuraInsightSummary }>(
    `/driver-intelligence/aura-insights/${insightId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}
