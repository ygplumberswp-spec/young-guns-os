import type { UnifiedAiGatewayStatus } from '@titan/shared';
import type { AiOrchestrationService } from './ai-orchestration.service.js';
import type { AiOperationsService } from './ai-operations.service.js';
import type { AiMemorySyncService } from './ai-memory-sync.service.js';
import type { AiComparisonService } from './ai-comparison.service.js';
import type { AiProviderResilienceService } from './ai-provider-resilience.service.js';

type UnifiedGatewayDeps = {
  aiOrchestrationService: AiOrchestrationService;
  aiOperationsService: AiOperationsService;
  aiProviderResilienceService: AiProviderResilienceService;
  aiMemorySyncService: AiMemorySyncService;
  aiComparisonService: AiComparisonService;
};

export class AiUnifiedGatewayService {
  constructor(private readonly deps: UnifiedGatewayDeps) {}

  async getGatewayStatus(companyId: string): Promise<UnifiedAiGatewayStatus> {
    const [providers, routingRules, resilience, memorySync, comparisons] = await Promise.all([
      this.deps.aiOrchestrationService.listProviders(companyId),
      this.deps.aiOrchestrationService.listRoutingRules(companyId),
      this.deps.aiProviderResilienceService.getResilienceStatus(companyId),
      this.deps.aiOrchestrationService.listMemorySyncRecords(companyId),
      this.deps.aiComparisonService.listComparisonRuns(companyId, 10),
    ]);

    const configured = providers.filter((provider) => provider.isConfigured);
    const healthy = configured.filter((provider) => provider.healthStatus === 'healthy');

    return {
      summary: `${configured.length} configured provider(s), ${routingRules.length} routing rule(s), unified AURA gateway active.`,
      configuredProviderCount: configured.length,
      healthyProviderCount: healthy.length,
      routingRuleCount: routingRules.length,
      memorySyncCount: memorySync.length,
      comparisonRunCount: comparisons.length,
      aiAccessMode: resilience.config.aiAccessMode ?? 'platform_managed',
      taskRoutingEnabled: resilience.config.taskRoutingEnabled,
    };
  }

  async hasConfiguredProvider(companyId: string): Promise<boolean> {
    return this.deps.aiProviderResilienceService.hasConfiguredProviders(companyId);
  }
}
