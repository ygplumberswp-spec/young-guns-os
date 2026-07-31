import type {
  AgentExecutionSummary,
  AgentProfileDetail,
  AgentProfileSummary,
  AgentRegistryEntry,
  AgentsStats,
  AgentToolDefinition,
  CreateAgentProfileRequest,
  SetAgentProfilePermissionsRequest,
  SetAgentProfileToolsRequest,
  UpdateAgentProfileRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchAgentsStats(accessToken: string): Promise<AgentsStats> {
  return request<AgentsStats>('/agents/stats', { accessToken });
}

export async function fetchAgentRegistry(accessToken: string): Promise<AgentRegistryEntry[]> {
  const data = await request<{ registry: AgentRegistryEntry[] }>('/agents/registry', {
    accessToken,
  });
  return data.registry;
}

export async function fetchAgentToolCatalog(accessToken: string): Promise<AgentToolDefinition[]> {
  const data = await request<{ tools: AgentToolDefinition[] }>('/agents/tools', { accessToken });
  return data.tools;
}

export async function fetchAgentProfiles(accessToken: string): Promise<AgentProfileSummary[]> {
  const data = await request<{ profiles: AgentProfileSummary[] }>('/agents/profiles', {
    accessToken,
  });
  return data.profiles;
}

export async function fetchAgentProfile(
  accessToken: string,
  profileId: string,
): Promise<AgentProfileDetail> {
  const data = await request<{ profile: AgentProfileDetail }>(`/agents/profiles/${profileId}`, {
    accessToken,
  });
  return data.profile;
}

export async function createAgentProfile(
  accessToken: string,
  body: CreateAgentProfileRequest,
): Promise<AgentProfileDetail> {
  const data = await request<{ profile: AgentProfileDetail }>('/agents/profiles', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.profile;
}

export async function updateAgentProfile(
  accessToken: string,
  profileId: string,
  body: UpdateAgentProfileRequest,
): Promise<AgentProfileDetail> {
  const data = await request<{ profile: AgentProfileDetail }>(`/agents/profiles/${profileId}`, {
    method: 'PATCH',
    accessToken,
    body,
  });
  return data.profile;
}

export async function setAgentProfilePermissions(
  accessToken: string,
  profileId: string,
  body: SetAgentProfilePermissionsRequest,
): Promise<AgentProfileDetail> {
  const data = await request<{ profile: AgentProfileDetail }>(
    `/agents/profiles/${profileId}/permissions`,
    {
      method: 'PUT',
      accessToken,
      body,
    },
  );
  return data.profile;
}

export async function setAgentProfileTools(
  accessToken: string,
  profileId: string,
  body: SetAgentProfileToolsRequest,
): Promise<AgentProfileDetail> {
  const data = await request<{ profile: AgentProfileDetail }>(
    `/agents/profiles/${profileId}/tools`,
    {
      method: 'PUT',
      accessToken,
      body,
    },
  );
  return data.profile;
}

export async function fetchAgentExecutions(accessToken: string): Promise<AgentExecutionSummary[]> {
  const data = await request<{ executions: AgentExecutionSummary[] }>('/agents/executions', {
    accessToken,
  });
  return data.executions;
}

export async function fetchAgentProfileExecutions(
  accessToken: string,
  profileId: string,
): Promise<AgentExecutionSummary[]> {
  const data = await request<{ executions: AgentExecutionSummary[] }>(
    `/agents/profiles/${profileId}/executions`,
    { accessToken },
  );
  return data.executions;
}

export async function runAgent(
  accessToken: string,
  body: import('@titan/shared').RunAgentRequest,
): Promise<import('@titan/shared').RunAgentResponse> {
  return request<import('@titan/shared').RunAgentResponse>('/agents/runs', {
    method: 'POST',
    accessToken,
    body,
  });
}

export async function fetchAgentTasks(
  accessToken: string,
  status?: string,
): Promise<import('@titan/shared').AgentTaskSummary[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await request<{ tasks: import('@titan/shared').AgentTaskSummary[] }>(
    `/agents/tasks${query}`,
    { accessToken },
  );
  return data.tasks;
}

export async function approveAgentTask(
  accessToken: string,
  taskId: string,
): Promise<import('@titan/shared').AgentTaskSummary> {
  const data = await request<{ task: import('@titan/shared').AgentTaskSummary }>(
    `/agents/tasks/${taskId}/approve`,
    { method: 'POST', accessToken, body: {} },
  );
  return data.task;
}

export async function rejectAgentTask(
  accessToken: string,
  taskId: string,
): Promise<import('@titan/shared').AgentTaskSummary> {
  const data = await request<{ task: import('@titan/shared').AgentTaskSummary }>(
    `/agents/tasks/${taskId}/reject`,
    { method: 'POST', accessToken, body: {} },
  );
  return data.task;
}

export async function updateAgentTask(
  accessToken: string,
  taskId: string,
  body: import('@titan/shared').UpdateAgentTaskRequest,
): Promise<import('@titan/shared').AgentTaskSummary> {
  const data = await request<{ task: import('@titan/shared').AgentTaskSummary }>(
    `/agents/tasks/${taskId}`,
    { method: 'PATCH', accessToken, body },
  );
  return data.task;
}
