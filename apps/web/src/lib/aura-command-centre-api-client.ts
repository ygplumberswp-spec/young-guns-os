import type {
  AuraCommandActionDraft,
  AuraCommandAgentRegistryEntry,
  AuraCommandCentreDashboard,
  AuraCommandFollowUp,
  AuraCommandHandoffSummary,
  AuraCommandMemoryEntry,
  CreateAuraCommandActionDraftRequest,
  CreateAuraCommandFollowUpRequest,
  CreateAuraCommandHandoffRequest,
  CreateAuraCommandMemoryRequest,
  DecideAuraCommandRequest,
  UpdateAuraCommandMemoryRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as AuraCommandCentreApiClientError };

export async function fetchAuraCommandCentreDashboard(
  accessToken: string,
): Promise<AuraCommandCentreDashboard> {
  const data = await request<{ dashboard: AuraCommandCentreDashboard }>(
    '/aura-command-centre/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function fetchAuraCommandMemory(
  accessToken: string,
): Promise<AuraCommandMemoryEntry[]> {
  const data = await request<{ entries: AuraCommandMemoryEntry[] }>(
    '/aura-command-centre/memory',
    { accessToken },
  );
  return data.entries;
}

export async function createAuraCommandMemory(
  accessToken: string,
  input: CreateAuraCommandMemoryRequest,
): Promise<AuraCommandMemoryEntry> {
  const data = await request<{ entry: AuraCommandMemoryEntry }>('/aura-command-centre/memory', {
    method: 'POST',
    accessToken,
    body: input,
  });
  return data.entry;
}

export async function updateAuraCommandMemory(
  accessToken: string,
  memoryId: string,
  input: UpdateAuraCommandMemoryRequest,
): Promise<AuraCommandMemoryEntry> {
  const data = await request<{ entry: AuraCommandMemoryEntry }>(
    `/aura-command-centre/memory/${encodeURIComponent(memoryId)}`,
    { method: 'PATCH', accessToken, body: input },
  );
  return data.entry;
}

export async function fetchAuraCommandHandoffs(
  accessToken: string,
): Promise<AuraCommandHandoffSummary[]> {
  const data = await request<{ handoffs: AuraCommandHandoffSummary[] }>(
    '/aura-command-centre/handoffs',
    { accessToken },
  );
  return data.handoffs;
}

export async function createAuraCommandHandoff(
  accessToken: string,
  input: CreateAuraCommandHandoffRequest,
): Promise<AuraCommandHandoffSummary> {
  const data = await request<{ handoff: AuraCommandHandoffSummary }>(
    '/aura-command-centre/handoffs',
    { method: 'POST', accessToken, body: input },
  );
  return data.handoff;
}

export async function decideAuraCommandHandoff(
  accessToken: string,
  handoffId: string,
  input: DecideAuraCommandRequest,
): Promise<AuraCommandHandoffSummary> {
  const data = await request<{ handoff: AuraCommandHandoffSummary }>(
    `/aura-command-centre/handoffs/${encodeURIComponent(handoffId)}/decide`,
    { method: 'POST', accessToken, body: input },
  );
  return data.handoff;
}

export async function fetchAuraCommandActions(
  accessToken: string,
): Promise<AuraCommandActionDraft[]> {
  const data = await request<{ drafts: AuraCommandActionDraft[] }>('/aura-command-centre/actions', {
    accessToken,
  });
  return data.drafts;
}

export async function createAuraCommandActionDraft(
  accessToken: string,
  input: CreateAuraCommandActionDraftRequest,
): Promise<AuraCommandActionDraft> {
  const data = await request<{ draft: AuraCommandActionDraft }>('/aura-command-centre/actions', {
    method: 'POST',
    accessToken,
    body: input,
  });
  return data.draft;
}

export async function decideAuraCommandActionDraft(
  accessToken: string,
  draftId: string,
  input: DecideAuraCommandRequest,
): Promise<AuraCommandActionDraft> {
  const data = await request<{ draft: AuraCommandActionDraft }>(
    `/aura-command-centre/actions/${encodeURIComponent(draftId)}/decide`,
    { method: 'POST', accessToken, body: input },
  );
  return data.draft;
}

export async function fetchAuraCommandFollowUps(
  accessToken: string,
): Promise<AuraCommandFollowUp[]> {
  const data = await request<{ followUps: AuraCommandFollowUp[] }>(
    '/aura-command-centre/follow-ups',
    { accessToken },
  );
  return data.followUps;
}

export async function createAuraCommandFollowUp(
  accessToken: string,
  input: CreateAuraCommandFollowUpRequest,
): Promise<AuraCommandFollowUp> {
  const data = await request<{ followUp: AuraCommandFollowUp }>(
    '/aura-command-centre/follow-ups',
    { method: 'POST', accessToken, body: input },
  );
  return data.followUp;
}

export async function completeAuraCommandFollowUp(
  accessToken: string,
  followUpId: string,
): Promise<AuraCommandFollowUp> {
  const data = await request<{ followUp: AuraCommandFollowUp }>(
    `/aura-command-centre/follow-ups/${encodeURIComponent(followUpId)}/complete`,
    { method: 'POST', accessToken, body: {} },
  );
  return data.followUp;
}

export async function fetchAuraCommandAgents(
  accessToken: string,
): Promise<AuraCommandAgentRegistryEntry[]> {
  const data = await request<{ agents: AuraCommandAgentRegistryEntry[] }>(
    '/aura-command-centre/agents',
    { accessToken },
  );
  return data.agents;
}

export async function ensureAuraCommandAgentRegistry(
  accessToken: string,
): Promise<AuraCommandAgentRegistryEntry[]> {
  const data = await request<{ agents: AuraCommandAgentRegistryEntry[] }>(
    '/aura-command-centre/agents/ensure-registry',
    { method: 'POST', accessToken, body: {} },
  );
  return data.agents;
}
