import type {
  AnalyticsDashboard,
  AnalyticsDashboardQuery,
  AnalyticsPeriod,
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

export async function fetchAnalyticsDashboard(
  accessToken: string,
  query: AnalyticsDashboardQuery = {},
): Promise<AnalyticsDashboard> {
  const data = await request<{ dashboard: AnalyticsDashboard }>(
    `/analytics/dashboard${buildQuery(query)}`,
    { accessToken },
  );
  return data.dashboard;
}

export async function fetchAnalyticsTrends(
  accessToken: string,
  query: AnalyticsDashboardQuery = {},
): Promise<AnalyticsTrends> {
  const data = await request<{ trends: AnalyticsTrends }>(`/analytics/trends${buildQuery(query)}`, {
    accessToken,
  });
  return data.trends;
}

export async function fetchJobProfitability(
  accessToken: string,
  query: AnalyticsDashboardQuery = {},
): Promise<JobProfitabilityAnalytics> {
  const data = await request<{ profitability: JobProfitabilityAnalytics }>(
    `/analytics/profitability${buildQuery(query)}`,
    { accessToken },
  );
  return data.profitability;
}

export async function fetchTechnicianPerformance(
  accessToken: string,
  query: AnalyticsDashboardQuery = {},
): Promise<TechnicianPerformanceAnalytics> {
  const data = await request<{ technicians: TechnicianPerformanceAnalytics }>(
    `/analytics/technicians${buildQuery(query)}`,
    { accessToken },
  );
  return data.technicians;
}

export async function fetchCustomerAnalytics(
  accessToken: string,
  query: AnalyticsDashboardQuery = {},
): Promise<CustomerAnalytics> {
  const data = await request<{ customers: CustomerAnalytics }>(
    `/analytics/customers${buildQuery(query)}`,
    { accessToken },
  );
  return data.customers;
}

export async function fetchFinanceAnalytics(
  accessToken: string,
  query: AnalyticsDashboardQuery = {},
): Promise<FinanceAnalytics> {
  const data = await request<{ finance: FinanceAnalytics }>(`/analytics/finance${buildQuery(query)}`, {
    accessToken,
  });
  return data.finance;
}

export async function fetchReportCatalog(accessToken: string): Promise<{
  definitions: ReportDefinitionSummary[];
  runs: ReportRunSummary[];
}> {
  return request<{ definitions: ReportDefinitionSummary[]; runs: ReportRunSummary[] }>(
    '/analytics/reports',
    { accessToken },
  );
}

export async function fetchReportRun(accessToken: string, runId: string): Promise<ReportRunDetail> {
  const data = await request<{ run: ReportRunDetail }>(`/analytics/reports/${runId}`, { accessToken });
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
