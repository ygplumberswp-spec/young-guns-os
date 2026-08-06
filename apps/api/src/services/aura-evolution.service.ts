import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { isCompanyOwnerRole, isPlatformOwnerRole } from '@titan/auth';
import type {
  AuraEvolutionDashboard,
  AuraEvolutionDecisionRecord,
  AuraEvolutionInsight,
  AuraEvolutionKnowledgeEntry,
  AuraEvolutionLearningItem,
  AuraEvolutionPatternRecord,
  AuraEvolutionRecommendationScore,
  AuraEvolutionSettings,
  CreateAuraEvolutionKnowledgeRequest,
  DecideAuraEvolutionInsightRequest,
  UpdateAuraEvolutionSettingsRequest,
} from '@titan/shared';
import {
  AURA_EVOLUTION_GUARANTEES,
  canAccessAuraEvolution,
  canControlAuraEvolution,
  canWriteAuraEvolution,
  computeRecommendationConfidence,
  computeRecommendationSuccessRate,
  patternAvailabilityForSampleSize,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  agentTasks,
  auraCommandActionDrafts,
  auraCommandHandoffs,
  auraCommandMemory,
  auraEvolutionDecisions,
  auraEvolutionInsights,
  auraEvolutionKnowledge,
  auraEvolutionLearningItems,
  auraEvolutionPatterns,
  auraEvolutionRecommendationScores,
  auraEvolutionSettings,
  auraMemory,
  communications,
  customers,
  evolutionRecommendations,
  invoices,
  jobs,
  opsMaintenanceAuraSuggestions,
  opsWorkflowAuraSuggestions,
  securityAuditLogs,
} from '@titan/db';

export class AuraEvolutionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuraEvolutionError';
  }
}

export type AuraEvolutionActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

type ServiceDeps = {
  db: DatabaseClient;
};

const MIN_PATTERN_SAMPLES = 5;
const LOOKBACK_DAYS = 90;

function assertAccess(actor: AuraEvolutionActor): void {
  if (
    !canAccessAuraEvolution({
      roleName: actor.roleName,
      permissions: actor.permissions,
    })
  ) {
    throw new AuraEvolutionError(
      'FORBIDDEN',
      'AURA Evolution requires agents/intelligence read access or Owner role',
    );
  }
}

function assertWrite(actor: AuraEvolutionActor): void {
  if (
    !canWriteAuraEvolution({
      roleName: actor.roleName,
      permissions: actor.permissions,
    })
  ) {
    throw new AuraEvolutionError(
      'FORBIDDEN',
      'AURA Evolution write requires agents/intelligence write or Owner role',
    );
  }
}

function assertControl(actor: AuraEvolutionActor): void {
  if (
    !canControlAuraEvolution({
      roleName: actor.roleName,
      permissions: actor.permissions,
    }) &&
    !isCompanyOwnerRole({ roleName: actor.roleName, permissions: actor.permissions }) &&
    !isPlatformOwnerRole({ roleName: actor.roleName, permissions: actor.permissions })
  ) {
    throw new AuraEvolutionError(
      'FORBIDDEN',
      'Only the company Owner or Platform Owner may control AURA Evolution learning',
    );
  }
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class AuraEvolutionService {
  constructor(private readonly deps: ServiceDeps) {}

  private async audit(
    companyId: string,
    userId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.deps.db.insert(securityAuditLogs).values({
      companyId,
      category: 'workflow',
      action,
      entityType,
      entityId,
      userId,
      metadata: {
        noDemoData: true,
        autoExecuted: false,
        noAutoBusinessRuleChanges: true,
        noAutoFinancialActions: true,
        noAutoCustomerCommunication: true,
        ...metadata,
      },
    });
  }

  private async ensureSettings(companyId: string) {
    const [existing] = await this.deps.db
      .select()
      .from(auraEvolutionSettings)
      .where(eq(auraEvolutionSettings.companyId, companyId))
      .limit(1);
    if (existing) return existing;
    const [created] = await this.deps.db
      .insert(auraEvolutionSettings)
      .values({ companyId, learningEnabled: false })
      .returning();
    return created!;
  }

  private mapSettings(row: typeof auraEvolutionSettings.$inferSelect): AuraEvolutionSettings {
    return {
      learningEnabled: row.learningEnabled,
      updatedAt: iso(row.updatedAt),
      updatedByUserId: row.updatedByUserId,
      guarantees: AURA_EVOLUTION_GUARANTEES,
    };
  }

  private mapDecision(row: typeof auraEvolutionDecisions.$inferSelect): AuraEvolutionDecisionRecord {
    return {
      id: row.id,
      sourceType: row.sourceType,
      sourceEntityId: row.sourceEntityId,
      title: row.title,
      reasoningContext: row.reasoningContext,
      outcome: row.outcome,
      outcomeNotes: row.outcomeNotes,
      improvementOpportunity: row.improvementOpportunity,
      decidedAt: iso(row.decidedAt),
      createdAt: iso(row.createdAt)!,
    };
  }

  private mapPattern(row: typeof auraEvolutionPatterns.$inferSelect): AuraEvolutionPatternRecord {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      availability: row.availability,
      confidence: row.confidence,
      sampleSize: row.sampleSize,
      evidence: row.evidence ?? {},
      honestGap: row.honestGap,
      createdAt: iso(row.createdAt)!,
      updatedAt: iso(row.updatedAt)!,
    };
  }

  private mapScore(
    row: typeof auraEvolutionRecommendationScores.$inferSelect,
  ): AuraEvolutionRecommendationScore {
    return {
      id: row.id,
      sourceModule: row.sourceModule,
      recommendationKey: row.recommendationKey,
      title: row.title,
      timesProposed: row.timesProposed,
      timesAccepted: row.timesAccepted,
      timesRejected: row.timesRejected,
      successRate: row.successRate,
      confidence: row.confidence,
      improvementSuggestion: row.improvementSuggestion,
      lastOutcomeAt: iso(row.lastOutcomeAt),
      updatedAt: iso(row.updatedAt)!,
    };
  }

  private mapInsight(row: typeof auraEvolutionInsights.$inferSelect): AuraEvolutionInsight {
    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      category: row.category,
      status: row.status,
      confidence: row.confidence,
      evidence: row.evidence ?? {},
      requiresApproval: true,
      autoExecuted: false,
      decidedAt: iso(row.decidedAt),
      decisionNotes: row.decisionNotes,
      createdAt: iso(row.createdAt)!,
    };
  }

  private mapLearningItem(
    row: typeof auraEvolutionLearningItems.$inferSelect,
  ): AuraEvolutionLearningItem {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      linkedEntityType: row.linkedEntityType,
      linkedEntityId: row.linkedEntityId,
      removed: row.removed,
      createdAt: iso(row.createdAt)!,
      removedAt: iso(row.removedAt),
    };
  }

  private mapKnowledge(row: typeof auraEvolutionKnowledge.$inferSelect): AuraEvolutionKnowledgeEntry {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      content: row.content,
      commandMemoryId: row.commandMemoryId,
      auraMemoryId: row.auraMemoryId,
      enabled: row.enabled,
      createdAt: iso(row.createdAt)!,
      updatedAt: iso(row.updatedAt)!,
    };
  }

  async getSettings(actor: AuraEvolutionActor): Promise<AuraEvolutionSettings> {
    assertAccess(actor);
    const row = await this.ensureSettings(actor.companyId);
    return this.mapSettings(row);
  }

  async updateSettings(
    actor: AuraEvolutionActor,
    input: UpdateAuraEvolutionSettingsRequest,
  ): Promise<AuraEvolutionSettings> {
    assertControl(actor);
    await this.ensureSettings(actor.companyId);
    const [updated] = await this.deps.db
      .update(auraEvolutionSettings)
      .set({
        learningEnabled: input.learningEnabled,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(auraEvolutionSettings.companyId, actor.companyId))
      .returning();
    await this.audit(
      actor.companyId,
      actor.userId,
      input.learningEnabled
        ? 'aura_evolution.settings.enabled'
        : 'aura_evolution.settings.disabled',
      'aura_evolution_settings',
      updated!.id,
      { learningEnabled: input.learningEnabled },
    );
    return this.mapSettings(updated!);
  }

  private async decisionExists(
    companyId: string,
    sourceType: typeof auraEvolutionDecisions.$inferInsert.sourceType,
    sourceEntityId: string,
  ): Promise<boolean> {
    const [row] = await this.deps.db
      .select({ id: auraEvolutionDecisions.id })
      .from(auraEvolutionDecisions)
      .where(
        and(
          eq(auraEvolutionDecisions.companyId, companyId),
          eq(auraEvolutionDecisions.sourceType, sourceType),
          eq(auraEvolutionDecisions.sourceEntityId, sourceEntityId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  private async recordDecision(
    companyId: string,
    input: {
      sourceType: typeof auraEvolutionDecisions.$inferInsert.sourceType;
      sourceEntityId: string;
      title: string;
      reasoningContext: string;
      outcome: typeof auraEvolutionDecisions.$inferInsert.outcome;
      outcomeNotes?: string | null;
      improvementOpportunity?: string | null;
      decidedAt?: Date | null;
    },
  ): Promise<void> {
    if (await this.decisionExists(companyId, input.sourceType, input.sourceEntityId)) return;
    const [created] = await this.deps.db
      .insert(auraEvolutionDecisions)
      .values({
        companyId,
        sourceType: input.sourceType,
        sourceEntityId: input.sourceEntityId,
        title: input.title,
        reasoningContext: input.reasoningContext,
        outcome: input.outcome,
        outcomeNotes: input.outcomeNotes ?? null,
        improvementOpportunity: input.improvementOpportunity ?? null,
        decidedAt: input.decidedAt ?? null,
        metadata: { noDemoData: true },
      })
      .returning();
    await this.deps.db.insert(auraEvolutionLearningItems).values({
      companyId,
      kind: 'decision',
      title: input.title,
      summary: `${input.outcome}: ${input.reasoningContext.slice(0, 240)}`,
      linkedEntityType: 'aura_evolution_decision',
      linkedEntityId: created!.id,
      metadata: { sourceType: input.sourceType, sourceEntityId: input.sourceEntityId },
    });
  }

  private async upsertRecommendationScore(
    companyId: string,
    sourceModule: string,
    recommendationKey: string,
    title: string,
    outcome: 'accepted' | 'rejected' | 'proposed',
    at: Date | null,
  ): Promise<void> {
    const [existing] = await this.deps.db
      .select()
      .from(auraEvolutionRecommendationScores)
      .where(
        and(
          eq(auraEvolutionRecommendationScores.companyId, companyId),
          eq(auraEvolutionRecommendationScores.sourceModule, sourceModule),
          eq(auraEvolutionRecommendationScores.recommendationKey, recommendationKey),
        ),
      )
      .limit(1);

    const timesProposed = (existing?.timesProposed ?? 0) + 1;
    const timesAccepted =
      (existing?.timesAccepted ?? 0) + (outcome === 'accepted' ? 1 : 0);
    const timesRejected =
      (existing?.timesRejected ?? 0) + (outcome === 'rejected' ? 1 : 0);
    const successRate = computeRecommendationSuccessRate(timesAccepted, timesRejected);
    const confidence = computeRecommendationConfidence(
      timesProposed,
      timesAccepted,
      timesRejected,
    );
    let improvementSuggestion: string | null = existing?.improvementSuggestion ?? null;
    if (successRate !== null && successRate < 0.4 && timesAccepted + timesRejected >= 3) {
      improvementSuggestion =
        'Historical acceptance is low — tighten recommendation criteria and require stronger supporting signals before proposing.';
    } else if (successRate !== null && successRate >= 0.7 && timesAccepted + timesRejected >= 3) {
      improvementSuggestion =
        'Historical acceptance is strong — keep criteria, but still require Owner approval before any operational change.';
    }

    if (existing) {
      await this.deps.db
        .update(auraEvolutionRecommendationScores)
        .set({
          title,
          timesProposed,
          timesAccepted,
          timesRejected,
          successRate,
          confidence,
          improvementSuggestion,
          lastOutcomeAt: at ?? existing.lastOutcomeAt,
          updatedAt: new Date(),
        })
        .where(eq(auraEvolutionRecommendationScores.id, existing.id));
      return;
    }

    const [created] = await this.deps.db
      .insert(auraEvolutionRecommendationScores)
      .values({
        companyId,
        sourceModule,
        recommendationKey,
        title,
        timesProposed,
        timesAccepted,
        timesRejected,
        successRate,
        confidence,
        improvementSuggestion,
        lastOutcomeAt: at,
        metadata: { noDemoData: true },
      })
      .returning();
    await this.deps.db.insert(auraEvolutionLearningItems).values({
      companyId,
      kind: 'recommendation_score',
      title,
      summary: `Tracked recommendation outcomes for ${sourceModule}`,
      linkedEntityType: 'aura_evolution_recommendation_score',
      linkedEntityId: created!.id,
    });
  }

  /** Ingest real approval/workflow signals when Owner has enabled learning. */
  async syncLearningSignals(actor: AuraEvolutionActor): Promise<{
    decisionsCaptured: number;
    scoresUpdated: number;
    patternsUpserted: number;
    insightsCreated: number;
    learningEnabled: boolean;
  }> {
    assertWrite(actor);
    const settings = await this.ensureSettings(actor.companyId);
    if (!settings.learningEnabled) {
      await this.audit(
        actor.companyId,
        actor.userId,
        'aura_evolution.sync.skipped_disabled',
        'aura_evolution_settings',
        settings.id,
        { reason: 'learning_disabled' },
      );
      return {
        decisionsCaptured: 0,
        scoresUpdated: 0,
        patternsUpserted: 0,
        insightsCreated: 0,
        learningEnabled: false,
      };
    }

    const companyId = actor.companyId;
    let decisionsCaptured = 0;
    let scoresUpdated = 0;

    // 1) Command Centre approved decisions / memory
    const memoryRows = await this.deps.db
      .select()
      .from(auraCommandMemory)
      .where(
        and(
          eq(auraCommandMemory.companyId, companyId),
          inArray(auraCommandMemory.kind, ['approved_decision', 'historical_decision']),
          eq(auraCommandMemory.enabled, true),
        ),
      )
      .limit(100);
    for (const row of memoryRows) {
      const before = await this.decisionExists(companyId, 'command_centre_memory', row.id);
      await this.recordDecision(companyId, {
        sourceType: 'command_centre_memory',
        sourceEntityId: row.id,
        title: row.title,
        reasoningContext: row.content,
        outcome: 'approved',
        decidedAt: row.decidedAt ?? row.updatedAt,
        improvementOpportunity:
          'Retain Owner-approved decision context for future AURA recommendations (advisory only).',
      });
      if (!before) decisionsCaptured += 1;
    }

    const actionRows = await this.deps.db
      .select()
      .from(auraCommandActionDrafts)
      .where(
        and(
          eq(auraCommandActionDrafts.companyId, companyId),
          inArray(auraCommandActionDrafts.status, ['approved', 'rejected']),
        ),
      )
      .limit(100);
    for (const row of actionRows) {
      const before = await this.decisionExists(companyId, 'command_centre_action', row.id);
      await this.recordDecision(companyId, {
        sourceType: 'command_centre_action',
        sourceEntityId: row.id,
        title: row.title,
        reasoningContext: row.description,
        outcome: row.status === 'approved' ? 'approved' : 'rejected',
        outcomeNotes: row.decisionNotes,
        decidedAt: row.decidedAt,
      });
      if (!before) {
        decisionsCaptured += 1;
        await this.upsertRecommendationScore(
          companyId,
          'aura_command_centre',
          `action:${row.departmentKey}`,
          `Command Centre action (${row.departmentKey})`,
          row.status === 'approved' ? 'accepted' : 'rejected',
          row.decidedAt,
        );
        scoresUpdated += 1;
      }
    }

    const handoffRows = await this.deps.db
      .select()
      .from(auraCommandHandoffs)
      .where(
        and(
          eq(auraCommandHandoffs.companyId, companyId),
          inArray(auraCommandHandoffs.status, ['approved', 'rejected', 'completed']),
        ),
      )
      .limit(100);
    for (const row of handoffRows) {
      const before = await this.decisionExists(companyId, 'command_centre_handoff', row.id);
      await this.recordDecision(companyId, {
        sourceType: 'command_centre_handoff',
        sourceEntityId: row.id,
        title: `Handoff ${row.fromAgentKey} → ${row.toAgentKey}`,
        reasoningContext: row.contextSummary,
        outcome:
          row.status === 'rejected'
            ? 'rejected'
            : row.status === 'completed'
              ? 'completed'
              : 'approved',
        outcomeNotes: row.decisionNotes,
        decidedAt: row.decidedAt,
      });
      if (!before) decisionsCaptured += 1;
    }

    // 2) Agent task decisions
    const taskRows = await this.deps.db
      .select()
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.companyId, companyId),
          inArray(agentTasks.status, ['approved', 'rejected', 'executed']),
        ),
      )
      .limit(150);
    for (const row of taskRows) {
      const before = await this.decisionExists(companyId, 'agent_task', row.id);
      const outcome =
        row.status === 'rejected'
          ? 'rejected'
          : row.status === 'executed'
            ? 'completed'
            : 'approved';
      await this.recordDecision(companyId, {
        sourceType: 'agent_task',
        sourceEntityId: row.id,
        title: `Agent task: ${row.taskType}`,
        reasoningContext: row.preview,
        outcome,
        decidedAt: row.executedAt ?? row.updatedAt,
      });
      if (!before) {
        decisionsCaptured += 1;
        await this.upsertRecommendationScore(
          companyId,
          'agent_tasks',
          row.taskType,
          `Agent task ${row.taskType}`,
          row.status === 'rejected' ? 'rejected' : 'accepted',
          row.executedAt ?? row.updatedAt,
        );
        scoresUpdated += 1;
      }
    }

    // 3) Workflow / maintenance AURA suggestions
    const workflowSuggestions = await this.deps.db
      .select()
      .from(opsWorkflowAuraSuggestions)
      .where(
        and(
          eq(opsWorkflowAuraSuggestions.companyId, companyId),
          inArray(opsWorkflowAuraSuggestions.status, ['approved', 'rejected']),
        ),
      )
      .limit(100);
    for (const row of workflowSuggestions) {
      const before = await this.decisionExists(companyId, 'workflow_aura_suggestion', row.id);
      await this.recordDecision(companyId, {
        sourceType: 'workflow_aura_suggestion',
        sourceEntityId: row.id,
        title: row.subject,
        reasoningContext: row.body,
        outcome: row.status === 'approved' ? 'approved' : 'rejected',
        outcomeNotes: row.decisionNotes,
        decidedAt: row.decidedAt,
      });
      if (!before) {
        decisionsCaptured += 1;
        await this.upsertRecommendationScore(
          companyId,
          'workflow_automation',
          'aura_suggestion',
          'Workflow AURA suggestion',
          row.status === 'approved' ? 'accepted' : 'rejected',
          row.decidedAt,
        );
        scoresUpdated += 1;
      }
    }

    const maintenanceSuggestions = await this.deps.db
      .select()
      .from(opsMaintenanceAuraSuggestions)
      .where(
        and(
          eq(opsMaintenanceAuraSuggestions.companyId, companyId),
          inArray(opsMaintenanceAuraSuggestions.status, ['approved', 'rejected']),
        ),
      )
      .limit(100);
    for (const row of maintenanceSuggestions) {
      const before = await this.decisionExists(companyId, 'maintenance_aura_suggestion', row.id);
      await this.recordDecision(companyId, {
        sourceType: 'maintenance_aura_suggestion',
        sourceEntityId: row.id,
        title: row.subject,
        reasoningContext: row.body,
        outcome: row.status === 'approved' ? 'approved' : 'rejected',
        outcomeNotes: row.decisionNotes,
        decidedAt: row.decidedAt,
      });
      if (!before) {
        decisionsCaptured += 1;
        await this.upsertRecommendationScore(
          companyId,
          'recurring_maintenance',
          row.kind,
          `Maintenance AURA (${row.kind})`,
          row.status === 'approved' ? 'accepted' : 'rejected',
          row.decidedAt,
        );
        scoresUpdated += 1;
      }
    }

    // 4) Enterprise evolution recommendations (real status only)
    const evoRecs = await this.deps.db
      .select()
      .from(evolutionRecommendations)
      .where(
        and(
          eq(evolutionRecommendations.companyId, companyId),
          inArray(evolutionRecommendations.status, ['accepted', 'dismissed', 'completed']),
        ),
      )
      .limit(100);
    for (const row of evoRecs) {
      const before = await this.decisionExists(companyId, 'evolution_recommendation', row.id);
      const outcome =
        row.status === 'accepted'
          ? 'accepted'
          : row.status === 'dismissed'
            ? 'dismissed'
            : 'completed';
      await this.recordDecision(companyId, {
        sourceType: 'evolution_recommendation',
        sourceEntityId: row.id,
        title: row.title,
        reasoningContext: row.recommendation,
        outcome,
        decidedAt: row.updatedAt,
      });
      if (!before) {
        decisionsCaptured += 1;
        await this.upsertRecommendationScore(
          companyId,
          'enterprise_evolution',
          row.category,
          `Evolution recommendation (${row.category})`,
          row.status === 'dismissed' ? 'rejected' : 'accepted',
          row.updatedAt,
        );
        scoresUpdated += 1;
      }
    }

    // Network approval sources intentionally omitted — agent network schema may be mid-flight.

    const patternsUpserted = await this.refreshPatterns(companyId);
    const insightsCreated = await this.refreshInsights(companyId);

    await this.audit(
      actor.companyId,
      actor.userId,
      'aura_evolution.sync.completed',
      'aura_evolution_settings',
      settings.id,
      {
        decisionsCaptured,
        scoresUpdated,
        patternsUpserted,
        insightsCreated,
        learningEnabled: true,
      },
    );

    return {
      decisionsCaptured,
      scoresUpdated,
      patternsUpserted,
      insightsCreated,
      learningEnabled: true,
    };
  }

  private async upsertPattern(
    companyId: string,
    kind: typeof auraEvolutionPatterns.$inferInsert.kind,
    title: string,
    summary: string,
    sampleSize: number,
    evidence: Record<string, unknown>,
    honestGap: string | null,
    confidence: number | null,
  ): Promise<void> {
    const availability = patternAvailabilityForSampleSize(sampleSize, MIN_PATTERN_SAMPLES);
    const [existing] = await this.deps.db
      .select()
      .from(auraEvolutionPatterns)
      .where(
        and(eq(auraEvolutionPatterns.companyId, companyId), eq(auraEvolutionPatterns.kind, kind)),
      )
      .limit(1);

    const payload = {
      title,
      summary:
        availability === 'available'
          ? summary
          : availability === 'insufficient_data'
            ? `Insufficient data to confirm a reliable ${kind.replace(/_/g, ' ')} pattern yet.`
            : `No ${kind.replace(/_/g, ' ')} pattern available — no qualifying records in the lookback window.`,
      availability,
      confidence: availability === 'available' ? confidence : null,
      sampleSize,
      evidence: { ...evidence, noDemoData: true, lookbackDays: LOOKBACK_DAYS },
      honestGap:
        availability === 'available'
          ? honestGap
          : availability === 'insufficient_data'
            ? `Need at least ${MIN_PATTERN_SAMPLES} real records; found ${sampleSize}.`
            : 'No real records available for this pattern kind.',
      updatedAt: new Date(),
    };

    if (existing) {
      await this.deps.db
        .update(auraEvolutionPatterns)
        .set(payload)
        .where(eq(auraEvolutionPatterns.id, existing.id));
      return;
    }

    const [created] = await this.deps.db
      .insert(auraEvolutionPatterns)
      .values({
        companyId,
        kind,
        ...payload,
      })
      .returning();
    await this.deps.db.insert(auraEvolutionLearningItems).values({
      companyId,
      kind: 'pattern',
      title,
      summary: payload.summary,
      linkedEntityType: 'aura_evolution_pattern',
      linkedEntityId: created!.id,
    });
  }

  private async refreshPatterns(companyId: string): Promise<number> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    let upserted = 0;

    const jobRows = await this.deps.db
      .select({
        createdAt: jobs.createdAt,
        status: jobs.status,
      })
      .from(jobs)
      .where(and(eq(jobs.companyId, companyId), gte(jobs.createdAt, since)))
      .limit(2000);

    const byDow = new Map<number, number>();
    for (const job of jobRows) {
      const dow = new Date(job.createdAt).getDay();
      byDow.set(dow, (byDow.get(dow) ?? 0) + 1);
    }
    const busiest = [...byDow.entries()].sort((a, b) => b[1] - a[1])[0];
    const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    await this.upsertPattern(
      companyId,
      'busy_period',
      'Busy periods (jobs created)',
      busiest
        ? `Highest job creation volume on ${dowNames[busiest[0]]} (${busiest[1]} jobs in ${LOOKBACK_DAYS}d).`
        : 'No busy-period signal.',
      jobRows.length,
      { byDayOfWeek: Object.fromEntries([...byDow.entries()].map(([k, v]) => [dowNames[k], v])) },
      null,
      busiest ? Math.min(0.95, busiest[1] / Math.max(jobRows.length, 1)) : null,
    );
    upserted += 1;

    const completedJobs = jobRows.filter((j) => String(j.status) === 'completed').length;
    await this.upsertPattern(
      companyId,
      'job_trend',
      'Job completion trend',
      jobRows.length
        ? `${completedJobs} of ${jobRows.length} jobs in the last ${LOOKBACK_DAYS} days are completed.`
        : 'No job trend available.',
      jobRows.length,
      { totalJobs: jobRows.length, completedJobs },
      null,
      jobRows.length ? completedJobs / jobRows.length : null,
    );
    upserted += 1;

    const [customerCount] = await this.deps.db
      .select({ value: count() })
      .from(customers)
      .where(eq(customers.companyId, companyId));
    const customerTotal = Number(customerCount?.value ?? 0);
    await this.upsertPattern(
      companyId,
      'customer_behaviour',
      'Customer base signal',
      customerTotal > 0
        ? `Tenant has ${customerTotal} customers on record. Behavioural clustering requires more interaction history than currently analyzed.`
        : 'No customer behaviour pattern available.',
      customerTotal,
      { customerTotal },
      customerTotal >= MIN_PATTERN_SAMPLES
        ? 'Detailed behaviour clustering is not inferred beyond real counts in this milestone.'
        : null,
      customerTotal >= MIN_PATTERN_SAMPLES ? 0.35 : null,
    );
    upserted += 1;

    const invoiceRows = await this.deps.db
      .select({
        totalCents: invoices.totalCents,
        status: invoices.status,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), gte(invoices.createdAt, since)))
      .limit(2000);
    const revenueCents = invoiceRows.reduce((sum, row) => sum + Number(row.totalCents ?? 0), 0);
    await this.upsertPattern(
      companyId,
      'revenue_trend',
      'Revenue (invoices created)',
      invoiceRows.length
        ? `${invoiceRows.length} invoices totaling ${(revenueCents / 100).toFixed(2)} in the last ${LOOKBACK_DAYS} days (status mix preserved; no forecast invented).`
        : 'No revenue trend available.',
      invoiceRows.length,
      {
        invoiceCount: invoiceRows.length,
        revenueCents,
        statuses: invoiceRows.reduce<Record<string, number>>((acc, row) => {
          const key = String(row.status);
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {}),
      },
      null,
      invoiceRows.length ? Math.min(0.9, invoiceRows.length / 20) : null,
    );
    upserted += 1;

    const maintApproved = await this.deps.db
      .select({ id: opsMaintenanceAuraSuggestions.id })
      .from(opsMaintenanceAuraSuggestions)
      .where(
        and(
          eq(opsMaintenanceAuraSuggestions.companyId, companyId),
          eq(opsMaintenanceAuraSuggestions.status, 'approved'),
          gte(opsMaintenanceAuraSuggestions.createdAt, since),
        ),
      )
      .limit(200);
    await this.upsertPattern(
      companyId,
      'maintenance_opportunity',
      'Maintenance opportunities (approved suggestions)',
      maintApproved.length
        ? `${maintApproved.length} Owner-approved maintenance suggestions in ${LOOKBACK_DAYS}d.`
        : 'No maintenance opportunity pattern available.',
      maintApproved.length,
      { approvedSuggestions: maintApproved.length },
      null,
      maintApproved.length ? Math.min(0.85, maintApproved.length / 10) : null,
    );
    upserted += 1;

    const openJobs = jobRows.filter((j) => !['completed', 'cancelled'].includes(String(j.status)));
    await this.upsertPattern(
      companyId,
      'operational_bottleneck',
      'Open job load',
      jobRows.length
        ? `${openJobs.length} open/non-terminal jobs among ${jobRows.length} created in ${LOOKBACK_DAYS}d.`
        : 'No operational bottleneck pattern available.',
      jobRows.length,
      { openJobs: openJobs.length, totalJobs: jobRows.length },
      openJobs.length > 0
        ? 'Bottleneck inference is limited to open-job load; root-cause automation is not auto-applied.'
        : null,
      jobRows.length ? openJobs.length / jobRows.length : null,
    );
    upserted += 1;

    const [commCount] = await this.deps.db
      .select({ value: count() })
      .from(communications)
      .where(and(eq(communications.companyId, companyId), gte(communications.createdAt, since)));
    const communicationTotal = Number(commCount?.value ?? 0);
    await this.upsertPattern(
      companyId,
      'communication_pattern',
      'Communication volume',
      communicationTotal > 0
        ? `${communicationTotal} communication records in ${LOOKBACK_DAYS}d (Personal WhatsApp private content is never sourced).`
        : 'No communication pattern available.',
      communicationTotal,
      { communicationTotal, neverSourcesPersonalWhatsappPrivate: true },
      null,
      communicationTotal >= MIN_PATTERN_SAMPLES
        ? Math.min(0.8, communicationTotal / 50)
        : null,
    );
    upserted += 1;

    return upserted;
  }

  private async refreshInsights(companyId: string): Promise<number> {
    let created = 0;
    const scores = await this.deps.db
      .select()
      .from(auraEvolutionRecommendationScores)
      .where(eq(auraEvolutionRecommendationScores.companyId, companyId))
      .limit(50);

    for (const score of scores) {
      // Insights from low success scores only (honest advisory; Owner must approve).
      if (
        score.successRate === null ||
        score.successRate >= 0.4 ||
        score.timesAccepted + score.timesRejected < 3 ||
        !score.improvementSuggestion
      ) {
        continue;
      }
      const [existing] = await this.deps.db
        .select({ id: auraEvolutionInsights.id })
        .from(auraEvolutionInsights)
        .where(
          and(
            eq(auraEvolutionInsights.companyId, companyId),
            eq(auraEvolutionInsights.title, `Improve ${score.title}`),
            inArray(auraEvolutionInsights.status, ['pending_approval', 'approved']),
          ),
        )
        .limit(1);
      if (existing) continue;

      const [insight] = await this.deps.db
        .insert(auraEvolutionInsights)
        .values({
          companyId,
          title: `Improve ${score.title}`,
          summary: score.improvementSuggestion,
          category: 'recommendation_improvement',
          status: 'pending_approval',
          confidence: score.confidence,
          evidence: {
            sourceModule: score.sourceModule,
            recommendationKey: score.recommendationKey,
            successRate: score.successRate,
            timesAccepted: score.timesAccepted,
            timesRejected: score.timesRejected,
            noDemoData: true,
          },
          requiresApproval: true,
          autoExecuted: false,
        })
        .returning();
      await this.deps.db.insert(auraEvolutionLearningItems).values({
        companyId,
        kind: 'insight',
        title: insight!.title,
        summary: insight!.summary,
        linkedEntityType: 'aura_evolution_insight',
        linkedEntityId: insight!.id,
      });
      created += 1;
    }

    const [decisionCount] = await this.deps.db
      .select({ value: count() })
      .from(auraEvolutionDecisions)
      .where(eq(auraEvolutionDecisions.companyId, companyId));
    const decisions = Number(decisionCount?.value ?? 0);
    if (decisions >= MIN_PATTERN_SAMPLES) {
      const title = 'Decision history available for advisory learning';
      const [existing] = await this.deps.db
        .select({ id: auraEvolutionInsights.id })
        .from(auraEvolutionInsights)
        .where(
          and(
            eq(auraEvolutionInsights.companyId, companyId),
            eq(auraEvolutionInsights.title, title),
            inArray(auraEvolutionInsights.status, ['pending_approval', 'approved']),
          ),
        )
        .limit(1);
      if (!existing) {
        const [insight] = await this.deps.db
          .insert(auraEvolutionInsights)
          .values({
            companyId,
            title,
            summary: `${decisions} real Owner/workflow decisions are available. AURA may reference them for advisory recommendations only — no automatic rule, finance, or customer changes.`,
            category: 'decision_learning',
            status: 'pending_approval',
            confidence: Math.min(0.9, decisions / 20),
            evidence: { decisions, noDemoData: true, autoExecuted: false },
            requiresApproval: true,
            autoExecuted: false,
          })
          .returning();
        await this.deps.db.insert(auraEvolutionLearningItems).values({
          companyId,
          kind: 'insight',
          title: insight!.title,
          summary: insight!.summary,
          linkedEntityType: 'aura_evolution_insight',
          linkedEntityId: insight!.id,
        });
        created += 1;
      }
    }

    return created;
  }

  async decideInsight(
    actor: AuraEvolutionActor,
    insightId: string,
    input: DecideAuraEvolutionInsightRequest,
  ): Promise<AuraEvolutionInsight> {
    assertControl(actor);
    const [row] = await this.deps.db
      .select()
      .from(auraEvolutionInsights)
      .where(
        and(
          eq(auraEvolutionInsights.companyId, actor.companyId),
          eq(auraEvolutionInsights.id, insightId),
        ),
      )
      .limit(1);
    if (!row) throw new AuraEvolutionError('NOT_FOUND', 'Insight not found');
    if (row.status !== 'pending_approval' && row.status !== 'draft') {
      throw new AuraEvolutionError('CONFLICT', 'Insight is not awaiting a decision');
    }

    const status = input.decision === 'approve' ? 'approved' : 'rejected';
    const [updated] = await this.deps.db
      .update(auraEvolutionInsights)
      .set({
        status,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
        decisionNotes: input.notes ?? null,
        autoExecuted: false,
        updatedAt: new Date(),
      })
      .where(eq(auraEvolutionInsights.id, insightId))
      .returning();

    await this.audit(
      actor.companyId,
      actor.userId,
      status === 'approved'
        ? 'aura_evolution.insight.approved'
        : 'aura_evolution.insight.rejected',
      'aura_evolution_insight',
      insightId,
      {
        autoExecuted: false,
        noAutoBusinessRuleChanges: true,
        noAutoFinancialActions: true,
        noAutoCustomerCommunication: true,
        notes: input.notes ?? null,
      },
    );

    return this.mapInsight(updated!);
  }

  async removeLearningItem(
    actor: AuraEvolutionActor,
    itemId: string,
  ): Promise<AuraEvolutionLearningItem> {
    assertControl(actor);
    const [row] = await this.deps.db
      .select()
      .from(auraEvolutionLearningItems)
      .where(
        and(
          eq(auraEvolutionLearningItems.companyId, actor.companyId),
          eq(auraEvolutionLearningItems.id, itemId),
        ),
      )
      .limit(1);
    if (!row) throw new AuraEvolutionError('NOT_FOUND', 'Learning item not found');
    if (row.removed) return this.mapLearningItem(row);

    const [updated] = await this.deps.db
      .update(auraEvolutionLearningItems)
      .set({
        removed: true,
        removedByUserId: actor.userId,
        removedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(auraEvolutionLearningItems.id, itemId))
      .returning();

    // Soft-remove linked insight when applicable
    if (row.linkedEntityType === 'aura_evolution_insight' && row.linkedEntityId) {
      await this.deps.db
        .update(auraEvolutionInsights)
        .set({ status: 'removed', updatedAt: new Date(), autoExecuted: false })
        .where(
          and(
            eq(auraEvolutionInsights.companyId, actor.companyId),
            eq(auraEvolutionInsights.id, row.linkedEntityId),
          ),
        );
    }

    await this.audit(
      actor.companyId,
      actor.userId,
      'aura_evolution.learning_item.removed',
      'aura_evolution_learning_item',
      itemId,
      { kind: row.kind },
    );

    return this.mapLearningItem(updated!);
  }

  async createKnowledge(
    actor: AuraEvolutionActor,
    input: CreateAuraEvolutionKnowledgeRequest,
  ): Promise<AuraEvolutionKnowledgeEntry> {
    assertWrite(actor);
    assertControl(actor);

    if (input.commandMemoryId) {
      const [mem] = await this.deps.db
        .select({ id: auraCommandMemory.id })
        .from(auraCommandMemory)
        .where(
          and(
            eq(auraCommandMemory.companyId, actor.companyId),
            eq(auraCommandMemory.id, input.commandMemoryId),
          ),
        )
        .limit(1);
      if (!mem) {
        throw new AuraEvolutionError('NOT_FOUND', 'Command Centre memory entry not found');
      }
    }
    if (input.auraMemoryId) {
      const [mem] = await this.deps.db
        .select({ id: auraMemory.id })
        .from(auraMemory)
        .where(
          and(eq(auraMemory.companyId, actor.companyId), eq(auraMemory.id, input.auraMemoryId)),
        )
        .limit(1);
      if (!mem) throw new AuraEvolutionError('NOT_FOUND', 'AURA memory entry not found');
    }

    const [created] = await this.deps.db
      .insert(auraEvolutionKnowledge)
      .values({
        companyId: actor.companyId,
        kind: input.kind,
        title: input.title.trim(),
        content: input.content.trim(),
        commandMemoryId: input.commandMemoryId ?? null,
        auraMemoryId: input.auraMemoryId ?? null,
        enabled: true,
        createdByUserId: actor.userId,
        updatedByUserId: actor.userId,
      })
      .returning();

    await this.deps.db.insert(auraEvolutionLearningItems).values({
      companyId: actor.companyId,
      kind: 'knowledge_link',
      title: created!.title,
      summary: created!.content.slice(0, 240),
      linkedEntityType: 'aura_evolution_knowledge',
      linkedEntityId: created!.id,
    });

    await this.audit(
      actor.companyId,
      actor.userId,
      'aura_evolution.knowledge.created',
      'aura_evolution_knowledge',
      created!.id,
      {
        kind: input.kind,
        extendsCommandCentreMemory: Boolean(input.commandMemoryId),
        extendsAuraMemory: Boolean(input.auraMemoryId),
      },
    );

    return this.mapKnowledge(created!);
  }

  async getDashboard(actor: AuraEvolutionActor): Promise<AuraEvolutionDashboard> {
    assertAccess(actor);
    const settingsRow = await this.ensureSettings(actor.companyId);
    const settings = this.mapSettings(settingsRow);

    const [
      decisionRows,
      patternRows,
      insightRows,
      scoreRows,
      learningRows,
      knowledgeRows,
      decisionCountRow,
    ] = await Promise.all([
      this.deps.db
        .select()
        .from(auraEvolutionDecisions)
        .where(eq(auraEvolutionDecisions.companyId, actor.companyId))
        .orderBy(desc(auraEvolutionDecisions.createdAt))
        .limit(25),
      this.deps.db
        .select()
        .from(auraEvolutionPatterns)
        .where(eq(auraEvolutionPatterns.companyId, actor.companyId))
        .orderBy(desc(auraEvolutionPatterns.updatedAt))
        .limit(50),
      this.deps.db
        .select()
        .from(auraEvolutionInsights)
        .where(
          and(
            eq(auraEvolutionInsights.companyId, actor.companyId),
            inArray(auraEvolutionInsights.status, [
              'pending_approval',
              'approved',
              'rejected',
              'draft',
            ]),
          ),
        )
        .orderBy(desc(auraEvolutionInsights.createdAt))
        .limit(50),
      this.deps.db
        .select()
        .from(auraEvolutionRecommendationScores)
        .where(eq(auraEvolutionRecommendationScores.companyId, actor.companyId))
        .orderBy(desc(auraEvolutionRecommendationScores.updatedAt))
        .limit(50),
      this.deps.db
        .select()
        .from(auraEvolutionLearningItems)
        .where(
          and(
            eq(auraEvolutionLearningItems.companyId, actor.companyId),
            eq(auraEvolutionLearningItems.removed, false),
          ),
        )
        .orderBy(desc(auraEvolutionLearningItems.createdAt))
        .limit(50),
      this.deps.db
        .select()
        .from(auraEvolutionKnowledge)
        .where(
          and(
            eq(auraEvolutionKnowledge.companyId, actor.companyId),
            eq(auraEvolutionKnowledge.enabled, true),
          ),
        )
        .orderBy(desc(auraEvolutionKnowledge.createdAt))
        .limit(50),
      this.deps.db
        .select({ value: count() })
        .from(auraEvolutionDecisions)
        .where(eq(auraEvolutionDecisions.companyId, actor.companyId)),
    ]);

    const patterns = patternRows.map((r) => this.mapPattern(r));
    const scores = scoreRows.map((r) => this.mapScore(r));
    const insights = insightRows.map((r) => this.mapInsight(r));
    const rates = scores
      .map((s) => s.successRate)
      .filter((v): v is number => typeof v === 'number');
    const averageRecommendationSuccessRate =
      rates.length > 0
        ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 1000) / 1000
        : null;

    const honestGaps: string[] = [];
    if (!settings.learningEnabled) {
      honestGaps.push('Learning is disabled. Owner must enable learning before sync captures signals.');
    }
    if (Number(decisionCountRow[0]?.value ?? 0) === 0) {
      honestGaps.push('No decision history captured yet for this tenant.');
    }
    for (const pattern of patterns) {
      if (pattern.availability !== 'available' && pattern.honestGap) {
        honestGaps.push(`${pattern.kind}: ${pattern.honestGap}`);
      }
    }
    if (scores.length === 0) {
      honestGaps.push('Recommendation accuracy is unavailable until real accept/reject outcomes exist.');
    }

    const summary = settings.learningEnabled
      ? `Learning enabled. ${Number(decisionCountRow[0]?.value ?? 0)} decisions, ${patterns.filter((p) => p.availability === 'available').length} available patterns, ${insights.filter((i) => i.status === 'pending_approval').length} insights awaiting Owner approval. No automatic business, finance, or customer actions.`
      : 'Learning disabled by Owner. Insights and patterns will not sync until enabled.';

    await this.audit(
      actor.companyId,
      actor.userId,
      'aura_evolution.overview.read',
      'aura_evolution_settings',
      settingsRow.id,
      { learningEnabled: settings.learningEnabled },
    );

    return {
      settings,
      summary,
      learningEnabled: settings.learningEnabled,
      decisionCount: Number(decisionCountRow[0]?.value ?? 0),
      patternCount: patterns.length,
      availablePatternCount: patterns.filter((p) => p.availability === 'available').length,
      insufficientPatternCount: patterns.filter((p) => p.availability === 'insufficient_data')
        .length,
      insightPendingCount: insights.filter((i) => i.status === 'pending_approval').length,
      insightApprovedCount: insights.filter((i) => i.status === 'approved').length,
      recommendationScoreCount: scores.length,
      averageRecommendationSuccessRate,
      recentDecisions: decisionRows.map((r) => this.mapDecision(r)),
      patterns,
      insights,
      recommendationScores: scores,
      learningHistory: learningRows.map((r) => this.mapLearningItem(r)),
      knowledgeMemory: knowledgeRows.map((r) => this.mapKnowledge(r)),
      honestGaps,
      guarantees: AURA_EVOLUTION_GUARANTEES,
    };
  }
}
