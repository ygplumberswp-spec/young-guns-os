import type {
  AuraMemorySummary,
  AuraOperationsSummary,
  BusinessRuleSummary,
  CreateAuraMemoryRequest,
  CreateBusinessRuleRequest,
  CreateDayPlanRequest,
  DashboardSummary,
  DayPlanFollowUpItem,
  DayPlanMorningSuggestion,
  DayPlanSummary,
  DayPlanTodayResponse,
  IntelligenceDashboard,
  Recommendation,
  UpdateAuraMemoryRequest,
  UpdateBusinessRuleRequest,
  UpdateDayPlanFollowUpRequest,
  UpdateDayPlanRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchIntelligenceDashboard(
  accessToken: string,
): Promise<IntelligenceDashboard> {
  const data = await request<{ dashboard: IntelligenceDashboard }>('/intelligence/dashboard', {
    accessToken,
  });
  return data.dashboard;
}

export async function fetchDashboardSummary(
  accessToken: string,
  planDate?: string,
): Promise<DashboardSummary> {
  const query = planDate ? `?date=${encodeURIComponent(planDate)}` : '';
  const data = await request<{ summary: DashboardSummary }>(
    `/intelligence/dashboard-summary${query}`,
    { accessToken },
  );
  return data.summary;
}

export async function fetchAuraOperationsSummary(
  accessToken: string,
): Promise<AuraOperationsSummary> {
  const data = await request<{ summary: AuraOperationsSummary }>(
    '/intelligence/operations-summary',
    { accessToken },
  );
  return data.summary;
}

export async function fetchRecommendations(accessToken: string): Promise<Recommendation[]> {
  const data = await request<{ recommendations: Recommendation[]; generatedAt: string }>(
    '/intelligence/recommendations',
    { accessToken },
  );
  return data.recommendations;
}

export async function fetchAuraMemories(accessToken: string): Promise<AuraMemorySummary[]> {
  const data = await request<{ memories: AuraMemorySummary[] }>('/intelligence/memory', {
    accessToken,
  });
  return data.memories;
}

export async function createAuraMemory(
  accessToken: string,
  body: CreateAuraMemoryRequest,
): Promise<AuraMemorySummary> {
  const data = await request<{ memory: AuraMemorySummary }>('/intelligence/memory', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.memory;
}

export async function updateAuraMemory(
  accessToken: string,
  memoryId: string,
  body: UpdateAuraMemoryRequest,
): Promise<AuraMemorySummary> {
  const data = await request<{ memory: AuraMemorySummary }>(`/intelligence/memory/${memoryId}`, {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.memory;
}

export async function deleteAuraMemory(accessToken: string, memoryId: string): Promise<void> {
  await request<{ success: boolean }>(`/intelligence/memory/${memoryId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function fetchTodayPlan(
  accessToken: string,
  planDate?: string,
): Promise<DayPlanTodayResponse> {
  const query = planDate ? `?date=${encodeURIComponent(planDate)}` : '';
  return request<DayPlanTodayResponse>(`/intelligence/day-plans/today${query}`, { accessToken });
}

export async function fetchMorningSuggestions(
  accessToken: string,
  planDate?: string,
): Promise<{ planDate: string; suggestions: DayPlanMorningSuggestion[] }> {
  const query = planDate ? `?date=${encodeURIComponent(planDate)}` : '';
  return request<{ planDate: string; suggestions: DayPlanMorningSuggestion[] }>(
    `/intelligence/day-plans/morning-suggestions${query}`,
    { accessToken },
  );
}

export async function fetchDayPlans(
  accessToken: string,
  planDate?: string,
): Promise<{ planDate: string; plans: DayPlanSummary[] }> {
  const query = planDate ? `?date=${encodeURIComponent(planDate)}` : '';
  return request<{ planDate: string; plans: DayPlanSummary[] }>(
    `/intelligence/day-plans${query}`,
    { accessToken },
  );
}

export async function fetchDayPlanFollowUps(
  accessToken: string,
  planDate?: string,
): Promise<{ planDate: string; followUps: DayPlanFollowUpItem[] }> {
  const query = planDate ? `?date=${encodeURIComponent(planDate)}` : '';
  return request<{ planDate: string; followUps: DayPlanFollowUpItem[] }>(
    `/intelligence/day-plans/follow-ups${query}`,
    { accessToken },
  );
}

export async function applyDayPlanFollowUpAction(
  accessToken: string,
  customerId: string,
  body: UpdateDayPlanFollowUpRequest,
  planDate?: string,
): Promise<DayPlanFollowUpItem> {
  const query = planDate ? `?date=${encodeURIComponent(planDate)}` : '';
  const data = await request<{ followUp: DayPlanFollowUpItem }>(
    `/intelligence/day-plans/follow-ups/${customerId}${query}`,
    {
      method: 'POST',
      accessToken,
      body,
    },
  );
  return data.followUp;
}

export async function createDayPlan(
  accessToken: string,
  body: CreateDayPlanRequest,
): Promise<DayPlanSummary> {
  const data = await request<{ plan: DayPlanSummary }>('/intelligence/day-plans', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.plan;
}

export async function updateDayPlan(
  accessToken: string,
  planId: string,
  body: UpdateDayPlanRequest,
): Promise<DayPlanSummary> {
  const data = await request<{ plan: DayPlanSummary }>(`/intelligence/day-plans/${planId}`, {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.plan;
}

export async function deleteDayPlan(accessToken: string, planId: string): Promise<void> {
  await request<{ success: boolean }>(`/intelligence/day-plans/${planId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function fetchBusinessRules(accessToken: string): Promise<BusinessRuleSummary[]> {
  const data = await request<{ rules: BusinessRuleSummary[] }>('/intelligence/business-rules', {
    accessToken,
  });
  return data.rules;
}

export async function createBusinessRule(
  accessToken: string,
  body: CreateBusinessRuleRequest,
): Promise<BusinessRuleSummary> {
  const data = await request<{ rule: BusinessRuleSummary }>('/intelligence/business-rules', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.rule;
}

export async function updateBusinessRule(
  accessToken: string,
  ruleId: string,
  body: UpdateBusinessRuleRequest,
): Promise<BusinessRuleSummary> {
  const data = await request<{ rule: BusinessRuleSummary }>(
    `/intelligence/business-rules/${ruleId}`,
    {
      method: 'PATCH',
      accessToken,
      body,
    },
  );
  return data.rule;
}

export function buildGreetingSalutation(firstName?: string | null): string {
  const hour = new Date().getHours();
  const salutation = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = firstName?.trim();
  return name ? `${salutation}, ${name}.` : `${salutation}.`;
}
