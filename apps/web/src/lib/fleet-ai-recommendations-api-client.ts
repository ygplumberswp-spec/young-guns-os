import type {
  AcknowledgeFarInsightRequest,
  CreateFarAuraInsightRequest,
  DecideFarRecommendationRequest,
  FarAuraInsightSummary,
  FarDashboard,
  FarRecommendationDraftSummary,
  FarSettings,
  RefreshFarRecommendationsRequest,
  UpdateFarSettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as FleetAiRecommendationsApiClientError };

export async function fetchFarDashboard(accessToken: string) {
  const data = await request<{ dashboard: FarDashboard }>('/fleet-ai-recommendations/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function refreshFarRecommendations(
  accessToken: string,
  body: RefreshFarRecommendationsRequest = {},
) {
  const data = await request<{ created: number; drafts: FarRecommendationDraftSummary[] }>(
    '/fleet-ai-recommendations/recommendations/refresh',
    { method: 'POST', accessToken, body },
  );
  return data;
}

export async function decideFarRecommendation(
  accessToken: string,
  draftId: string,
  body: DecideFarRecommendationRequest,
) {
  const data = await request<{ draft: FarRecommendationDraftSummary }>(
    `/fleet-ai-recommendations/recommendations/${draftId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function updateFarSettings(accessToken: string, body: UpdateFarSettingsRequest) {
  const data = await request<{ settings: FarSettings }>('/fleet-ai-recommendations/settings', {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.settings;
}

export async function createFarAuraInsight(
  accessToken: string,
  body: CreateFarAuraInsightRequest,
) {
  const data = await request<{ insight: FarAuraInsightSummary }>(
    '/fleet-ai-recommendations/aura-insights',
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function acknowledgeFarInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgeFarInsightRequest,
) {
  const data = await request<{ insight: FarAuraInsightSummary }>(
    `/fleet-ai-recommendations/aura-insights/${insightId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}
