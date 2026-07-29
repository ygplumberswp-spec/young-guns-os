import type { AiProviderKey, AiRoutingCategory } from './ai-orchestration.js';

export type AiComparisonRunStatus = 'pending_approval' | 'approved' | 'rejected' | 'completed';

export type AiComparisonResultSummary = {
  id: string;
  providerKey: AiProviderKey;
  modelKey: string;
  providerId: string | null;
  responseContent: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number | null;
  createdAt: string;
};

export type AiComparisonRunSummary = {
  id: string;
  subject: string;
  taskPrompt: string;
  routingCategory: AiRoutingCategory | null;
  status: AiComparisonRunStatus;
  consolidatedRecommendation: string | null;
  disagreementSummary: string | null;
  results: AiComparisonResultSummary[];
  createdAt: string;
  updatedAt: string;
};

export type CreateAiComparisonRunRequest = {
  subject: string;
  taskPrompt: string;
  routingCategory?: AiRoutingCategory;
  providerTargets?: Array<{ providerKey: AiProviderKey; modelKey?: string; providerId?: string }>;
};

export type UnifiedAiGatewayStatus = {
  summary: string;
  configuredProviderCount: number;
  healthyProviderCount: number;
  routingRuleCount: number;
  memorySyncCount: number;
  comparisonRunCount: number;
  aiAccessMode: 'platform_managed' | 'tenant_credentials' | 'hybrid';
  taskRoutingEnabled: boolean;
};

export type SyncAiMemoryRequest = {
  contextType: 'business' | 'customer' | 'job' | 'finance' | 'executive' | 'workflow';
  syncKey: string;
  title: string;
  content: string;
  summary?: string;
  conversationId?: string;
  providerId?: string;
  classification?: 'public' | 'internal' | 'confidential' | 'restricted';
};

export type AiMemorySyncRecordSummary = {
  id: string;
  contextType: string;
  syncKey: string;
  providerId: string | null;
  metadata: Record<string, unknown>;
  syncedAt: string;
};
