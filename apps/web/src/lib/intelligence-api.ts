import type {
  AuraMemorySummary,
  CreateAuraMemoryRequest,
  IntelligenceDashboard,
  Recommendation,
  UpdateAuraMemoryRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchIntelligenceDashboard(accessToken: string): Promise<IntelligenceDashboard> {
  const data = await request<{ dashboard: IntelligenceDashboard }>('/intelligence/dashboard', {
    accessToken,
  });
  return data.dashboard;
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
