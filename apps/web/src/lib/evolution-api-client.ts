import type { EnterpriseEvolutionDashboard } from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as EvolutionApiClientError };

export async function fetchEvolutionDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseEvolutionDashboard }>('/evolution/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function syncEvolutionLearning(accessToken: string) {
  const data = await request<{ events: EnterpriseEvolutionDashboard['recentLearningEvents'] }>(
    '/evolution/learning/sync',
    { accessToken, method: 'POST' },
  );
  return data.events;
}

export async function detectEvolutionPatterns(accessToken: string) {
  const data = await request<{ patterns: EnterpriseEvolutionDashboard['patterns'] }>(
    '/evolution/patterns/detect',
    { accessToken, method: 'POST' },
  );
  return data.patterns;
}

export async function generateEvolutionRecommendations(accessToken: string) {
  const data = await request<{ recommendations: EnterpriseEvolutionDashboard['recommendations'] }>(
    '/evolution/recommendations/generate',
    { accessToken, method: 'POST' },
  );
  return data.recommendations;
}

export async function syncEvolutionTimeline(accessToken: string) {
  const data = await request<{ events: EnterpriseEvolutionDashboard['timelineEvents'] }>(
    '/evolution/timeline/sync',
    { accessToken, method: 'POST' },
  );
  return data.events;
}

export async function approveEvolutionLearning(accessToken: string, learningEventId: string) {
  const data = await request<{
    event: EnterpriseEvolutionDashboard['recentLearningEvents'][number];
  }>('/evolution/learning/approve', { accessToken, method: 'POST', body: { learningEventId } });
  return data.event;
}

export async function captureEvolutionSnapshot(accessToken: string) {
  const data = await request<{ snapshot: { id: string } }>('/evolution/snapshots/capture', {
    accessToken,
    method: 'POST',
  });
  return data.snapshot;
}
