import type {
  AutomationStats,
  CreateWorkflowActionRequest,
  CreateWorkflowConditionRequest,
  CreateWorkflowRequest,
  CreateWorkflowTriggerRequest,
  ReorderWorkflowActionsRequest,
  UpdateWorkflowRequest,
  WorkflowDetail,
  WorkflowExecutionSummary,
  WorkflowRunDetail,
  WorkflowRunSummary,
  WorkflowSummary,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchAutomationStats(accessToken: string): Promise<AutomationStats> {
  return request<AutomationStats>('/automation/stats', { accessToken });
}

export async function fetchWorkflows(accessToken: string): Promise<WorkflowSummary[]> {
  const data = await request<{ workflows: WorkflowSummary[] }>('/automation/workflows', {
    accessToken,
  });
  return data.workflows;
}

export async function fetchWorkflow(accessToken: string, workflowId: string): Promise<WorkflowDetail> {
  const data = await request<{ workflow: WorkflowDetail }>(`/automation/workflows/${workflowId}`, {
    accessToken,
  });
  return data.workflow;
}

export async function createWorkflow(
  accessToken: string,
  body: CreateWorkflowRequest,
): Promise<WorkflowDetail> {
  const data = await request<{ workflow: WorkflowDetail }>('/automation/workflows', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.workflow;
}

export async function updateWorkflow(
  accessToken: string,
  workflowId: string,
  body: UpdateWorkflowRequest,
): Promise<WorkflowDetail> {
  const data = await request<{ workflow: WorkflowDetail }>(`/automation/workflows/${workflowId}`, {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.workflow;
}

export async function addWorkflowTrigger(
  accessToken: string,
  workflowId: string,
  body: CreateWorkflowTriggerRequest,
) {
  const data = await request<{ trigger: unknown }>(`/automation/workflows/${workflowId}/triggers`, {
    method: 'POST',
    accessToken,
    body,
  });
  return data.trigger;
}

export async function addWorkflowAction(
  accessToken: string,
  workflowId: string,
  body: CreateWorkflowActionRequest,
) {
  const data = await request<{ action: unknown }>(`/automation/workflows/${workflowId}/actions`, {
    method: 'POST',
    accessToken,
    body,
  });
  return data.action;
}

export async function addWorkflowCondition(
  accessToken: string,
  workflowId: string,
  body: CreateWorkflowConditionRequest,
) {
  const data = await request<{ condition: unknown }>(
    `/automation/workflows/${workflowId}/conditions`,
    {
      method: 'POST',
      accessToken,
      body,
    },
  );
  return data.condition;
}

export async function reorderWorkflowActions(
  accessToken: string,
  workflowId: string,
  body: ReorderWorkflowActionsRequest,
): Promise<WorkflowDetail> {
  const data = await request<{ workflow: WorkflowDetail }>(
    `/automation/workflows/${workflowId}/actions/reorder`,
    {
      method: 'POST',
      accessToken,
      body,
    },
  );
  return data.workflow;
}

export async function runWorkflow(
  accessToken: string,
  workflowId: string,
  payload?: Record<string, unknown>,
): Promise<WorkflowRunDetail> {
  const data = await request<{ run: WorkflowRunDetail }>(`/automation/workflows/${workflowId}/run`, {
    method: 'POST',
    accessToken,
    body: { payload },
  });
  return data.run;
}

export async function fetchWorkflowExecutions(
  accessToken: string,
): Promise<WorkflowExecutionSummary[]> {
  const data = await request<{ executions: WorkflowExecutionSummary[] }>('/automation/executions', {
    accessToken,
  });
  return data.executions;
}

export async function fetchWorkflowExecutionHistory(
  accessToken: string,
  workflowId: string,
): Promise<WorkflowExecutionSummary[]> {
  const data = await request<{ executions: WorkflowExecutionSummary[] }>(
    `/automation/workflows/${workflowId}/executions`,
    { accessToken },
  );
  return data.executions;
}

export async function fetchWorkflowRuns(
  accessToken: string,
  workflowId?: string,
): Promise<WorkflowRunSummary[]> {
  const path = workflowId ? `/automation/workflows/${workflowId}/runs` : '/automation/runs';
  const data = await request<{ runs: WorkflowRunSummary[] }>(path, { accessToken });
  return data.runs;
}

export async function fetchWorkflowRun(
  accessToken: string,
  runId: string,
): Promise<WorkflowRunDetail> {
  const data = await request<{ run: WorkflowRunDetail }>(`/automation/runs/${runId}`, {
    accessToken,
  });
  return data.run;
}

export async function approveWorkflowStepResult(accessToken: string, stepResultId: string) {
  const data = await request<{ run: WorkflowRunDetail }>(
    `/automation/step-results/${stepResultId}/approve`,
    {
      method: 'POST',
      accessToken,
    },
  );
  return data.run;
}

export async function rejectWorkflowStepResult(accessToken: string, stepResultId: string) {
  return request<{ success: boolean }>(`/automation/step-results/${stepResultId}/reject`, {
    method: 'POST',
    accessToken,
  });
}

export async function retryWorkflowStep(accessToken: string, stepId: string) {
  return request<{ success: boolean }>(`/automation/steps/${stepId}/retry`, {
    method: 'POST',
    accessToken,
  });
}
