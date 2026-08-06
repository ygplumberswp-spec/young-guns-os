import type {
  AcknowledgeSfInsightRequest,
  CreateSfAuraInsightRequest,
  DecideSfRecommendationRequest,
  RefreshSfForecastsRequest,
  SfAuraInsightSummary,
  SfDashboard,
  SfItemForecastSummary,
  SfReorderRecommendationSummary,
  SfSettings,
  UpdateSfSettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as StockForecastingApiClientError };

export async function fetchSfDashboard(accessToken: string) {
  const data = await request<{ dashboard: SfDashboard }>('/stock-forecasting/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function refreshSfForecasts(
  accessToken: string,
  body: RefreshSfForecastsRequest = {},
) {
  const data = await request<{
    createdForecasts: number;
    createdRecommendations: number;
    forecasts: SfItemForecastSummary[];
    recommendations: SfReorderRecommendationSummary[];
  }>('/stock-forecasting/forecasts/refresh', { method: 'POST', accessToken, body });
  return data;
}

export async function decideSfRecommendation(
  accessToken: string,
  recommendationId: string,
  body: DecideSfRecommendationRequest,
) {
  const data = await request<{ recommendation: SfReorderRecommendationSummary }>(
    `/stock-forecasting/recommendations/${recommendationId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.recommendation;
}

export async function updateSfSettings(accessToken: string, body: UpdateSfSettingsRequest) {
  const data = await request<{ settings: SfSettings }>('/stock-forecasting/settings', {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.settings;
}

export async function createSfAuraInsight(
  accessToken: string,
  body: CreateSfAuraInsightRequest,
) {
  const data = await request<{ insight: SfAuraInsightSummary }>(
    '/stock-forecasting/aura-insights',
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function acknowledgeSfInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgeSfInsightRequest,
) {
  const data = await request<{ insight: SfAuraInsightSummary }>(
    `/stock-forecasting/aura-insights/${insightId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}
