import type {
  AskSalesIntelligenceQuestionRequest,
  CreateSalesIntelligenceRecommendationRequest,
  DecideSalesIntelligenceRecommendationRequest,
  SalesIntelligenceAgentDashboard,
  SalesIntelligenceBusinessContext,
  SalesIntelligenceInsightSummary,
  SalesIntelligenceQuestionAnswer,
  SalesIntelligenceRecommendationSummary,
  SalesIntelligenceSignalSummary,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as SalesIntelligenceAgentApiClientError };

export async function fetchSalesIntelligenceDashboard(accessToken: string) {
  const data = await request<{ dashboard: SalesIntelligenceAgentDashboard }>(
    '/sales-intelligence-agent/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function registerSalesIntelligenceAgent(accessToken: string) {
  const data = await request<{
    registry: { commandCentreStatus: string; note: string };
    autoExecuted: false;
    outreachSent: false;
  }>('/sales-intelligence-agent/register', {
    method: 'POST',
    accessToken,
    body: {},
  });
  return data;
}

export async function fetchSalesIntelligenceContext(accessToken: string) {
  const data = await request<{ context: SalesIntelligenceBusinessContext }>(
    '/sales-intelligence-agent/context',
    { accessToken },
  );
  return data.context;
}

export async function askSalesIntelligenceQuestion(
  accessToken: string,
  body: AskSalesIntelligenceQuestionRequest,
) {
  const data = await request<{ answer: SalesIntelligenceQuestionAnswer }>(
    '/sales-intelligence-agent/ask',
    { method: 'POST', accessToken, body },
  );
  return data.answer;
}

export async function listSalesIntelligenceRecommendations(accessToken: string) {
  const data = await request<{ recommendations: SalesIntelligenceRecommendationSummary[] }>(
    '/sales-intelligence-agent/recommendations',
    { accessToken },
  );
  return data.recommendations;
}

export async function createSalesIntelligenceRecommendation(
  accessToken: string,
  body: CreateSalesIntelligenceRecommendationRequest,
) {
  const data = await request<{ recommendation: SalesIntelligenceRecommendationSummary }>(
    '/sales-intelligence-agent/recommendations',
    { method: 'POST', accessToken, body },
  );
  return data.recommendation;
}

export async function generateSalesIntelligenceRecommendations(accessToken: string) {
  const data = await request<{ recommendations: SalesIntelligenceRecommendationSummary[] }>(
    '/sales-intelligence-agent/recommendations/generate',
    { method: 'POST', accessToken, body: {} },
  );
  return data.recommendations;
}

export async function decideSalesIntelligenceRecommendation(
  accessToken: string,
  recommendationId: string,
  body: DecideSalesIntelligenceRecommendationRequest,
) {
  const data = await request<{ recommendation: SalesIntelligenceRecommendationSummary }>(
    `/sales-intelligence-agent/recommendations/${recommendationId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.recommendation;
}

export async function listSalesIntelligenceInsights(accessToken: string) {
  const data = await request<{ insights: SalesIntelligenceInsightSummary[] }>(
    '/sales-intelligence-agent/insights',
    { accessToken },
  );
  return data.insights;
}

export async function refreshSalesIntelligenceInsights(accessToken: string) {
  const data = await request<{ insights: SalesIntelligenceInsightSummary[] }>(
    '/sales-intelligence-agent/insights/refresh',
    { method: 'POST', accessToken, body: {} },
  );
  return data.insights;
}

export async function listSalesIntelligenceSignals(accessToken: string) {
  const data = await request<{ signals: SalesIntelligenceSignalSummary[] }>(
    '/sales-intelligence-agent/signals',
    { accessToken },
  );
  return data.signals;
}

export async function refreshSalesIntelligenceSignals(accessToken: string) {
  const data = await request<{ signals: SalesIntelligenceSignalSummary[] }>(
    '/sales-intelligence-agent/signals/refresh',
    { method: 'POST', accessToken, body: {} },
  );
  return data.signals;
}
