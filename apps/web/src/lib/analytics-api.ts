import type {
  AnalyticsDashboard,
  AnalyticsDashboardQuery,
  AnalyticsPeriod,
  AnalyticsReportingWorkspace,
  AnalyticsTrends,
  CustomerAnalytics,
  FinanceAnalytics,
  GenerateReportRequest,
  JobProfitabilityAnalytics,
  ReportDefinitionSummary,
  ReportRunDetail,
  ReportRunSummary,
  TechnicianPerformanceAnalytics,
} from '@titan/shared';
import { request } from './api-client';

function buildQuery(query: AnalyticsDashboardQuery = {}): string {
  const params = new URLSearchParams();
  if (query.period) params.set('period', query.period);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

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

export async function fetchReportingWorkspace(
  accessToken: string,
  query: AnalyticsDashboardQuery = {},
  options?: AnalyticsRequestOptions,
): Promise<AnalyticsReportingWorkspace> {
  const data = await request<{ workspace: AnalyticsReportingWorkspace }>(
    `/analytics/reporting-workspace${buildQuery(query)}`,
    { accessToken, ...requestOptions(options) },
  );
  return data.workspace;
}

export async function fetchAnalyticsDashboard(
  accessToken: string,
  query: AnalyticsDashboardQuery = {},
  options?: AnalyticsRequestOptions,
): Promise<AnalyticsDashboard> {
  const data = await request<{ dashboard: AnalyticsDashboard }>(
    `/analytics/dashboard${buildQuery(query)}`,
    { accessToken, ...requestOptions(options) },
  );
  return data.dashboard;
}

export async function fetchAnalyticsTrends(
  accessToken: string,
  query: AnalyticsDashboardQuery = {},
  options?: AnalyticsRequestOptions,
): Promise<AnalyticsTrends> {
  const data = await request<{ trends: AnalyticsTrends }>(`/analytics/trends${buildQuery(query)}`, {
    accessToken,
    ...requestOptions(options),
  });
  return data.trends;
}

export async function fetchJobProfitability(
  accessToken: string,
  query: AnalyticsDashboardQuery = {},
  options?: AnalyticsRequestOptions,
): Promise<JobProfitabilityAnalytics> {
  const data = await request<{ profitability: JobProfitabilityAnalytics }>(
    `/analytics/profitability${buildQuery(query)}`,
    { accessToken, ...requestOptions(options) },
  );
  return data.profitability;
}

export async function fetchTechnicianPerformance(
  accessToken: string,
  query: AnalyticsDashboardQuery = {},
  options?: AnalyticsRequestOptions,
): Promise<TechnicianPerformanceAnalytics> {
  const data = await request<{ technicians: TechnicianPerformanceAnalytics }>(
    `/analytics/technicians${buildQuery(query)}`,
    { accessToken, ...requestOptions(options) },
  );
  return data.technicians;
}

export async function fetchCustomerAnalytics(
  accessToken: string,
  query: AnalyticsDashboardQuery = {},
  options?: AnalyticsRequestOptions,
): Promise<CustomerAnalytics> {
  const data = await request<{ customers: CustomerAnalytics }>(
    `/analytics/customers${buildQuery(query)}`,
    { accessToken, ...requestOptions(options) },
  );
  return data.customers;
}

export async function fetchFinanceAnalytics(
  accessToken: string,
  query: AnalyticsDashboardQuery = {},
  options?: AnalyticsRequestOptions,
): Promise<FinanceAnalytics> {
  const data = await request<{ finance: FinanceAnalytics }>(
    `/analytics/finance${buildQuery(query)}`,
    {
      accessToken,
      ...requestOptions(options),
    },
  );
  return data.finance;
}

export async function fetchReportCatalog(
  accessToken: string,
  options?: AnalyticsRequestOptions,
): Promise<{
  definitions: ReportDefinitionSummary[];
  runs: ReportRunSummary[];
}> {
  return request<{ definitions: ReportDefinitionSummary[]; runs: ReportRunSummary[] }>(
    '/analytics/reports',
    { accessToken, ...requestOptions(options) },
  );
}

export async function fetchReportRun(accessToken: string, runId: string): Promise<ReportRunDetail> {
  const data = await request<{ run: ReportRunDetail }>(`/analytics/reports/${runId}`, {
    accessToken,
  });
  return data.run;
}

export async function generateAnalyticsReport(
  accessToken: string,
  body: GenerateReportRequest,
): Promise<ReportRunDetail> {
  const data = await request<{ run: ReportRunDetail }>('/analytics/reports/generate', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.run;
}

export type { AnalyticsPeriod };
