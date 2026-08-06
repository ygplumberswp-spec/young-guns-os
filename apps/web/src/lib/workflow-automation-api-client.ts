import type {
  CreateWorkflowRequest,
  OpsWorkflowApprovalSummary,
  OpsWorkflowAuraSuggestionSummary,
  OpsWorkflowDefinitionSummary,
  OpsWorkflowFollowUpSummary,
  OpsWorkflowMonitorBucket,
  OpsWorkflowMonitorOverview,
  OpsWorkflowRunSummary,
  OpsWorkflowTaskSummary,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as WorkflowAutomationApiClientError };

export async function fetchWorkflowAutomationMonitor(
  accessToken: string,
): Promise<OpsWorkflowMonitorOverview> {
  const data = await request<{ overview: OpsWorkflowMonitorOverview }>(
    '/workflow-automation/monitor',
    { accessToken },
  );
  return data.overview;
}

export async function fetchWorkflowAutomationRuns(
  accessToken: string,
  bucket: OpsWorkflowMonitorBucket,
): Promise<OpsWorkflowRunSummary[]> {
  const data = await request<{ runs: OpsWorkflowRunSummary[] }>(
    `/workflow-automation/runs?bucket=${encodeURIComponent(bucket)}`,
    { accessToken },
  );
  return data.runs;
}

export async function fetchWorkflowAutomationDefinitions(
  accessToken: string,
): Promise<OpsWorkflowDefinitionSummary[]> {
  const data = await request<{ definitions: OpsWorkflowDefinitionSummary[] }>(
    '/workflow-automation/definitions',
    { accessToken },
  );
  return data.definitions;
}

export async function createWorkflowAutomationDefinition(
  accessToken: string,
  input: CreateWorkflowRequest,
): Promise<OpsWorkflowDefinitionSummary> {
  const data = await request<{ definition: OpsWorkflowDefinitionSummary }>(
    '/workflow-automation/definitions',
    { accessToken, method: 'POST', body: input },
  );
  return data.definition;
}

export async function fetchWorkflowAutomationApprovals(
  accessToken: string,
): Promise<OpsWorkflowApprovalSummary[]> {
  const data = await request<{ approvals: OpsWorkflowApprovalSummary[] }>(
    '/workflow-automation/approvals',
    { accessToken },
  );
  return data.approvals;
}

export async function decideWorkflowAutomationApproval(
  accessToken: string,
  stepResultId: string,
  decision: 'approve' | 'reject',
  notes?: string,
): Promise<{ approval: OpsWorkflowApprovalSummary | null; decision: string }> {
  return request<{ approval: OpsWorkflowApprovalSummary | null; decision: string }>(
    `/workflow-automation/approvals/${encodeURIComponent(stepResultId)}/decide`,
    {
      accessToken,
      method: 'POST',
      body: { decision, notes },
    },
  );
}

export async function fetchWorkflowAutomationTasks(
  accessToken: string,
): Promise<OpsWorkflowTaskSummary[]> {
  const data = await request<{ tasks: OpsWorkflowTaskSummary[] }>(
    '/workflow-automation/tasks',
    { accessToken },
  );
  return data.tasks;
}

export async function fetchWorkflowAutomationFollowUps(
  accessToken: string,
): Promise<OpsWorkflowFollowUpSummary[]> {
  const data = await request<{ followUps: OpsWorkflowFollowUpSummary[] }>(
    '/workflow-automation/follow-ups',
    { accessToken },
  );
  return data.followUps;
}

export async function fetchWorkflowAutomationAuraSuggestions(
  accessToken: string,
): Promise<OpsWorkflowAuraSuggestionSummary[]> {
  const data = await request<{
    suggestions: OpsWorkflowAuraSuggestionSummary[];
    autoExecuted: false;
  }>('/workflow-automation/aura-suggestions', { accessToken });
  return data.suggestions;
}

export async function decideWorkflowAutomationAuraSuggestion(
  accessToken: string,
  suggestionId: string,
  decision: 'approve' | 'reject',
  notes?: string,
): Promise<OpsWorkflowAuraSuggestionSummary> {
  const data = await request<{
    suggestion: OpsWorkflowAuraSuggestionSummary;
    autoExecuted: false;
  }>(`/workflow-automation/aura-suggestions/${encodeURIComponent(suggestionId)}/decide`, {
    accessToken,
    method: 'POST',
    body: { decision, notes },
  });
  return data.suggestion;
}
