import type {
  AcknowledgeViInsightRequest,
  CreateViAuraInsightRequest,
  DecideViInsightDraftRequest,
  RefreshViInsightsRequest,
  UpdateViSettingsRequest,
  ViAuraInsightSummary,
  ViDashboard,
  ViInsightDraftSummary,
  ViSettings,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as VehicleIntelligenceApiClientError };

export async function fetchViDashboard(accessToken: string) {
  const data = await request<{ dashboard: ViDashboard }>('/vehicle-intelligence/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function refreshViInsights(
  accessToken: string,
  body: RefreshViInsightsRequest = {},
) {
  const data = await request<{ created: number; drafts: ViInsightDraftSummary[] }>(
    '/vehicle-intelligence/insights/refresh',
    { method: 'POST', accessToken, body },
  );
  return data;
}

export async function decideViInsightDraft(
  accessToken: string,
  draftId: string,
  body: DecideViInsightDraftRequest,
) {
  const data = await request<{ draft: ViInsightDraftSummary }>(
    `/vehicle-intelligence/insights/${draftId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function updateViSettings(accessToken: string, body: UpdateViSettingsRequest) {
  const data = await request<{ settings: ViSettings }>('/vehicle-intelligence/settings', {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.settings;
}

export async function createViAuraInsight(
  accessToken: string,
  body: CreateViAuraInsightRequest,
) {
  const data = await request<{ insight: ViAuraInsightSummary }>(
    '/vehicle-intelligence/aura-insights',
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function acknowledgeViInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgeViInsightRequest,
) {
  const data = await request<{ insight: ViAuraInsightSummary }>(
    `/vehicle-intelligence/aura-insights/${insightId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}
