import type { AiRoutingCategory } from './ai-orchestration.js';

export type AiOperationType =
  | 'conversation'
  | 'agent_run'
  | 'workflow'
  | 'report'
  | 'analysis'
  | 'search'
  | 'recommendation';

export type AiProviderResilienceConfigSummary = {
  fallbackOrder: Array<{ providerKey: string; modelKey?: string; providerId?: string }>;
  maxRetries: number;
  retryBaseDelayMs: number;
  queueEnabled: boolean;
  lowCreditWarningCents: number;
  highUsageWarningTokens: number;
  hardSpendingLimitEnabled: boolean;
  hardSpendingLimitCents: number | null;
  taskRoutingEnabled: boolean;
  aiAccessMode?: 'platform_managed' | 'tenant_credentials' | 'hybrid';
  blockedCategories?: string[];
};

export type AiOperationAllowanceSummary = {
  unlimited: boolean;
  titanLimitsEnforced: boolean;
  subscriptionRequired: boolean;
  allowed: boolean;
  reason: string | null;
  monthlyTokenLimit: number | null;
  monthlyTokensUsed: number;
  monthlyCostCents: number;
  hardSpendingLimitEnabled: boolean;
  hardSpendingLimitCents: number | null;
};

export type AiProviderHealthSummary = {
  providerKey: string;
  providerId: string | null;
  displayName: string;
  healthStatus: string;
  isEnabled: boolean;
  averageLatencyMs: number | null;
  lastHealthCheckAt: string | null;
};

export type AiResilienceStatusSummary = {
  providers: AiProviderHealthSummary[];
  pendingQueueCount: number;
  recentFailoverCount: number;
  config: AiProviderResilienceConfigSummary;
};

export type AiMissionControlAlertCandidate = {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  sourceEntityId: string;
  context: Record<string, unknown>;
};

export type PlatformOwnerAiOperationsDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  allowance: AiOperationAllowanceSummary;
  resilience: AiResilienceStatusSummary;
  alertCandidates: AiMissionControlAlertCandidate[];
};

export type UpdateAiProviderResilienceConfigRequest = {
  fallbackOrder?: Array<{ providerKey: string; modelKey?: string; providerId?: string }>;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  queueEnabled?: boolean;
  lowCreditWarningCents?: number;
  highUsageWarningTokens?: number;
  hardSpendingLimitEnabled?: boolean;
  hardSpendingLimitCents?: number | null;
  taskRoutingEnabled?: boolean;
  aiAccessMode?: 'platform_managed' | 'tenant_credentials' | 'hybrid';
  blockedCategories?: string[];
};

export type AiGenerateWithResilienceOptions = {
  operationType: AiOperationType;
  routingCategory?: AiRoutingCategory;
  conversationId?: string;
  agentRunId?: string;
  userId: string;
};

export type AiGenerateWithResilienceResult = {
  content: string;
  providerKey: string;
  modelKey: string;
  providerId: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costCents: number;
  failoverCount: number;
  queued: boolean;
  providerLatencyMs?: number;
  providerAttempts?: number;
  retryCount?: number;
  agentRoutingMs?: number;
};
