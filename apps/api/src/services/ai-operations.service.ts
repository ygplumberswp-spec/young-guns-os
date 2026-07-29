import { and, eq, gte, sql } from 'drizzle-orm';
import type {
  AiMissionControlAlertCandidate,
  AiOperationAllowanceSummary,
  AiOperationType,
  PlatformOwnerAiOperationsDashboard,
  UpdateAiProviderResilienceConfigRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { aiProviderResilienceConfigs, aiUsageRecords } from '@titan/db';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';

export class AiOperationsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AiOperationsError';
  }
}

type StaffScope = { companyId: string; userId: string };

type AiOperationsDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
};

export class AiOperationsService {
  constructor(private readonly deps: AiOperationsDeps) {}

  async hasUnlimitedAiAccess(companyId: string): Promise<boolean> {
    return this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId);
  }

  async assertAiOperationAllowed(
    scope: StaffScope,
    operationType: AiOperationType,
  ): Promise<AiOperationAllowanceSummary> {
    const allowance = await this.getAllowanceSummary(scope.companyId);

    if (!allowance.allowed) {
      throw new AiOperationsError(
        allowance.reason === 'ai_token_limit' ? 'AI_ALLOWANCE_EXCEEDED' : 'AI_ACCESS_DENIED',
        allowance.unlimited
          ? 'AI hard spending limit reached. Disable the hard limit or increase the budget in platform settings.'
          : allowance.reason === 'subscription'
            ? 'An active subscription is required for AI operations on this tenant.'
            : `AI ${operationType.replace(/_/g, ' ')} allowance exceeded for this billing period.`,
      );
    }

    return allowance;
  }

  async getAllowanceSummary(companyId: string): Promise<AiOperationAllowanceSummary> {
    const unlimited = await this.hasUnlimitedAiAccess(companyId);
    const { tokensUsed, costCents } = await this.getMonthlyUsageTotals(companyId);
    const config = await this.ensureResilienceConfig(companyId);

    if (unlimited) {
      const hardBlocked =
        config.hardSpendingLimitEnabled &&
        config.hardSpendingLimitCents != null &&
        costCents >= config.hardSpendingLimitCents;

      return {
        unlimited: true,
        titanLimitsEnforced: false,
        subscriptionRequired: false,
        allowed: !hardBlocked,
        reason: hardBlocked ? 'hard_spending_limit' : null,
        monthlyTokenLimit: null,
        monthlyTokensUsed: tokensUsed,
        monthlyCostCents: costCents,
        hardSpendingLimitEnabled: config.hardSpendingLimitEnabled,
        hardSpendingLimitCents: config.hardSpendingLimitCents,
      };
    }

    const subscriptionEnforced = await this.deps.enterpriseSaasPlatformService.shouldEnforceSubscription(
      companyId,
    );
    if (subscriptionEnforced) {
      const subscriptionUsable = await this.isCustomerSubscriptionUsable(companyId);
      if (!subscriptionUsable) {
        return {
          unlimited: false,
          titanLimitsEnforced: true,
          subscriptionRequired: true,
          allowed: false,
          reason: 'subscription',
          monthlyTokenLimit: null,
          monthlyTokensUsed: tokensUsed,
          monthlyCostCents: costCents,
          hardSpendingLimitEnabled: false,
          hardSpendingLimitCents: null,
        };
      }
    }

    const tokenLimit = await this.getCustomerMonthlyTokenLimit(companyId);
    if (tokenLimit != null && tokensUsed >= tokenLimit) {
      return {
        unlimited: false,
        titanLimitsEnforced: true,
        subscriptionRequired: false,
        allowed: false,
        reason: 'ai_token_limit',
        monthlyTokenLimit: tokenLimit,
        monthlyTokensUsed: tokensUsed,
        monthlyCostCents: costCents,
        hardSpendingLimitEnabled: false,
        hardSpendingLimitCents: null,
      };
    }

    return {
      unlimited: false,
      titanLimitsEnforced: true,
      subscriptionRequired: false,
      allowed: true,
      reason: null,
      monthlyTokenLimit: tokenLimit,
      monthlyTokensUsed: tokensUsed,
      monthlyCostCents: costCents,
      hardSpendingLimitEnabled: false,
      hardSpendingLimitCents: null,
    };
  }

  async getMissionControlAlertCandidates(companyId: string): Promise<AiMissionControlAlertCandidate[]> {
    const allowance = await this.getAllowanceSummary(companyId);
    const config = await this.ensureResilienceConfig(companyId);
    const alerts: AiMissionControlAlertCandidate[] = [];
    const isOwner = allowance.unlimited;

    if (config.lowCreditWarningCents > 0 && allowance.monthlyCostCents >= config.lowCreditWarningCents) {
      alerts.push({
        title: isOwner ? 'AI provider credit usage warning' : 'AI usage cost threshold reached',
        description: `Estimated AI spend this month is ${allowance.monthlyCostCents} cents${isOwner ? '. External provider billing should be reviewed.' : '.'}`,
        severity: allowance.monthlyCostCents >= config.lowCreditWarningCents * 2 ? 'high' : 'medium',
        sourceEntityId: `ai-cost-${companyId}`,
        context: {
          monthlyCostCents: allowance.monthlyCostCents,
          thresholdCents: config.lowCreditWarningCents,
          platformOwner: isOwner,
        },
      });
    }

    if (
      config.highUsageWarningTokens > 0 &&
      allowance.monthlyTokensUsed >= config.highUsageWarningTokens
    ) {
      alerts.push({
        title: isOwner ? 'High AI token usage detected' : 'AI token allowance threshold reached',
        description: `${allowance.monthlyTokensUsed.toLocaleString()} tokens used this month${isOwner ? '. Monitor external provider rate limits and context windows.' : '.'}`,
        severity: 'medium',
        sourceEntityId: `ai-tokens-${companyId}`,
        context: {
          monthlyTokensUsed: allowance.monthlyTokensUsed,
          thresholdTokens: config.highUsageWarningTokens,
          platformOwner: isOwner,
        },
      });
    }

    if (
      isOwner &&
      allowance.hardSpendingLimitEnabled &&
      allowance.hardSpendingLimitCents != null &&
      allowance.monthlyCostCents >= allowance.hardSpendingLimitCents * 0.8 &&
      allowance.monthlyCostCents < allowance.hardSpendingLimitCents
    ) {
      alerts.push({
        title: 'Approaching AI hard spending limit',
        description: `Spend is at ${allowance.monthlyCostCents} of ${allowance.hardSpendingLimitCents} cents hard limit.`,
        severity: 'high',
        sourceEntityId: `ai-hard-limit-${companyId}`,
        context: {
          monthlyCostCents: allowance.monthlyCostCents,
          hardSpendingLimitCents: allowance.hardSpendingLimitCents,
        },
      });
    }

    return alerts;
  }

  async getPlatformOwnerAiDashboard(companyId: string): Promise<PlatformOwnerAiOperationsDashboard> {
    const isPlatformOwner = await this.hasUnlimitedAiAccess(companyId);
    const allowance = await this.getAllowanceSummary(companyId);
    const alertCandidates = await this.getMissionControlAlertCandidates(companyId);
    const config = await this.ensureResilienceConfig(companyId);

    return {
      summary: isPlatformOwner
        ? `Platform owner unlimited AI — ${allowance.monthlyTokensUsed.toLocaleString()} tokens this month, TITAN limits bypassed${allowance.hardSpendingLimitEnabled ? ' (hard spending limit enabled)' : ''}.`
        : `Customer AI allowance — ${allowance.monthlyTokensUsed.toLocaleString()} / ${allowance.monthlyTokenLimit?.toLocaleString() ?? '∞'} tokens this month.`,
      isPlatformOwner,
      allowance,
      resilience: {
        providers: [],
        pendingQueueCount: 0,
        recentFailoverCount: 0,
        config: this.toConfigSummary(config),
      },
      alertCandidates,
    };
  }

  async updateResilienceConfig(
    scope: StaffScope,
    input: UpdateAiProviderResilienceConfigRequest,
  ) {
    await this.ensureResilienceConfig(scope.companyId);
    const [row] = await this.deps.db
      .update(aiProviderResilienceConfigs)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(aiProviderResilienceConfigs.companyId, scope.companyId))
      .returning();
    return this.toConfigSummary(row!);
  }

  async ensureResilienceConfig(companyId: string) {
    const existing = await this.deps.db.query.aiProviderResilienceConfigs.findFirst({
      where: eq(aiProviderResilienceConfigs.companyId, companyId),
    });
    if (existing) {
      return existing;
    }

    const isOwner = await this.hasUnlimitedAiAccess(companyId);
    const [row] = await this.deps.db
      .insert(aiProviderResilienceConfigs)
      .values({
        companyId,
        hardSpendingLimitEnabled: false,
        lowCreditWarningCents: isOwner ? 5000 : 1000,
        highUsageWarningTokens: isOwner ? 1_000_000 : 500_000,
      })
      .returning();
    return row!;
  }

  async recordUsage(input: {
    companyId: string;
    userId: string;
    providerId?: string | null;
    conversationId?: string | null;
    agentRunId?: string | null;
    promptTokens: number;
    completionTokens: number;
    costCents?: number;
    metadata?: Record<string, unknown>;
  }) {
    const totalTokens = input.promptTokens + input.completionTokens;
    await this.deps.db.insert(aiUsageRecords).values({
      companyId: input.companyId,
      userId: input.userId,
      providerId: input.providerId ?? null,
      conversationId: input.conversationId ?? null,
      agentRunId: input.agentRunId ?? null,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens,
      costCents: input.costCents ?? 0,
      metadata: input.metadata ?? {},
    });
  }

  private async getMonthlyUsageTotals(companyId: string) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [row] = await this.deps.db
      .select({
        tokens: sql<number>`coalesce(sum(${aiUsageRecords.totalTokens}), 0)`,
        cost: sql<number>`coalesce(sum(${aiUsageRecords.costCents}), 0)`,
      })
      .from(aiUsageRecords)
      .where(and(eq(aiUsageRecords.companyId, companyId), gte(aiUsageRecords.recordedAt, monthStart)));

    return {
      tokensUsed: Number(row?.tokens ?? 0),
      costCents: Number(row?.cost ?? 0),
    };
  }

  private async getCustomerMonthlyTokenLimit(companyId: string): Promise<number | null> {
    const dashboard = await this.deps.enterpriseSaasPlatformService.getPlatformDashboard(companyId);
    const planLimit = dashboard.subscription?.plan?.limits?.aiTokens;
    if (planLimit != null) {
      return planLimit;
    }

    const entitlement = dashboard.entitlements.find((entry) => entry.featureKey === 'ai_tokens');
    return entitlement?.limitValue ?? null;
  }

  private async isCustomerSubscriptionUsable(companyId: string): Promise<boolean> {
    const dashboard = await this.deps.enterpriseSaasPlatformService.getPlatformDashboard(companyId);
    const status = dashboard.subscription?.status;
    return status != null && ['trial', 'active', 'grace_period'].includes(status);
  }

  private toConfigSummary(row: typeof aiProviderResilienceConfigs.$inferSelect) {
    return {
      fallbackOrder: row.fallbackOrder,
      maxRetries: row.maxRetries,
      retryBaseDelayMs: row.retryBaseDelayMs,
      queueEnabled: row.queueEnabled,
      lowCreditWarningCents: row.lowCreditWarningCents,
      highUsageWarningTokens: row.highUsageWarningTokens,
      hardSpendingLimitEnabled: row.hardSpendingLimitEnabled,
      hardSpendingLimitCents: row.hardSpendingLimitCents,
      taskRoutingEnabled: row.taskRoutingEnabled,
      aiAccessMode: row.aiAccessMode,
      blockedCategories: row.blockedCategories,
    };
  }
}
