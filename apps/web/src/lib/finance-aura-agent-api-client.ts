import type {
  AcknowledgeFinanceAuraAlertRequest,
  AskFinanceAuraQuestionRequest,
  CreateFinanceAuraRecommendationRequest,
  DecideFinanceAuraRecommendationRequest,
  FinanceAuraAgentDashboard,
  FinanceAuraAlertSummary,
  FinanceAuraBusinessContext,
  FinanceAuraInsightSummary,
  FinanceAuraQuestionAnswer,
  FinanceAuraRecommendationSummary,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as FinanceAuraAgentApiClientError };

export async function fetchFinanceAuraDashboard(accessToken: string) {
  const data = await request<{ dashboard: FinanceAuraAgentDashboard }>(
    '/finance-aura-agent/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function registerFinanceAuraAgent(accessToken: string) {
  const data = await request<{
    registry: { commandCentreStatus: string; note: string };
    autoExecuted: false;
  }>('/finance-aura-agent/register', {
    method: 'POST',
    accessToken,
    body: {},
  });
  return data;
}

export async function fetchFinanceAuraContext(accessToken: string) {
  const data = await request<{ context: FinanceAuraBusinessContext }>(
    '/finance-aura-agent/context',
    { accessToken },
  );
  return data.context;
}

export async function askFinanceAuraQuestion(
  accessToken: string,
  body: AskFinanceAuraQuestionRequest,
) {
  const data = await request<{ answer: FinanceAuraQuestionAnswer }>(
    '/finance-aura-agent/ask',
    { method: 'POST', accessToken, body },
  );
  return data.answer;
}

export async function createFinanceAuraRecommendation(
  accessToken: string,
  body: CreateFinanceAuraRecommendationRequest,
) {
  const data = await request<{ recommendation: FinanceAuraRecommendationSummary }>(
    '/finance-aura-agent/recommendations',
    { method: 'POST', accessToken, body },
  );
  return data.recommendation;
}

export async function generateFinanceAuraRecommendations(accessToken: string) {
  const data = await request<{ recommendations: FinanceAuraRecommendationSummary[] }>(
    '/finance-aura-agent/recommendations/generate',
    { method: 'POST', accessToken, body: {} },
  );
  return data.recommendations;
}

export async function decideFinanceAuraRecommendation(
  accessToken: string,
  recommendationId: string,
  body: DecideFinanceAuraRecommendationRequest,
) {
  const data = await request<{ recommendation: FinanceAuraRecommendationSummary }>(
    `/finance-aura-agent/recommendations/${recommendationId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.recommendation;
}

export async function refreshFinanceAuraInsights(accessToken: string) {
  const data = await request<{ insights: FinanceAuraInsightSummary[] }>(
    '/finance-aura-agent/insights/refresh',
    { method: 'POST', accessToken, body: {} },
  );
  return data.insights;
}

export async function refreshFinanceAuraAlerts(accessToken: string) {
  const data = await request<{ alerts: FinanceAuraAlertSummary[] }>(
    '/finance-aura-agent/alerts/refresh',
    { method: 'POST', accessToken, body: {} },
  );
  return data.alerts;
}

export async function acknowledgeFinanceAuraAlert(
  accessToken: string,
  alertId: string,
  body: AcknowledgeFinanceAuraAlertRequest = {},
) {
  const data = await request<{ alert: FinanceAuraAlertSummary }>(
    `/finance-aura-agent/alerts/${alertId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.alert;
}
