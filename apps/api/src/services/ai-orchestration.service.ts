import { and, desc, eq } from 'drizzle-orm';
import type { AuraConfig } from '@titan/aura';
import {
  AI_PROVIDER_REGISTRY,
  type AiCapabilityFlag,
  type AiConfigurationActionSummary,
  type AiCostAnalytics,
  type AiExecutiveDashboard,
  type AiFailoverEventSummary,
  type AiFeedbackSummary,
  type AiMemorySyncSummary,
  type AiModelSummary,
  type AiOrchestrationAuraContext,
  type AiPromptTemplateSummary,
  type AiPromptVersionSummary,
  type AiRoutingCategory,
  type AiRoutingMode,
  type AiProviderKey,
  type AiProviderSummary,
  type AiQualityAnalytics,
  type AiQualityEvaluationSummary,
  type AiRoutingRuleSummary,
  type AiRoutingStatistics,
  type AiUsageRecordSummary,
  type CreateAiConfigurationActionRequest,
  type CreateAiFeedbackRequest,
  type CreateAiPromptTemplateRequest,
  type CreateAiPromptVersionRequest,
  type CreateAiProviderRequest,
  type CreateAiQualityEvaluationRequest,
  type CreateAiRoutingRuleRequest,
  type UpdateAiProviderRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  aiConfigurationActions,
  aiFailoverEvents,
  aiFeedbackRecords,
  aiMemorySyncRecords,
  aiModels,
  aiPromptTemplates,
  aiPromptVersions,
  aiProviders,
  aiQualityEvaluations,
  aiRoutingRules,
  aiUsageRecords,
} from '@titan/db';
import { encryptSecret } from '../lib/crypto.js';
import type { NotificationService } from './notification.service.js';

export class AiOrchestrationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AiOrchestrationError';
  }
}

type StaffScope = {
  companyId: string;
  userId: string;
};

type AiOrchestrationServiceOptions = {
  encryptionKey?: string;
  auraConfig?: AuraConfig;
  isAuraConfigured?: boolean;
};

export class AiOrchestrationService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly notificationService: NotificationService,
    private readonly options: AiOrchestrationServiceOptions = {},
  ) {}

  async listProviders(companyId: string): Promise<AiProviderSummary[]> {
    const tenantRows = await this.db.query.aiProviders.findMany({
      where: eq(aiProviders.companyId, companyId),
      orderBy: [desc(aiProviders.priorityWeight), desc(aiProviders.createdAt)],
    });

    const tenantSummaries = tenantRows.map((row) => toProviderSummary(row, 'tenant'));
    const envOpenAi = this.buildEnvironmentOpenAiProvider();

    const merged = envOpenAi ? [envOpenAi, ...tenantSummaries] : tenantSummaries;
    const configuredKeys = new Set(merged.map((item) => item.providerKey));

    for (const registryEntry of getProviderRegistry()) {
      if (!configuredKeys.has(registryEntry.providerKey)) {
        merged.push({
          id: null,
          providerKey: registryEntry.providerKey,
          name: registryEntry.name,
          status: 'inactive',
          healthStatus: 'unknown',
          apiVersion: registryEntry.apiVersion,
          baseUrl: null,
          isEnabled: false,
          isConfigured: false,
          credentialsConfigured: false,
          priorityWeight: 0,
          supportedModels: registryEntry.supportedModels,
          capabilities: registryEntry.defaultCapabilities,
          multimodalSupport: registryEntry.supportsMultimodal,
          averageLatencyMs: null,
          lastHealthCheckAt: null,
          source: 'tenant',
        });
      }
    }

    return merged;
  }

  async createProvider(scope: StaffScope, input: CreateAiProviderRequest): Promise<AiProviderSummary> {
    const registryEntry = getProviderRegistry().find((entry) => entry.providerKey === input.providerKey);
    if (!registryEntry) {
      throw new AiOrchestrationError('VALIDATION_ERROR', 'Unsupported provider key');
    }

    const encryptedCredentials =
      input.apiKey && this.options.encryptionKey
        ? encryptSecret(input.apiKey, this.options.encryptionKey)
        : null;

    const [created] = await this.db
      .insert(aiProviders)
      .values({
        companyId: scope.companyId,
        providerKey: input.providerKey,
        displayName: input.displayName?.trim() || registryEntry.name,
        status: input.isEnabled ? 'active' : 'inactive',
        healthStatus: encryptedCredentials || input.providerKey === 'ollama' ? 'unknown' : 'unknown',
        apiVersion: input.apiVersion?.trim() || registryEntry.apiVersion,
        baseUrl: input.baseUrl?.trim() || null,
        encryptedCredentials,
        config: input.config ?? {},
        priorityWeight: input.priorityWeight ?? 100,
        isEnabled: input.isEnabled ?? false,
        createdByUserId: scope.userId,
      })
      .returning();

    for (const model of registryEntry.supportedModels) {
      await this.db.insert(aiModels).values({
        companyId: scope.companyId,
        providerId: created!.id,
        modelKey: model.modelKey,
        displayName: model.displayName,
        contextWindow: model.contextWindow,
        capabilities: model.capabilities,
        pricingMetadata: {},
        isEnabled: true,
      });
    }

    const row = await this.db.query.aiProviders.findFirst({
      where: and(eq(aiProviders.id, created!.id), eq(aiProviders.companyId, scope.companyId)),
    });

    return toProviderSummary(row!, 'tenant');
  }

  async updateProvider(
    companyId: string,
    providerId: string,
    input: UpdateAiProviderRequest,
  ): Promise<AiProviderSummary> {
    const existing = await this.db.query.aiProviders.findFirst({
      where: and(eq(aiProviders.id, providerId), eq(aiProviders.companyId, companyId)),
    });

    if (!existing) {
      throw new AiOrchestrationError('NOT_FOUND', 'Provider not found');
    }

    const encryptedCredentials =
      input.apiKey && this.options.encryptionKey
        ? encryptSecret(input.apiKey, this.options.encryptionKey)
        : undefined;

    await this.db
      .update(aiProviders)
      .set({
        displayName: input.displayName?.trim() ?? undefined,
        status: input.status ?? undefined,
        apiVersion: input.apiVersion?.trim() ?? undefined,
        baseUrl: input.baseUrl?.trim() ?? undefined,
        encryptedCredentials,
        config: input.config ?? undefined,
        priorityWeight: input.priorityWeight ?? undefined,
        isEnabled: input.isEnabled ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(aiProviders.id, providerId), eq(aiProviders.companyId, companyId)));

    const row = await this.db.query.aiProviders.findFirst({
      where: and(eq(aiProviders.id, providerId), eq(aiProviders.companyId, companyId)),
    });

    return toProviderSummary(row!, 'tenant');
  }

  async listModels(companyId: string): Promise<AiModelSummary[]> {
    const tenantModels = await this.db.query.aiModels.findMany({
      where: eq(aiModels.companyId, companyId),
      with: { provider: true },
      orderBy: [desc(aiModels.createdAt)],
      limit: 200,
    });

    const summaries: AiModelSummary[] = tenantModels.map((row) => ({
      id: row.id,
      providerId: row.providerId,
      providerKey: row.provider!.providerKey as AiProviderKey,
      providerName: row.provider!.displayName,
      modelKey: row.modelKey,
      displayName: row.displayName,
      contextWindow: row.contextWindow,
      capabilities: row.capabilities as AiCapabilityFlag[],
      multimodal: (row.capabilities as string[]).includes('multimodal'),
      pricingMetadata: row.pricingMetadata,
      averageLatencyMs: row.averageLatencyMs,
      isEnabled: row.isEnabled,
    }));

    const envOpenAi = this.buildEnvironmentOpenAiProvider();
    if (envOpenAi) {
      for (const model of envOpenAi.supportedModels) {
        summaries.unshift({
          id: null,
          providerId: null,
          providerKey: 'openai',
          providerName: envOpenAi.name,
          modelKey: model.modelKey,
          displayName: model.displayName,
          contextWindow: model.contextWindow,
          capabilities: model.capabilities,
          multimodal: model.multimodal,
          pricingMetadata: {},
          averageLatencyMs: envOpenAi.averageLatencyMs,
          isEnabled: true,
        });
      }
    }

    return summaries;
  }

  async listRoutingRules(companyId: string): Promise<AiRoutingRuleSummary[]> {
    const rows = await this.db.query.aiRoutingRules.findMany({
      where: eq(aiRoutingRules.companyId, companyId),
      with: { primaryProvider: true, primaryModel: true },
      orderBy: [aiRoutingRules.priorityOrder],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      category: row.category,
      routingMode: row.routingMode,
      primaryProviderId: row.primaryProviderId,
      primaryProviderKey: (row.primaryProvider?.providerKey as AiProviderKey | undefined) ?? null,
      primaryModelId: row.primaryModelId,
      primaryModelKey: row.primaryModel?.modelKey ?? null,
      fallbackChain: row.fallbackChain.map((entry) => ({
        ...entry,
        providerKey: entry.providerKey as AiProviderKey | undefined,
      })),
      priorityOrder: row.priorityOrder,
      weight: row.weight,
      isEnabled: row.isEnabled,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createRoutingRule(
    scope: StaffScope,
    input: CreateAiRoutingRuleRequest,
  ): Promise<AiRoutingRuleSummary> {
    const [created] = await this.db
      .insert(aiRoutingRules)
      .values({
        companyId: scope.companyId,
        category: input.category,
        routingMode: input.routingMode ?? 'automatic',
        primaryProviderId: input.primaryProviderId ?? null,
        primaryModelId: input.primaryModelId ?? null,
        fallbackChain: input.fallbackChain ?? [],
        priorityOrder: input.priorityOrder ?? 100,
        weight: input.weight ?? 100,
        isEnabled: input.isEnabled ?? true,
      })
      .returning();

    const rules = await this.listRoutingRules(scope.companyId);
    return rules.find((rule) => rule.id === created!.id)!;
  }

  async resolveRoutingForCategory(
    companyId: string,
    category: AiRoutingCategory,
  ): Promise<{
    routingRuleId: string | null;
    providerKey: AiProviderKey | null;
    modelKey: string | null;
    routingMode: AiRoutingMode;
  }> {
    const rules = await this.listRoutingRules(companyId);
    const match = rules.find((rule) => rule.isEnabled && rule.category === category);

    if (!match) {
      return {
        routingRuleId: null,
        providerKey: null,
        modelKey: null,
        routingMode: 'automatic',
      };
    }

    return {
      routingRuleId: match.id,
      providerKey: match.primaryProviderKey,
      modelKey: match.primaryModelKey,
      routingMode: match.routingMode,
    };
  }

  async listPromptTemplates(companyId: string): Promise<AiPromptTemplateSummary[]> {
    const rows = await this.db.query.aiPromptTemplates.findMany({
      where: eq(aiPromptTemplates.companyId, companyId),
      orderBy: [desc(aiPromptTemplates.createdAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      templateKey: row.templateKey,
      category: row.category,
      name: row.name,
      description: row.description,
      agentKey: row.agentKey,
      currentPublishedVersionId: row.currentPublishedVersionId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listPromptVersions(companyId: string, templateId?: string): Promise<AiPromptVersionSummary[]> {
    const rows = await this.db.query.aiPromptVersions.findMany({
      where: templateId
        ? and(eq(aiPromptVersions.companyId, companyId), eq(aiPromptVersions.templateId, templateId))
        : eq(aiPromptVersions.companyId, companyId),
      with: { template: true },
      orderBy: [desc(aiPromptVersions.versionNumber)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      templateId: row.templateId,
      templateKey: row.template!.templateKey,
      templateName: row.template!.name,
      versionNumber: row.versionNumber,
      content: row.content,
      status: row.status,
      changeNotes: row.changeNotes,
      createdByUserId: row.createdByUserId,
      approvedByUserId: row.approvedByUserId,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createPromptTemplate(
    scope: StaffScope,
    input: CreateAiPromptTemplateRequest,
  ): Promise<{ template: AiPromptTemplateSummary; version: AiPromptVersionSummary }> {
    const [template] = await this.db
      .insert(aiPromptTemplates)
      .values({
        companyId: scope.companyId,
        templateKey: input.templateKey.trim(),
        category: input.category,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        agentKey: input.agentKey as never,
      })
      .returning();

    const [version] = await this.db
      .insert(aiPromptVersions)
      .values({
        companyId: scope.companyId,
        templateId: template!.id,
        versionNumber: 1,
        content: input.content.trim(),
        status: 'pending_approval',
        changeNotes: input.changeNotes?.trim() || null,
        createdByUserId: scope.userId,
      })
      .returning();

    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: scope.userId,
      notificationType: 'ai_orchestration_alert',
      title: 'Prompt version pending approval',
      body: `Prompt template "${input.name}" requires approval before publishing.`,
      entityType: 'ai_prompt_version',
      entityId: version!.id,
    });

    const templates = await this.listPromptTemplates(scope.companyId);
    const versions = await this.listPromptVersions(scope.companyId, template!.id);

    return {
      template: templates.find((item) => item.id === template!.id)!,
      version: versions.find((item) => item.id === version!.id)!,
    };
  }

  async createPromptVersion(
    scope: StaffScope,
    input: CreateAiPromptVersionRequest,
  ): Promise<AiPromptVersionSummary> {
    const template = await this.db.query.aiPromptTemplates.findFirst({
      where: and(
        eq(aiPromptTemplates.id, input.templateId),
        eq(aiPromptTemplates.companyId, scope.companyId),
      ),
    });

    if (!template) {
      throw new AiOrchestrationError('NOT_FOUND', 'Prompt template not found');
    }

    const latest = await this.db.query.aiPromptVersions.findFirst({
      where: and(
        eq(aiPromptVersions.companyId, scope.companyId),
        eq(aiPromptVersions.templateId, input.templateId),
      ),
      orderBy: [desc(aiPromptVersions.versionNumber)],
    });

    const [created] = await this.db
      .insert(aiPromptVersions)
      .values({
        companyId: scope.companyId,
        templateId: input.templateId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        content: input.content.trim(),
        status: 'pending_approval',
        changeNotes: input.changeNotes?.trim() || null,
        createdByUserId: scope.userId,
      })
      .returning();

    const versions = await this.listPromptVersions(scope.companyId, input.templateId);
    return versions.find((item) => item.id === created!.id)!;
  }

  async listConfigurationActions(
    companyId: string,
    status?: string,
  ): Promise<AiConfigurationActionSummary[]> {
    const rows = await this.db.query.aiConfigurationActions.findMany({
      where: status
        ? and(
            eq(aiConfigurationActions.companyId, companyId),
            eq(aiConfigurationActions.status, status as never),
          )
        : eq(aiConfigurationActions.companyId, companyId),
      orderBy: [desc(aiConfigurationActions.createdAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      actionType: row.actionType,
      status: row.status,
      subject: row.subject,
      recommendation: row.recommendation,
      payload: row.payload,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createConfigurationAction(
    scope: StaffScope,
    input: CreateAiConfigurationActionRequest,
  ): Promise<AiConfigurationActionSummary> {
    const [created] = await this.db
      .insert(aiConfigurationActions)
      .values({
        companyId: scope.companyId,
        actionType: input.actionType,
        status: 'pending_approval',
        subject: input.subject.trim(),
        recommendation: input.recommendation.trim(),
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    await this.notificationService.createNotification({
      companyId: scope.companyId,
      recipientType: 'staff',
      recipientUserId: scope.userId,
      notificationType: 'ai_orchestration_alert',
      title: 'AI configuration pending approval',
      body: input.subject,
      entityType: 'ai_configuration_action',
      entityId: created!.id,
    });

    const actions = await this.listConfigurationActions(scope.companyId);
    return actions.find((item) => item.id === created!.id)!;
  }

  async listUsageRecords(companyId: string): Promise<AiUsageRecordSummary[]> {
    const rows = await this.db.query.aiUsageRecords.findMany({
      where: eq(aiUsageRecords.companyId, companyId),
      with: { provider: true, model: true },
      orderBy: [desc(aiUsageRecords.recordedAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      providerId: row.providerId,
      providerKey: (row.provider?.providerKey as AiProviderKey | undefined) ?? null,
      modelId: row.modelId,
      modelKey: row.model?.modelKey ?? null,
      departmentKey: row.departmentKey,
      workflowKey: row.workflowKey,
      userId: row.userId,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      totalTokens: row.totalTokens,
      costCents: row.costCents,
      recordedAt: row.recordedAt.toISOString(),
    }));
  }

  async listQualityEvaluations(companyId: string): Promise<AiQualityEvaluationSummary[]> {
    const rows = await this.db.query.aiQualityEvaluations.findMany({
      where: eq(aiQualityEvaluations.companyId, companyId),
      with: { provider: true, model: true },
      orderBy: [desc(aiQualityEvaluations.evaluatedAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      providerId: row.providerId,
      providerKey: (row.provider?.providerKey as AiProviderKey | undefined) ?? null,
      modelId: row.modelId,
      modelKey: row.model?.modelKey ?? null,
      responseQualityScore: row.responseQualityScore ? Number(row.responseQualityScore) : null,
      success: row.success,
      correctionRate: row.correctionRate ? Number(row.correctionRate) : null,
      hallucinationReported: row.hallucinationReported,
      responseTimeMs: row.responseTimeMs,
      confidenceScore: row.confidenceScore ? Number(row.confidenceScore) : null,
      evaluatedAt: row.evaluatedAt.toISOString(),
    }));
  }

  async createQualityEvaluation(
    scope: StaffScope,
    input: CreateAiQualityEvaluationRequest,
  ): Promise<AiQualityEvaluationSummary> {
    const [created] = await this.db
      .insert(aiQualityEvaluations)
      .values({
        companyId: scope.companyId,
        providerId: input.providerId ?? null,
        modelId: input.modelId ?? null,
        agentRunId: input.agentRunId ?? null,
        conversationId: input.conversationId ?? null,
        responseQualityScore:
          input.responseQualityScore !== undefined ? String(input.responseQualityScore) : null,
        success: input.success ?? true,
        correctionRate: input.correctionRate !== undefined ? String(input.correctionRate) : null,
        hallucinationReported: input.hallucinationReported ?? false,
        responseTimeMs: input.responseTimeMs ?? null,
        confidenceScore: input.confidenceScore !== undefined ? String(input.confidenceScore) : null,
      })
      .returning();

    const evaluations = await this.listQualityEvaluations(scope.companyId);
    return evaluations.find((item) => item.id === created!.id)!;
  }

  async listFeedback(companyId: string): Promise<AiFeedbackSummary[]> {
    const rows = await this.db.query.aiFeedbackRecords.findMany({
      where: eq(aiFeedbackRecords.companyId, companyId),
      orderBy: [desc(aiFeedbackRecords.createdAt)],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      providerId: row.providerId,
      modelId: row.modelId,
      rating: row.rating,
      correctionText: row.correctionText,
      accepted: row.accepted,
      rejected: row.rejected,
      workflowOutcome: row.workflowOutcome,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createFeedback(scope: StaffScope, input: CreateAiFeedbackRequest): Promise<AiFeedbackSummary> {
    const [created] = await this.db
      .insert(aiFeedbackRecords)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        providerId: input.providerId ?? null,
        modelId: input.modelId ?? null,
        agentRunId: input.agentRunId ?? null,
        conversationId: input.conversationId ?? null,
        rating: input.rating ?? null,
        correctionText: input.correctionText?.trim() || null,
        accepted: input.accepted ?? false,
        rejected: input.rejected ?? false,
        workflowOutcome: input.workflowOutcome?.trim() || null,
      })
      .returning();

    const feedback = await this.listFeedback(scope.companyId);
    return feedback.find((item) => item.id === created!.id)!;
  }

  async listFailoverEvents(companyId: string): Promise<AiFailoverEventSummary[]> {
    const rows = await this.db.query.aiFailoverEvents.findMany({
      where: eq(aiFailoverEvents.companyId, companyId),
      with: { fromProvider: true, toProvider: true },
      orderBy: [desc(aiFailoverEvents.loggedAt)],
      limit: 100,
    });

    return rows.map((row) => ({
      id: row.id,
      fromProviderId: row.fromProviderId,
      toProviderId: row.toProviderId,
      fromProviderKey: (row.fromProvider?.providerKey as AiProviderKey | undefined) ?? null,
      toProviderKey: (row.toProvider?.providerKey as AiProviderKey | undefined) ?? null,
      reason: row.reason,
      contextPreserved: row.contextPreserved,
      loggedAt: row.loggedAt.toISOString(),
    }));
  }

  async listMemorySyncRecords(companyId: string): Promise<AiMemorySyncSummary[]> {
    const rows = await this.db.query.aiMemorySyncRecords.findMany({
      where: eq(aiMemorySyncRecords.companyId, companyId),
      with: { provider: true },
      orderBy: [desc(aiMemorySyncRecords.syncedAt)],
      limit: 100,
    });

    return rows.map((row) => ({
      id: row.id,
      contextType: row.contextType,
      syncKey: row.syncKey,
      providerId: row.providerId,
      providerKey: (row.provider?.providerKey as AiProviderKey | undefined) ?? null,
      syncedAt: row.syncedAt.toISOString(),
    }));
  }

  async getCostAnalytics(companyId: string): Promise<AiCostAnalytics> {
    const usage = await this.listUsageRecords(companyId);

    const totalCostCents = usage.reduce((sum, row) => sum + row.costCents, 0);
    const totalTokens = usage.reduce((sum, row) => sum + row.totalTokens, 0);

    const departmentMap = new Map<string, { costCents: number; tokenCount: number }>();
    const providerMap = new Map<string, { costCents: number; tokenCount: number }>();
    const modelMap = new Map<string, { usageCount: number; tokenCount: number }>();

    for (const row of usage) {
      const deptKey = row.departmentKey ?? 'unassigned';
      const dept = departmentMap.get(deptKey) ?? { costCents: 0, tokenCount: 0 };
      dept.costCents += row.costCents;
      dept.tokenCount += row.totalTokens;
      departmentMap.set(deptKey, dept);

      if (row.providerKey) {
        const provider = providerMap.get(row.providerKey) ?? { costCents: 0, tokenCount: 0 };
        provider.costCents += row.costCents;
        provider.tokenCount += row.totalTokens;
        providerMap.set(row.providerKey, provider);
      }

      if (row.modelKey) {
        const model = modelMap.get(row.modelKey) ?? { usageCount: 0, tokenCount: 0 };
        model.usageCount += 1;
        model.tokenCount += row.totalTokens;
        modelMap.set(row.modelKey, model);
      }
    }

    const routingRules = await this.listRoutingRules(companyId);
    const routingEfficiency =
      routingRules.length > 0
        ? routingRules.filter((rule) => rule.isEnabled && rule.primaryProviderId).length / routingRules.length
        : null;

    const recommendations: string[] = [];
    if (usage.length === 0) {
      recommendations.push('No token usage recorded yet — cost optimization recommendations will appear once usage data exists.');
    } else if (totalCostCents === 0) {
      recommendations.push('Usage recorded without cost metadata — configure provider pricing metadata for cost optimization insights.');
    }

    return {
      totalCostCents,
      totalTokens,
      costByDepartment: [...departmentMap.entries()].map(([departmentKey, value]) => ({
        departmentKey,
        ...value,
      })),
      costByProvider: [...providerMap.entries()].map(([providerKey, value]) => ({
        providerKey: providerKey as AiProviderKey,
        ...value,
      })),
      modelUtilization: [...modelMap.entries()].map(([modelKey, value]) => ({
        modelKey,
        ...value,
      })),
      routingEfficiency,
      recommendations,
    };
  }

  async getQualityAnalytics(companyId: string): Promise<AiQualityAnalytics> {
    const evaluations = await this.listQualityEvaluations(companyId);
    const feedback = await this.listFeedback(companyId);

    if (evaluations.length === 0 && feedback.length === 0) {
      return {
        averageQualityScore: null,
        successRate: null,
        correctionRate: null,
        hallucinationReportCount: 0,
        averageResponseTimeMs: null,
        averageConfidenceScore: null,
        evaluationCount: 0,
      };
    }

    const qualityScores = evaluations
      .map((item) => item.responseQualityScore)
      .filter((value): value is number => value !== null);
    const successCount = evaluations.filter((item) => item.success).length;
    const correctionRates = evaluations
      .map((item) => item.correctionRate)
      .filter((value): value is number => value !== null);
    const responseTimes = evaluations
      .map((item) => item.responseTimeMs)
      .filter((value): value is number => value !== null);
    const confidenceScores = evaluations
      .map((item) => item.confidenceScore)
      .filter((value): value is number => value !== null);

    return {
      averageQualityScore:
        qualityScores.length > 0
          ? qualityScores.reduce((sum, value) => sum + value, 0) / qualityScores.length
          : null,
      successRate: evaluations.length > 0 ? successCount / evaluations.length : null,
      correctionRate:
        correctionRates.length > 0
          ? correctionRates.reduce((sum, value) => sum + value, 0) / correctionRates.length
          : null,
      hallucinationReportCount: evaluations.filter((item) => item.hallucinationReported).length,
      averageResponseTimeMs:
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
          : null,
      averageConfidenceScore:
        confidenceScores.length > 0
          ? confidenceScores.reduce((sum, value) => sum + value, 0) / confidenceScores.length
          : null,
      evaluationCount: evaluations.length,
    };
  }

  async getRoutingStatistics(companyId: string): Promise<AiRoutingStatistics> {
    const rules = await this.listRoutingRules(companyId);
    const failovers = await this.listFailoverEvents(companyId);

    return {
      totalRules: rules.length,
      enabledRules: rules.filter((rule) => rule.isEnabled).length,
      automaticRules: rules.filter((rule) => rule.routingMode === 'automatic').length,
      manualRules: rules.filter((rule) => rule.routingMode === 'manual').length,
      categoryCoverage: [...new Set(rules.map((rule) => rule.category))],
      failoverEventCount: failovers.length,
    };
  }

  async getExecutiveDashboard(companyId: string): Promise<AiExecutiveDashboard> {
    const [providers, costAnalytics, qualityAnalytics, routingStatistics, recentFailovers, pendingActions, pendingPromptVersions] =
      await Promise.all([
        this.listProviders(companyId),
        this.getCostAnalytics(companyId),
        this.getQualityAnalytics(companyId),
        this.getRoutingStatistics(companyId),
        this.listFailoverEvents(companyId),
        this.listConfigurationActions(companyId, 'pending_approval'),
        this.listPromptVersions(companyId),
      ]);

    const healthyProviderCount = providers.filter((provider) => provider.healthStatus === 'healthy').length;
    const configuredProviderCount = providers.filter((provider) => provider.isConfigured).length;
    const pendingPromptCount = pendingPromptVersions.filter((version) => version.status === 'pending_approval').length;

    return {
      summary: `${providers.length} provider(s), ${healthyProviderCount} healthy, ${pendingActions.length} pending action(s), ${costAnalytics.totalTokens} total tokens recorded.`,
      providerCount: providers.length,
      healthyProviderCount,
      configuredProviderCount,
      pendingActionCount: pendingActions.length,
      pendingPromptVersions: pendingPromptCount,
      costAnalytics,
      qualityAnalytics,
      routingStatistics,
      recentFailovers: recentFailovers.slice(0, 10),
      providers,
    };
  }

  async buildAiOrchestrationAuraContext(companyId: string): Promise<AiOrchestrationAuraContext> {
    const dashboard = await this.getExecutiveDashboard(companyId);

    return {
      summary: dashboard.summary,
      providerCount: dashboard.providerCount,
      healthyProviderCount: dashboard.healthyProviderCount,
      pendingActionCount: dashboard.pendingActionCount,
      totalCostCents: dashboard.costAnalytics.totalCostCents,
      evaluationCount: dashboard.qualityAnalytics.evaluationCount,
      routingRuleCount: dashboard.routingStatistics.totalRules,
    };
  }

  private buildEnvironmentOpenAiProvider(): AiProviderSummary | null {
    if (!this.options.isAuraConfigured || this.options.auraConfig?.provider !== 'openai') {
      return null;
    }

    const registryEntry = getProviderRegistry().find((entry) => entry.providerKey === 'openai');
    if (!registryEntry) {
      return null;
    }

    return {
      id: null,
      providerKey: 'openai',
      name: 'OpenAI (Environment)',
      status: 'active',
      healthStatus: 'healthy',
      apiVersion: registryEntry.apiVersion,
      baseUrl: this.options.auraConfig.openaiBaseUrl,
      isEnabled: true,
      isConfigured: true,
      credentialsConfigured: true,
      priorityWeight: 1000,
      supportedModels: registryEntry.supportedModels,
      capabilities: registryEntry.defaultCapabilities,
      multimodalSupport: registryEntry.supportsMultimodal,
      averageLatencyMs: null,
      lastHealthCheckAt: new Date().toISOString(),
      source: 'environment',
    };
  }
}

function getProviderRegistry() {
  return AI_PROVIDER_REGISTRY;
}

function toProviderSummary(
  row: {
    id: string;
    providerKey: string;
    displayName: string;
    status: string;
    healthStatus: string;
    apiVersion: string | null;
    baseUrl: string | null;
    encryptedCredentials: string | null;
    priorityWeight: number;
    isEnabled: boolean;
    averageLatencyMs: number | null;
    lastHealthCheckAt: Date | null;
  },
  source: 'environment' | 'tenant',
): AiProviderSummary {
  const registryEntry = getProviderRegistry().find((entry) => entry.providerKey === row.providerKey);

  return {
    id: row.id,
    providerKey: row.providerKey as AiProviderKey,
    name: row.displayName,
    status: row.status as AiProviderSummary['status'],
    healthStatus: row.healthStatus as AiProviderSummary['healthStatus'],
    apiVersion: row.apiVersion,
    baseUrl: row.baseUrl,
    isEnabled: row.isEnabled,
    isConfigured: Boolean(row.encryptedCredentials) || row.isEnabled,
    credentialsConfigured: Boolean(row.encryptedCredentials),
    priorityWeight: row.priorityWeight,
    supportedModels: registryEntry?.supportedModels ?? [],
    capabilities: registryEntry?.defaultCapabilities ?? [],
    multimodalSupport: registryEntry?.supportsMultimodal ?? false,
    averageLatencyMs: row.averageLatencyMs,
    lastHealthCheckAt: row.lastHealthCheckAt?.toISOString() ?? null,
    source,
  };
}
