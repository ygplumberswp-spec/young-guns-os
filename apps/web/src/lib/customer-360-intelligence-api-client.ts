import type {
  C360CustomerView,
  C360Dashboard,
  C360InsightDraft,
  C360Settings,
  DecideC360InsightRequest,
  RefreshC360InsightsRequest,
  UpdateC360SettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as Customer360IntelligenceApiClientError };

export async function fetchC360Dashboard(accessToken: string) {
  const data = await request<{ dashboard: C360Dashboard }>('/customer-360-intelligence/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function fetchC360Customer(accessToken: string, customerId: string) {
  const data = await request<{ customer360: C360CustomerView }>(
    `/customer-360-intelligence/customers/${customerId}`,
    { accessToken },
  );
  return data.customer360;
}

export async function refreshC360Insights(
  accessToken: string,
  body: RefreshC360InsightsRequest = {},
) {
  return request<{ created: number; insights: C360InsightDraft[] }>(
    '/customer-360-intelligence/insights/refresh',
    { method: 'POST', accessToken, body },
  );
}

export async function decideC360Insight(
  accessToken: string,
  insightId: string,
  body: DecideC360InsightRequest,
) {
  const data = await request<{ insight: C360InsightDraft }>(
    `/customer-360-intelligence/insights/${insightId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function updateC360Settings(accessToken: string, body: UpdateC360SettingsRequest) {
  const data = await request<{ settings: C360Settings }>(
    '/customer-360-intelligence/settings',
    { method: 'PATCH', accessToken, body },
  );
  return data.settings;
}
