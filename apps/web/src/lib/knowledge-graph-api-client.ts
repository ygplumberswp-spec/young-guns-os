import type {
  EnterpriseKnowledgeGraphDashboard,
  KnowledgeSemanticSearchResult,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as KnowledgeGraphApiClientError };

export async function fetchKnowledgeGraphDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseKnowledgeGraphDashboard }>(
    '/knowledge-graph/dashboard',
    {
      accessToken,
    },
  );
  return data.dashboard;
}

export async function syncKnowledgeGraph(accessToken: string) {
  const data = await request<{ entityCount: number; relationshipCount: number }>(
    '/knowledge-graph/sync',
    {
      accessToken,
      method: 'POST',
    },
  );
  return data;
}

export async function searchKnowledgeGraph(accessToken: string, query: string) {
  const data = await request<{ results: KnowledgeSemanticSearchResult[] }>(
    '/knowledge-graph/search',
    {
      accessToken,
      method: 'POST',
      body: { query, mode: 'hybrid' },
    },
  );
  return data.results;
}

export async function generateKnowledgeGraphRecommendations(accessToken: string) {
  const data = await request<{
    recommendations: EnterpriseKnowledgeGraphDashboard['recommendations'];
  }>('/knowledge-graph/recommendations/generate', { accessToken, method: 'POST' });
  return data.recommendations;
}

export async function captureKnowledgeGraphSync(accessToken: string) {
  return syncKnowledgeGraph(accessToken);
}
