import type {
  AcknowledgeFcpInsightRequest,
  CreateFcpActionRequest,
  DecideFcpActionRequest,
  FcpActionSummary,
  FcpCashflowIntelligence,
  FcpDashboard,
  FcpInsightSummary,
  FcpProfitIntelligence,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as FinanceCashflowProfitApiClientError };

export async function fetchFcpDashboard(accessToken: string) {
  const data = await request<{ dashboard: FcpDashboard }>('/finance-cashflow-profit/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function fetchFcpCashflow(accessToken: string) {
  const data = await request<{ cashflow: FcpCashflowIntelligence }>(
    '/finance-cashflow-profit/cashflow',
    { accessToken },
  );
  return data.cashflow;
}

export async function fetchFcpProfit(accessToken: string) {
  const data = await request<{ profit: FcpProfitIntelligence }>('/finance-cashflow-profit/profit', {
    accessToken,
  });
  return data.profit;
}

export async function refreshFcpInsights(accessToken: string) {
  const data = await request<{ insights: FcpInsightSummary[] }>(
    '/finance-cashflow-profit/insights/refresh',
    { method: 'POST', accessToken, body: {} },
  );
  return data.insights;
}

export async function acknowledgeFcpInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgeFcpInsightRequest,
) {
  const data = await request<{ insight: FcpInsightSummary }>(
    `/finance-cashflow-profit/insights/${insightId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function generateFcpActions(accessToken: string) {
  const data = await request<{ actions: FcpActionSummary[] }>(
    '/finance-cashflow-profit/actions/generate',
    { method: 'POST', accessToken, body: {} },
  );
  return data.actions;
}

export async function createFcpAction(accessToken: string, body: CreateFcpActionRequest) {
  const data = await request<{ action: FcpActionSummary }>('/finance-cashflow-profit/actions', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.action;
}

export async function decideFcpAction(
  accessToken: string,
  actionId: string,
  body: DecideFcpActionRequest,
) {
  const data = await request<{ action: FcpActionSummary }>(
    `/finance-cashflow-profit/actions/${actionId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.action;
}
