import { and, desc, eq, inArray } from 'drizzle-orm';
import { createRuntimeAuraProvider, resolveDefaultBaseUrl } from '@titan/aura';
import type { AuraConfig, AuraGenerateRequest, AuraProvider } from '@titan/aura';
import { AuraProviderError } from '@titan/aura';
import type {
  AiGenerateWithResilienceOptions,
  AiGenerateWithResilienceResult,
  AiProviderKey,
  AiResilienceStatusSummary,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  aiFailoverEvents,
  aiModels,
  aiProviders,
  aiRequestQueue,
  aiRoutingRules,
} from '@titan/db';
import { decryptSecret } from '../lib/crypto.js';
import {
  AiIntelligentRoutingService,
  estimateModelCostCents,
  type RankableProvider,
} from './ai-intelligent-routing.service.js';
import type { AiMemorySyncService } from './ai-memory-sync.service.js';
import type { AiOrchestrationService } from './ai-orchestration.service.js';
import type { AiOperationsService } from './ai-operations.service.js';

export class AiProviderResilienceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly attemptedProviders: string[] = [],
  ) {
    super(message);
    this.name = 'AiProviderResilienceError';
  }
}

type ResilienceDeps = {
  db: DatabaseClient;
  aiOrchestrationService: AiOrchestrationService;
  aiOperationsService: AiOperationsService;
  aiMemorySyncService?: AiMemorySyncService;
  auraConfig: AuraConfig;
  encryptionKey?: string;
  envProvider: AuraProvider | null;
};

type RuntimeProvider = {
  providerKey: string;
  modelKey: string;
  providerId: string | null;
  displayName: string;
  provider: AuraProvider;
  contextWindow: number;
  capabilities: RankableProvider['capabilities'];
  multimodal: boolean;
  averageLatencyMs: number | null;
  priorityWeight: number;
  pricingMetadata: Record<string, unknown>;
};

type TargetGenerateOptions = AiGenerateWithResilienceOptions & {
  providerKey: string;
  modelKey?: string;
  providerId?: string;
};

type ProviderChainCacheEntry = {
  expiresAt: number;
  chain: RuntimeProvider[];
};

const PROVIDER_CHAIN_CACHE_TTL_MS = 30_000;

export class AiProviderResilienceService {
  private readonly routingService = new AiIntelligentRoutingService();
  private readonly providerChainCache = new Map<string, ProviderChainCacheEntry>();

  constructor(private readonly deps: ResilienceDeps) {}

  async hasConfiguredProviders(companyId: string): Promise<boolean> {
    const chain = await this.buildProviderChain(companyId, undefined, [], true);
    return chain.length > 0;
  }

  async listConfiguredTargets(companyId: string) {
    const config = await this.deps.aiOperationsService.ensureResilienceConfig(companyId);
    const chain = await this.buildProviderChain(companyId, undefined, config.fallbackOrder, true);
    return chain.map((candidate) => ({
      providerKey: candidate.providerKey as AiProviderKey,
      modelKey: candidate.modelKey,
      providerId: candidate.providerId ?? undefined,
    }));
  }

  async prepareProviderChain(
    companyId: string,
    options: AiGenerateWithResilienceOptions,
  ): Promise<{
    config: Awaited<ReturnType<AiOperationsService['ensureResilienceConfig']>>;
    chain: RuntimeProvider[];
    providerRoutingMs: number;
  }> {
    const started = Date.now();
    const config = await this.assertRoutingAllowed(companyId, options);
    const chain = await this.buildProviderChain(
      companyId,
      options.routingCategory,
      config.fallbackOrder,
      config.taskRoutingEnabled,
    );
    return {
      config,
      chain,
      providerRoutingMs: Date.now() - started,
    };
  }

  async generate(
    companyId: string,
    request: AuraGenerateRequest,
    options: AiGenerateWithResilienceOptions,
    prepared?: {
      config: Awaited<ReturnType<AiOperationsService['ensureResilienceConfig']>>;
      chain: RuntimeProvider[];
      providerRoutingMs: number;
    },
  ): Promise<AiGenerateWithResilienceResult> {
    const preparedChain =
      prepared ??
      (await this.prepareProviderChain(companyId, options));
    const { config, chain, providerRoutingMs } = preparedChain;

    if (chain.length === 0) {
      throw new AiProviderResilienceError(
        'NO_PROVIDERS_CONFIGURED',
        'No AI providers are configured. Configure tenant providers or set AURA_OPENAI_API_KEY.',
      );
    }

    const sanitizedRequest = this.deps.aiMemorySyncService
      ? {
          ...request,
          context: this.deps.aiMemorySyncService.sanitizeContextForExternalProvider(request.context),
        }
      : request;

    const result = await this.executeProviderChain(
      companyId,
      sanitizedRequest,
      options,
      chain,
      config.maxRetries,
      config.retryBaseDelayMs,
      config.queueEnabled,
    );

    return { ...result, providerRoutingMs, agentRoutingMs: providerRoutingMs };
  }

  async generateForTarget(
    companyId: string,
    request: AuraGenerateRequest,
    options: TargetGenerateOptions,
  ): Promise<AiGenerateWithResilienceResult> {
    await this.assertRoutingAllowed(companyId, options);
    const runtime = await this.resolveRuntimeProvider(
      companyId,
      options.providerKey,
      options.modelKey,
      options.providerId,
    );

    if (!runtime) {
      throw new AiProviderResilienceError(
        'PROVIDER_NOT_AVAILABLE',
        `Provider ${options.providerKey} is not configured.`,
      );
    }

    const sanitizedRequest = this.deps.aiMemorySyncService
      ? {
          ...request,
          context: this.deps.aiMemorySyncService.sanitizeContextForExternalProvider(request.context),
        }
      : request;

    return this.executeSingleProvider(companyId, sanitizedRequest, options, runtime);
  }

  async getResilienceStatus(companyId: string): Promise<AiResilienceStatusSummary> {
    const config = await this.deps.aiOperationsService.ensureResilienceConfig(companyId);
    const summaries = await this.deps.aiOrchestrationService.listProviders(companyId);
    const pendingRows = await this.deps.db.query.aiRequestQueue.findMany({
      where: and(eq(aiRequestQueue.companyId, companyId), eq(aiRequestQueue.status, 'pending')),
    });
    const recentFailovers = await this.deps.db.query.aiFailoverEvents.findMany({
      where: eq(aiFailoverEvents.companyId, companyId),
      orderBy: [desc(aiFailoverEvents.loggedAt)],
      limit: 20,
    });

    return {
      providers: summaries
        .filter((provider) => provider.isConfigured)
        .map((provider) => ({
          providerKey: provider.providerKey,
          providerId: provider.id,
          displayName: provider.name,
          healthStatus: provider.healthStatus,
          isEnabled: provider.isEnabled,
          averageLatencyMs: provider.averageLatencyMs,
          lastHealthCheckAt: provider.lastHealthCheckAt,
        })),
      pendingQueueCount: pendingRows.length,
      recentFailoverCount: recentFailovers.length,
      config: {
        fallbackOrder: config.fallbackOrder,
        maxRetries: config.maxRetries,
        retryBaseDelayMs: config.retryBaseDelayMs,
        queueEnabled: config.queueEnabled,
        lowCreditWarningCents: config.lowCreditWarningCents,
        highUsageWarningTokens: config.highUsageWarningTokens,
        hardSpendingLimitEnabled: config.hardSpendingLimitEnabled,
        hardSpendingLimitCents: config.hardSpendingLimitCents,
        taskRoutingEnabled: config.taskRoutingEnabled,
        aiAccessMode: config.aiAccessMode,
        blockedCategories: config.blockedCategories,
      },
    };
  }

  private async assertRoutingAllowed(
    companyId: string,
    options: AiGenerateWithResilienceOptions,
  ) {
    await this.deps.aiOperationsService.assertAiOperationAllowed(
      { companyId, userId: options.userId },
      options.operationType,
    );

    const config = await this.deps.aiOperationsService.ensureResilienceConfig(companyId);
    if (
      options.routingCategory &&
      config.blockedCategories.includes(options.routingCategory)
    ) {
      throw new AiProviderResilienceError(
        'ROUTING_BLOCKED',
        `Routing category ${options.routingCategory} is blocked by tenant policy.`,
      );
    }

    return config;
  }

  private async executeSingleProvider(
    companyId: string,
    request: AuraGenerateRequest,
    options: AiGenerateWithResilienceOptions,
    candidate: RuntimeProvider,
  ) {
    const started = Date.now();
    const content = await candidate.provider.generate(request);
    const latencyMs = Date.now() - started;
    const promptTokens = estimateTokens(request.messages.map((message) => message.content).join('\n'));
    const completionTokens = estimateTokens(content);
    const costCents = estimateModelCostCents(candidate.pricingMetadata, promptTokens, completionTokens);

    await this.deferRecordSuccessfulUsage(
      companyId,
      options,
      candidate,
      promptTokens,
      completionTokens,
      costCents,
      latencyMs,
      0,
    );
    return {
      content,
      providerKey: candidate.providerKey,
      modelKey: candidate.modelKey,
      providerId: candidate.providerId,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costCents,
      failoverCount: 0,
      queued: false,
      providerLatencyMs: latencyMs,
      providerAttempts: 1,
      retryCount: 0,
    };
  }

  private async executeProviderChain(
    companyId: string,
    request: AuraGenerateRequest,
    options: AiGenerateWithResilienceOptions,
    chain: RuntimeProvider[],
    maxRetries: number,
    retryBaseDelayMs: number,
    queueEnabled: boolean,
  ) {
    const attempted: string[] = [];
    let failoverCount = 0;
    let lastError: Error | null = null;
    let retryCount = 0;

    for (let index = 0; index < chain.length; index += 1) {
      const candidate = chain[index]!;

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        attempted.push(`${candidate.providerKey}:${candidate.modelKey}`);
        try {
          if (attempt > 0) {
            retryCount += 1;
            await sleep(retryBaseDelayMs * 2 ** (attempt - 1));
          }

          const started = Date.now();
          const content = await candidate.provider.generate(request);
          const latencyMs = Date.now() - started;
          const promptTokens = estimateTokens(
            request.messages.map((message) => message.content).join('\n'),
          );
          const completionTokens = estimateTokens(content);
          const costCents = estimateModelCostCents(candidate.pricingMetadata, promptTokens, completionTokens);

          this.deferRecordSuccessfulUsage(
            companyId,
            options,
            candidate,
            promptTokens,
            completionTokens,
            costCents,
            latencyMs,
            failoverCount,
          );

          return {
            content,
            providerKey: candidate.providerKey,
            modelKey: candidate.modelKey,
            providerId: candidate.providerId,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            costCents,
            failoverCount,
            queued: false,
            providerLatencyMs: latencyMs,
            providerAttempts: attempted.length,
            retryCount,
          };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown provider error');
          const reason = mapFailoverReason(error);

          if (candidate.providerId) {
            await this.deps.db
              .update(aiProviders)
              .set({
                healthStatus: reason === 'rate_limit' || reason === 'credit_exhausted' ? 'degraded' : 'unhealthy',
                updatedAt: new Date(),
              })
              .where(eq(aiProviders.id, candidate.providerId));
          }

          if (attempt >= maxRetries) {
            break;
          }
        }
      }

      const next = chain[index + 1];
      if (next) {
        await this.deps.db.insert(aiFailoverEvents).values({
          companyId,
          fromProviderId: candidate.providerId,
          toProviderId: next.providerId,
          reason: mapFailoverReason(lastError),
          contextPreserved: true,
          metadata: {
            fromProviderKey: candidate.providerKey,
            toProviderKey: next.providerKey,
            lastError: lastError?.message ?? null,
          },
        });
        failoverCount += 1;
      }
    }

    if (queueEnabled) {
      await this.deps.db.insert(aiRequestQueue).values({
        companyId,
        userId: options.userId,
        status: 'pending',
        operationType: options.operationType,
        routingCategory: options.routingCategory ?? null,
        payload: {
          messageCount: request.messages.length,
          conversationId: options.conversationId ?? null,
          agentRunId: options.agentRunId ?? null,
        },
        lastError: lastError?.message ?? 'All providers failed',
      });
    }

    throw new AiProviderResilienceError(
      'ALL_PROVIDERS_UNAVAILABLE',
      `All configured AI providers are unavailable. Attempted: ${[...new Set(attempted)].join(', ')}. ${lastError?.message ?? ''}`.trim(),
      [...new Set(attempted)],
    );
  }

  private deferRecordSuccessfulUsage(
    companyId: string,
    options: AiGenerateWithResilienceOptions,
    candidate: RuntimeProvider,
    promptTokens: number,
    completionTokens: number,
    costCents: number,
    latencyMs: number,
    failoverCount: number,
  ) {
    void this.recordSuccessfulUsage(
      companyId,
      options,
      candidate,
      promptTokens,
      completionTokens,
      costCents,
      latencyMs,
      failoverCount,
    ).catch(() => {});
  }

  private async recordSuccessfulUsage(
    companyId: string,
    options: AiGenerateWithResilienceOptions,
    candidate: RuntimeProvider,
    promptTokens: number,
    completionTokens: number,
    costCents: number,
    latencyMs: number,
    failoverCount: number,
  ) {
    await this.deps.aiOperationsService.recordUsage({
      companyId,
      userId: options.userId,
      providerId: candidate.providerId,
      conversationId: options.conversationId ?? null,
      agentRunId: options.agentRunId ?? null,
      promptTokens,
      completionTokens,
      costCents,
      metadata: {
        providerKey: candidate.providerKey,
        modelKey: candidate.modelKey,
        latencyMs,
        failoverCount,
        operationType: options.operationType,
        routingCategory: options.routingCategory ?? null,
      },
    });

    if (candidate.providerId) {
      await this.deps.db
        .update(aiProviders)
        .set({
          healthStatus: 'healthy',
          averageLatencyMs: latencyMs,
          lastHealthCheckAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(aiProviders.id, candidate.providerId));
    }
  }

  private cacheProviderChain(cacheKey: string, chain: RuntimeProvider[]) {
    this.providerChainCache.set(cacheKey, {
      expiresAt: Date.now() + PROVIDER_CHAIN_CACHE_TTL_MS,
      chain,
    });
  }

  private async buildProviderChain(
    companyId: string,
    routingCategory: AiGenerateWithResilienceOptions['routingCategory'],
    configuredFallback: Array<{ providerKey: string; modelKey?: string; providerId?: string }>,
    taskRoutingEnabled: boolean,
  ): Promise<RuntimeProvider[]> {
    const cacheKey = `${companyId}:${routingCategory ?? 'none'}:${taskRoutingEnabled}:${configuredFallback.length}`;
    const cached = this.providerChainCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.chain;
    }

    const chain: RuntimeProvider[] = [];
    const seen = new Set<string>();

    const addCandidate = (candidate: RuntimeProvider | null) => {
      if (!candidate) {
        return;
      }
      const key = `${candidate.providerKey}:${candidate.modelKey}:${candidate.providerId ?? 'env'}`;
      if (!seen.has(key)) {
        seen.add(key);
        chain.push(candidate);
      }
    };

    if (
      this.deps.envProvider &&
      this.deps.auraConfig.provider === 'openai' &&
      configuredFallback.length === 0
    ) {
      const [tenantProvider, rule] = await Promise.all([
        this.deps.db.query.aiProviders.findFirst({
          where: and(eq(aiProviders.companyId, companyId), eq(aiProviders.isEnabled, true)),
        }),
        taskRoutingEnabled && routingCategory
          ? this.deps.db.query.aiRoutingRules.findFirst({
              where: and(
                eq(aiRoutingRules.companyId, companyId),
                eq(aiRoutingRules.category, routingCategory),
                eq(aiRoutingRules.isEnabled, true),
              ),
              orderBy: [desc(aiRoutingRules.priorityOrder)],
            })
          : Promise.resolve(null),
      ]);

      if (!tenantProvider && !rule) {
        const env = await this.resolveEnvironmentProvider();
        if (env) {
          const fastChain = [env];
          this.cacheProviderChain(cacheKey, fastChain);
          return fastChain;
        }
      }
    }

    let rule: typeof aiRoutingRules.$inferSelect | null | undefined = null;

    if (taskRoutingEnabled && routingCategory) {
      rule = await this.deps.db.query.aiRoutingRules.findFirst({
        where: and(
          eq(aiRoutingRules.companyId, companyId),
          eq(aiRoutingRules.category, routingCategory),
          eq(aiRoutingRules.isEnabled, true),
        ),
        orderBy: [desc(aiRoutingRules.priorityOrder)],
      });

      if (rule?.primaryProviderId) {
        const [primaryProvider, primaryModel] = await Promise.all([
          this.deps.db.query.aiProviders.findFirst({
            where: and(eq(aiProviders.id, rule.primaryProviderId), eq(aiProviders.companyId, companyId)),
          }),
          rule.primaryModelId
            ? this.deps.db.query.aiModels.findFirst({
                where: and(eq(aiModels.id, rule.primaryModelId), eq(aiModels.companyId, companyId)),
              })
            : Promise.resolve(null),
        ]);

        if (primaryProvider) {
          addCandidate(
            await this.resolveRuntimeProvider(
              companyId,
              primaryProvider.providerKey,
              primaryModel?.modelKey,
              primaryProvider.id,
            ),
          );
        }
      }

      const resolved = await Promise.all(
        (rule?.fallbackChain ?? []).map(async (entry) => {
          if (!entry.providerKey) {
            return null;
          }
          return this.resolveRuntimeProvider(companyId, entry.providerKey, entry.modelKey, entry.providerId);
        }),
      );
      for (const candidate of resolved) {
        addCandidate(candidate);
      }
    }

    const fallbackResolved = await Promise.all(
      configuredFallback.map(async (entry) =>
        this.resolveRuntimeProvider(companyId, entry.providerKey, entry.modelKey, entry.providerId),
      ),
    );
    for (const candidate of fallbackResolved) {
      addCandidate(candidate);
    }

    const tenantProviders = await this.deps.db.query.aiProviders.findMany({
      where: and(eq(aiProviders.companyId, companyId), eq(aiProviders.isEnabled, true)),
      orderBy: [desc(aiProviders.priorityWeight)],
    });

    const providerIds = tenantProviders.map((row) => row.id);
    const modelRows =
      providerIds.length > 0
        ? await this.deps.db.query.aiModels.findMany({
            where: and(inArray(aiModels.providerId, providerIds), eq(aiModels.isEnabled, true)),
            orderBy: [desc(aiModels.createdAt)],
          })
        : [];

    const modelByProviderId = new Map<string, (typeof modelRows)[number]>();
    for (const model of modelRows) {
      if (!modelByProviderId.has(model.providerId)) {
        modelByProviderId.set(model.providerId, model);
      }
    }

    const tenantResolved = await Promise.all(
      tenantProviders.map(async (row) =>
        this.resolveRuntimeProviderFromRow(companyId, row, modelByProviderId.get(row.id)),
      ),
    );
    for (const candidate of tenantResolved) {
      addCandidate(candidate);
    }

    addCandidate(await this.resolveEnvironmentProvider());

    const rankable = chain.map((candidate) => ({
      providerKey: candidate.providerKey,
      modelKey: candidate.modelKey,
      providerId: candidate.providerId,
      displayName: candidate.displayName,
      contextWindow: candidate.contextWindow,
      capabilities: candidate.capabilities,
      multimodal: candidate.multimodal,
      averageLatencyMs: candidate.averageLatencyMs,
      priorityWeight: candidate.priorityWeight,
      inputCostPer1kTokensCents: Number(candidate.pricingMetadata.inputPer1kTokensCents ?? 0),
      runtime: candidate,
    }));

    const ranked = this.routingService.rankProviders(rankable, routingCategory).map((entry) => {
      return (entry as (typeof rankable)[number]).runtime;
    });

    this.cacheProviderChain(cacheKey, ranked);
    return ranked;
  }

  private async resolveRuntimeProviderFromRow(
    _companyId: string,
    row: typeof aiProviders.$inferSelect,
    modelRow?: typeof aiModels.$inferSelect,
  ): Promise<RuntimeProvider | null> {
    const resolvedModelKey = modelRow?.modelKey ?? 'gpt-4o-mini';
    const apiKey = await this.resolveProviderApiKey(row);
    if (!apiKey && row.providerKey !== 'ollama') {
      return null;
    }

    const provider = createRuntimeAuraProvider({
      providerKey: row.providerKey,
      apiKey: apiKey ?? 'ollama',
      model: resolvedModelKey,
      baseUrl: row.baseUrl ?? resolveDefaultBaseUrl(row.providerKey),
      apiVersion: row.apiVersion,
      extraConfig: row.config,
    });

    return {
      providerKey: row.providerKey,
      modelKey: resolvedModelKey,
      providerId: row.id,
      displayName: row.displayName,
      provider,
      contextWindow: modelRow?.contextWindow ?? 8192,
      capabilities: (modelRow?.capabilities ?? []) as RankableProvider['capabilities'],
      multimodal: Boolean(modelRow?.capabilities?.includes('multimodal') || modelRow?.capabilities?.includes('vision')),
      averageLatencyMs: row.averageLatencyMs,
      priorityWeight: row.priorityWeight,
      pricingMetadata: modelRow?.pricingMetadata ?? {},
    };
  }

  private async resolveRuntimeProvider(
    companyId: string,
    providerKey: string,
    modelKey?: string,
    providerId?: string,
  ): Promise<RuntimeProvider | null> {
    if (providerKey === 'openai' && this.deps.envProvider && this.deps.auraConfig.provider === 'openai' && !providerId) {
      return {
        providerKey: 'openai',
        modelKey: modelKey ?? this.deps.auraConfig.openaiModel,
        providerId: null,
        displayName: 'OpenAI (Environment)',
        provider: this.deps.envProvider,
        contextWindow: 128000,
        capabilities: ['function_calling', 'streaming', 'structured_output'],
        multimodal: true,
        averageLatencyMs: null,
        priorityWeight: 1000,
        pricingMetadata: {},
      };
    }

    const row = providerId
      ? await this.deps.db.query.aiProviders.findFirst({
          where: and(eq(aiProviders.id, providerId), eq(aiProviders.companyId, companyId), eq(aiProviders.isEnabled, true)),
        })
      : await this.deps.db.query.aiProviders.findFirst({
          where: and(
            eq(aiProviders.companyId, companyId),
            eq(aiProviders.providerKey, providerKey as typeof aiProviders.$inferSelect.providerKey),
            eq(aiProviders.isEnabled, true),
          ),
        });

    if (!row) {
      return null;
    }

    const modelRow = modelKey
      ? await this.deps.db.query.aiModels.findFirst({
          where: and(
            eq(aiModels.providerId, row.id),
            eq(aiModels.modelKey, modelKey),
            eq(aiModels.isEnabled, true),
          ),
        })
      : await this.deps.db.query.aiModels.findFirst({
          where: and(eq(aiModels.providerId, row.id), eq(aiModels.isEnabled, true)),
          orderBy: [desc(aiModels.createdAt)],
        });

    const resolvedModelKey = modelRow?.modelKey ?? modelKey ?? 'gpt-4o-mini';
    const apiKey = await this.resolveProviderApiKey(row);
    if (!apiKey && row.providerKey !== 'ollama') {
      return null;
    }

    const provider = createRuntimeAuraProvider({
      providerKey: row.providerKey,
      apiKey: apiKey ?? 'ollama',
      model: resolvedModelKey,
      baseUrl: row.baseUrl ?? resolveDefaultBaseUrl(row.providerKey),
      apiVersion: row.apiVersion,
      extraConfig: row.config,
    });

    return {
      providerKey: row.providerKey,
      modelKey: resolvedModelKey,
      providerId: row.id,
      displayName: row.displayName,
      provider,
      contextWindow: modelRow?.contextWindow ?? 8192,
      capabilities: (modelRow?.capabilities ?? []) as RankableProvider['capabilities'],
      multimodal: Boolean(modelRow?.capabilities?.includes('multimodal') || modelRow?.capabilities?.includes('vision')),
      averageLatencyMs: row.averageLatencyMs,
      priorityWeight: row.priorityWeight,
      pricingMetadata: modelRow?.pricingMetadata ?? {},
    };
  }

  private async resolveEnvironmentProvider(): Promise<RuntimeProvider | null> {
    if (!this.deps.envProvider || this.deps.auraConfig.provider !== 'openai') {
      return null;
    }

    return {
      providerKey: 'openai',
      modelKey: this.deps.auraConfig.openaiModel,
      providerId: null,
      displayName: 'OpenAI (Environment)',
      provider: this.deps.envProvider,
      contextWindow: 128000,
      capabilities: ['function_calling', 'streaming', 'structured_output'],
      multimodal: true,
      averageLatencyMs: null,
      priorityWeight: 900,
      pricingMetadata: {},
    };
  }

  private async resolveProviderApiKey(row: typeof aiProviders.$inferSelect) {
    if (row.providerKey === 'ollama') {
      return 'ollama';
    }

    if (!row.encryptedCredentials || !this.deps.encryptionKey) {
      return null;
    }

    return decryptSecret(row.encryptedCredentials, this.deps.encryptionKey);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function mapFailoverReason(
  error: unknown,
): 'provider_unavailable' | 'timeout' | 'rate_limit' | 'degraded_performance' | 'credit_exhausted' | 'context_window_exceeded' {
    if (error instanceof AuraProviderError) {
      if (error.code === 'PROVIDER_UNAVAILABLE' || error.code === 'PROVIDER_TIMEOUT') {
        return error.code === 'PROVIDER_TIMEOUT' ? 'timeout' : 'provider_unavailable';
      }
    if (error.details && typeof error.details === 'object' && 'status' in error.details) {
      const status = Number((error.details as { status?: number }).status);
      if (status === 429) {
        return 'rate_limit';
      }
      if (status === 402) {
        return 'credit_exhausted';
      }
      if (status === 413) {
        return 'context_window_exceeded';
      }
    }
    return 'degraded_performance';
  }
  return 'provider_unavailable';
}
