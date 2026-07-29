import type {
  AiComparisonRunSummary,
  AiConfigurationActionSummary,
  AiExecutiveDashboard,
  AiModelSummary,
  AiPromptTemplateSummary,
  AiPromptVersionSummary,
  AiProviderSummary,
  AiRoutingRuleSummary,
  CreateAiComparisonRunRequest,
  CreateAiConfigurationActionRequest,
  CreateAiPromptTemplateRequest,
  CreateAiProviderRequest,
  SyncAiMemoryRequest,
  UnifiedAiGatewayStatus,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as AiOrchestrationApiClientError };

export async function fetchAiOrchestrationDashboard(accessToken: string) {
  const data = await request<{ dashboard: AiExecutiveDashboard }>('/ai-orchestration/dashboard', { accessToken });
  return data.dashboard;
}

export async function fetchAiProviders(accessToken: string) {
  const data = await request<{ providers: AiProviderSummary[] }>('/ai-orchestration/providers', { accessToken });
  return data.providers;
}

export async function fetchAiModels(accessToken: string) {
  const data = await request<{ models: AiModelSummary[] }>('/ai-orchestration/models', { accessToken });
  return data.models;
}

export async function fetchAiRouting(accessToken: string) {
  const data = await request<{ rules: AiRoutingRuleSummary[] }>('/ai-orchestration/routing', { accessToken });
  return data.rules;
}

export async function fetchAiPromptTemplates(accessToken: string) {
  const data = await request<{ templates: AiPromptTemplateSummary[] }>('/ai-orchestration/prompts/templates', {
    accessToken,
  });
  return data.templates;
}

export async function fetchAiPromptVersions(accessToken: string) {
  const data = await request<{ versions: AiPromptVersionSummary[] }>('/ai-orchestration/prompts/versions', {
    accessToken,
  });
  return data.versions;
}

export async function fetchAiConfigurationActions(accessToken: string) {
  const data = await request<{ actions: AiConfigurationActionSummary[] }>('/ai-orchestration/actions', { accessToken });
  return data.actions;
}

export async function createAiProvider(accessToken: string, body: CreateAiProviderRequest) {
  const data = await request<{ provider: AiProviderSummary }>('/ai-orchestration/providers', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.provider;
}

export async function createAiPromptTemplate(accessToken: string, body: CreateAiPromptTemplateRequest) {
  const data = await request<{ template: AiPromptTemplateSummary; version: AiPromptVersionSummary }>(
    '/ai-orchestration/prompts/templates',
    { accessToken, method: 'POST', body },
  );
  return data;
}

export async function createAiConfigurationAction(accessToken: string, body: CreateAiConfigurationActionRequest) {
  const data = await request<{ action: AiConfigurationActionSummary }>('/ai-orchestration/actions', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.action;
}

export async function fetchAiGatewayStatus(accessToken: string) {
  const data = await request<{ status: UnifiedAiGatewayStatus }>('/ai-orchestration/gateway/status', {
    accessToken,
  });
  return data.status;
}

export async function fetchAiFailovers(accessToken: string) {
  const data = await request<{ failovers: Array<{ id: string; reason: string; loggedAt: string }> }>(
    '/ai-orchestration/failovers',
    { accessToken },
  );
  return data.failovers;
}

export async function fetchAiComparisonRuns(accessToken: string) {
  const data = await request<{ runs: AiComparisonRunSummary[] }>('/ai-orchestration/comparisons', { accessToken });
  return data.runs;
}

export async function createAiComparisonRun(accessToken: string, body: CreateAiComparisonRunRequest) {
  const data = await request<{ run: AiComparisonRunSummary }>('/ai-orchestration/comparisons', {
    accessToken,
    method: 'POST',
    body,
  });
  return data.run;
}

export async function syncAiMemory(accessToken: string, body: SyncAiMemoryRequest) {
  const data = await request<{ syncRecordId: string; deduplicated: boolean }>('/ai-orchestration/memory-sync', {
    accessToken,
    method: 'POST',
    body,
  });
  return data;
}
