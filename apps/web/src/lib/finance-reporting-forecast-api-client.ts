import type {
  AcknowledgeFrfInsightRequest,
  CreateFrfActionRequest,
  CreateFrfBudgetPlanRequest,
  CreateFrfInsightRequest,
  DecideFrfActionRequest,
  FrfActionSummary,
  FrfBudgetPlanSummary,
  FrfDashboard,
  FrfForecastResult,
  FrfForecastSnapshotSummary,
  FrfInsightSummary,
  FrfReportResult,
  FrfReportSnapshotSummary,
  GenerateFrfForecastRequest,
  GenerateFrfReportRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as FinanceReportingForecastApiClientError };

export async function fetchFrfDashboard(accessToken: string) {
  const data = await request<{ dashboard: FrfDashboard }>(
    '/finance-reporting-forecast/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function generateFrfReport(
  accessToken: string,
  body: GenerateFrfReportRequest,
) {
  return request<{
    report: FrfReportResult;
    snapshot: FrfReportSnapshotSummary | null;
    autoExecuted: false;
  }>('/finance-reporting-forecast/reports/generate', {
    method: 'POST',
    accessToken,
    body,
  });
}

export async function generateFrfForecast(
  accessToken: string,
  body: GenerateFrfForecastRequest,
) {
  return request<{
    forecast: FrfForecastResult;
    snapshot: FrfForecastSnapshotSummary | null;
    autoExecuted: false;
  }>('/finance-reporting-forecast/forecasts/generate', {
    method: 'POST',
    accessToken,
    body,
  });
}

export async function createFrfBudgetPlan(
  accessToken: string,
  body: CreateFrfBudgetPlanRequest,
) {
  const data = await request<{ budgetPlan: FrfBudgetPlanSummary }>(
    '/finance-reporting-forecast/budgets',
    { method: 'POST', accessToken, body },
  );
  return data.budgetPlan;
}

export async function refreshFrfInsights(accessToken: string) {
  const data = await request<{ insights: FrfInsightSummary[] }>(
    '/finance-reporting-forecast/insights/refresh',
    { method: 'POST', accessToken, body: {} },
  );
  return data.insights;
}

export async function createFrfInsight(
  accessToken: string,
  body: CreateFrfInsightRequest,
) {
  const data = await request<{ insight: FrfInsightSummary }>(
    '/finance-reporting-forecast/insights',
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function acknowledgeFrfInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgeFrfInsightRequest,
) {
  const data = await request<{ insight: FrfInsightSummary }>(
    `/finance-reporting-forecast/insights/${insightId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function generateFrfActions(accessToken: string) {
  const data = await request<{ actions: FrfActionSummary[] }>(
    '/finance-reporting-forecast/actions/generate',
    { method: 'POST', accessToken, body: {} },
  );
  return data.actions;
}

export async function createFrfAction(
  accessToken: string,
  body: CreateFrfActionRequest,
) {
  const data = await request<{ action: FrfActionSummary }>(
    '/finance-reporting-forecast/actions',
    { method: 'POST', accessToken, body },
  );
  return data.action;
}

export async function decideFrfAction(
  accessToken: string,
  actionId: string,
  body: DecideFrfActionRequest,
) {
  const data = await request<{ action: FrfActionSummary }>(
    `/finance-reporting-forecast/actions/${actionId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.action;
}
