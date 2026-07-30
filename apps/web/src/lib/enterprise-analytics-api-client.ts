import type {
  AnalyticsGovernanceSummary,
  AnalyticsPlatformActionSummary,
  AnalyticsSavedLayoutSummary,
  AnalyticsWarehouseSummary,
  CreateAnalyticsPlatformActionRequest,
  EnterpriseAnalyticsExecutiveDashboard,
  RunAnalyticsAggregationRequest,
} from '@titan/shared';
import type {
  BiReportTemplateSummary,
  BusinessInsightSummary,
  BusinessKpiSummary,
  BusinessReportSummary,
  PredictiveForecastSummary,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as EnterpriseAnalyticsApiClientError };

const ANALYTICS_REQUEST_TIMEOUT_MS = 20_000;

type AnalyticsRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

function requestOptions(options?: AnalyticsRequestOptions) {
  return {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs ?? ANALYTICS_REQUEST_TIMEOUT_MS,
  };
}

export async function fetchEnterpriseAnalyticsDashboard(
  accessToken: string,
  options?: AnalyticsRequestOptions,
) {
  const data = await request<{ dashboard: EnterpriseAnalyticsExecutiveDashboard }>(
    '/enterprise-analytics/dashboard',
    { accessToken, ...requestOptions(options) },
  );
  return data.dashboard;
}

export async function fetchAnalyticsWarehouse(accessToken: string) {
  const data = await request<{ warehouse: AnalyticsWarehouseSummary }>('/enterprise-analytics/warehouse', {
    accessToken,
  });
  return data.warehouse;
}

export async function runAnalyticsAggregation(accessToken: string, body: RunAnalyticsAggregationRequest = {}) {
  const data = await request<{ snapshots: AnalyticsWarehouseSummary['snapshots'] }>(
    '/enterprise-analytics/aggregate',
    { accessToken, method: 'POST', body },
  );
  return data.snapshots;
}

export async function fetchAnalyticsGovernance(accessToken: string) {
  const data = await request<{ governance: AnalyticsGovernanceSummary }>('/enterprise-analytics/governance', {
    accessToken,
  });
  return data.governance;
}

export async function fetchAnalyticsPlatformActions(accessToken: string) {
  const data = await request<{ actions: AnalyticsPlatformActionSummary[] }>('/enterprise-analytics/actions', {
    accessToken,
  });
  return data.actions;
}

export async function createAnalyticsPlatformAction(
  accessToken: string,
  body: CreateAnalyticsPlatformActionRequest,
) {
  const data = await request<{ action: AnalyticsPlatformActionSummary }>('/enterprise-analytics/actions', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.action;
}

export async function fetchAnalyticsSavedLayouts(accessToken: string) {
  const data = await request<{ layouts: AnalyticsSavedLayoutSummary[] }>('/enterprise-analytics/layouts', {
    accessToken,
  });
  return data.layouts;
}

export async function fetchBusinessKpis(accessToken: string, options?: AnalyticsRequestOptions) {
  const data = await request<{ kpis: BusinessKpiSummary[] }>('/business-intelligence/kpis', {
    accessToken,
    ...requestOptions(options),
  });
  return data.kpis;
}

export async function fetchBusinessInsights(accessToken: string, options?: AnalyticsRequestOptions) {
  const data = await request<{ insights: BusinessInsightSummary[] }>('/business-intelligence/insights', {
    accessToken,
    ...requestOptions(options),
  });
  return data.insights;
}

export async function generateBusinessInsights(accessToken: string) {
  const data = await request<{ insights: BusinessInsightSummary[] }>('/business-intelligence/insights/generate', {
    accessToken,
    method: 'POST',
  });
  return data.insights;
}

export async function fetchPredictiveForecasts(accessToken: string, options?: AnalyticsRequestOptions) {
  const data = await request<{ forecasts: PredictiveForecastSummary[] }>('/business-intelligence/forecasts', {
    accessToken,
    ...requestOptions(options),
  });
  return data.forecasts;
}

export async function fetchBusinessReports(accessToken: string) {
  const data = await request<{ reports: BusinessReportSummary[] }>('/business-intelligence/reports', { accessToken });
  return data.reports;
}

export async function fetchReportTemplates(accessToken: string) {
  const data = await request<{ templates: BiReportTemplateSummary[] }>('/business-intelligence/report-templates', {
    accessToken,
  });
  return data.templates;
}

export async function generateKpiSnapshots(accessToken: string) {
  const data = await request<{ snapshots: unknown[] }>('/business-intelligence/kpis/snapshots/generate', {
    accessToken,
    method: 'POST',
    body: {},
  });
  return data.snapshots;
}
