import type {
  AiConfigurationActionSummary,
  AiExecutiveDashboard,
  AiModelSummary,
  AiPromptTemplateSummary,
  AiPromptVersionSummary,
  AiProviderSummary,
  AiRoutingRuleSummary,
  CreateAiConfigurationActionRequest,
  CreateAiPromptTemplateRequest,
  CreateAiProviderRequest,
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
