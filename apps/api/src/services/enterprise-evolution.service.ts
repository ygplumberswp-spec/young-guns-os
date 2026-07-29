import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  ApproveEvolutionLearningRequest,
  CreateEvolutionOptimizationRequest,
  EnterpriseEvolutionAuraContext,
  EnterpriseEvolutionDashboard,
  EvolutionLearningAuditSummary,
  EvolutionLearningEventSummary,
  EvolutionModelVersionSummary,
  EvolutionOptimizationStudioSummary,
  EvolutionPatternSummary,
  EvolutionRecommendationSummary,
  EvolutionSafeLearningPolicySummary,
  EvolutionTimelineEventSummary,
  RollbackEvolutionLearningRequest,
  UpdateEvolutionOptimizationRequest,
  UpdateEvolutionRecommendationRequest,
  UpdateEvolutionSafeLearningPolicyRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  agentTasks,
  evolutionLearningAudit,
  evolutionLearningEvents,
  evolutionModelVersions,
  evolutionOptimizationStudio,
  evolutionPatterns,
  evolutionRecommendations,
  evolutionSafeLearningPolicies,
  evolutionSnapshots,
  evolutionTimelineEvents,
  jobs,
  workflowRuns,
} from '@titan/db';
import type { AiOrchestrationService } from './ai-orchestration.service.js';
import type { EnterpriseAutomationStudioService } from './enterprise-automation-studio.service.js';
import type { EnterpriseDigitalTwinService } from './enterprise-digital-twin.service.js';
import type { EnterpriseKnowledgeGraphService } from './enterprise-knowledge-graph.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { ExecutiveService } from './executive.service.js';
import type { FinanceService } from './finance.service.js';
import type { FleetService } from './fleet.service.js';
import type { IntelligenceService } from './intelligence.service.js';
import type { InventoryService } from './inventory.service.js';
import type { JobsService } from './jobs.service.js';
import type { MemoryService } from './memory.service.js';
import type { RecommendationsService } from './recommendations.service.js';
import type { SchedulingService } from './scheduling.service.js';

export class EnterpriseEvolutionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseEvolutionError';
  }
}

type StaffScope = { companyId: string; userId: string };

type EnterpriseEvolutionDeps = {
  db: DatabaseClient;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  enterpriseDigitalTwinService: EnterpriseDigitalTwinService;
  enterpriseKnowledgeGraphService: EnterpriseKnowledgeGraphService;
  enterpriseAutomationStudioService: EnterpriseAutomationStudioService;
  executiveService: ExecutiveService;
  intelligenceService: IntelligenceService;
  recommendationsService: RecommendationsService;
  aiOrchestrationService: AiOrchestrationService;
  memoryService: MemoryService;
  jobsService: JobsService;
  schedulingService: SchedulingService;
  fleetService: FleetService;
  inventoryService: InventoryService;
  financeService: FinanceService;
};

const DEFAULT_LEARNING_POLICIES: Array<{
  sourceType: EvolutionLearningEventSummary['sourceType'];
  requiresApproval: boolean;
}> = [
  { sourceType: 'user_approval', requiresApproval: false },
  { sourceType: 'user_correction', requiresApproval: true },
  { sourceType: 'completed_job', requiresApproval: false },
  { sourceType: 'customer_feedback', requiresApproval: true },
  { sourceType: 'technician_performance', requiresApproval: true },
  { sourceType: 'financial_outcome', requiresApproval: true },
  { sourceType: 'workflow_history', requiresApproval: false },
  { sourceType: 'ai_interaction', requiresApproval: true },
  { sourceType: 'business_decision', requiresApproval: true },
];

export class EnterpriseEvolutionService {
  constructor(private readonly deps: EnterpriseEvolutionDeps) {}

  async getEvolutionDashboard(companyId: string): Promise<EnterpriseEvolutionDashboard> {
    const [
      snapshot,
      learningEvents,
      patterns,
      recommendations,
      optimizations,
      timelineEvents,
      modelVersions,
    ] = await Promise.all([
      this.getLatestSnapshot(companyId),
      this.listLearningEvents(companyId),
      this.listPatterns(companyId),
      this.listRecommendations(companyId),
      this.listOptimizations(companyId),
      this.listTimelineEvents(companyId),
      this.listModelVersions(companyId),
    ]);

    const approvedLearning = learningEvents.filter((event) => event.status === 'approved');
    const pendingRecommendations = recommendations.filter((rec) => rec.status === 'pending');
    const pendingOptimizations = optimizations.filter(
      (opt) => opt.status === 'suggested' || opt.status === 'pending_approval',
    );

    return {
      summary: `Evolution platform live — optimization score ${snapshot?.optimizationScore ?? '—'}/100, ${approvedLearning.length} approved learning event(s), ${patterns.length} pattern(s), ${pendingRecommendations.length} pending recommendation(s).`,
      optimizationScore: snapshot?.optimizationScore ?? null,
      learningProgressPercent: snapshot?.learningProgressPercent ?? null,
      aiConfidenceScore: snapshot?.aiConfidenceScore ?? null,
      recommendationAcceptanceRate: snapshot?.recommendationAcceptanceRate ?? null,
      learningEventCount: learningEvents.length,
      approvedLearningCount: approvedLearning.length,
      patternCount: patterns.length,
      pendingRecommendationCount: pendingRecommendations.length,
      pendingOptimizationCount: pendingOptimizations.length,
      recentLearningEvents: learningEvents.slice(0, 20),
      patterns: patterns.slice(0, 15),
      recommendations: recommendations.slice(0, 20),
      optimizations: optimizations.slice(0, 15),
      timelineEvents: timelineEvents.slice(0, 25),
      modelVersions: modelVersions.slice(0, 10),
    };
  }

  async buildEvolutionAuraContext(companyId: string): Promise<EnterpriseEvolutionAuraContext> {
    const dashboard = await this.getEvolutionDashboard(companyId);
    return {
      summary: dashboard.summary,
      optimizationScore: dashboard.optimizationScore,
      learningProgressPercent: dashboard.learningProgressPercent,
      aiConfidenceScore: dashboard.aiConfidenceScore,
      pendingRecommendationCount: dashboard.pendingRecommendationCount,
      pendingOptimizationCount: dashboard.pendingOptimizationCount,
      patternCount: dashboard.patternCount,
    };
  }

  async syncLearningFromModules(companyId: string): Promise<EvolutionLearningEventSummary[]> {
    await this.ensureDefaultPolicies(companyId);
    const created: EvolutionLearningEventSummary[] = [];

    const [approvedTasks, rejectedTasks, completedJobs, failedWorkflows, aiQuality] = await Promise.all([
      this.deps.db.query.agentTasks.findMany({
        where: and(eq(agentTasks.companyId, companyId), eq(agentTasks.status, 'executed')),
        orderBy: [desc(agentTasks.updatedAt)],
        limit: 15,
      }),
      this.deps.db.query.agentTasks.findMany({
        where: and(eq(agentTasks.companyId, companyId), eq(agentTasks.status, 'rejected')),
        orderBy: [desc(agentTasks.updatedAt)],
        limit: 10,
      }),
      this.deps.db.query.jobs.findMany({
        where: and(eq(jobs.companyId, companyId), eq(jobs.status, 'completed')),
        orderBy: [desc(jobs.updatedAt)],
        limit: 15,
      }),
      this.deps.db.query.workflowRuns.findMany({
        where: and(eq(workflowRuns.companyId, companyId), eq(workflowRuns.status, 'completed')),
        orderBy: [desc(workflowRuns.completedAt)],
        limit: 10,
      }),
      this.deps.aiOrchestrationService.getQualityAnalytics(companyId),
    ]);

    for (const task of approvedTasks) {
      const row = await this.upsertLearningEvent(companyId, {
        sourceType: 'user_approval',
        title: `Approved: ${task.taskType.replace(/_/g, ' ')}`,
        summary: `User approved agent task ${task.taskType} — learning signal captured for future recommendations.`,
        sourceModule: 'agents',
        sourceEntityType: 'agent_task',
        sourceEntityId: task.id,
        confidenceScore: 0.85,
        context: { taskType: task.taskType, status: task.status },
      });
      created.push(row);
    }

    for (const task of rejectedTasks) {
      const row = await this.upsertLearningEvent(companyId, {
        sourceType: 'user_correction',
        title: `Corrected: ${task.taskType.replace(/_/g, ' ')}`,
        summary: `User rejected agent task ${task.taskType} — correction signal captured pending approval.`,
        sourceModule: 'agents',
        sourceEntityType: 'agent_task',
        sourceEntityId: task.id,
        confidenceScore: 0.75,
        context: { taskType: task.taskType, status: task.status },
      });
      created.push(row);
    }

    for (const job of completedJobs) {
      const row = await this.upsertLearningEvent(companyId, {
        sourceType: 'completed_job',
        title: `Completed job: ${job.title}`,
        summary: `Job completed successfully — operational outcome recorded for pattern analysis.`,
        sourceModule: 'jobs',
        sourceEntityType: 'job',
        sourceEntityId: job.id,
        confidenceScore: 0.8,
        context: { status: job.status },
      });
      created.push(row);
    }

    for (const run of failedWorkflows) {
      const row = await this.upsertLearningEvent(companyId, {
        sourceType: 'workflow_history',
        title: `Workflow completed: ${run.triggerEvent}`,
        summary: `Workflow run completed — execution history captured for automation optimization.`,
        sourceModule: 'automation',
        sourceEntityType: 'workflow_run',
        sourceEntityId: run.id,
        confidenceScore: 0.7,
        context: { workflowId: run.workflowId, durationMs: run.durationMs },
      });
      created.push(row);
    }

    if (aiQuality.evaluationCount > 0) {
      const row = await this.upsertLearningEvent(companyId, {
        sourceType: 'ai_interaction',
        title: 'AI quality feedback aggregated',
        summary: `${aiQuality.evaluationCount} quality evaluation(s), average score ${aiQuality.averageQualityScore?.toFixed(2) ?? '—'}.`,
        sourceModule: 'ai_orchestration',
        confidenceScore:
          aiQuality.averageQualityScore != null ? aiQuality.averageQualityScore / 100 : 0.6,
        context: aiQuality as unknown as Record<string, unknown>,
      });
      created.push(row);
    }

    await this.captureSnapshot(companyId);
    return created;
  }

  async detectPatterns(companyId: string): Promise<EvolutionPatternSummary[]> {
    await this.deps.db.delete(evolutionPatterns).where(eq(evolutionPatterns.companyId, companyId));

    const [
      jobsStats,
      schedulingStats,
      fleetStats,
      inventoryStats,
      financeStats,
      missionControl,
      twinDashboard,
      automationMonitoring,
    ] = await Promise.all([
      this.deps.jobsService.getStats(companyId),
      this.deps.schedulingService.getStats(companyId),
      this.deps.fleetService.getStats(companyId),
      this.deps.inventoryService.getStats(companyId),
      this.deps.financeService.getStats(companyId),
      this.deps.enterpriseMissionControlService.getMissionControlDashboard(companyId),
      this.deps.enterpriseDigitalTwinService.getExecutiveDashboard(companyId),
      this.deps.enterpriseAutomationStudioService.getMonitoringSummary(companyId),
    ]);

    const signals: Array<{
      patternType: EvolutionPatternSummary['patternType'];
      title: string;
      description: string;
      confidenceScore: number;
      evidence: Record<string, unknown>;
    }> = [];

    if (jobsStats.activeCount > 0 && schedulingStats.scheduledCount < jobsStats.activeCount) {
      signals.push({
        patternType: 'operational_trend',
        title: 'Scheduling gap detected',
        description: `${jobsStats.activeCount} active job(s) but only ${schedulingStats.scheduledCount} scheduled — dispatch optimization opportunity.`,
        confidenceScore: 0.78,
        evidence: { jobsStats, schedulingStats },
      });
    }

    if (inventoryStats.lowStockCount > 0) {
      signals.push({
        patternType: 'inventory_demand',
        title: 'Low stock pattern',
        description: `${inventoryStats.lowStockCount} item(s) below reorder level — procurement optimization recommended.`,
        confidenceScore: 0.82,
        evidence: { inventoryStats },
      });
    }

    if (fleetStats.totalCount > 0 && fleetStats.inUseCount / fleetStats.totalCount > 0.8) {
      signals.push({
        patternType: 'fleet_utilization',
        title: 'High fleet utilization',
        description: `${fleetStats.inUseCount}/${fleetStats.totalCount} vehicles in use — capacity planning recommended.`,
        confidenceScore: 0.76,
        evidence: { fleetStats },
      });
    }

    if (financeStats.openQuoteCount > 5) {
      signals.push({
        patternType: 'financial_anomaly',
        title: 'Open quote backlog',
        description: `${financeStats.openQuoteCount} open quote(s) — pricing and conversion optimization opportunity.`,
        confidenceScore: 0.74,
        evidence: { financeStats },
      });
    }

    if (twinDashboard.riskIndicators.operationalRiskLevel === 'high') {
      signals.push({
        patternType: 'business_risk',
        title: 'Elevated operational risk',
        description: twinDashboard.summary,
        confidenceScore: 0.88,
        evidence: twinDashboard.riskIndicators as unknown as Record<string, unknown>,
      });
    }

    if (automationMonitoring.failedCount > 0) {
      signals.push({
        patternType: 'operational_trend',
        title: 'Automation failure trend',
        description: `${automationMonitoring.failedCount} failed workflow run(s) — automation improvement recommended.`,
        confidenceScore: 0.8,
        evidence: automationMonitoring as unknown as Record<string, unknown>,
      });
    }

    if (missionControl.criticalAlertCount > 0) {
      signals.push({
        patternType: 'business_risk',
        title: 'Critical alert pattern',
        description: `${missionControl.criticalAlertCount} critical alert(s) active — executive optimization priority.`,
        confidenceScore: 0.9,
        evidence: { criticalAlertCount: missionControl.criticalAlertCount },
      });
    }

    const created: EvolutionPatternSummary[] = [];
    for (const signal of signals.slice(0, 12)) {
      const [row] = await this.deps.db
        .insert(evolutionPatterns)
        .values({
          companyId,
          patternType: signal.patternType,
          title: signal.title,
          description: signal.description,
          confidenceScore: signal.confidenceScore,
          evidence: signal.evidence,
        })
        .returning();
      created.push(toPatternSummary(row!));
    }

    return created;
  }

  async generateRecommendations(companyId: string): Promise<EvolutionRecommendationSummary[]> {
    const [patterns, crossModuleRecommendations, missionControl, automationMonitoring, aiCosts] =
      await Promise.all([
        this.listPatterns(companyId).then(async (existing) =>
          existing.length > 0 ? existing : this.detectPatterns(companyId),
        ),
        this.deps.recommendationsService.getRecommendations(companyId),
        this.deps.enterpriseMissionControlService.getMissionControlDashboard(companyId),
        this.deps.enterpriseAutomationStudioService.getMonitoringSummary(companyId),
        this.deps.aiOrchestrationService.getCostAnalytics(companyId),
      ]);

    const signals: Array<{
      category: EvolutionRecommendationSummary['category'];
      title: string;
      recommendation: string;
      priority: string;
      confidenceScore: number;
      estimatedImpact: string;
      context: Record<string, unknown>;
    }> = [];

    for (const pattern of patterns) {
      const category = mapPatternToCategory(pattern.patternType);
      signals.push({
        category,
        title: pattern.title,
        recommendation: pattern.description,
        priority: pattern.confidenceScore != null && pattern.confidenceScore >= 0.85 ? 'high' : 'medium',
        confidenceScore: pattern.confidenceScore ?? 0.7,
        estimatedImpact: 'Operational efficiency improvement based on detected pattern',
        context: { patternId: pattern.id, patternType: pattern.patternType },
      });
    }

    for (const rec of crossModuleRecommendations.recommendations.slice(0, 8)) {
      signals.push({
        category: mapLegacyCategory(rec.category),
        title: rec.title,
        recommendation: rec.description,
        priority: rec.priority,
        confidenceScore: rec.priority === 'high' ? 0.85 : 0.7,
        estimatedImpact: rec.actionHint ?? 'Cross-module optimization opportunity',
        context: { source: 'recommendations_service', entityType: rec.entityType, entityId: rec.entityId },
      });
    }

    if (automationMonitoring.failedCount > 0) {
      signals.push({
        category: 'automation',
        title: 'Reduce workflow failures',
        recommendation: `${automationMonitoring.failedCount} failed run(s) — review automation studio monitoring and draft workflow improvements.`,
        priority: 'high',
        confidenceScore: 0.82,
        estimatedImpact: 'Reduced manual intervention and faster process execution',
        context: automationMonitoring as unknown as Record<string, unknown>,
      });
    }

    if (aiCosts.totalCostCents > 0) {
      signals.push({
        category: 'ai_prompts',
        title: 'Optimize AI usage costs',
        recommendation: `AI spend ${formatCents(aiCosts.totalCostCents)} recorded — review routing rules and prompt versions for cost-quality balance.`,
        priority: 'medium',
        confidenceScore: 0.72,
        estimatedImpact: 'Potential AI cost reduction without quality degradation',
        context: aiCosts as unknown as Record<string, unknown>,
      });
    }

    if (missionControl.businessHealthScore != null && missionControl.businessHealthScore < 75) {
      signals.push({
        category: 'workforce',
        title: 'Improve business health score',
        recommendation: `Health score ${missionControl.businessHealthScore}/100 — coordinate department optimizations via mission control.`,
        priority: 'high',
        confidenceScore: 0.8,
        estimatedImpact: 'Holistic business performance improvement',
        context: { businessHealthScore: missionControl.businessHealthScore },
      });
    }

    const created: EvolutionRecommendationSummary[] = [];
    for (const signal of signals.slice(0, 15)) {
      const [row] = await this.deps.db
        .insert(evolutionRecommendations)
        .values({
          companyId,
          category: signal.category,
          title: signal.title,
          recommendation: signal.recommendation,
          priority: signal.priority,
          confidenceScore: signal.confidenceScore,
          estimatedImpact: signal.estimatedImpact,
          context: signal.context,
        })
        .returning();
      created.push(toRecommendationSummary(row!));
    }

    await this.captureSnapshot(companyId);
    return created;
  }

  async listLearningEvents(companyId: string): Promise<EvolutionLearningEventSummary[]> {
    const rows = await this.deps.db.query.evolutionLearningEvents.findMany({
      where: eq(evolutionLearningEvents.companyId, companyId),
      orderBy: [desc(evolutionLearningEvents.createdAt)],
      limit: 100,
    });
    return rows.map(toLearningSummary);
  }

  async approveLearning(scope: StaffScope, input: ApproveEvolutionLearningRequest): Promise<EvolutionLearningEventSummary> {
    const event = await this.ensureLearningEvent(scope.companyId, input.learningEventId);
    const [updated] = await this.deps.db
      .update(evolutionLearningEvents)
      .set({
        status: 'approved',
        approvedByUserId: scope.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(evolutionLearningEvents.id, event.id))
      .returning();

    await this.recordAudit(scope, {
      learningEventId: event.id,
      actionType: 'approved',
      description: `Learning event approved: ${event.title}`,
      snapshot: { status: 'approved' },
    });

    await this.syncModelVersion(scope.companyId);
    return toLearningSummary(updated!);
  }

  async rollbackLearning(scope: StaffScope, input: RollbackEvolutionLearningRequest): Promise<EvolutionLearningEventSummary> {
    const event = await this.ensureLearningEvent(scope.companyId, input.learningEventId);
    const [updated] = await this.deps.db
      .update(evolutionLearningEvents)
      .set({
        status: 'rolled_back',
        rolledBackAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(evolutionLearningEvents.id, event.id))
      .returning();

    await this.recordAudit(scope, {
      learningEventId: event.id,
      actionType: 'rolled_back',
      description: `Learning event rolled back: ${event.title}`,
      snapshot: { status: 'rolled_back' },
    });

    return toLearningSummary(updated!);
  }

  async listLearningAudit(companyId: string): Promise<EvolutionLearningAuditSummary[]> {
    const rows = await this.deps.db.query.evolutionLearningAudit.findMany({
      where: eq(evolutionLearningAudit.companyId, companyId),
      orderBy: [desc(evolutionLearningAudit.performedAt)],
      limit: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      learningEventId: row.learningEventId,
      actionType: row.actionType,
      description: row.description,
      performedAt: row.performedAt.toISOString(),
    }));
  }

  async listPatterns(companyId: string): Promise<EvolutionPatternSummary[]> {
    const rows = await this.deps.db.query.evolutionPatterns.findMany({
      where: eq(evolutionPatterns.companyId, companyId),
      orderBy: [desc(evolutionPatterns.detectedAt)],
      limit: 50,
    });
    return rows.map(toPatternSummary);
  }

  async listRecommendations(companyId: string): Promise<EvolutionRecommendationSummary[]> {
    const rows = await this.deps.db.query.evolutionRecommendations.findMany({
      where: eq(evolutionRecommendations.companyId, companyId),
      orderBy: [desc(evolutionRecommendations.createdAt)],
      limit: 100,
    });
    return rows.map(toRecommendationSummary);
  }

  async updateRecommendation(
    companyId: string,
    recommendationId: string,
    input: UpdateEvolutionRecommendationRequest,
  ): Promise<EvolutionRecommendationSummary> {
    await this.ensureRecommendation(companyId, recommendationId);
    const [updated] = await this.deps.db
      .update(evolutionRecommendations)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(evolutionRecommendations.id, recommendationId))
      .returning();

    await this.captureSnapshot(companyId);
    return toRecommendationSummary(updated!);
  }

  async listOptimizations(companyId: string): Promise<EvolutionOptimizationStudioSummary[]> {
    const rows = await this.deps.db.query.evolutionOptimizationStudio.findMany({
      where: eq(evolutionOptimizationStudio.companyId, companyId),
      orderBy: [desc(evolutionOptimizationStudio.updatedAt)],
      limit: 50,
    });
    return rows.map(toOptimizationSummary);
  }

  async createOptimization(
    scope: StaffScope,
    input: CreateEvolutionOptimizationRequest,
  ): Promise<EvolutionOptimizationStudioSummary> {
    if (input.recommendationId) {
      await this.ensureRecommendation(scope.companyId, input.recommendationId);
    }

    const [row] = await this.deps.db
      .insert(evolutionOptimizationStudio)
      .values({
        companyId: scope.companyId,
        title: input.title,
        description: input.description,
        recommendationId: input.recommendationId ?? null,
        estimatedImpact: input.estimatedImpact ?? null,
        riskAssessment: input.riskAssessment ?? null,
        costAnalysis: input.costAnalysis ?? null,
        payload: input.payload ?? {},
        status: 'pending_approval',
        createdByUserId: scope.userId,
      })
      .returning();

    await this.deps.db.insert(evolutionTimelineEvents).values({
      companyId: scope.companyId,
      eventType: 'optimization_history',
      title: `Optimization proposed: ${input.title}`,
      description: input.description,
      sourceModule: 'evolution',
      entityId: row!.id,
      eventAt: new Date(),
    });

    return toOptimizationSummary(row!);
  }

  async updateOptimization(
    scope: StaffScope,
    optimizationId: string,
    input: UpdateEvolutionOptimizationRequest,
  ): Promise<EvolutionOptimizationStudioSummary> {
    await this.ensureOptimization(scope.companyId, optimizationId);

    const [updated] = await this.deps.db
      .update(evolutionOptimizationStudio)
      .set({
        status: input.status,
        approvedByUserId: input.status === 'approved' || input.status === 'deployed' ? scope.userId : undefined,
        deployedAt: input.status === 'deployed' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(evolutionOptimizationStudio.id, optimizationId))
      .returning();

    if (input.status === 'deployed') {
      await this.deps.db.insert(evolutionTimelineEvents).values({
        companyId: scope.companyId,
        eventType: 'system_improvement',
        title: `Optimization deployed: ${updated!.title}`,
        description: updated!.description,
        sourceModule: 'evolution',
        entityId: optimizationId,
        impactSummary: updated!.estimatedImpact,
        eventAt: new Date(),
      });
    }

    return toOptimizationSummary(updated!);
  }

  async syncTimelineFromModules(companyId: string): Promise<EvolutionTimelineEventSummary[]> {
    const [executiveStats, knowledgeContext, approvedLearning] = await Promise.all([
      this.deps.executiveService.getStats(companyId),
      this.deps.enterpriseKnowledgeGraphService.buildKnowledgeGraphAuraContext(companyId),
      this.deps.db.query.evolutionLearningEvents.findMany({
        where: and(
          eq(evolutionLearningEvents.companyId, companyId),
          eq(evolutionLearningEvents.status, 'approved'),
        ),
        orderBy: [desc(evolutionLearningEvents.approvedAt)],
        limit: 10,
      }),
    ]);

    const created: EvolutionTimelineEventSummary[] = [];

    if (executiveStats.healthScore != null) {
      const [row] = await this.deps.db
        .insert(evolutionTimelineEvents)
        .values({
          companyId,
          eventType: 'kpi_improvement',
          title: `Business health: ${executiveStats.healthScore}/100`,
          description: 'Executive health snapshot captured for evolution timeline.',
          sourceModule: 'executive',
          impactSummary: `Health score ${executiveStats.healthScore}`,
          eventAt: new Date(),
        })
        .returning();
      created.push(toTimelineSummary(row!));
    }

    if (knowledgeContext.entityCount > 0) {
      const [row] = await this.deps.db
        .insert(evolutionTimelineEvents)
        .values({
          companyId,
          eventType: 'ai_learning',
          title: 'Knowledge graph indexed',
          description: knowledgeContext.summary,
          sourceModule: 'knowledge_graph',
          eventAt: new Date(),
        })
        .returning();
      created.push(toTimelineSummary(row!));
    }

    for (const event of approvedLearning) {
      const [row] = await this.deps.db
        .insert(evolutionTimelineEvents)
        .values({
          companyId,
          eventType: 'ai_learning',
          title: event.title,
          description: event.summary,
          sourceModule: event.sourceModule,
          entityId: event.id,
          eventAt: event.approvedAt ?? event.createdAt,
        })
        .returning();
      created.push(toTimelineSummary(row!));
    }

    return created;
  }

  async listTimelineEvents(companyId: string): Promise<EvolutionTimelineEventSummary[]> {
    const rows = await this.deps.db.query.evolutionTimelineEvents.findMany({
      where: eq(evolutionTimelineEvents.companyId, companyId),
      orderBy: [desc(evolutionTimelineEvents.eventAt)],
      limit: 100,
    });
    return rows.map(toTimelineSummary);
  }

  async listModelVersions(companyId: string): Promise<EvolutionModelVersionSummary[]> {
    const rows = await this.deps.db.query.evolutionModelVersions.findMany({
      where: eq(evolutionModelVersions.companyId, companyId),
      orderBy: [desc(evolutionModelVersions.createdAt)],
      limit: 20,
    });
    return rows.map(toModelVersionSummary);
  }

  async listSafeLearningPolicies(companyId: string): Promise<EvolutionSafeLearningPolicySummary[]> {
    await this.ensureDefaultPolicies(companyId);
    const rows = await this.deps.db.query.evolutionSafeLearningPolicies.findMany({
      where: eq(evolutionSafeLearningPolicies.companyId, companyId),
      orderBy: [evolutionSafeLearningPolicies.sourceType],
    });
    return rows.map(toPolicySummary);
  }

  async updateSafeLearningPolicy(
    scope: StaffScope,
    input: UpdateEvolutionSafeLearningPolicyRequest,
  ): Promise<EvolutionSafeLearningPolicySummary> {
    await this.ensureDefaultPolicies(scope.companyId);

    const existing = await this.deps.db.query.evolutionSafeLearningPolicies.findFirst({
      where: and(
        eq(evolutionSafeLearningPolicies.companyId, scope.companyId),
        eq(evolutionSafeLearningPolicies.sourceType, input.sourceType),
      ),
    });

    if (!existing) {
      throw new EnterpriseEvolutionError('NOT_FOUND', 'Learning policy not found');
    }

    const [updated] = await this.deps.db
      .update(evolutionSafeLearningPolicies)
      .set({
        requiresApproval: input.requiresApproval,
        allowRollback: input.allowRollback,
        minConfidenceScore: input.minConfidenceScore,
        updatedByUserId: scope.userId,
        updatedAt: new Date(),
      })
      .where(eq(evolutionSafeLearningPolicies.id, existing.id))
      .returning();

    return toPolicySummary(updated!);
  }

  async captureSnapshot(companyId: string) {
    const dashboard = await this.buildMetrics(companyId);

    const [row] = await this.deps.db
      .insert(evolutionSnapshots)
      .values({
        companyId,
        optimizationScore: dashboard.optimizationScore,
        learningProgressPercent: dashboard.learningProgressPercent,
        aiConfidenceScore: dashboard.aiConfidenceScore,
        recommendationAcceptanceRate: dashboard.recommendationAcceptanceRate,
        learningEventCount: dashboard.learningEventCount,
        patternCount: dashboard.patternCount,
        pendingRecommendationCount: dashboard.pendingRecommendationCount,
        metrics: dashboard.metrics,
      })
      .returning();

    return row!;
  }

  private async getLatestSnapshot(companyId: string) {
    const row = await this.deps.db.query.evolutionSnapshots.findFirst({
      where: eq(evolutionSnapshots.companyId, companyId),
      orderBy: [desc(evolutionSnapshots.capturedAt)],
    });

    if (!row) {
      return this.captureSnapshot(companyId);
    }

    return row;
  }

  private async buildMetrics(companyId: string) {
    const [learningEvents, recommendations, patterns, aiQuality, executiveStats] = await Promise.all([
      this.listLearningEvents(companyId),
      this.listRecommendations(companyId),
      this.listPatterns(companyId),
      this.deps.aiOrchestrationService.getQualityAnalytics(companyId),
      this.deps.executiveService.getStats(companyId),
    ]);

    const approved = learningEvents.filter((event) => event.status === 'approved').length;
    const accepted = recommendations.filter((rec) => rec.status === 'accepted' || rec.status === 'completed').length;
    const decided = recommendations.filter((rec) => rec.status !== 'pending').length;

    const learningProgressPercent =
      learningEvents.length > 0 ? Math.round((approved / learningEvents.length) * 100) : 0;
    const recommendationAcceptanceRate = decided > 0 ? Math.round((accepted / decided) * 100) : null;
    const aiConfidenceScore = aiQuality.averageQualityScore ?? null;
    const optimizationScore = computeOptimizationScore({
      executiveHealth: executiveStats.healthScore,
      learningProgressPercent,
      patternCount: patterns.length,
      pendingRecommendations: recommendations.filter((rec) => rec.status === 'pending').length,
    });

    return {
      optimizationScore,
      learningProgressPercent,
      aiConfidenceScore,
      recommendationAcceptanceRate,
      learningEventCount: learningEvents.length,
      patternCount: patterns.length,
      pendingRecommendationCount: recommendations.filter((rec) => rec.status === 'pending').length,
      metrics: {
        approvedLearningCount: approved,
        totalRecommendations: recommendations.length,
        executiveHealthScore: executiveStats.healthScore,
      },
    };
  }

  private async syncModelVersion(companyId: string) {
    const approvedCount = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(evolutionLearningEvents)
      .where(
        and(eq(evolutionLearningEvents.companyId, companyId), eq(evolutionLearningEvents.status, 'approved')),
      );

    const count = approvedCount[0]?.count ?? 0;
    const versionLabel = `v${count}`;

    await this.deps.db
      .update(evolutionModelVersions)
      .set({ isActive: false })
      .where(eq(evolutionModelVersions.companyId, companyId));

    await this.deps.db.insert(evolutionModelVersions).values({
      companyId,
      versionLabel,
      description: `Tenant learning model with ${count} approved event(s)`,
      learningEventCount: count,
      confidenceScore: Math.min(0.95, 0.5 + count * 0.02),
      isActive: true,
      metadata: { generatedAt: new Date().toISOString() },
    });
  }

  private async ensureDefaultPolicies(companyId: string) {
    for (const policy of DEFAULT_LEARNING_POLICIES) {
      const existing = await this.deps.db.query.evolutionSafeLearningPolicies.findFirst({
        where: and(
          eq(evolutionSafeLearningPolicies.companyId, companyId),
          eq(evolutionSafeLearningPolicies.sourceType, policy.sourceType),
        ),
      });
      if (!existing) {
        await this.deps.db.insert(evolutionSafeLearningPolicies).values({
          companyId,
          sourceType: policy.sourceType,
          requiresApproval: policy.requiresApproval,
        });
      }
    }
  }

  private async upsertLearningEvent(
    companyId: string,
    input: {
      sourceType: EvolutionLearningEventSummary['sourceType'];
      title: string;
      summary: string;
      sourceModule?: string;
      sourceEntityType?: string;
      sourceEntityId?: string;
      confidenceScore?: number;
      context?: Record<string, unknown>;
    },
  ): Promise<EvolutionLearningEventSummary> {
    if (input.sourceEntityId) {
      const existing = await this.deps.db.query.evolutionLearningEvents.findFirst({
        where: and(
          eq(evolutionLearningEvents.companyId, companyId),
          eq(evolutionLearningEvents.sourceEntityId, input.sourceEntityId),
          inArray(evolutionLearningEvents.status, ['pending_approval', 'approved']),
        ),
      });
      if (existing) return toLearningSummary(existing);
    }

    const policy = await this.deps.db.query.evolutionSafeLearningPolicies.findFirst({
      where: and(
        eq(evolutionSafeLearningPolicies.companyId, companyId),
        eq(evolutionSafeLearningPolicies.sourceType, input.sourceType),
      ),
    });

    const requiresApproval = policy?.requiresApproval ?? true;
    const status = requiresApproval ? 'pending_approval' : 'approved';

    const [row] = await this.deps.db
      .insert(evolutionLearningEvents)
      .values({
        companyId,
        sourceType: input.sourceType,
        title: input.title,
        summary: input.summary,
        sourceModule: input.sourceModule ?? null,
        sourceEntityType: input.sourceEntityType ?? null,
        sourceEntityId: input.sourceEntityId ?? null,
        confidenceScore: input.confidenceScore ?? null,
        context: input.context ?? {},
        requiresApproval,
        status,
        approvedAt: status === 'approved' ? new Date() : null,
      })
      .returning();

    return toLearningSummary(row!);
  }

  private async recordAudit(
    scope: StaffScope,
    input: { learningEventId: string; actionType: string; description: string; snapshot: Record<string, unknown> },
  ) {
    await this.deps.db.insert(evolutionLearningAudit).values({
      companyId: scope.companyId,
      learningEventId: input.learningEventId,
      actionType: input.actionType,
      description: input.description,
      snapshot: input.snapshot,
      performedByUserId: scope.userId,
    });
  }

  private async ensureLearningEvent(companyId: string, eventId: string) {
    const row = await this.deps.db.query.evolutionLearningEvents.findFirst({
      where: and(eq(evolutionLearningEvents.companyId, companyId), eq(evolutionLearningEvents.id, eventId)),
    });
    if (!row) throw new EnterpriseEvolutionError('NOT_FOUND', 'Learning event not found');
    return row;
  }

  private async ensureRecommendation(companyId: string, recommendationId: string) {
    const row = await this.deps.db.query.evolutionRecommendations.findFirst({
      where: and(eq(evolutionRecommendations.companyId, companyId), eq(evolutionRecommendations.id, recommendationId)),
    });
    if (!row) throw new EnterpriseEvolutionError('NOT_FOUND', 'Recommendation not found');
    return row;
  }

  private async ensureOptimization(companyId: string, optimizationId: string) {
    const row = await this.deps.db.query.evolutionOptimizationStudio.findFirst({
      where: and(eq(evolutionOptimizationStudio.companyId, companyId), eq(evolutionOptimizationStudio.id, optimizationId)),
    });
    if (!row) throw new EnterpriseEvolutionError('NOT_FOUND', 'Optimization not found');
    return row;
  }
}

function computeOptimizationScore(input: {
  executiveHealth: number | null;
  learningProgressPercent: number;
  patternCount: number;
  pendingRecommendations: number;
}): number {
  let score = input.executiveHealth ?? 60;
  score += Math.min(15, input.learningProgressPercent * 0.15);
  score += Math.min(10, input.patternCount * 2);
  score -= Math.min(20, input.pendingRecommendations * 2);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function mapPatternToCategory(patternType: EvolutionPatternSummary['patternType']): EvolutionRecommendationSummary['category'] {
  switch (patternType) {
    case 'inventory_demand':
      return 'inventory';
    case 'fleet_utilization':
      return 'fleet';
    case 'financial_anomaly':
      return 'finance';
    case 'technician_strength':
      return 'workforce';
    case 'customer_behaviour':
      return 'customer_success';
    case 'seasonal_change':
      return 'scheduling';
    default:
      return 'automation';
  }
}

function mapLegacyCategory(category: string): EvolutionRecommendationSummary['category'] {
  if (category === 'scheduling') return 'scheduling';
  if (category === 'inventory') return 'inventory';
  if (category === 'fleet') return 'fleet';
  if (category === 'automation') return 'automation';
  if (category === 'invoice_payment') return 'finance';
  if (category === 'customer_follow_up') return 'customer_success';
  return 'workforce';
}

function formatCents(amountCents: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(amountCents / 100);
}

function toLearningSummary(row: typeof evolutionLearningEvents.$inferSelect): EvolutionLearningEventSummary {
  return {
    id: row.id,
    sourceType: row.sourceType,
    status: row.status,
    title: row.title,
    summary: row.summary,
    confidenceScore: row.confidenceScore,
    sourceModule: row.sourceModule,
    requiresApproval: row.requiresApproval,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPatternSummary(row: typeof evolutionPatterns.$inferSelect): EvolutionPatternSummary {
  return {
    id: row.id,
    patternType: row.patternType,
    title: row.title,
    description: row.description,
    confidenceScore: row.confidenceScore,
    detectedAt: row.detectedAt.toISOString(),
  };
}

function toRecommendationSummary(row: typeof evolutionRecommendations.$inferSelect): EvolutionRecommendationSummary {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    recommendation: row.recommendation,
    priority: row.priority,
    status: row.status,
    confidenceScore: row.confidenceScore,
    estimatedImpact: row.estimatedImpact,
    createdAt: row.createdAt.toISOString(),
  };
}

function toOptimizationSummary(row: typeof evolutionOptimizationStudio.$inferSelect): EvolutionOptimizationStudioSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    estimatedImpact: row.estimatedImpact,
    riskAssessment: row.riskAssessment,
    costAnalysis: row.costAnalysis,
    confidenceScore: row.confidenceScore,
    recommendationId: row.recommendationId,
    deployedAt: row.deployedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toTimelineSummary(row: typeof evolutionTimelineEvents.$inferSelect): EvolutionTimelineEventSummary {
  return {
    id: row.id,
    eventType: row.eventType,
    title: row.title,
    description: row.description,
    sourceModule: row.sourceModule,
    impactSummary: row.impactSummary,
    eventAt: row.eventAt.toISOString(),
  };
}

function toModelVersionSummary(row: typeof evolutionModelVersions.$inferSelect): EvolutionModelVersionSummary {
  return {
    id: row.id,
    versionLabel: row.versionLabel,
    description: row.description,
    confidenceScore: row.confidenceScore,
    learningEventCount: row.learningEventCount,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPolicySummary(row: typeof evolutionSafeLearningPolicies.$inferSelect): EvolutionSafeLearningPolicySummary {
  return {
    id: row.id,
    sourceType: row.sourceType,
    requiresApproval: row.requiresApproval,
    allowRollback: row.allowRollback,
    minConfidenceScore: row.minConfidenceScore,
  };
}
