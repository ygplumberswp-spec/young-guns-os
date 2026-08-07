import type {
  AcknowledgeEcInsightRequest,
  CreateEcActionDraftRequest,
  CreateEcInsightRequest,
  DecideEcActionRequest,
  EcActionDraftSummary,
  EcDashboard,
  EcInsightSummary,
  EcSettings,
  RefreshEcInsightsRequest,
  UpdateEcSettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as ExecutiveCommandCentreApiClientError };

export async function fetchEcDashboard(accessToken: string) {
  const data = await request<{ dashboard: EcDashboard }>('/executive-command-centre/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function fetchEcSettings(accessToken: string) {
  const data = await request<{ settings: EcSettings }>('/executive-command-centre/settings', {
    accessToken,
  });
  return data.settings;
}

export async function updateEcSettings(accessToken: string, body: UpdateEcSettingsRequest) {
  const data = await request<{ settings: EcSettings }>('/executive-command-centre/settings', {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.settings;
}

export async function fetchEcActionDrafts(accessToken: string) {
  const data = await request<{ actions: EcActionDraftSummary[] }>(
    '/executive-command-centre/actions',
    { accessToken },
  );
  return data.actions;
}

export async function createEcActionDraft(
  accessToken: string,
  body: CreateEcActionDraftRequest,
) {
  const data = await request<{ action: EcActionDraftSummary }>(
    '/executive-command-centre/actions',
    { method: 'POST', accessToken, body },
  );
  return data.action;
}

export async function refreshEcActionDrafts(
  accessToken: string,
  body: RefreshEcInsightsRequest = {},
) {
  const data = await request<{ actions: EcActionDraftSummary[] }>(
    '/executive-command-centre/actions/refresh',
    { method: 'POST', accessToken, body },
  );
  return data.actions;
}

export async function decideEcActionDraft(
  accessToken: string,
  actionId: string,
  body: DecideEcActionRequest,
) {
  const data = await request<{ action: EcActionDraftSummary }>(
    `/executive-command-centre/actions/${actionId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.action;
}

export async function fetchEcInsights(accessToken: string) {
  const data = await request<{ insights: EcInsightSummary[] }>(
    '/executive-command-centre/insights',
    { accessToken },
  );
  return data.insights;
}

export async function createEcInsight(accessToken: string, body: CreateEcInsightRequest) {
  const data = await request<{ insight: EcInsightSummary }>(
    '/executive-command-centre/insights',
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function acknowledgeEcInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgeEcInsightRequest,
) {
  const data = await request<{ insight: EcInsightSummary }>(
    `/executive-command-centre/insights/${insightId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}
