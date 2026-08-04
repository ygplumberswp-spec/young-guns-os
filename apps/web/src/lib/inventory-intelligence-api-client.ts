import type {
  AcknowledgeInvIntelInsightRequest,
  CreateInvIntelAuraInsightRequest,
  DecideInvIntelAlertRequest,
  InvIntelAlertDraftSummary,
  InvIntelAuraInsightSummary,
  InvIntelDashboard,
  InvIntelSettings,
  InvIntelUsageSignalSummary,
  RefreshInvIntelAlertsRequest,
  RefreshInvIntelUsageRequest,
  UpdateInvIntelSettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as InventoryIntelligenceApiClientError };

export async function fetchInvIntelDashboard(accessToken: string) {
  const data = await request<{ dashboard: InvIntelDashboard }>(
    '/inventory-intelligence/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function refreshInvIntelAlerts(
  accessToken: string,
  body: RefreshInvIntelAlertsRequest = {},
) {
  const data = await request<{ created: number; alerts: InvIntelAlertDraftSummary[] }>(
    '/inventory-intelligence/alerts/refresh',
    { method: 'POST', accessToken, body },
  );
  return data;
}

export async function decideInvIntelAlert(
  accessToken: string,
  alertId: string,
  body: DecideInvIntelAlertRequest,
) {
  const data = await request<{ alert: InvIntelAlertDraftSummary }>(
    `/inventory-intelligence/alerts/${alertId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.alert;
}

export async function refreshInvIntelUsage(
  accessToken: string,
  body: RefreshInvIntelUsageRequest = {},
) {
  const data = await request<{ created: number; signals: InvIntelUsageSignalSummary[] }>(
    '/inventory-intelligence/usage/refresh',
    { method: 'POST', accessToken, body },
  );
  return data;
}

export async function updateInvIntelSettings(
  accessToken: string,
  body: UpdateInvIntelSettingsRequest,
) {
  const data = await request<{ settings: InvIntelSettings }>(
    '/inventory-intelligence/settings',
    { method: 'PATCH', accessToken, body },
  );
  return data.settings;
}

export async function createInvIntelAuraInsight(
  accessToken: string,
  body: CreateInvIntelAuraInsightRequest,
) {
  const data = await request<{ insight: InvIntelAuraInsightSummary }>(
    '/inventory-intelligence/aura-insights',
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function acknowledgeInvIntelInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgeInvIntelInsightRequest,
) {
  const data = await request<{ insight: InvIntelAuraInsightSummary }>(
    `/inventory-intelligence/aura-insights/${insightId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}
