import type {
  AcknowledgePtiInsightRequest,
  CreatePtiAuraInsightRequest,
  DecidePtiInsightRequest,
  PtiAuraInsightSummary,
  PtiInsightDraftSummary,
  PtiOwnerDashboard,
  PtiSelfTimesheetView,
  PtiSettings,
  RefreshPtiInsightsRequest,
  UpdatePtiSettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as PayrollTimesheetIntelligenceApiClientError };

export async function fetchPtiDashboard(accessToken: string) {
  const data = await request<{ dashboard: PtiOwnerDashboard }>(
    '/payroll-timesheet-intelligence/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function fetchPtiSelfTimesheetView(accessToken: string) {
  const data = await request<{ view: PtiSelfTimesheetView }>(
    '/payroll-timesheet-intelligence/me',
    { accessToken },
  );
  return data.view;
}

export async function refreshPtiInsights(
  accessToken: string,
  body: RefreshPtiInsightsRequest = {},
) {
  const data = await request<{ created: number; drafts: PtiInsightDraftSummary[] }>(
    '/payroll-timesheet-intelligence/insights/refresh',
    { method: 'POST', accessToken, body },
  );
  return data;
}

export async function decidePtiInsight(
  accessToken: string,
  insightId: string,
  body: DecidePtiInsightRequest,
) {
  const data = await request<{ draft: PtiInsightDraftSummary }>(
    `/payroll-timesheet-intelligence/insights/${insightId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.draft;
}

export async function updatePtiSettings(accessToken: string, body: UpdatePtiSettingsRequest) {
  const data = await request<{ settings: PtiSettings }>(
    '/payroll-timesheet-intelligence/settings',
    { method: 'PATCH', accessToken, body },
  );
  return data.settings;
}

export async function createPtiAuraInsight(
  accessToken: string,
  body: CreatePtiAuraInsightRequest,
) {
  const data = await request<{ insight: PtiAuraInsightSummary }>(
    '/payroll-timesheet-intelligence/aura-insights',
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function acknowledgePtiInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgePtiInsightRequest,
) {
  const data = await request<{ insight: PtiAuraInsightSummary }>(
    `/payroll-timesheet-intelligence/aura-insights/${insightId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}
