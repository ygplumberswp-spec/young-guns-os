import type {
  AcknowledgeSaiInsightRequest,
  CreateSaiAuraInsightRequest,
  DecideSaiInsightRequest,
  RefreshSaiInsightsRequest,
  SaiAnalyticsSnapshotSummary,
  SaiAuraInsightSummary,
  SaiInsightDraftSummary,
  SaiOwnerDashboard,
  SaiSettings,
  UpdateSaiSettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as SalesAnalyticsIntelligenceApiClientError };

export async function fetchSaiDashboard(accessToken: string) {
  const data = await request<{ dashboard: SaiOwnerDashboard }>(
    '/sales-analytics-intelligence/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function captureSaiSnapshot(accessToken: string) {
  const data = await request<{ snapshot: SaiAnalyticsSnapshotSummary }>(
    '/sales-analytics-intelligence/snapshots/capture',
    { method: 'POST', accessToken, body: {} },
  );
  return data.snapshot;
}

export async function refreshSaiInsights(
  accessToken: string,
  body: RefreshSaiInsightsRequest = {},
) {
  const data = await request<{ created: number; drafts: SaiInsightDraftSummary[] }>(
    '/sales-analytics-intelligence/insights/refresh',
    { method: 'POST', accessToken, body },
  );
  return data;
}

export async function decideSaiInsight(
  accessToken: string,
  insightId: string,
  body: DecideSaiInsightRequest,
) {
  const data = await request<{ draft: SaiInsightDraftSummary }>(
    `/sales-analytics-intelligence/insights/${insightId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function updateSaiSettings(accessToken: string, body: UpdateSaiSettingsRequest) {
  const data = await request<{ settings: SaiSettings }>(
    '/sales-analytics-intelligence/settings',
    { method: 'PATCH', accessToken, body },
  );
  return data.settings;
}

export async function createSaiAuraInsight(
  accessToken: string,
  body: CreateSaiAuraInsightRequest,
) {
  const data = await request<{ insight: SaiAuraInsightSummary }>(
    '/sales-analytics-intelligence/aura-insights',
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function acknowledgeSaiInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgeSaiInsightRequest,
) {
  const data = await request<{ insight: SaiAuraInsightSummary }>(
    `/sales-analytics-intelligence/aura-insights/${insightId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}
