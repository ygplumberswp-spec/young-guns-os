import type { AgentRegistryEntry } from '@titan/shared';

type AiProviderSnapshot = {
  configured: boolean | null;
  fetchedAt: number;
};

type AgentRegistrySnapshot = {
  registry: AgentRegistryEntry[];
  fetchedAt: number;
};

const aiProviderCache = new Map<string, AiProviderSnapshot>();
const agentRegistryCache = new Map<string, AgentRegistrySnapshot>();

const CACHE_TTL_MS = 5 * 60 * 1000;

export function getCachedAiProviderConfigured(accessToken: string): boolean | null {
  const cached = aiProviderCache.get(accessToken);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
    aiProviderCache.delete(accessToken);
    return null;
  }

  return cached.configured;
}

export function setCachedAiProviderConfigured(
  accessToken: string,
  configured: boolean | null,
): void {
  aiProviderCache.set(accessToken, { configured, fetchedAt: Date.now() });
}

export function getCachedAgentRegistry(accessToken: string): AgentRegistryEntry[] | null {
  const cached = agentRegistryCache.get(accessToken);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
    agentRegistryCache.delete(accessToken);
    return null;
  }

  return cached.registry;
}

export function setCachedAgentRegistry(accessToken: string, registry: AgentRegistryEntry[]): void {
  agentRegistryCache.set(accessToken, { registry, fetchedAt: Date.now() });
}
