import type {
  CompleteMaintenanceCycleRequest,
  CreateMaintenanceCommRequest,
  CreateRecurringMaintenancePlanRequest,
  OpsMaintenanceAuraSuggestionSummary,
  OpsMaintenanceCommRequestSummary,
  OpsMaintenanceDueItem,
  OpsMaintenanceReminderSummary,
  OpsMaintenanceRunSummary,
  OpsRecurringMaintenanceOverview,
  OpsRecurringMaintenancePlanSummary,
  UpdateRecurringMaintenancePlanRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as RecurringMaintenanceApiClientError };

export async function fetchRecurringMaintenanceOverview(
  accessToken: string,
): Promise<OpsRecurringMaintenanceOverview> {
  const data = await request<{ overview: OpsRecurringMaintenanceOverview }>(
    '/recurring-maintenance/overview',
    { accessToken },
  );
  return data.overview;
}

export async function fetchRecurringMaintenancePlans(
  accessToken: string,
): Promise<OpsRecurringMaintenancePlanSummary[]> {
  const data = await request<{ plans: OpsRecurringMaintenancePlanSummary[] }>(
    '/recurring-maintenance/plans',
    { accessToken },
  );
  return data.plans;
}

export async function createRecurringMaintenancePlan(
  accessToken: string,
  input: CreateRecurringMaintenancePlanRequest,
): Promise<OpsRecurringMaintenancePlanSummary> {
  const data = await request<{ plan: OpsRecurringMaintenancePlanSummary }>(
    '/recurring-maintenance/plans',
    { method: 'POST', accessToken, body: input },
  );
  return data.plan;
}

export async function updateRecurringMaintenancePlan(
  accessToken: string,
  planId: string,
  input: UpdateRecurringMaintenancePlanRequest,
): Promise<OpsRecurringMaintenancePlanSummary> {
  const data = await request<{ plan: OpsRecurringMaintenancePlanSummary }>(
    `/recurring-maintenance/plans/${encodeURIComponent(planId)}`,
    { method: 'PATCH', accessToken, body: input },
  );
  return data.plan;
}

export async function fetchRecurringMaintenanceDue(
  accessToken: string,
): Promise<OpsMaintenanceDueItem[]> {
  const data = await request<{ dueItems: OpsMaintenanceDueItem[] }>(
    '/recurring-maintenance/due',
    { accessToken },
  );
  return data.dueItems;
}

export async function generateRecurringMaintenanceDue(accessToken: string): Promise<{
  dueGenerated: number;
  remindersCreated: number;
  plansSynced: number;
}> {
  const data = await request<{
    result: { dueGenerated: number; remindersCreated: number; plansSynced: number };
  }>('/recurring-maintenance/generate-due', { method: 'POST', accessToken, body: {} });
  return data.result;
}

export async function completeRecurringMaintenanceCycle(
  accessToken: string,
  planId: string,
  input: CompleteMaintenanceCycleRequest = {},
): Promise<{ plan: OpsRecurringMaintenancePlanSummary; run: OpsMaintenanceRunSummary }> {
  return request<{ plan: OpsRecurringMaintenancePlanSummary; run: OpsMaintenanceRunSummary }>(
    `/recurring-maintenance/plans/${encodeURIComponent(planId)}/complete`,
    { method: 'POST', accessToken, body: input },
  );
}

export async function fetchRecurringMaintenanceHistory(
  accessToken: string,
  planId?: string,
): Promise<OpsMaintenanceRunSummary[]> {
  const qs = planId ? `?planId=${encodeURIComponent(planId)}` : '';
  const data = await request<{ history: OpsMaintenanceRunSummary[] }>(
    `/recurring-maintenance/history${qs}`,
    { accessToken },
  );
  return data.history;
}

export async function fetchRecurringMaintenanceReminders(
  accessToken: string,
): Promise<OpsMaintenanceReminderSummary[]> {
  const data = await request<{ reminders: OpsMaintenanceReminderSummary[] }>(
    '/recurring-maintenance/reminders',
    { accessToken },
  );
  return data.reminders;
}

export async function acknowledgeRecurringMaintenanceReminder(
  accessToken: string,
  reminderId: string,
): Promise<OpsMaintenanceReminderSummary> {
  const data = await request<{ reminder: OpsMaintenanceReminderSummary }>(
    `/recurring-maintenance/reminders/${encodeURIComponent(reminderId)}/acknowledge`,
    { method: 'POST', accessToken, body: {} },
  );
  return data.reminder;
}

export async function fetchRecurringMaintenanceAuraSuggestions(
  accessToken: string,
): Promise<OpsMaintenanceAuraSuggestionSummary[]> {
  const data = await request<{ suggestions: OpsMaintenanceAuraSuggestionSummary[] }>(
    '/recurring-maintenance/aura-suggestions',
    { accessToken },
  );
  return data.suggestions;
}

export async function generateRecurringMaintenanceAuraSuggestions(
  accessToken: string,
): Promise<OpsMaintenanceAuraSuggestionSummary[]> {
  const data = await request<{ suggestions: OpsMaintenanceAuraSuggestionSummary[] }>(
    '/recurring-maintenance/aura-suggestions/generate',
    { method: 'POST', accessToken, body: {} },
  );
  return data.suggestions;
}

export async function decideRecurringMaintenanceAuraSuggestion(
  accessToken: string,
  suggestionId: string,
  decision: 'approve' | 'reject',
  notes?: string,
): Promise<OpsMaintenanceAuraSuggestionSummary> {
  const data = await request<{ suggestion: OpsMaintenanceAuraSuggestionSummary }>(
    `/recurring-maintenance/aura-suggestions/${encodeURIComponent(suggestionId)}/decide`,
    { method: 'POST', accessToken, body: { decision, notes } },
  );
  return data.suggestion;
}

export async function fetchRecurringMaintenanceCommRequests(
  accessToken: string,
): Promise<OpsMaintenanceCommRequestSummary[]> {
  const data = await request<{ requests: OpsMaintenanceCommRequestSummary[] }>(
    '/recurring-maintenance/comm-requests',
    { accessToken },
  );
  return data.requests;
}

export async function createRecurringMaintenanceCommRequest(
  accessToken: string,
  input: CreateMaintenanceCommRequest,
): Promise<OpsMaintenanceCommRequestSummary> {
  const data = await request<{ request: OpsMaintenanceCommRequestSummary }>(
    '/recurring-maintenance/comm-requests',
    { method: 'POST', accessToken, body: input },
  );
  return data.request;
}

export async function decideRecurringMaintenanceCommRequest(
  accessToken: string,
  requestId: string,
  decision: 'approve' | 'reject',
  notes?: string,
): Promise<OpsMaintenanceCommRequestSummary> {
  const data = await request<{ request: OpsMaintenanceCommRequestSummary }>(
    `/recurring-maintenance/comm-requests/${encodeURIComponent(requestId)}/decide`,
    { method: 'POST', accessToken, body: { decision, notes } },
  );
  return data.request;
}

export async function executeRecurringMaintenanceCommRequest(
  accessToken: string,
  requestId: string,
): Promise<OpsMaintenanceCommRequestSummary> {
  const data = await request<{ request: OpsMaintenanceCommRequestSummary }>(
    `/recurring-maintenance/comm-requests/${encodeURIComponent(requestId)}/execute`,
    { method: 'POST', accessToken, body: {} },
  );
  return data.request;
}
