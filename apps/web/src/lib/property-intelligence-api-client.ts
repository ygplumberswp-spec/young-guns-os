import type {
  AcknowledgePriInsightRequest,
  CreatePriAuraInsightRequest,
  DecidePriInsightDraftRequest,
  PriAuraInsightSummary,
  PriDashboard,
  PriInsightDraftSummary,
  PriSettings,
  RefreshPriInsightsRequest,
  UpdatePriSettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as PropertyIntelligenceApiClientError };

export async function fetchPriDashboard(accessToken: string) {
  const data = await request<{ dashboard: PriDashboard }>('/property-intelligence/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function refreshPriInsights(
  accessToken: string,
  body: RefreshPriInsightsRequest = {},
) {
  const data = await request<{ created: number; drafts: PriInsightDraftSummary[] }>(
    '/property-intelligence/insights/refresh',
    { method: 'POST', accessToken, body },
  );
  return data;
}

export async function decidePriInsightDraft(
  accessToken: string,
  draftId: string,
  body: DecidePriInsightDraftRequest,
) {
  const data = await request<{ draft: PriInsightDraftSummary }>(
    `/property-intelligence/insights/${draftId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function updatePriSettings(accessToken: string, body: UpdatePriSettingsRequest) {
  const data = await request<{ settings: PriSettings }>('/property-intelligence/settings', {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.settings;
}

export async function createPriAuraInsight(
  accessToken: string,
  body: CreatePriAuraInsightRequest,
) {
  const data = await request<{ insight: PriAuraInsightSummary }>(
    '/property-intelligence/aura-insights',
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function acknowledgePriInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgePriInsightRequest,
) {
  const data = await request<{ insight: PriAuraInsightSummary }>(
    `/property-intelligence/aura-insights/${insightId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}
