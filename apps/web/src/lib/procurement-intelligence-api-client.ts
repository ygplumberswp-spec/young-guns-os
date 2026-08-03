import type {
  AcknowledgePiInsightRequest,
  CreatePiAuraInsightRequest,
  DecidePiRecommendationRequest,
  PiDashboard,
  PiPurchaseRecommendationSummary,
  PiSettings,
  RefreshPiCostComparisonsRequest,
  RefreshPiRecommendationsRequest,
  UpdatePiSettingsRequest,
} from '@titan/shared';
import { apiRequest, ApiClientError } from './api-client';

export { ApiClientError as ProcurementIntelligenceApiClientError };

export async function fetchPiDashboard(accessToken: string): Promise<PiDashboard> {
  const res = await apiRequest<{ dashboard: PiDashboard }>(
    '/procurement-intelligence/dashboard',
    { method: 'GET', accessToken },
  );
  return res.dashboard;
}

export async function refreshPiRecommendations(
  accessToken: string,
  body: RefreshPiRecommendationsRequest = {},
): Promise<{ created: number; recommendations: PiPurchaseRecommendationSummary[] }> {
  return apiRequest('/procurement-intelligence/recommendations/refresh', {
    method: 'POST',
    accessToken,
    body,
  });
}

export async function decidePiRecommendation(
  accessToken: string,
  recommendationId: string,
  body: DecidePiRecommendationRequest,
): Promise<PiPurchaseRecommendationSummary> {
  const res = await apiRequest<{ recommendation: PiPurchaseRecommendationSummary }>(
    `/procurement-intelligence/recommendations/${recommendationId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return res.recommendation;
}

export async function refreshPiCostComparisons(
  accessToken: string,
  body: RefreshPiCostComparisonsRequest = {},
) {
  return apiRequest('/procurement-intelligence/cost-comparisons/refresh', {
    method: 'POST',
    accessToken,
    body,
  });
}

export async function updatePiSettings(
  accessToken: string,
  body: UpdatePiSettingsRequest,
): Promise<PiSettings> {
  const res = await apiRequest<{ settings: PiSettings }>(
    '/procurement-intelligence/settings',
    { method: 'PATCH', accessToken, body },
  );
  return res.settings;
}

export async function createPiAuraInsight(
  accessToken: string,
  body: CreatePiAuraInsightRequest,
) {
  return apiRequest('/procurement-intelligence/aura-insights', {
    method: 'POST',
    accessToken,
    body,
  });
}

export async function acknowledgePiInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgePiInsightRequest,
) {
  return apiRequest(`/procurement-intelligence/aura-insights/${insightId}/acknowledge`, {
    method: 'POST',
    accessToken,
    body,
  });
}
