import type {
  AcknowledgeHrIntelInsightRequest,
  CreateHrIntelAuraInsightRequest,
  DecideHrIntelRecommendationRequest,
  HrIntelAuraInsightSummary,
  HrIntelDashboard,
  HrIntelEmployeeRecord,
  HrIntelRecommendationSummary,
  HrIntelSelfProfile,
  HrIntelSettings,
  UpdateHrIntelSettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as HrEmployeeIntelligenceApiClientError };

export async function fetchHrIntelDashboard(accessToken: string) {
  const data = await request<{ dashboard: HrIntelDashboard }>(
    '/hr-employee-intelligence/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function fetchHrIntelEmployee(accessToken: string, userId: string) {
  const data = await request<{ employee: HrIntelEmployeeRecord }>(
    `/hr-employee-intelligence/employees/${userId}`,
    { accessToken },
  );
  return data.employee;
}

export async function fetchHrIntelSelfProfile(accessToken: string) {
  const data = await request<{ profile: HrIntelSelfProfile }>('/hr-employee-intelligence/me', {
    accessToken,
  });
  return data.profile;
}

export async function refreshHrIntelRecommendations(accessToken: string) {
  return request<{ created: number; recommendations: HrIntelRecommendationSummary[] }>(
    '/hr-employee-intelligence/recommendations/refresh',
    { method: 'POST', accessToken, body: {} },
  );
}

export async function decideHrIntelRecommendation(
  accessToken: string,
  recommendationId: string,
  body: DecideHrIntelRecommendationRequest,
) {
  const data = await request<{ recommendation: HrIntelRecommendationSummary }>(
    `/hr-employee-intelligence/recommendations/${recommendationId}/decide`,
    { method: 'POST', accessToken, body },
  );
  return data.recommendation;
}

export async function updateHrIntelSettings(
  accessToken: string,
  body: UpdateHrIntelSettingsRequest,
) {
  const data = await request<{ settings: HrIntelSettings }>(
    '/hr-employee-intelligence/settings',
    { method: 'PATCH', accessToken, body },
  );
  return data.settings;
}

export async function createHrIntelAuraInsight(
  accessToken: string,
  body: CreateHrIntelAuraInsightRequest,
) {
  const data = await request<{ insight: HrIntelAuraInsightSummary }>(
    '/hr-employee-intelligence/aura-insights',
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}

export async function acknowledgeHrIntelInsight(
  accessToken: string,
  insightId: string,
  body: AcknowledgeHrIntelInsightRequest,
) {
  const data = await request<{ insight: HrIntelAuraInsightSummary }>(
    `/hr-employee-intelligence/aura-insights/${insightId}/acknowledge`,
    { method: 'POST', accessToken, body },
  );
  return data.insight;
}
