import type {
  ConfigureN8nConnectionRequest,
  DispatchN8nExecutionRequest,
  N8nConnectionSummary,
  N8nExecutionSummary,
  N8nWorkflowRegistrationSummary,
  RegisterN8nWorkflowRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchN8nConnection(accessToken: string): Promise<N8nConnectionSummary> {
  const data = await request<{ connection: N8nConnectionSummary }>('/automation/n8n/connection', {
    accessToken,
  });
  return data.connection;
}

export async function configureN8nConnection(
  accessToken: string,
  body: ConfigureN8nConnectionRequest,
): Promise<N8nConnectionSummary> {
  const data = await request<{ connection: N8nConnectionSummary }>('/automation/n8n/connection', {
    method: 'PUT',
    accessToken,
    body,
  });
  return data.connection;
}

export async function verifyN8nConnection(accessToken: string): Promise<N8nConnectionSummary> {
  const data = await request<{ connection: N8nConnectionSummary }>(
    '/automation/n8n/connection/verify',
    { method: 'POST', accessToken },
  );
  return data.connection;
}

export async function disconnectN8nConnection(accessToken: string): Promise<N8nConnectionSummary> {
  const data = await request<{ connection: N8nConnectionSummary }>(
    '/automation/n8n/connection/disconnect',
    { method: 'POST', accessToken },
  );
  return data.connection;
}

export async function fetchN8nWorkflows(
  accessToken: string,
): Promise<N8nWorkflowRegistrationSummary[]> {
  const data = await request<{ workflows: N8nWorkflowRegistrationSummary[] }>(
    '/automation/n8n/workflows',
    { accessToken },
  );
  return data.workflows;
}

export async function registerN8nWorkflow(
  accessToken: string,
  body: RegisterN8nWorkflowRequest,
): Promise<N8nWorkflowRegistrationSummary> {
  const data = await request<{ workflow: N8nWorkflowRegistrationSummary }>(
    '/automation/n8n/workflows',
    { method: 'POST', accessToken, body },
  );
  return data.workflow;
}

export async function fetchN8nExecutions(accessToken: string): Promise<N8nExecutionSummary[]> {
  const data = await request<{ executions: N8nExecutionSummary[] }>('/automation/n8n/executions', {
    accessToken,
  });
  return data.executions;
}

export async function dispatchN8nExecution(
  accessToken: string,
  body: DispatchN8nExecutionRequest,
): Promise<N8nExecutionSummary> {
  const data = await request<{ execution: N8nExecutionSummary }>(
    '/automation/n8n/executions/dispatch',
    { method: 'POST', accessToken, body },
  );
  return data.execution;
}

export async function approveN8nExecution(
  accessToken: string,
  id: string,
): Promise<N8nExecutionSummary> {
  const data = await request<{ execution: N8nExecutionSummary }>(
    `/automation/n8n/executions/${id}/approve`,
    { method: 'POST', accessToken },
  );
  return data.execution;
}

export async function cancelN8nExecution(
  accessToken: string,
  id: string,
): Promise<N8nExecutionSummary> {
  const data = await request<{ execution: N8nExecutionSummary }>(
    `/automation/n8n/executions/${id}/cancel`,
    { method: 'POST', accessToken },
  );
  return data.execution;
}

export async function retryN8nExecution(
  accessToken: string,
  id: string,
): Promise<N8nExecutionSummary> {
  const data = await request<{ execution: N8nExecutionSummary }>(
    `/automation/n8n/executions/${id}/retry`,
    { method: 'POST', accessToken },
  );
  return data.execution;
}
