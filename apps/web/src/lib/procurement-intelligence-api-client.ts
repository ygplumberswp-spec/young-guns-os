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
import { request, ApiClientError } from './api-client';

export { ApiClientError as ProcurementIntelligenceApiClientError };

export async function fetchPiDashboard(accessToken: string): Promise<PiDashboard> {
  const res = await request<{ dashboard: PiDashboard }>(
    '/procurement-intelligence/dashboard',
    { method: 'GET', accessToken },
  );
  return res.dashboard;
}

export async function refreshPiRecommendations(
  accessToken: string,
  body: RefreshPiRecommendationsRequest = {},
): Promise<{ created: number; recommendations: PiPurchaseRecommendationSummary[] }> {
  return request('/procurement-intelligence/recommendations/refresh', {
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
  const res = await request<{ recommendation: PiPurchaseRecommendationSummary }>(
    `/procurement-intelligence/recommendations/${recommendationId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return res.recommendation;
}

export async function refreshPiCostComparisons(
  accessToken: string,
  body: RefreshPiCostComparisonsRequest = {},
) {
  return request('/procurement-intelligence/cost-comparisons/refresh', {
    method: 'POST',
    accessToken,
    body,
  });
}

export async function updatePiSettings(
  accessToken: string,
  body: UpdatePiSettingsRequest,
): Promise<PiSettings> {
  const res = await request<{ settings: PiSettings }>(
    '/procurement-intelligence/settings',
    { method: 'PATCH', accessToken, body },
  );
  return res.settings;
}

export async function createPiAuraInsight(
  accessToken: string,
  body: CreatePiAuraInsightRequest,
) {
  return request('/procurement-intelligence/aura-insights', {
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
  return request(`/procurement-intelligence/aura-insights/${insightId}/acknowledge`, {
    method: 'POST',
    accessToken,
    body,
  });
}
