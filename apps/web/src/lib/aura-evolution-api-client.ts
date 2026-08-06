import type {
  AuraEvolutionDashboard,
  AuraEvolutionInsight,
  AuraEvolutionKnowledgeEntry,
  AuraEvolutionLearningItem,
  AuraEvolutionSettings,
  CreateAuraEvolutionKnowledgeRequest,
  DecideAuraEvolutionInsightRequest,
  UpdateAuraEvolutionSettingsRequest,
} from '@titan/shared';
import { request, ApiClientError } from './api-client';

export { ApiClientError as AuraEvolutionApiClientError };

export async function fetchAuraEvolutionOverview(
  accessToken: string,
): Promise<AuraEvolutionDashboard> {
  const data = await request<{ overview: AuraEvolutionDashboard }>('/aura-evolution/overview', {
    accessToken,
  });
  return data.overview;
}

export async function fetchAuraEvolutionSettings(
  accessToken: string,
): Promise<AuraEvolutionSettings> {
  const data = await request<{ settings: AuraEvolutionSettings }>('/aura-evolution/settings', {
    accessToken,
  });
  return data.settings;
}

export async function updateAuraEvolutionSettings(
  accessToken: string,
  input: UpdateAuraEvolutionSettingsRequest,
): Promise<AuraEvolutionSettings> {
  const data = await request<{ settings: AuraEvolutionSettings }>('/aura-evolution/settings', {
    method: 'PATCH',
    accessToken,
    body: input,
  });
  return data.settings;
}

export async function syncAuraEvolutionLearning(accessToken: string): Promise<{
  decisionsCaptured: number;
  scoresUpdated: number;
  patternsUpserted: number;
  insightsCreated: number;
  learningEnabled: boolean;
}> {
  const data = await request<{
    result: {
      decisionsCaptured: number;
      scoresUpdated: number;
      patternsUpserted: number;
      insightsCreated: number;
      learningEnabled: boolean;
    };
  }>('/aura-evolution/sync', { method: 'POST', accessToken, body: {} });
  return data.result;
}

export async function decideAuraEvolutionInsight(
  accessToken: string,
  insightId: string,
  input: DecideAuraEvolutionInsightRequest,
): Promise<AuraEvolutionInsight> {
  const data = await request<{ insight: AuraEvolutionInsight }>(
    `/aura-evolution/insights/${encodeURIComponent(insightId)}/decide`,
    { method: 'POST', accessToken, body: input },
  );
  return data.insight;
}

export async function removeAuraEvolutionLearningItem(
  accessToken: string,
  itemId: string,
): Promise<AuraEvolutionLearningItem> {
  const data = await request<{ item: AuraEvolutionLearningItem }>(
    `/aura-evolution/learning-items/${encodeURIComponent(itemId)}`,
    { method: 'DELETE', accessToken },
  );
  return data.item;
}

export async function createAuraEvolutionKnowledge(
  accessToken: string,
  input: CreateAuraEvolutionKnowledgeRequest,
): Promise<AuraEvolutionKnowledgeEntry> {
  const data = await request<{ entry: AuraEvolutionKnowledgeEntry }>('/aura-evolution/knowledge', {
    method: 'POST',
    accessToken,
    body: input,
  });
  return data.entry;
}
