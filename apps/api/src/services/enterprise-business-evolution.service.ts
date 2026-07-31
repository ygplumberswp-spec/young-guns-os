import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  BevActionDraftSummary,
  BevAgentImprovementSummary,
  BevAgentPerformanceSnapshotSummary,
  BevAiEvaluationSummary,
  BevAnalyticsSummary,
  BevAuditLogSummary,
  BevContinuousImprovementItemSummary,
  BevEvolutionAlertSummary,
  BevEvolutionMonitoringSummary,
  BevExperimentSummary,
  BevHypothesisSummary,
  BevKnowledgeReinforcementSummary,
  BevMaturityAssessmentSummary,
  BevObservationSummary,
  BevOutcomeSummary,
  BevPatternSummary,
  BevPlatformConfigSummary,
  BevProcessMiningResultSummary,
  BevPromptPolicyVersionSummary,
  BevRecommendationEventSummary,
  BevRecommendationSummary,
  BevStrategicRoadmapItemSummary,
  BevUserFeedbackSummary,
  CreateBevContinuousImprovementItemRequest,
  CreateBevEvolutionActionDraftRequest,
  CreateBevExperimentRequest,
  CreateBevHypothesisRequest,
  CreateBevObservationRequest,
  CreateBevOutcomeRequest,
  CreateBevRecommendationRequest,
  CreateBevUserFeedbackRequest,
  EnterpriseBusinessEvolutionAuraContext,
  EnterpriseBusinessEvolutionDashboard,
  ExecuteBevSafeOptimizationRequest,
  UpdateBevExperimentRequest,
  UpdateBevHypothesisRequest,
  UpdateBevPlatformConfigRequest,
  UpdateBevRecommendationRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  agentTasks,
  bevActionDrafts,
  bevAgentImprovements,
  bevAgentPerformanceSnapshots,
  bevAiEvaluations,
  bevAnalyticsSnapshots,
  bevAuditLogs,
  bevAutonomousOptimizations,
  bevContinuousImprovementItems,
  bevEvolutionAlerts,
  bevExperiments,
  bevHypotheses,
  bevKnowledgeReinforcements,
  bevMaturityAssessments,
  bevObservations,
  bevOutcomes,
  bevPatterns,
  bevPlatformConfig,
  bevProcessMiningResults,
  bevPromptPolicyVersions,
  bevRecommendationEvents,
  bevRecommendations,
  bevStrategicRoadmapItems,
  bevUserFeedback,
  evolutionLearningEvents,
  itoIncidents,
  jobs,
  workflowRuns,
  workflowSteps,
} from '@titan/db';
import type { AiOrchestrationService } from './ai-orchestration.service.js';
import type { AnalyticsService } from './analytics.service.js';
import type { EnterpriseAutomationStudioService } from './enterprise-automation-studio.service.js';
import type { EnterpriseCustomerExperienceService } from './enterprise-customer-experience.service.js';
import type { EnterpriseDigitalTwinService } from './enterprise-digital-twin.service.js';
import type { EnterpriseEvolutionService } from './enterprise-evolution.service.js';
import type { EnterpriseFinancialPlanningService } from './enterprise-financial-planning.service.js';
import type { EnterpriseItOperationsService } from './enterprise-it-operations.service.js';
import type { EnterpriseKnowledgeGraphService } from './enterprise-knowledge-graph.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { EnterpriseServiceDeliveryService } from './enterprise-service-delivery.service.js';
import type { EnterpriseWorkforceIntelligenceService } from './enterprise-workforce-intelligence.service.js';
import type { FinanceService } from './finance.service.js';
import type { JobsService } from './jobs.service.js';
import type { LeadsService } from './leads.service.js';
import type { MarketingService } from './marketing.service.js';

export class EnterpriseBusinessEvolutionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseBusinessEvolutionError';
  }
}

type StaffScope = { companyId: string; userId: string };

type ExecuteSafeOptimizationResult = {
  optimizationId: string;
  optimizationKey: string;
  verified: boolean;
  workflowStatus: string;
  output: Record<string, unknown>;
};

type CreateBevPatternRequest = {
  patternKey: string;
  title: string;
  description?: string;
  learningStage?: string;
  confidenceScore?: number;
  frequency?: number;
  businessImpact?: string;
  affectedModules?: Record<string, unknown>;
  possibleCauses?: Record<string, unknown>;
  limitations?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  timePeriodStart?: string;
  timePeriodEnd?: string;
};

type UpdateBevPatternRequest = Partial<CreateBevPatternRequest> & { learningStage?: string };
type UpdateBevObservationRequest = Partial<CreateBevObservationRequest> & {
  learningStage?: string;
};
type UpdateBevOutcomeRequest = Partial<CreateBevOutcomeRequest> & { learningStage?: string };
type UpdateBevContinuousImprovementItemRequest =
  Partial<CreateBevContinuousImprovementItemRequest> & { workflowStatus?: string };
type CreateBevStrategicRoadmapItemRequest = {
  themeKey: string;
  title: string;
  description?: string;
  priority?: string;
  ownerUserId?: string;
  budgetCents?: number;
  expectedOutcomes?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  milestones?: Record<string, unknown>;
};
type UpdateBevStrategicRoadmapItemRequest = Partial<CreateBevStrategicRoadmapItemRequest> & {
  workflowStatus?: string;
  progressPercent?: number;
  benefitRealizedCents?: number;
};
type CreateBevMaturityAssessmentRequest = {
  frameworkKey: string;
  domain: string;
  criteria?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  score?: number;
  scoringMethod?: string;
  confidenceScore?: number;
  gaps?: Record<string, unknown>;
  recommendedSteps?: Record<string, unknown>;
};
type UpdateBevMaturityAssessmentRequest = Partial<CreateBevMaturityAssessmentRequest>;
type CreateBevAgentImprovementRequest = {
  agentKey: string;
  improvementType: string;
  title: string;
  description?: string;
  versionLabel?: string;
  changeReason?: string;
  securityReviewRequired?: boolean;
  stagingTestRequired?: boolean;
  performanceBefore?: Record<string, unknown>;
  performanceAfter?: Record<string, unknown>;
  rollbackVersionLabel?: string;
};
type UpdateBevAgentImprovementRequest = Partial<CreateBevAgentImprovementRequest> & {
  workflowStatus?: string;
};
type CreateBevPromptPolicyVersionRequest = {
  policyType: string;
  policyKey: string;
  versionLabel: string;
  content: string;
  changeReason?: string;
  effectiveAt?: string;
  rollbackVersionLabel?: string;
  performanceBefore?: Record<string, unknown>;
  performanceAfter?: Record<string, unknown>;
};
type UpdateBevPromptPolicyVersionRequest = Partial<CreateBevPromptPolicyVersionRequest> & {
  workflowStatus?: string;
};
type CreateBevAiEvaluationRequest = {
  evaluationKey: string;
  evaluationType: string;
  datasetRef?: string;
  metrics?: Record<string, unknown>;
  summary?: string;
  evaluatedAt?: string;
};
type UpdateBevAiEvaluationRequest = Partial<CreateBevAiEvaluationRequest> & {
  workflowStatus?: string;
};
type CreateBevKnowledgeReinforcementRequest = {
  lessonTitle: string;
  lessonContent: string;
  knowledgeNodeRef?: string;
  linkedEntities?: Record<string, unknown>;
  sourceOutcomeId?: string;
  learningStage?: string;
};
type UpdateBevKnowledgeReinforcementRequest = Partial<CreateBevKnowledgeReinforcementRequest> & {
  validatedAt?: string;
  validatedByUserId?: string;
};
type CreateBevProcessMiningResultRequest = {
  processKey: string;
  title: string;
  actualPath?: Record<string, unknown>;
  expectedPath?: Record<string, unknown>;
  bottlenecks?: Record<string, unknown>;
  reworkLoops?: Record<string, unknown>;
  deviations?: Record<string, unknown>;
};
type UpdateBevProcessMiningResultRequest = Partial<CreateBevProcessMiningResultRequest>;
type CreateBevEvolutionAlertRequest = {
  alertType: string;
  severity?: string;
  title: string;
  description?: string;
  sourceModule?: string;
  incidentId?: string;
  context?: Record<string, unknown>;
};
type UpdateBevEvolutionAlertRequest = Partial<CreateBevEvolutionAlertRequest> & { status?: string };

const SAFE_OPTIMIZATION_KEYS = [
  'alert_deduplication',
  'analytics_job_retry',
  'monitoring_frequency_tune',
  'provider_health_reroute',
] as const;

type BusinessEvolutionDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  enterpriseEvolutionService: EnterpriseEvolutionService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  enterpriseKnowledgeGraphService: EnterpriseKnowledgeGraphService;
  enterpriseDigitalTwinService: EnterpriseDigitalTwinService;
  enterpriseAutomationStudioService: EnterpriseAutomationStudioService;
  enterpriseItOperationsService: EnterpriseItOperationsService;
  enterpriseFinancialPlanningService: EnterpriseFinancialPlanningService;
  enterpriseWorkforceIntelligenceService: EnterpriseWorkforceIntelligenceService;
  enterpriseCustomerExperienceService: EnterpriseCustomerExperienceService;
  enterpriseServiceDeliveryService: EnterpriseServiceDeliveryService;
  jobsService: JobsService;
  financeService: FinanceService;
  leadsService: LeadsService;
  marketingService: MarketingService;
  analyticsService: AnalyticsService;
  aiOrchestrationService: AiOrchestrationService;
};

export class EnterpriseBusinessEvolutionService {
  constructor(private readonly deps: BusinessEvolutionDeps) {}

  async getDashboard(companyId: string): Promise<EnterpriseBusinessEvolutionDashboard> {
    const isPlatformOwner =
      await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId);
    const [
      platformConfig,
      legacyEvolution,
      observations,
      patterns,
      hypotheses,
      recommendations,
      experiments,
      outcomes,
      alerts,
      improvementItems,
      maturityAssessments,
      analytics,
      evolutionMonitoring,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.deps.enterpriseEvolutionService.getEvolutionDashboard(companyId).catch(() => null),
      this.listObservations(companyId),
      this.listPatterns(companyId),
      this.listHypotheses(companyId),
      this.listRecommendations(companyId),
      this.listExperiments(companyId),
      this.listOutcomes(companyId),
      this.listEvolutionAlerts(companyId, { status: 'open' }),
      this.listContinuousImprovementItems(companyId),
      this.listMaturityAssessments(companyId),
      this.getLatestAnalytics(companyId),
      this.getEvolutionMonitoring(companyId),
    ]);

    void this.deps.enterpriseFinancialPlanningService.getDashboard(companyId).catch(() => null);

    const openRecommendationCount = recommendations.filter((r) =>
      ['created', 'viewed', 'accepted', 'approved'].includes(r.workflowStatus),
    ).length;
    const activeExperimentCount = experiments.filter((e) =>
      ['approved', 'scheduled', 'active'].includes(e.workflowStatus),
    ).length;
    const overallLearningConfidence =
      analytics?.overallLearningConfidence ?? computeLearningConfidence(patterns);

    return {
      summary: `${observations.length} observation(s), ${patterns.length} pattern(s), ${openRecommendationCount} open recommendation(s), ${alerts.length} open alert(s).`,
      isPlatformOwner,
      platformConfig,
      legacyEvolution,
      observationCount: observations.length,
      patternCount: patterns.length,
      hypothesisCount: hypotheses.length,
      openRecommendationCount,
      activeExperimentCount,
      openAlertCount: alerts.length,
      continuousImprovementCount: improvementItems.length,
      maturityAssessmentCount: maturityAssessments.length,
      overallLearningConfidence,
      evolutionMonitoring,
      analytics,
      recentObservations: observations.slice(0, 10),
      recentPatterns: patterns.slice(0, 10),
      recentHypotheses: hypotheses.slice(0, 10),
      recentRecommendations: recommendations.slice(0, 10),
      recentExperiments: experiments.slice(0, 10),
      recentOutcomes: outcomes.slice(0, 10),
      recentAlerts: alerts.slice(0, 10),
      recentImprovementItems: improvementItems.slice(0, 10),
    };
  }

  async getEvolutionMonitoring(companyId: string): Promise<BevEvolutionMonitoringSummary> {
    const [
      alerts,
      experiments,
      recommendations,
      lessons,
      missionControl,
      automationMonitoring,
      knowledgeContext,
      workforceDashboard,
      cxDashboard,
      serviceDeliveryDashboard,
      aiQuality,
    ] = await Promise.all([
      this.listEvolutionAlerts(companyId, { status: 'open' }),
      this.listExperiments(companyId),
      this.listRecommendations(companyId),
      this.listKnowledgeReinforcements(companyId),
      this.deps.enterpriseMissionControlService.getMissionControlDashboard(companyId),
      this.deps.enterpriseAutomationStudioService.getMonitoringSummary(companyId),
      this.deps.enterpriseKnowledgeGraphService
        .buildKnowledgeGraphAuraContext(companyId)
        .catch(() => null),
      this.deps.enterpriseWorkforceIntelligenceService.getDashboard(companyId).catch(() => null),
      this.deps.enterpriseCustomerExperienceService.getDashboard(companyId).catch(() => null),
      this.deps.enterpriseServiceDeliveryService.getDashboard(companyId).catch(() => null),
      this.deps.aiOrchestrationService.getQualityAnalytics(companyId).catch(() => null),
    ]);

    const activeExperimentCount = experiments.filter((e) => e.workflowStatus === 'active').length;
    const pendingRecommendationCount = recommendations.filter(
      (r) => r.workflowStatus === 'created',
    ).length;
    const validatedLessonCount = lessons.filter((l) => l.learningStage === 'validated').length;
    const alertsList: string[] = [];
    if (alerts.length > 0) alertsList.push(`${alerts.length} open evolution alert(s)`);
    if (activeExperimentCount > 0) alertsList.push(`${activeExperimentCount} active experiment(s)`);
    if (pendingRecommendationCount > 0)
      alertsList.push(`${pendingRecommendationCount} pending recommendation(s)`);
    if (missionControl.criticalAlertCount > 0)
      alertsList.push(`${missionControl.criticalAlertCount} critical mission control alert(s)`);
    if (automationMonitoring.failedCount > 0)
      alertsList.push(`${automationMonitoring.failedCount} failed workflow run(s)`);
    if (knowledgeContext && knowledgeContext.entityCount > 0)
      alertsList.push(`${knowledgeContext.entityCount} knowledge graph entit(ies)`);
    if (workforceDashboard && workforceDashboard.pendingLeaveCount > 0) {
      alertsList.push(`${workforceDashboard.pendingLeaveCount} pending leave application(s)`);
    }
    if (cxDashboard && cxDashboard.pendingApprovalBookingCount > 0) {
      alertsList.push(
        `${cxDashboard.pendingApprovalBookingCount} pending customer booking approval(s)`,
      );
    }
    if (serviceDeliveryDashboard && serviceDeliveryDashboard.openCallbackCount > 0) {
      alertsList.push(`${serviceDeliveryDashboard.openCallbackCount} open service callback(s)`);
    }
    if (aiQuality && aiQuality.evaluationCount > 0 && (aiQuality.averageQualityScore ?? 100) < 70) {
      alertsList.push(`AI quality score ${aiQuality.averageQualityScore?.toFixed(1) ?? '—'}`);
    }

    return {
      openAlertCount: alerts.length,
      activeExperimentCount,
      pendingRecommendationCount,
      validatedLessonCount,
      alerts: alertsList,
    };
  }

  async getPlatformConfig(companyId: string): Promise<BevPlatformConfigSummary> {
    return toPlatformConfigSummary(await this.ensurePlatformConfig(companyId));
  }

  async updatePlatformConfig(
    scope: StaffScope,
    input: UpdateBevPlatformConfigRequest,
  ): Promise<BevPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(bevPlatformConfig)
      .set({
        learningGovernance: input.learningGovernance ?? existing.learningGovernance,
        experimentSafetyDefaults:
          input.experimentSafetyDefaults ?? existing.experimentSafetyDefaults,
        evaluationTemplates: input.evaluationTemplates ?? existing.evaluationTemplates,
        aggregationThresholds: input.aggregationThresholds ?? existing.aggregationThresholds,
        crossTenantPrivacyRules: input.crossTenantPrivacyRules ?? existing.crossTenantPrivacyRules,
        agentImprovementStandards:
          input.agentImprovementStandards ?? existing.agentImprovementStandards,
        autonomousAllowlist: input.autonomousAllowlist ?? existing.autonomousAllowlist,
        rollbackRequirements: input.rollbackRequirements ?? existing.rollbackRequirements,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        recommendationThresholds:
          input.recommendationThresholds ?? existing.recommendationThresholds,
        learningScope: input.learningScope ?? existing.learningScope,
        dataSources: input.dataSources ?? existing.dataSources,
        updatedAt: new Date(),
      })
      .where(eq(bevPlatformConfig.companyId, scope.companyId))
      .returning();
    await this.recordAudit(scope, 'platform_config_updated');
    return toPlatformConfigSummary(updated!);
  }

  async syncObservations(scope: StaffScope): Promise<BevObservationSummary[]> {
    const companyId = scope.companyId;
    const syncedAt = new Date().toISOString();
    const [completedJobs, failedWorkflows, agentTaskRows, openIncidents, learningEvents, existing] =
      await Promise.all([
        this.deps.db.query.jobs.findMany({
          where: and(eq(jobs.companyId, companyId), eq(jobs.status, 'completed')),
          orderBy: [desc(jobs.updatedAt)],
          limit: 20,
        }),
        this.deps.db.query.workflowRuns.findMany({
          where: and(eq(workflowRuns.companyId, companyId), eq(workflowRuns.status, 'failed')),
          orderBy: [desc(workflowRuns.completedAt)],
          limit: 20,
        }),
        this.deps.db.query.agentTasks.findMany({
          where: and(
            eq(agentTasks.companyId, companyId),
            inArray(agentTasks.status, ['executed', 'rejected']),
          ),
          orderBy: [desc(agentTasks.updatedAt)],
          limit: 30,
        }),
        this.deps.db.query.itoIncidents.findMany({
          where: and(
            eq(itoIncidents.companyId, companyId),
            inArray(itoIncidents.status, ['open', 'investigating']),
          ),
          orderBy: [desc(itoIncidents.createdAt)],
          limit: 20,
        }),
        this.deps.db.query.evolutionLearningEvents.findMany({
          where: eq(evolutionLearningEvents.companyId, companyId),
          orderBy: [desc(evolutionLearningEvents.createdAt)],
          limit: 20,
        }),
        this.listObservations(companyId),
      ]);

    for (const job of completedJobs) {
      const observationKey = `job:completed:${job.id}`;
      if (!existing.some((row) => row.observationKey === observationKey)) {
        await this.createObservation(scope, {
          observationKey,
          sourceModule: 'jobs',
          observationType: 'job_completed',
          title: `Completed job: ${job.title}`,
          description: `Job ${job.title} completed with status ${job.status}.`,
          sourceEntityType: 'job',
          sourceEntityId: job.id,
          evidence: { status: job.status, syncedAt },
        });
      }
    }

    for (const run of failedWorkflows) {
      const observationKey = `workflow:failed:${run.id}`;
      if (!existing.some((row) => row.observationKey === observationKey)) {
        await this.createObservation(scope, {
          observationKey,
          sourceModule: 'automation',
          observationType: 'workflow_failed',
          title: `Failed workflow: ${run.triggerEvent}`,
          description: run.errorMessage ?? 'Workflow run failed.',
          sourceEntityType: 'workflow_run',
          sourceEntityId: run.id,
          evidence: { triggerEvent: run.triggerEvent, durationMs: run.durationMs, syncedAt },
        });
      }
    }

    for (const task of agentTaskRows) {
      const observationKey = `agent_task:${task.status}:${task.id}`;
      if (!existing.some((row) => row.observationKey === observationKey)) {
        await this.createObservation(scope, {
          observationKey,
          sourceModule: 'agents',
          observationType:
            task.status === 'executed' ? 'agent_task_executed' : 'agent_task_rejected',
          title: `${task.status === 'executed' ? 'Executed' : 'Rejected'} agent task: ${task.taskType}`,
          description: task.preview.slice(0, 500),
          sourceEntityType: 'agent_task',
          sourceEntityId: task.id,
          evidence: {
            agentKey: task.agentKey,
            taskType: task.taskType,
            status: task.status,
            syncedAt,
          },
        });
      }
    }

    for (const incident of openIncidents) {
      const observationKey = `ito_incident:${incident.id}`;
      if (!existing.some((row) => row.observationKey === observationKey)) {
        await this.createObservation(scope, {
          observationKey,
          sourceModule: 'it_operations',
          observationType: 'it_incident_open',
          title: incident.title,
          description: incident.description ?? undefined,
          sourceEntityType: 'ito_incident',
          sourceEntityId: incident.id,
          evidence: { severity: incident.severity, status: incident.status, syncedAt },
        });
      }
    }

    for (const event of learningEvents) {
      const observationKey = `evolution_learning:${event.id}`;
      if (!existing.some((row) => row.observationKey === observationKey)) {
        await this.createObservation(scope, {
          observationKey,
          sourceModule: event.sourceModule ?? 'evolution',
          observationType: 'evolution_learning_event',
          title: event.title,
          description: event.summary,
          sourceEntityType: event.sourceEntityType ?? 'evolution_learning_event',
          sourceEntityId: event.sourceEntityId ?? undefined,
          evidence: {
            sourceType: event.sourceType,
            status: event.status,
            confidenceScore: event.confidenceScore,
            syncedAt,
          },
        });
      }
    }

    await this.recordAudit(scope, 'observations_synced');
    return this.listObservations(companyId);
  }

  async detectPatterns(scope: StaffScope): Promise<BevPatternSummary[]> {
    const companyId = scope.companyId;
    const [
      observations,
      jobsStats,
      leadsStats,
      marketingStats,
      financeStats,
      automationMonitoring,
      twinDashboard,
    ] = await Promise.all([
      this.listObservations(companyId),
      this.deps.jobsService.getStats(companyId),
      this.deps.leadsService.getStats(companyId),
      this.deps.marketingService.getStats(companyId),
      this.deps.financeService.getStats(companyId),
      this.deps.enterpriseAutomationStudioService.getMonitoringSummary(companyId),
      this.deps.enterpriseDigitalTwinService.getExecutiveDashboard(companyId),
    ]);

    const existing = await this.listPatterns(companyId);
    const created: BevPatternSummary[] = [];
    const now = new Date();
    const syncedAt = now.toISOString();

    const failedWorkflowObs = observations.filter((o) => o.observationType === 'workflow_failed');
    if (failedWorkflowObs.length >= 2) {
      const patternKey = 'automation_failure_cluster';
      if (!existing.some((p) => p.patternKey === patternKey)) {
        created.push(
          await this.createPattern(scope, {
            patternKey,
            title: 'Automation failure cluster',
            description: `${failedWorkflowObs.length} failed workflow observation(s) detected from real workflow runs.`,
            confidenceScore: Math.min(0.95, 0.6 + failedWorkflowObs.length * 0.05),
            frequency: failedWorkflowObs.length,
            businessImpact: 'Increased manual intervention and process delays',
            affectedModules: { modules: ['automation'] },
            evidence: {
              supportingSourceRecords: failedWorkflowObs.map((o) => o.id),
              observationIds: failedWorkflowObs.map((o) => o.id),
              automationMonitoring,
              syncedAt,
            },
            timePeriodStart: failedWorkflowObs.at(-1)?.observedAt,
            timePeriodEnd: failedWorkflowObs[0]?.observedAt,
          }),
        );
      }
    }

    const rejectedAgentObs = observations.filter(
      (o) => o.observationType === 'agent_task_rejected',
    );
    if (rejectedAgentObs.length >= 2) {
      const patternKey = 'agent_correction_cluster';
      if (!existing.some((p) => p.patternKey === patternKey)) {
        created.push(
          await this.createPattern(scope, {
            patternKey,
            title: 'Agent correction cluster',
            description: `${rejectedAgentObs.length} rejected agent task observation(s) indicate recurring correction needs.`,
            confidenceScore: Math.min(0.9, 0.55 + rejectedAgentObs.length * 0.06),
            frequency: rejectedAgentObs.length,
            businessImpact: 'Reduced agent trust and slower automation adoption',
            affectedModules: { modules: ['agents'] },
            evidence: {
              supportingSourceRecords: rejectedAgentObs.map((o) => o.id),
              observationIds: rejectedAgentObs.map((o) => o.id),
              syncedAt,
            },
          }),
        );
      }
    }

    if (
      jobsStats.activeCount > 0 &&
      jobsStats.totalCount > 0 &&
      jobsStats.activeCount / jobsStats.totalCount > 0.6
    ) {
      const patternKey = 'job_completion_backlog';
      if (!existing.some((p) => p.patternKey === patternKey)) {
        created.push(
          await this.createPattern(scope, {
            patternKey,
            title: 'Job completion backlog',
            description: `${jobsStats.activeCount} active job(s) of ${jobsStats.totalCount} total — operational throughput opportunity.`,
            confidenceScore: 0.74,
            frequency: jobsStats.activeCount,
            businessImpact: 'Delayed revenue recognition and customer delivery',
            affectedModules: { modules: ['jobs'] },
            evidence: { jobsStats, syncedAt },
          }),
        );
      }
    }

    if (
      leadsStats.activeLeadCount > 5 &&
      leadsStats.convertedLeadCount < leadsStats.activeLeadCount
    ) {
      const patternKey = 'lead_conversion_gap';
      if (!existing.some((p) => p.patternKey === patternKey)) {
        created.push(
          await this.createPattern(scope, {
            patternKey,
            title: 'Lead conversion gap',
            description: `${leadsStats.activeLeadCount} active lead(s) with ${leadsStats.convertedLeadCount} conversion(s) — sales funnel optimization opportunity.`,
            confidenceScore: 0.72,
            frequency: leadsStats.activeLeadCount,
            businessImpact: 'Missed revenue from open pipeline',
            affectedModules: { modules: ['leads', 'marketing'] },
            evidence: { leadsStats, marketingStats, syncedAt },
          }),
        );
      }
    }

    if (financeStats.openQuoteCount > 3) {
      const patternKey = 'open_quote_backlog';
      if (!existing.some((p) => p.patternKey === patternKey)) {
        created.push(
          await this.createPattern(scope, {
            patternKey,
            title: 'Open quote backlog',
            description: `${financeStats.openQuoteCount} open quote(s) pending decision — pricing and conversion optimization recommended.`,
            confidenceScore: 0.73,
            frequency: financeStats.openQuoteCount,
            businessImpact: 'Delayed cash collection',
            affectedModules: { modules: ['finance'] },
            evidence: { financeStats, syncedAt },
          }),
        );
      }
    }

    if (automationMonitoring.failedCount > 0) {
      const patternKey = 'workflow_failure_trend';
      if (!existing.some((p) => p.patternKey === patternKey)) {
        created.push(
          await this.createPattern(scope, {
            patternKey,
            title: 'Workflow failure trend',
            description: `${automationMonitoring.failedCount} failed workflow run(s) recorded in automation monitoring.`,
            confidenceScore: 0.8,
            frequency: automationMonitoring.failedCount,
            businessImpact: 'Process reliability degradation',
            affectedModules: { modules: ['automation'] },
            evidence: {
              automationMonitoring: automationMonitoring as unknown as Record<string, unknown>,
              syncedAt,
            },
          }),
        );
      }
    }

    if (twinDashboard.riskIndicators.operationalRiskLevel === 'high') {
      const patternKey = 'elevated_operational_risk';
      if (!existing.some((p) => p.patternKey === patternKey)) {
        created.push(
          await this.createPattern(scope, {
            patternKey,
            title: 'Elevated operational risk',
            description: twinDashboard.summary,
            confidenceScore: 0.88,
            frequency: 1,
            businessImpact: 'Cross-domain business risk elevation',
            affectedModules: { modules: ['digital_twin'] },
            evidence: {
              riskIndicators: twinDashboard.riskIndicators as unknown as Record<string, unknown>,
              syncedAt,
            },
          }),
        );
      }
    }

    await this.recordAudit(scope, 'patterns_detected', undefined, undefined, {
      createdCount: created.length,
    });
    return [...existing, ...created];
  }

  async syncEvolutionAlerts(scope: StaffScope): Promise<BevEvolutionAlertSummary[]> {
    const companyId = scope.companyId;
    const [failedExperiments, rejectedRecommendations, negativeOutcomes, existingOpen] =
      await Promise.all([
        this.deps.db.query.bevExperiments.findMany({
          where: and(
            eq(bevExperiments.companyId, companyId),
            eq(bevExperiments.workflowStatus, 'rejected'),
          ),
          orderBy: [desc(bevExperiments.updatedAt)],
          limit: 20,
        }),
        this.deps.db.query.bevRecommendations.findMany({
          where: and(
            eq(bevRecommendations.companyId, companyId),
            eq(bevRecommendations.workflowStatus, 'rejected'),
          ),
          orderBy: [desc(bevRecommendations.updatedAt)],
          limit: 20,
        }),
        this.deps.db.query.bevOutcomes.findMany({
          where: and(
            eq(bevOutcomes.companyId, companyId),
            sql`${bevOutcomes.financialImpactCents} < 0`,
          ),
          orderBy: [desc(bevOutcomes.measuredAt)],
          limit: 20,
        }),
        this.listEvolutionAlerts(companyId, { status: 'open' }),
      ]);

    for (const experiment of failedExperiments) {
      const alertType = `failed_experiment:${experiment.id}`;
      if (!existingOpen.some((a) => a.alertType === alertType)) {
        await this.deps.db.insert(bevEvolutionAlerts).values({
          companyId,
          alertType,
          severity: 'warning',
          status: 'open',
          title: `Failed experiment: ${experiment.title}`,
          description: experiment.description,
          sourceModule: 'business_evolution',
          context: { experimentId: experiment.id, workflowStatus: experiment.workflowStatus },
        });
      }
    }

    for (const recommendation of rejectedRecommendations) {
      const alertType = `rejected_recommendation:${recommendation.id}`;
      if (!existingOpen.some((a) => a.alertType === alertType)) {
        await this.deps.db.insert(bevEvolutionAlerts).values({
          companyId,
          alertType,
          severity: 'info',
          status: 'open',
          title: `Rejected recommendation: ${recommendation.title}`,
          description: recommendation.description,
          sourceModule: 'business_evolution',
          context: {
            recommendationId: recommendation.id,
            workflowStatus: recommendation.workflowStatus,
          },
        });
      }
    }

    for (const outcome of negativeOutcomes) {
      const alertType = `negative_outcome:${outcome.id}`;
      if (!existingOpen.some((a) => a.alertType === alertType)) {
        await this.deps.db.insert(bevEvolutionAlerts).values({
          companyId,
          alertType,
          severity: 'critical',
          status: 'open',
          title: `Negative outcome: ${outcome.title}`,
          description: outcome.operationalImpact,
          sourceModule: 'business_evolution',
          context: {
            outcomeId: outcome.id,
            financialImpactCents: outcome.financialImpactCents,
            experimentId: outcome.experimentId,
            recommendationId: outcome.recommendationId,
          },
        });
      }
    }

    await this.recordAudit(scope, 'evolution_alerts_synced');
    return this.listEvolutionAlerts(companyId, { status: 'open' });
  }

  async captureAnalytics(scope: StaffScope): Promise<BevAnalyticsSummary> {
    const dashboard = await this.getDashboard(scope.companyId);
    const analyticsDashboard = await this.deps.analyticsService
      .getDashboard(scope.companyId)
      .catch(() => null);
    const [created] = await this.deps.db
      .insert(bevAnalyticsSnapshots)
      .values({
        companyId: scope.companyId,
        metrics: {
          observationCount: dashboard.observationCount,
          patternCount: dashboard.patternCount,
          hypothesisCount: dashboard.hypothesisCount,
          openRecommendationCount: dashboard.openRecommendationCount,
          activeExperimentCount: dashboard.activeExperimentCount,
          openAlertCount: dashboard.openAlertCount,
          continuousImprovementCount: dashboard.continuousImprovementCount,
          maturityAssessmentCount: dashboard.maturityAssessmentCount,
          validatedLessonCount: dashboard.evolutionMonitoring.validatedLessonCount,
          overallLearningConfidence: dashboard.overallLearningConfidence,
          analyticsDashboard,
        },
      })
      .returning();
    await this.recordAudit(scope, 'analytics_captured');
    return toAnalyticsSummary(created!);
  }

  async captureAgentPerformance(scope: StaffScope): Promise<BevAgentPerformanceSnapshotSummary[]> {
    const companyId = scope.companyId;
    const tasks = await this.deps.db.query.agentTasks.findMany({
      where: eq(agentTasks.companyId, companyId),
      orderBy: [desc(agentTasks.updatedAt)],
      limit: 500,
    });
    if (tasks.length === 0) return [];

    const grouped = new Map<string, typeof tasks>();
    for (const task of tasks) {
      const key = String(task.agentKey);
      const bucket = grouped.get(key) ?? [];
      bucket.push(task);
      grouped.set(key, bucket);
    }

    const snapshots: BevAgentPerformanceSnapshotSummary[] = [];
    for (const [agentKey, agentTasksForKey] of grouped) {
      const total = agentTasksForKey.length;
      const executed = agentTasksForKey.filter((t) => t.status === 'executed').length;
      const rejected = agentTasksForKey.filter((t) => t.status === 'rejected').length;
      const approved = agentTasksForKey.filter(
        (t) => t.status === 'approved' || t.status === 'executed',
      ).length;
      const [created] = await this.deps.db
        .insert(bevAgentPerformanceSnapshots)
        .values({
          companyId,
          agentKey,
          taskVolume: total,
          successRate: total > 0 ? String((executed / total) * 100) : null,
          failureRate: total > 0 ? String((rejected / total) * 100) : null,
          approvalRate: total > 0 ? String((approved / total) * 100) : null,
          rejectionRate: total > 0 ? String((rejected / total) * 100) : null,
          correctionRate: total > 0 ? String((rejected / total) * 100) : null,
          toolFailureCount: agentTasksForKey.filter((t) => t.status === 'cancelled').length,
          policyViolationCount: 0,
          costCents: 0,
        })
        .returning();
      snapshots.push(toAgentPerformanceSnapshotSummary(created!));
    }

    await this.recordAudit(scope, 'agent_performance_captured', undefined, undefined, {
      agentCount: snapshots.length,
    });
    return snapshots;
  }

  async listAgentPerformanceSnapshots(
    companyId: string,
  ): Promise<BevAgentPerformanceSnapshotSummary[]> {
    const rows = await this.deps.db.query.bevAgentPerformanceSnapshots.findMany({
      where: eq(bevAgentPerformanceSnapshots.companyId, companyId),
      orderBy: [desc(bevAgentPerformanceSnapshots.capturedAt)],
      limit: 100,
    });
    return rows.map(toAgentPerformanceSnapshotSummary);
  }

  async syncProcessMining(scope: StaffScope): Promise<BevProcessMiningResultSummary[]> {
    const companyId = scope.companyId;
    const runs = await this.deps.db.query.workflowRuns.findMany({
      where: eq(workflowRuns.companyId, companyId),
      orderBy: [desc(workflowRuns.completedAt)],
      limit: 30,
    });
    if (runs.length === 0) return [];

    const existing = await this.listProcessMiningResults(companyId);
    const created: BevProcessMiningResultSummary[] = [];

    for (const run of runs) {
      const steps = await this.deps.db.query.workflowSteps.findMany({
        where: eq(workflowSteps.workflowRunId, run.id),
        orderBy: [workflowSteps.sortOrder],
      });
      if (steps.length === 0) continue;

      const processKey = `workflow_run:${run.id}`;
      if (existing.some((row) => row.processKey === processKey)) continue;

      const actualPath = {
        runId: run.id,
        triggerEvent: run.triggerEvent,
        status: run.status,
        steps: steps.map((step) => ({
          id: step.id,
          actionType: step.actionType,
          sortOrder: step.sortOrder,
          status: step.status,
        })),
      };
      const failedSteps = steps.filter((s) => s.status === 'failed');
      const reworkLoops = steps.filter(
        (s) => s.status === 'skipped' || s.status === 'awaiting_approval',
      );

      const row = await this.createProcessMiningResult(scope, {
        processKey,
        title: `Process path: ${run.triggerEvent}`,
        actualPath,
        expectedPath: { workflowId: run.workflowId, stepCount: steps.length },
        bottlenecks: {
          failedStepCount: failedSteps.length,
          failedSteps: failedSteps.map((s) => s.id),
        },
        reworkLoops: { count: reworkLoops.length, stepIds: reworkLoops.map((s) => s.id) },
        deviations: { status: run.status, errorMessage: run.errorMessage },
      });
      created.push(row);
    }

    await this.recordAudit(scope, 'process_mining_synced', undefined, undefined, {
      createdCount: created.length,
    });
    return [...existing, ...created];
  }

  async executeSafeOptimization(
    scope: StaffScope,
    input: ExecuteBevSafeOptimizationRequest,
  ): Promise<ExecuteSafeOptimizationResult> {
    if (
      !SAFE_OPTIMIZATION_KEYS.includes(
        input.optimizationKey as (typeof SAFE_OPTIMIZATION_KEYS)[number],
      )
    ) {
      throw new EnterpriseBusinessEvolutionError(
        'VALIDATION_ERROR',
        'Only configured low-risk optimizations are allowed',
      );
    }

    const config = await this.getPlatformConfig(scope.companyId);
    const allowlist =
      (config.autonomousAllowlist.allowlist as
        Array<{ optimizationKey: string; riskLevel: string }> | undefined) ?? [];
    const allowed = allowlist.find((entry) => entry.optimizationKey === input.optimizationKey);
    if (allowed && allowed.riskLevel !== 'low') {
      throw new EnterpriseBusinessEvolutionError(
        'VALIDATION_ERROR',
        'Only configured low-risk optimizations are allowed',
      );
    }

    let output: Record<string, unknown> = {};
    let verified = false;

    if (input.optimizationKey === 'alert_deduplication') {
      const openAlerts = await this.listEvolutionAlerts(scope.companyId, { status: 'open' });
      const seen = new Set<string>();
      let resolvedCount = 0;
      for (const alert of openAlerts) {
        const dedupeKey = alert.alertType.split(':')[0] ?? alert.alertType;
        if (seen.has(dedupeKey)) {
          await this.deps.db
            .update(bevEvolutionAlerts)
            .set({ status: 'resolved', updatedAt: new Date() })
            .where(eq(bevEvolutionAlerts.id, alert.id));
          resolvedCount += 1;
        } else {
          seen.add(dedupeKey);
        }
      }
      output = { resolvedCount, remainingOpen: openAlerts.length - resolvedCount };
      verified = true;
    } else if (input.optimizationKey === 'analytics_job_retry') {
      const analytics = await this.captureAnalytics(scope);
      output = { capturedAt: analytics.capturedAt, observationCount: analytics.observationCount };
      verified = analytics.observationCount >= 0;
    } else if (input.optimizationKey === 'monitoring_frequency_tune') {
      const current = await this.ensurePlatformConfig(scope.companyId);
      const nextThresholds = {
        ...current.aggregationThresholds,
        monitoringFrequencyMinutes: Number(input.input?.monitoringFrequencyMinutes ?? 15),
        tunedAt: new Date().toISOString(),
      };
      await this.deps.db
        .update(bevPlatformConfig)
        .set({ aggregationThresholds: nextThresholds, updatedAt: new Date() })
        .where(eq(bevPlatformConfig.companyId, scope.companyId));
      output = { aggregationThresholds: nextThresholds };
      verified = true;
    } else if (input.optimizationKey === 'provider_health_reroute') {
      const resilience = await this.deps.enterpriseItOperationsService.getAiResilienceStatus(
        scope.companyId,
      );
      output = { resilience };
      verified = resilience.providers.length > 0;
    }

    const [optimization] = await this.deps.db
      .insert(bevAutonomousOptimizations)
      .values({
        companyId: scope.companyId,
        optimizationKey: input.optimizationKey,
        allowlistKey: input.optimizationKey,
        title: `Safe optimization: ${input.optimizationKey}`,
        description: 'Low-risk autonomous optimization executed with full audit trail.',
        workflowStatus: verified ? 'executed' : 'review',
        riskLevel: 'low',
        verified,
        output: { input: input.input ?? {}, result: output },
        executedAt: new Date(),
      })
      .returning();

    await this.recordAudit(
      scope,
      'safe_optimization_executed',
      'bev_autonomous_optimization',
      optimization!.id,
      {
        optimizationKey: input.optimizationKey,
        verified,
        output,
      },
    );

    return {
      optimizationId: optimization!.id,
      optimizationKey: input.optimizationKey,
      verified,
      workflowStatus: optimization!.workflowStatus,
      output,
    };
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseBusinessEvolutionAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      summary: dashboard.summary,
      observationCount: dashboard.observationCount,
      patternCount: dashboard.patternCount,
      hypothesisCount: dashboard.hypothesisCount,
      openRecommendationCount: dashboard.openRecommendationCount,
      activeExperimentCount: dashboard.activeExperimentCount,
      openAlertCount: dashboard.openAlertCount,
      continuousImprovementCount: dashboard.continuousImprovementCount,
      maturityAssessmentCount: dashboard.maturityAssessmentCount,
      overallLearningConfidence: dashboard.overallLearningConfidence,
    };
  }

  async recordRecommendationEvent(
    scope: StaffScope,
    recommendationId: string,
    eventType: string,
    data: Record<string, unknown> = {},
  ): Promise<BevRecommendationEventSummary> {
    await this.ensureRecommendation(scope.companyId, recommendationId);
    const [created] = await this.deps.db
      .insert(bevRecommendationEvents)
      .values({
        companyId: scope.companyId,
        recommendationId,
        eventType,
        decisionReason: typeof data.decisionReason === 'string' ? data.decisionReason : null,
        reviewingUserId: scope.userId,
        implementationOwnerUserId:
          typeof data.implementationOwnerUserId === 'string'
            ? data.implementationOwnerUserId
            : null,
        expectedOutcome: typeof data.expectedOutcome === 'string' ? data.expectedOutcome : null,
        actualOutcome: typeof data.actualOutcome === 'string' ? data.actualOutcome : null,
        variance: typeof data.variance === 'string' ? data.variance : null,
        lessonsLearned: typeof data.lessonsLearned === 'string' ? data.lessonsLearned : null,
        metadata: data,
      })
      .returning();
    await this.recordAudit(
      scope,
      'recommendation_event_recorded',
      'bev_recommendation',
      recommendationId,
      { eventType },
    );
    return toRecommendationEventSummary(created!);
  }

  async acknowledgeEvolutionAlert(
    scope: StaffScope,
    alertId: string,
  ): Promise<BevEvolutionAlertSummary> {
    const row = await this.deps.db.query.bevEvolutionAlerts.findFirst({
      where: and(
        eq(bevEvolutionAlerts.companyId, scope.companyId),
        eq(bevEvolutionAlerts.id, alertId),
      ),
    });
    if (!row) throw new EnterpriseBusinessEvolutionError('NOT_FOUND', 'Evolution alert not found');
    const [updated] = await this.deps.db
      .update(bevEvolutionAlerts)
      .set({ status: 'acknowledged', updatedAt: new Date() })
      .where(eq(bevEvolutionAlerts.id, alertId))
      .returning();
    await this.recordAudit(scope, 'evolution_alert_acknowledged', 'bev_evolution_alert', alertId);
    return toEvolutionAlertSummary(updated!);
  }

  async getLatestAnalytics(companyId: string): Promise<BevAnalyticsSummary | null> {
    const row = await this.deps.db.query.bevAnalyticsSnapshots.findFirst({
      where: eq(bevAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(bevAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  async createObservation(
    scope: StaffScope,
    input: CreateBevObservationRequest,
  ): Promise<BevObservationSummary> {
    const [created] = await this.deps.db
      .insert(bevObservations)
      .values({
        companyId: scope.companyId,
        ...mapCreateObservationInput(input),
      })
      .returning();
    await this.recordAudit(scope, 'observation_created', 'bev_observation', created!.id);
    return toObservationSummary(created!);
  }
  async listObservations(companyId: string): Promise<BevObservationSummary[]> {
    const rows = await this.deps.db.query.bevObservations.findMany({
      where: eq(bevObservations.companyId, companyId),
      orderBy: [desc(bevObservations.observedAt)],
      limit: 100,
    });
    return rows.map(toObservationSummary);
  }
  async getObservation(companyId: string, id: string): Promise<BevObservationSummary | null> {
    const row = await this.deps.db.query.bevObservations.findFirst({
      where: and(eq(bevObservations.companyId, companyId), eq(bevObservations.id, id)),
    });
    return row ? toObservationSummary(row) : null;
  }
  async updateObservation(
    scope: StaffScope,
    id: string,
    input: UpdateBevObservationRequest,
  ): Promise<BevObservationSummary> {
    await this.ensureObservation(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(bevObservations)
      .set({
        ...mapUpdateObservationInput(input),
        updatedAt: new Date(),
      })
      .where(and(eq(bevObservations.companyId, scope.companyId), eq(bevObservations.id, id)))
      .returning();
    await this.recordAudit(scope, 'observation_updated', 'bev_observation', id);
    return toObservationSummary(updated!);
  }

  async createPattern(
    scope: StaffScope,
    input: CreateBevPatternRequest,
  ): Promise<BevPatternSummary> {
    const [created] = await this.deps.db
      .insert(bevPatterns)
      .values({
        companyId: scope.companyId,
        ...mapCreatePatternInput(input),
        dataFreshnessAt: new Date(),
      })
      .returning();
    await this.recordAudit(scope, 'pattern_created', 'bev_pattern', created!.id);
    return toPatternSummary(created!);
  }
  async listPatterns(companyId: string): Promise<BevPatternSummary[]> {
    const rows = await this.deps.db.query.bevPatterns.findMany({
      where: eq(bevPatterns.companyId, companyId),
      orderBy: [desc(bevPatterns.createdAt)],
      limit: 100,
    });
    return rows.map(toPatternSummary);
  }
  async getPattern(companyId: string, id: string): Promise<BevPatternSummary | null> {
    const row = await this.deps.db.query.bevPatterns.findFirst({
      where: and(eq(bevPatterns.companyId, companyId), eq(bevPatterns.id, id)),
    });
    return row ? toPatternSummary(row) : null;
  }
  async updatePattern(
    scope: StaffScope,
    id: string,
    input: UpdateBevPatternRequest,
  ): Promise<BevPatternSummary> {
    await this.ensurePattern(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(bevPatterns)
      .set({
        ...mapUpdatePatternInput(input),
        updatedAt: new Date(),
      })
      .where(and(eq(bevPatterns.companyId, scope.companyId), eq(bevPatterns.id, id)))
      .returning();
    await this.recordAudit(scope, 'pattern_updated', 'bev_pattern', id);
    return toPatternSummary(updated!);
  }

  async createHypothesis(
    scope: StaffScope,
    input: CreateBevHypothesisRequest,
  ): Promise<BevHypothesisSummary> {
    const [created] = await this.deps.db
      .insert(bevHypotheses)
      .values({
        companyId: scope.companyId,
        ...mapCreateHypothesisInput(input),
      })
      .returning();
    await this.recordAudit(scope, 'hypothesis_created', 'bev_hypothesis', created!.id);
    return toHypothesisSummary(created!);
  }
  async listHypotheses(companyId: string): Promise<BevHypothesisSummary[]> {
    const rows = await this.deps.db.query.bevHypotheses.findMany({
      where: eq(bevHypotheses.companyId, companyId),
      orderBy: [desc(bevHypotheses.createdAt)],
      limit: 100,
    });
    return rows.map(toHypothesisSummary);
  }
  async getHypothesis(companyId: string, id: string): Promise<BevHypothesisSummary | null> {
    const row = await this.deps.db.query.bevHypotheses.findFirst({
      where: and(eq(bevHypotheses.companyId, companyId), eq(bevHypotheses.id, id)),
    });
    return row ? toHypothesisSummary(row) : null;
  }
  async updateHypothesis(
    scope: StaffScope,
    id: string,
    input: UpdateBevHypothesisRequest,
  ): Promise<BevHypothesisSummary> {
    await this.ensureHypothesis(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(bevHypotheses)
      .set({
        ...mapUpdateHypothesisInput(input),
        updatedAt: new Date(),
      })
      .where(and(eq(bevHypotheses.companyId, scope.companyId), eq(bevHypotheses.id, id)))
      .returning();
    await this.recordAudit(scope, 'hypothesis_updated', 'bev_hypothesis', id);
    return toHypothesisSummary(updated!);
  }

  async createRecommendation(
    scope: StaffScope,
    input: CreateBevRecommendationRequest,
  ): Promise<BevRecommendationSummary> {
    const [created] = await this.deps.db
      .insert(bevRecommendations)
      .values({
        companyId: scope.companyId,
        ...mapCreateRecommendationInput(input),
      })
      .returning();
    await this.recordAudit(scope, 'recommendation_created', 'bev_recommendation', created!.id);
    return toRecommendationSummary(created!);
  }
  async listRecommendations(companyId: string): Promise<BevRecommendationSummary[]> {
    const rows = await this.deps.db.query.bevRecommendations.findMany({
      where: eq(bevRecommendations.companyId, companyId),
      orderBy: [desc(bevRecommendations.createdAt)],
      limit: 100,
    });
    return rows.map(toRecommendationSummary);
  }
  async getRecommendation(companyId: string, id: string): Promise<BevRecommendationSummary | null> {
    const row = await this.deps.db.query.bevRecommendations.findFirst({
      where: and(eq(bevRecommendations.companyId, companyId), eq(bevRecommendations.id, id)),
    });
    return row ? toRecommendationSummary(row) : null;
  }
  async updateRecommendation(
    scope: StaffScope,
    id: string,
    input: UpdateBevRecommendationRequest,
  ): Promise<BevRecommendationSummary> {
    await this.ensureRecommendation(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(bevRecommendations)
      .set({
        ...mapUpdateRecommendationInput(input),
        updatedAt: new Date(),
      })
      .where(and(eq(bevRecommendations.companyId, scope.companyId), eq(bevRecommendations.id, id)))
      .returning();
    await this.recordAudit(scope, 'recommendation_updated', 'bev_recommendation', id);
    return toRecommendationSummary(updated!);
  }

  async createExperiment(
    scope: StaffScope,
    input: CreateBevExperimentRequest,
  ): Promise<BevExperimentSummary> {
    const [created] = await this.deps.db
      .insert(bevExperiments)
      .values({
        companyId: scope.companyId,
        ...mapCreateExperimentInput(input),
      })
      .returning();
    await this.recordAudit(scope, 'experiment_created', 'bev_experiment', created!.id);
    return toExperimentSummary(created!);
  }
  async listExperiments(companyId: string): Promise<BevExperimentSummary[]> {
    const rows = await this.deps.db.query.bevExperiments.findMany({
      where: eq(bevExperiments.companyId, companyId),
      orderBy: [desc(bevExperiments.createdAt)],
      limit: 100,
    });
    return rows.map(toExperimentSummary);
  }
  async getExperiment(companyId: string, id: string): Promise<BevExperimentSummary | null> {
    const row = await this.deps.db.query.bevExperiments.findFirst({
      where: and(eq(bevExperiments.companyId, companyId), eq(bevExperiments.id, id)),
    });
    return row ? toExperimentSummary(row) : null;
  }
  async updateExperiment(
    scope: StaffScope,
    id: string,
    input: UpdateBevExperimentRequest,
  ): Promise<BevExperimentSummary> {
    await this.ensureExperiment(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(bevExperiments)
      .set({
        ...mapUpdateExperimentInput(input),
        updatedAt: new Date(),
      })
      .where(and(eq(bevExperiments.companyId, scope.companyId), eq(bevExperiments.id, id)))
      .returning();
    await this.recordAudit(scope, 'experiment_updated', 'bev_experiment', id);
    return toExperimentSummary(updated!);
  }

  async createOutcome(
    scope: StaffScope,
    input: CreateBevOutcomeRequest,
  ): Promise<BevOutcomeSummary> {
    const [created] = await this.deps.db
      .insert(bevOutcomes)
      .values({
        companyId: scope.companyId,
        ...mapCreateOutcomeInput(input),
      })
      .returning();
    await this.recordAudit(scope, 'outcome_created', 'bev_outcome', created!.id);
    return toOutcomeSummary(created!);
  }
  async listOutcomes(companyId: string): Promise<BevOutcomeSummary[]> {
    const rows = await this.deps.db.query.bevOutcomes.findMany({
      where: eq(bevOutcomes.companyId, companyId),
      orderBy: [desc(bevOutcomes.measuredAt)],
      limit: 100,
    });
    return rows.map(toOutcomeSummary);
  }
  async getOutcome(companyId: string, id: string): Promise<BevOutcomeSummary | null> {
    const row = await this.deps.db.query.bevOutcomes.findFirst({
      where: and(eq(bevOutcomes.companyId, companyId), eq(bevOutcomes.id, id)),
    });
    return row ? toOutcomeSummary(row) : null;
  }
  async updateOutcome(
    scope: StaffScope,
    id: string,
    input: UpdateBevOutcomeRequest,
  ): Promise<BevOutcomeSummary> {
    await this.ensureOutcome(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(bevOutcomes)
      .set({
        ...mapUpdateOutcomeInput(input),
        updatedAt: new Date(),
      })
      .where(and(eq(bevOutcomes.companyId, scope.companyId), eq(bevOutcomes.id, id)))
      .returning();
    await this.recordAudit(scope, 'outcome_updated', 'bev_outcome', id);
    return toOutcomeSummary(updated!);
  }

  async createUserFeedback(
    scope: StaffScope,
    input: CreateBevUserFeedbackRequest,
  ): Promise<BevUserFeedbackSummary> {
    const [created] = await this.deps.db
      .insert(bevUserFeedback)
      .values({
        companyId: scope.companyId,
        targetType: input.targetType,
        targetId: input.targetId,
        feedbackRating: input.feedbackRating as typeof bevUserFeedback.$inferInsert.feedbackRating,
        feedbackText: input.feedbackText ?? null,
        submittedByUserId: scope.userId,
        metadata: input.metadata ?? {},
      })
      .returning();
    await this.recordAudit(scope, 'user_feedback_created', 'bev_user_feedback', created!.id);
    return toUserFeedbackSummary(created!);
  }
  async listUserFeedback(companyId: string): Promise<BevUserFeedbackSummary[]> {
    const rows = await this.deps.db.query.bevUserFeedback.findMany({
      where: eq(bevUserFeedback.companyId, companyId),
      orderBy: [desc(bevUserFeedback.createdAt)],
      limit: 100,
    });
    return rows.map(toUserFeedbackSummary);
  }
  async getUserFeedback(companyId: string, id: string): Promise<BevUserFeedbackSummary | null> {
    const row = await this.deps.db.query.bevUserFeedback.findFirst({
      where: and(eq(bevUserFeedback.companyId, companyId), eq(bevUserFeedback.id, id)),
    });
    return row ? toUserFeedbackSummary(row) : null;
  }

  async createContinuousImprovementItem(
    scope: StaffScope,
    input: CreateBevContinuousImprovementItemRequest,
  ): Promise<BevContinuousImprovementItemSummary> {
    const [created] = await this.deps.db
      .insert(bevContinuousImprovementItems)
      .values({
        companyId: scope.companyId,
        ...mapCreateContinuousImprovementItemInput(input),
      })
      .returning();
    await this.recordAudit(
      scope,
      'continuous_improvement_created',
      'bev_continuous_improvement_item',
      created!.id,
    );
    return toContinuousImprovementItemSummary(created!);
  }
  async listContinuousImprovementItems(
    companyId: string,
  ): Promise<BevContinuousImprovementItemSummary[]> {
    const rows = await this.deps.db.query.bevContinuousImprovementItems.findMany({
      where: eq(bevContinuousImprovementItems.companyId, companyId),
      orderBy: [desc(bevContinuousImprovementItems.createdAt)],
      limit: 100,
    });
    return rows.map(toContinuousImprovementItemSummary);
  }
  async getContinuousImprovementItem(
    companyId: string,
    id: string,
  ): Promise<BevContinuousImprovementItemSummary | null> {
    const row = await this.deps.db.query.bevContinuousImprovementItems.findFirst({
      where: and(
        eq(bevContinuousImprovementItems.companyId, companyId),
        eq(bevContinuousImprovementItems.id, id),
      ),
    });
    return row ? toContinuousImprovementItemSummary(row) : null;
  }
  async updateContinuousImprovementItem(
    scope: StaffScope,
    id: string,
    input: UpdateBevContinuousImprovementItemRequest,
  ): Promise<BevContinuousImprovementItemSummary> {
    await this.ensureContinuousImprovementItem(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(bevContinuousImprovementItems)
      .set({
        ...mapUpdateContinuousImprovementItemInput(input),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bevContinuousImprovementItems.companyId, scope.companyId),
          eq(bevContinuousImprovementItems.id, id),
        ),
      )
      .returning();
    await this.recordAudit(
      scope,
      'continuous_improvement_updated',
      'bev_continuous_improvement_item',
      id,
    );
    return toContinuousImprovementItemSummary(updated!);
  }

  async createStrategicRoadmapItem(
    scope: StaffScope,
    input: CreateBevStrategicRoadmapItemRequest,
  ): Promise<BevStrategicRoadmapItemSummary> {
    const [created] = await this.deps.db
      .insert(bevStrategicRoadmapItems)
      .values({
        companyId: scope.companyId,
        ...mapCreateStrategicRoadmapItemInput(input),
      })
      .returning();
    await this.recordAudit(
      scope,
      'roadmap_item_created',
      'bev_strategic_roadmap_item',
      created!.id,
    );
    return toStrategicRoadmapItemSummary(created!);
  }
  async listStrategicRoadmapItems(companyId: string): Promise<BevStrategicRoadmapItemSummary[]> {
    const rows = await this.deps.db.query.bevStrategicRoadmapItems.findMany({
      where: eq(bevStrategicRoadmapItems.companyId, companyId),
      orderBy: [desc(bevStrategicRoadmapItems.createdAt)],
      limit: 100,
    });
    return rows.map(toStrategicRoadmapItemSummary);
  }
  async getStrategicRoadmapItem(
    companyId: string,
    id: string,
  ): Promise<BevStrategicRoadmapItemSummary | null> {
    const row = await this.deps.db.query.bevStrategicRoadmapItems.findFirst({
      where: and(
        eq(bevStrategicRoadmapItems.companyId, companyId),
        eq(bevStrategicRoadmapItems.id, id),
      ),
    });
    return row ? toStrategicRoadmapItemSummary(row) : null;
  }
  async updateStrategicRoadmapItem(
    scope: StaffScope,
    id: string,
    input: UpdateBevStrategicRoadmapItemRequest,
  ): Promise<BevStrategicRoadmapItemSummary> {
    await this.ensureStrategicRoadmapItem(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(bevStrategicRoadmapItems)
      .set({
        ...mapUpdateStrategicRoadmapItemInput(input),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bevStrategicRoadmapItems.companyId, scope.companyId),
          eq(bevStrategicRoadmapItems.id, id),
        ),
      )
      .returning();
    await this.recordAudit(scope, 'roadmap_item_updated', 'bev_strategic_roadmap_item', id);
    return toStrategicRoadmapItemSummary(updated!);
  }

  async createMaturityAssessment(
    scope: StaffScope,
    input: CreateBevMaturityAssessmentRequest,
  ): Promise<BevMaturityAssessmentSummary> {
    const [created] = await this.deps.db
      .insert(bevMaturityAssessments)
      .values({
        companyId: scope.companyId,
        ...mapCreateMaturityAssessmentInput(input, scope),
      })
      .returning();
    await this.recordAudit(
      scope,
      'maturity_assessment_created',
      'bev_maturity_assessment',
      created!.id,
    );
    return toMaturityAssessmentSummary(created!);
  }
  async listMaturityAssessments(companyId: string): Promise<BevMaturityAssessmentSummary[]> {
    const rows = await this.deps.db.query.bevMaturityAssessments.findMany({
      where: eq(bevMaturityAssessments.companyId, companyId),
      orderBy: [desc(bevMaturityAssessments.assessedAt)],
      limit: 100,
    });
    return rows.map(toMaturityAssessmentSummary);
  }
  async getMaturityAssessment(
    companyId: string,
    id: string,
  ): Promise<BevMaturityAssessmentSummary | null> {
    const row = await this.deps.db.query.bevMaturityAssessments.findFirst({
      where: and(
        eq(bevMaturityAssessments.companyId, companyId),
        eq(bevMaturityAssessments.id, id),
      ),
    });
    return row ? toMaturityAssessmentSummary(row) : null;
  }
  async updateMaturityAssessment(
    scope: StaffScope,
    id: string,
    input: UpdateBevMaturityAssessmentRequest,
  ): Promise<BevMaturityAssessmentSummary> {
    await this.ensureMaturityAssessment(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(bevMaturityAssessments)
      .set({
        ...mapUpdateMaturityAssessmentInput(input),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bevMaturityAssessments.companyId, scope.companyId),
          eq(bevMaturityAssessments.id, id),
        ),
      )
      .returning();
    await this.recordAudit(scope, 'maturity_assessment_updated', 'bev_maturity_assessment', id);
    return toMaturityAssessmentSummary(updated!);
  }

  async createAgentImprovement(
    scope: StaffScope,
    input: CreateBevAgentImprovementRequest,
  ): Promise<BevAgentImprovementSummary> {
    const [created] = await this.deps.db
      .insert(bevAgentImprovements)
      .values({
        companyId: scope.companyId,
        ...mapCreateAgentImprovementInput(input),
      })
      .returning();
    await this.recordAudit(
      scope,
      'agent_improvement_created',
      'bev_agent_improvement',
      created!.id,
    );
    return toAgentImprovementSummary(created!);
  }
  async listAgentImprovements(companyId: string): Promise<BevAgentImprovementSummary[]> {
    const rows = await this.deps.db.query.bevAgentImprovements.findMany({
      where: eq(bevAgentImprovements.companyId, companyId),
      orderBy: [desc(bevAgentImprovements.createdAt)],
      limit: 100,
    });
    return rows.map(toAgentImprovementSummary);
  }
  async getAgentImprovement(
    companyId: string,
    id: string,
  ): Promise<BevAgentImprovementSummary | null> {
    const row = await this.deps.db.query.bevAgentImprovements.findFirst({
      where: and(eq(bevAgentImprovements.companyId, companyId), eq(bevAgentImprovements.id, id)),
    });
    return row ? toAgentImprovementSummary(row) : null;
  }
  async updateAgentImprovement(
    scope: StaffScope,
    id: string,
    input: UpdateBevAgentImprovementRequest,
  ): Promise<BevAgentImprovementSummary> {
    await this.ensureAgentImprovement(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(bevAgentImprovements)
      .set({
        ...mapUpdateAgentImprovementInput(input),
        updatedAt: new Date(),
      })
      .where(
        and(eq(bevAgentImprovements.companyId, scope.companyId), eq(bevAgentImprovements.id, id)),
      )
      .returning();
    await this.recordAudit(scope, 'agent_improvement_updated', 'bev_agent_improvement', id);
    return toAgentImprovementSummary(updated!);
  }

  async createPromptPolicyVersion(
    scope: StaffScope,
    input: CreateBevPromptPolicyVersionRequest,
  ): Promise<BevPromptPolicyVersionSummary> {
    const [created] = await this.deps.db
      .insert(bevPromptPolicyVersions)
      .values({
        companyId: scope.companyId,
        ...mapCreatePromptPolicyVersionInput(input),
      })
      .returning();
    await this.recordAudit(
      scope,
      'prompt_policy_version_created',
      'bev_prompt_policy_version',
      created!.id,
    );
    return toPromptPolicyVersionSummary(created!);
  }
  async listPromptPolicyVersions(companyId: string): Promise<BevPromptPolicyVersionSummary[]> {
    const rows = await this.deps.db.query.bevPromptPolicyVersions.findMany({
      where: eq(bevPromptPolicyVersions.companyId, companyId),
      orderBy: [desc(bevPromptPolicyVersions.createdAt)],
      limit: 100,
    });
    return rows.map(toPromptPolicyVersionSummary);
  }
  async getPromptPolicyVersion(
    companyId: string,
    id: string,
  ): Promise<BevPromptPolicyVersionSummary | null> {
    const row = await this.deps.db.query.bevPromptPolicyVersions.findFirst({
      where: and(
        eq(bevPromptPolicyVersions.companyId, companyId),
        eq(bevPromptPolicyVersions.id, id),
      ),
    });
    return row ? toPromptPolicyVersionSummary(row) : null;
  }
  async updatePromptPolicyVersion(
    scope: StaffScope,
    id: string,
    input: UpdateBevPromptPolicyVersionRequest,
  ): Promise<BevPromptPolicyVersionSummary> {
    await this.ensurePromptPolicyVersion(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(bevPromptPolicyVersions)
      .set({
        ...mapUpdatePromptPolicyVersionInput(input),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bevPromptPolicyVersions.companyId, scope.companyId),
          eq(bevPromptPolicyVersions.id, id),
        ),
      )
      .returning();
    await this.recordAudit(scope, 'prompt_policy_version_updated', 'bev_prompt_policy_version', id);
    return toPromptPolicyVersionSummary(updated!);
  }

  async createAiEvaluation(
    scope: StaffScope,
    input: CreateBevAiEvaluationRequest,
  ): Promise<BevAiEvaluationSummary> {
    const [created] = await this.deps.db
      .insert(bevAiEvaluations)
      .values({
        companyId: scope.companyId,
        ...mapCreateAiEvaluationInput(input),
      })
      .returning();
    await this.recordAudit(scope, 'ai_evaluation_created', 'bev_ai_evaluation', created!.id);
    return toAiEvaluationSummary(created!);
  }
  async listAiEvaluations(companyId: string): Promise<BevAiEvaluationSummary[]> {
    const rows = await this.deps.db.query.bevAiEvaluations.findMany({
      where: eq(bevAiEvaluations.companyId, companyId),
      orderBy: [desc(bevAiEvaluations.createdAt)],
      limit: 100,
    });
    return rows.map(toAiEvaluationSummary);
  }
  async getAiEvaluation(companyId: string, id: string): Promise<BevAiEvaluationSummary | null> {
    const row = await this.deps.db.query.bevAiEvaluations.findFirst({
      where: and(eq(bevAiEvaluations.companyId, companyId), eq(bevAiEvaluations.id, id)),
    });
    return row ? toAiEvaluationSummary(row) : null;
  }
  async updateAiEvaluation(
    scope: StaffScope,
    id: string,
    input: UpdateBevAiEvaluationRequest,
  ): Promise<BevAiEvaluationSummary> {
    await this.ensureAiEvaluation(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(bevAiEvaluations)
      .set({
        ...mapUpdateAiEvaluationInput(input),
        updatedAt: new Date(),
      })
      .where(and(eq(bevAiEvaluations.companyId, scope.companyId), eq(bevAiEvaluations.id, id)))
      .returning();
    await this.recordAudit(scope, 'ai_evaluation_updated', 'bev_ai_evaluation', id);
    return toAiEvaluationSummary(updated!);
  }

  async createKnowledgeReinforcement(
    scope: StaffScope,
    input: CreateBevKnowledgeReinforcementRequest,
  ): Promise<BevKnowledgeReinforcementSummary> {
    const [created] = await this.deps.db
      .insert(bevKnowledgeReinforcements)
      .values({
        companyId: scope.companyId,
        ...mapCreateKnowledgeReinforcementInput(input),
      })
      .returning();
    await this.recordAudit(
      scope,
      'knowledge_reinforcement_created',
      'bev_knowledge_reinforcement',
      created!.id,
    );
    return toKnowledgeReinforcementSummary(created!);
  }
  async listKnowledgeReinforcements(
    companyId: string,
  ): Promise<BevKnowledgeReinforcementSummary[]> {
    const rows = await this.deps.db.query.bevKnowledgeReinforcements.findMany({
      where: eq(bevKnowledgeReinforcements.companyId, companyId),
      orderBy: [desc(bevKnowledgeReinforcements.createdAt)],
      limit: 100,
    });
    return rows.map(toKnowledgeReinforcementSummary);
  }
  async getKnowledgeReinforcement(
    companyId: string,
    id: string,
  ): Promise<BevKnowledgeReinforcementSummary | null> {
    const row = await this.deps.db.query.bevKnowledgeReinforcements.findFirst({
      where: and(
        eq(bevKnowledgeReinforcements.companyId, companyId),
        eq(bevKnowledgeReinforcements.id, id),
      ),
    });
    return row ? toKnowledgeReinforcementSummary(row) : null;
  }
  async updateKnowledgeReinforcement(
    scope: StaffScope,
    id: string,
    input: UpdateBevKnowledgeReinforcementRequest,
  ): Promise<BevKnowledgeReinforcementSummary> {
    await this.ensureKnowledgeReinforcement(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(bevKnowledgeReinforcements)
      .set({
        ...mapUpdateKnowledgeReinforcementInput(input, scope),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bevKnowledgeReinforcements.companyId, scope.companyId),
          eq(bevKnowledgeReinforcements.id, id),
        ),
      )
      .returning();
    await this.recordAudit(
      scope,
      'knowledge_reinforcement_updated',
      'bev_knowledge_reinforcement',
      id,
    );
    return toKnowledgeReinforcementSummary(updated!);
  }

  async createProcessMiningResult(
    scope: StaffScope,
    input: CreateBevProcessMiningResultRequest,
  ): Promise<BevProcessMiningResultSummary> {
    const [created] = await this.deps.db
      .insert(bevProcessMiningResults)
      .values({
        companyId: scope.companyId,
        ...mapCreateProcessMiningResultInput(input),
      })
      .returning();
    await this.recordAudit(
      scope,
      'process_mining_result_created',
      'bev_process_mining_result',
      created!.id,
    );
    return toProcessMiningResultSummary(created!);
  }
  async listProcessMiningResults(companyId: string): Promise<BevProcessMiningResultSummary[]> {
    const rows = await this.deps.db.query.bevProcessMiningResults.findMany({
      where: eq(bevProcessMiningResults.companyId, companyId),
      orderBy: [desc(bevProcessMiningResults.capturedAt)],
      limit: 100,
    });
    return rows.map(toProcessMiningResultSummary);
  }
  async getProcessMiningResult(
    companyId: string,
    id: string,
  ): Promise<BevProcessMiningResultSummary | null> {
    const row = await this.deps.db.query.bevProcessMiningResults.findFirst({
      where: and(
        eq(bevProcessMiningResults.companyId, companyId),
        eq(bevProcessMiningResults.id, id),
      ),
    });
    return row ? toProcessMiningResultSummary(row) : null;
  }
  async updateProcessMiningResult(
    scope: StaffScope,
    id: string,
    input: UpdateBevProcessMiningResultRequest,
  ): Promise<BevProcessMiningResultSummary> {
    await this.ensureProcessMiningResult(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(bevProcessMiningResults)
      .set({
        ...mapUpdateProcessMiningResultInput(input),
      })
      .where(
        and(
          eq(bevProcessMiningResults.companyId, scope.companyId),
          eq(bevProcessMiningResults.id, id),
        ),
      )
      .returning();
    await this.recordAudit(scope, 'process_mining_result_updated', 'bev_process_mining_result', id);
    return toProcessMiningResultSummary(updated!);
  }

  async createEvolutionAlert(
    scope: StaffScope,
    input: CreateBevEvolutionAlertRequest,
  ): Promise<BevEvolutionAlertSummary> {
    const [created] = await this.deps.db
      .insert(bevEvolutionAlerts)
      .values({
        companyId: scope.companyId,
        alertType: input.alertType,
        severity: (input.severity ?? 'warning') as typeof bevEvolutionAlerts.$inferInsert.severity,
        status: 'open',
        title: input.title.trim(),
        description: input.description ?? null,
        sourceModule: input.sourceModule ?? null,
        incidentId: input.incidentId ?? null,
        context: input.context ?? {},
      })
      .returning();
    await this.recordAudit(scope, 'evolution_alert_created', 'bev_evolution_alert', created!.id);
    return toEvolutionAlertSummary(created!);
  }
  async listEvolutionAlerts(
    companyId: string,
    filters?: { status?: string },
  ): Promise<BevEvolutionAlertSummary[]> {
    const rows = await this.deps.db.query.bevEvolutionAlerts.findMany({
      where: eq(bevEvolutionAlerts.companyId, companyId),
      orderBy: [desc(bevEvolutionAlerts.createdAt)],
      limit: 100,
    });
    return (filters?.status ? rows.filter((r) => r.status === filters.status) : rows).map(
      toEvolutionAlertSummary,
    );
  }
  async getEvolutionAlert(companyId: string, id: string): Promise<BevEvolutionAlertSummary | null> {
    const row = await this.deps.db.query.bevEvolutionAlerts.findFirst({
      where: and(eq(bevEvolutionAlerts.companyId, companyId), eq(bevEvolutionAlerts.id, id)),
    });
    return row ? toEvolutionAlertSummary(row) : null;
  }
  async updateEvolutionAlert(
    scope: StaffScope,
    id: string,
    input: UpdateBevEvolutionAlertRequest,
  ): Promise<BevEvolutionAlertSummary> {
    await this.ensureEvolutionAlert(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(bevEvolutionAlerts)
      .set({
        ...(input.alertType !== undefined ? { alertType: input.alertType } : {}),
        ...(input.severity !== undefined
          ? { severity: input.severity as typeof bevEvolutionAlerts.$inferInsert.severity }
          : {}),
        ...(input.status !== undefined
          ? { status: input.status as typeof bevEvolutionAlerts.$inferInsert.status }
          : {}),
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.sourceModule !== undefined ? { sourceModule: input.sourceModule ?? null } : {}),
        ...(input.incidentId !== undefined ? { incidentId: input.incidentId ?? null } : {}),
        ...(input.context !== undefined ? { context: input.context } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(bevEvolutionAlerts.companyId, scope.companyId), eq(bevEvolutionAlerts.id, id)))
      .returning();
    await this.recordAudit(scope, 'evolution_alert_updated', 'bev_evolution_alert', id);
    return toEvolutionAlertSummary(updated!);
  }

  async createActionDraft(
    scope: StaffScope,
    input: CreateBevEvolutionActionDraftRequest,
  ): Promise<BevActionDraftSummary> {
    const [created] = await this.deps.db
      .insert(bevActionDrafts)
      .values({
        companyId: scope.companyId,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
        workflowStatus: 'draft',
      })
      .returning();
    await this.recordAudit(scope, 'action_draft_created', 'bev_action_draft', created!.id);
    return toActionDraftSummary(created!);
  }
  async listActionDrafts(companyId: string): Promise<BevActionDraftSummary[]> {
    const rows = await this.deps.db.query.bevActionDrafts.findMany({
      where: eq(bevActionDrafts.companyId, companyId),
      orderBy: [desc(bevActionDrafts.createdAt)],
      limit: 100,
    });
    return rows.map(toActionDraftSummary);
  }
  async getActionDraft(companyId: string, id: string): Promise<BevActionDraftSummary | null> {
    const row = await this.deps.db.query.bevActionDrafts.findFirst({
      where: and(eq(bevActionDrafts.companyId, companyId), eq(bevActionDrafts.id, id)),
    });
    return row ? toActionDraftSummary(row) : null;
  }
  async updateActionDraft(
    scope: StaffScope,
    id: string,
    input: Partial<CreateBevEvolutionActionDraftRequest> & { workflowStatus?: string },
  ): Promise<BevActionDraftSummary> {
    await this.ensureActionDraft(scope.companyId, id);
    const [updated] = await this.deps.db
      .update(bevActionDrafts)
      .set({
        ...(input.draftType !== undefined ? { draftType: input.draftType.trim() } : {}),
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.content !== undefined ? { content: input.content.trim() } : {}),
        ...(input.sourceRecords !== undefined ? { sourceRecords: input.sourceRecords } : {}),
        ...(input.aiGenerated !== undefined ? { aiGenerated: input.aiGenerated } : {}),
        ...(input.workflowStatus !== undefined
          ? {
              workflowStatus:
                input.workflowStatus as typeof bevActionDrafts.$inferInsert.workflowStatus,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(bevActionDrafts.companyId, scope.companyId), eq(bevActionDrafts.id, id)))
      .returning();
    await this.recordAudit(scope, 'action_draft_updated', 'bev_action_draft', id);
    return toActionDraftSummary(updated!);
  }

  async listAuditLogs(companyId: string, limit = 100): Promise<BevAuditLogSummary[]> {
    const rows = await this.deps.db.query.bevAuditLogs.findMany({
      where: eq(bevAuditLogs.companyId, companyId),
      orderBy: [desc(bevAuditLogs.createdAt)],
      limit,
    });
    return rows.map(toAuditLogSummary);
  }
  async getAuditLog(companyId: string, id: string): Promise<BevAuditLogSummary | null> {
    const row = await this.deps.db.query.bevAuditLogs.findFirst({
      where: and(eq(bevAuditLogs.companyId, companyId), eq(bevAuditLogs.id, id)),
    });
    return row ? toAuditLogSummary(row) : null;
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.bevPlatformConfig.findFirst({
      where: eq(bevPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db
      .insert(bevPlatformConfig)
      .values({ companyId })
      .returning();
    return created!;
  }

  private async recordAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(bevAuditLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      metadata: metadata ?? {},
    });
  }

  private async ensureObservation(companyId: string, id: string) {
    const row = await this.deps.db.query.bevObservations.findFirst({
      where: and(eq(bevObservations.companyId, companyId), eq(bevObservations.id, id)),
    });
    if (!row) throw new EnterpriseBusinessEvolutionError('NOT_FOUND', 'Observation not found');
    return row;
  }
  private async ensurePattern(companyId: string, id: string) {
    const row = await this.deps.db.query.bevPatterns.findFirst({
      where: and(eq(bevPatterns.companyId, companyId), eq(bevPatterns.id, id)),
    });
    if (!row) throw new EnterpriseBusinessEvolutionError('NOT_FOUND', 'Pattern not found');
    return row;
  }
  private async ensureHypothesis(companyId: string, id: string) {
    const row = await this.deps.db.query.bevHypotheses.findFirst({
      where: and(eq(bevHypotheses.companyId, companyId), eq(bevHypotheses.id, id)),
    });
    if (!row) throw new EnterpriseBusinessEvolutionError('NOT_FOUND', 'Hypothesis not found');
    return row;
  }
  private async ensureRecommendation(companyId: string, id: string) {
    const row = await this.deps.db.query.bevRecommendations.findFirst({
      where: and(eq(bevRecommendations.companyId, companyId), eq(bevRecommendations.id, id)),
    });
    if (!row) throw new EnterpriseBusinessEvolutionError('NOT_FOUND', 'Recommendation not found');
    return row;
  }
  private async ensureExperiment(companyId: string, id: string) {
    const row = await this.deps.db.query.bevExperiments.findFirst({
      where: and(eq(bevExperiments.companyId, companyId), eq(bevExperiments.id, id)),
    });
    if (!row) throw new EnterpriseBusinessEvolutionError('NOT_FOUND', 'Experiment not found');
    return row;
  }
  private async ensureOutcome(companyId: string, id: string) {
    const row = await this.deps.db.query.bevOutcomes.findFirst({
      where: and(eq(bevOutcomes.companyId, companyId), eq(bevOutcomes.id, id)),
    });
    if (!row) throw new EnterpriseBusinessEvolutionError('NOT_FOUND', 'Outcome not found');
    return row;
  }
  private async ensureContinuousImprovementItem(companyId: string, id: string) {
    const row = await this.deps.db.query.bevContinuousImprovementItems.findFirst({
      where: and(
        eq(bevContinuousImprovementItems.companyId, companyId),
        eq(bevContinuousImprovementItems.id, id),
      ),
    });
    if (!row)
      throw new EnterpriseBusinessEvolutionError(
        'NOT_FOUND',
        'Continuous improvement item not found',
      );
    return row;
  }
  private async ensureStrategicRoadmapItem(companyId: string, id: string) {
    const row = await this.deps.db.query.bevStrategicRoadmapItems.findFirst({
      where: and(
        eq(bevStrategicRoadmapItems.companyId, companyId),
        eq(bevStrategicRoadmapItems.id, id),
      ),
    });
    if (!row)
      throw new EnterpriseBusinessEvolutionError('NOT_FOUND', 'Strategic roadmap item not found');
    return row;
  }
  private async ensureMaturityAssessment(companyId: string, id: string) {
    const row = await this.deps.db.query.bevMaturityAssessments.findFirst({
      where: and(
        eq(bevMaturityAssessments.companyId, companyId),
        eq(bevMaturityAssessments.id, id),
      ),
    });
    if (!row)
      throw new EnterpriseBusinessEvolutionError('NOT_FOUND', 'Maturity assessment not found');
    return row;
  }
  private async ensureAgentImprovement(companyId: string, id: string) {
    const row = await this.deps.db.query.bevAgentImprovements.findFirst({
      where: and(eq(bevAgentImprovements.companyId, companyId), eq(bevAgentImprovements.id, id)),
    });
    if (!row)
      throw new EnterpriseBusinessEvolutionError('NOT_FOUND', 'Agent improvement not found');
    return row;
  }
  private async ensurePromptPolicyVersion(companyId: string, id: string) {
    const row = await this.deps.db.query.bevPromptPolicyVersions.findFirst({
      where: and(
        eq(bevPromptPolicyVersions.companyId, companyId),
        eq(bevPromptPolicyVersions.id, id),
      ),
    });
    if (!row)
      throw new EnterpriseBusinessEvolutionError('NOT_FOUND', 'Prompt policy version not found');
    return row;
  }
  private async ensureAiEvaluation(companyId: string, id: string) {
    const row = await this.deps.db.query.bevAiEvaluations.findFirst({
      where: and(eq(bevAiEvaluations.companyId, companyId), eq(bevAiEvaluations.id, id)),
    });
    if (!row) throw new EnterpriseBusinessEvolutionError('NOT_FOUND', 'AI evaluation not found');
    return row;
  }
  private async ensureKnowledgeReinforcement(companyId: string, id: string) {
    const row = await this.deps.db.query.bevKnowledgeReinforcements.findFirst({
      where: and(
        eq(bevKnowledgeReinforcements.companyId, companyId),
        eq(bevKnowledgeReinforcements.id, id),
      ),
    });
    if (!row)
      throw new EnterpriseBusinessEvolutionError('NOT_FOUND', 'Knowledge reinforcement not found');
    return row;
  }
  private async ensureProcessMiningResult(companyId: string, id: string) {
    const row = await this.deps.db.query.bevProcessMiningResults.findFirst({
      where: and(
        eq(bevProcessMiningResults.companyId, companyId),
        eq(bevProcessMiningResults.id, id),
      ),
    });
    if (!row)
      throw new EnterpriseBusinessEvolutionError('NOT_FOUND', 'Process mining result not found');
    return row;
  }
  private async ensureEvolutionAlert(companyId: string, id: string) {
    const row = await this.deps.db.query.bevEvolutionAlerts.findFirst({
      where: and(eq(bevEvolutionAlerts.companyId, companyId), eq(bevEvolutionAlerts.id, id)),
    });
    if (!row) throw new EnterpriseBusinessEvolutionError('NOT_FOUND', 'Evolution alert not found');
    return row;
  }
  private async ensureActionDraft(companyId: string, id: string) {
    const row = await this.deps.db.query.bevActionDrafts.findFirst({
      where: and(eq(bevActionDrafts.companyId, companyId), eq(bevActionDrafts.id, id)),
    });
    if (!row) throw new EnterpriseBusinessEvolutionError('NOT_FOUND', 'Action draft not found');
    return row;
  }
}

function parseOptionalDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function computeLearningConfidence(patterns: BevPatternSummary[]): string {
  if (patterns.length === 0) return '0.00';
  const scores = patterns.map((p) => Number(p.confidence ?? 0)).filter((n) => !Number.isNaN(n));
  if (scores.length === 0) return '0.00';
  return (scores.reduce((sum, n) => sum + n, 0) / scores.length).toFixed(2);
}

function jsonArray(value: Record<string, unknown> | unknown, key = 'items'): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as Record<string, unknown>)[key])
  ) {
    return ((value as Record<string, unknown>)[key] as unknown[]).map(String);
  }
  return [];
}

function toPlatformConfigSummary(
  row: typeof bevPlatformConfig.$inferSelect,
): BevPlatformConfigSummary {
  return {
    learningGovernance: row.learningGovernance,
    experimentSafetyDefaults: row.experimentSafetyDefaults,
    evaluationTemplates: row.evaluationTemplates,
    aggregationThresholds: row.aggregationThresholds,
    crossTenantPrivacyRules: row.crossTenantPrivacyRules,
    agentImprovementStandards: row.agentImprovementStandards,
    autonomousAllowlist: row.autonomousAllowlist,
    rollbackRequirements: row.rollbackRequirements,
    auditRetentionDays: row.auditRetentionDays,
    recommendationThresholds: row.recommendationThresholds,
    learningScope: row.learningScope,
    dataSources: row.dataSources,
  };
}

function toAnalyticsSummary(row: typeof bevAnalyticsSnapshots.$inferSelect): BevAnalyticsSummary {
  const metrics = row.metrics ?? {};
  return {
    observationCount: Number(metrics.observationCount ?? 0),
    patternCount: Number(metrics.patternCount ?? 0),
    hypothesisCount: Number(metrics.hypothesisCount ?? 0),
    openRecommendationCount: Number(metrics.openRecommendationCount ?? 0),
    activeExperimentCount: Number(metrics.activeExperimentCount ?? 0),
    openAlertCount: Number(metrics.openAlertCount ?? 0),
    continuousImprovementCount: Number(metrics.continuousImprovementCount ?? 0),
    maturityAssessmentCount: Number(metrics.maturityAssessmentCount ?? 0),
    validatedLessonCount: Number(metrics.validatedLessonCount ?? 0),
    overallLearningConfidence: String(metrics.overallLearningConfidence ?? '0.00'),
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toObservationSummary(row: typeof bevObservations.$inferSelect): BevObservationSummary {
  return {
    id: row.id,
    observationKey: row.observationKey,
    sourceModule: row.sourceModule,
    observationType: row.observationType,
    title: row.title,
    description: row.description,
    learningStage: row.learningStage,
    sourceEntityType: row.sourceEntityType,
    sourceEntityId: row.sourceEntityId,
    observedAt: row.observedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateObservationInput(input: CreateBevObservationRequest) {
  return {
    observationKey: input.observationKey.trim(),
    sourceModule: input.sourceModule ?? null,
    observationType: input.observationType.trim(),
    title: input.title.trim(),
    description: input.description ?? null,
    learningStage: (input.learningStage ??
      'observed') as typeof bevObservations.$inferInsert.learningStage,
    sourceEntityType: input.sourceEntityType ?? null,
    sourceEntityId: input.sourceEntityId ?? null,
    evidence: input.evidence ?? {},
    config: input.config ?? {},
    observedAt: parseOptionalDate(input.observedAt) ?? new Date(),
  };
}

function mapUpdateObservationInput(input: UpdateBevObservationRequest) {
  return {
    ...(input.observationKey !== undefined ? { observationKey: input.observationKey.trim() } : {}),
    ...(input.sourceModule !== undefined ? { sourceModule: input.sourceModule ?? null } : {}),
    ...(input.observationType !== undefined ? { observationType: input.observationType } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.learningStage !== undefined
      ? { learningStage: input.learningStage as typeof bevObservations.$inferInsert.learningStage }
      : {}),
    ...(input.sourceEntityType !== undefined
      ? { sourceEntityType: input.sourceEntityType ?? null }
      : {}),
    ...(input.sourceEntityId !== undefined ? { sourceEntityId: input.sourceEntityId ?? null } : {}),
    ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
    ...(input.observedAt !== undefined
      ? { observedAt: parseOptionalDate(input.observedAt) ?? new Date() }
      : {}),
  };
}

function toPatternSummary(row: typeof bevPatterns.$inferSelect): BevPatternSummary {
  return {
    id: row.id,
    patternKey: row.patternKey,
    title: row.title,
    description: row.description,
    supportingSourceRecords: jsonArray(row.evidence, 'supportingSourceRecords'),
    timePeriod: {
      start: row.timePeriodStart?.toISOString() ?? null,
      end: row.timePeriodEnd?.toISOString() ?? null,
    },
    confidence: row.confidenceScore != null ? String(row.confidenceScore) : null,
    frequency: row.frequency,
    businessImpact: row.businessImpact,
    affectedModules: jsonArray(row.affectedModules, 'modules'),
    possibleCauses: jsonArray(row.possibleCauses, 'items'),
    limitations: jsonArray(row.limitations, 'items'),
    dataFreshnessAt: row.dataFreshnessAt?.toISOString() ?? null,
    learningStage: row.learningStage,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreatePatternInput(input: CreateBevPatternRequest) {
  return {
    patternKey: input.patternKey.trim(),
    title: input.title.trim(),
    description: input.description ?? null,
    learningStage: (input.learningStage ??
      'analyzed') as typeof bevPatterns.$inferInsert.learningStage,
    confidenceScore: input.confidenceScore != null ? String(input.confidenceScore) : null,
    frequency: input.frequency ?? 0,
    businessImpact: input.businessImpact ?? null,
    affectedModules: input.affectedModules ?? {},
    possibleCauses: input.possibleCauses ?? {},
    limitations: input.limitations ?? {},
    evidence: input.evidence ?? {},
    timePeriodStart: parseOptionalDate(input.timePeriodStart),
    timePeriodEnd: parseOptionalDate(input.timePeriodEnd),
  };
}

function mapUpdatePatternInput(input: UpdateBevPatternRequest) {
  return {
    ...(input.patternKey !== undefined ? { patternKey: input.patternKey.trim() } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.learningStage !== undefined
      ? { learningStage: input.learningStage as typeof bevPatterns.$inferInsert.learningStage }
      : {}),
    ...(input.confidenceScore !== undefined
      ? { confidenceScore: input.confidenceScore != null ? String(input.confidenceScore) : null }
      : {}),
    ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
    ...(input.businessImpact !== undefined ? { businessImpact: input.businessImpact ?? null } : {}),
    ...(input.affectedModules !== undefined ? { affectedModules: input.affectedModules } : {}),
    ...(input.possibleCauses !== undefined ? { possibleCauses: input.possibleCauses } : {}),
    ...(input.limitations !== undefined ? { limitations: input.limitations } : {}),
    ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
    ...(input.timePeriodStart !== undefined
      ? { timePeriodStart: parseOptionalDate(input.timePeriodStart) }
      : {}),
    ...(input.timePeriodEnd !== undefined
      ? { timePeriodEnd: parseOptionalDate(input.timePeriodEnd) }
      : {}),
  };
}

function toHypothesisSummary(row: typeof bevHypotheses.$inferSelect): BevHypothesisSummary {
  return {
    id: row.id,
    hypothesisKey: row.hypothesisKey,
    title: row.title,
    problemStatement: row.problemStatement,
    proposedChange: row.proposedChange,
    expectedOutcome: row.expectedOutcome,
    riskLevel: row.riskLevel,
    measurementMethod: row.measurementMethod,
    successCriteria: row.successCriteria,
    rollbackPlan: row.rollbackPlan,
    learningStage: row.learningStage,
    patternId: row.patternId,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateHypothesisInput(input: CreateBevHypothesisRequest) {
  return {
    hypothesisKey: input.hypothesisKey.trim(),
    title: input.title.trim(),
    problemStatement: input.problemStatement ?? null,
    proposedChange: input.proposedChange ?? null,
    expectedOutcome: input.expectedOutcome ?? null,
    supportingEvidence: input.supportingEvidence ?? {},
    riskLevel: (input.riskLevel ?? 'medium') as typeof bevHypotheses.$inferInsert.riskLevel,
    affectedUsers: input.affectedUsers ?? {},
    requiredApprovals: input.requiredApprovals ?? {},
    measurementMethod: input.measurementMethod ?? null,
    successCriteria: input.successCriteria ?? null,
    rollbackPlan: input.rollbackPlan ?? null,
    patternId: input.patternId ?? null,
  };
}

function mapUpdateHypothesisInput(input: UpdateBevHypothesisRequest) {
  return {
    ...(input.hypothesisKey !== undefined ? { hypothesisKey: input.hypothesisKey.trim() } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.problemStatement !== undefined
      ? { problemStatement: input.problemStatement ?? null }
      : {}),
    ...(input.proposedChange !== undefined ? { proposedChange: input.proposedChange ?? null } : {}),
    ...(input.expectedOutcome !== undefined
      ? { expectedOutcome: input.expectedOutcome ?? null }
      : {}),
    ...(input.supportingEvidence !== undefined
      ? { supportingEvidence: input.supportingEvidence }
      : {}),
    ...(input.riskLevel !== undefined
      ? { riskLevel: input.riskLevel as typeof bevHypotheses.$inferInsert.riskLevel }
      : {}),
    ...(input.affectedUsers !== undefined ? { affectedUsers: input.affectedUsers } : {}),
    ...(input.requiredApprovals !== undefined
      ? { requiredApprovals: input.requiredApprovals }
      : {}),
    ...(input.measurementMethod !== undefined
      ? { measurementMethod: input.measurementMethod ?? null }
      : {}),
    ...(input.successCriteria !== undefined
      ? { successCriteria: input.successCriteria ?? null }
      : {}),
    ...(input.rollbackPlan !== undefined ? { rollbackPlan: input.rollbackPlan ?? null } : {}),
    ...(input.patternId !== undefined ? { patternId: input.patternId ?? null } : {}),
    ...(input.learningStage !== undefined
      ? { learningStage: input.learningStage as typeof bevHypotheses.$inferInsert.learningStage }
      : {}),
  };
}

function toRecommendationSummary(
  row: typeof bevRecommendations.$inferSelect,
): BevRecommendationSummary {
  return {
    id: row.id,
    recommendationKey: row.recommendationKey,
    category: row.category,
    title: row.title,
    description: row.description,
    expectedBenefit: row.expectedBenefit,
    expectedCost: row.expectedCost,
    confidenceScore: row.confidenceScore != null ? String(row.confidenceScore) : null,
    requiredEffort: row.requiredEffort,
    riskLevel: row.riskLevel,
    recommendedOwnerUserId: row.recommendedOwnerUserId,
    approvalRequired: row.approvalRequired,
    measurementPlan: row.measurementPlan,
    rollbackPlan: row.rollbackPlan,
    workflowStatus: row.workflowStatus,
    hypothesisId: row.hypothesisId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapCreateRecommendationInput(input: CreateBevRecommendationRequest) {
  return {
    recommendationKey: input.recommendationKey.trim(),
    category: input.category.trim(),
    title: input.title.trim(),
    description: input.description ?? null,
    expectedBenefit: input.expectedBenefit ?? null,
    expectedCost: input.expectedCost ?? null,
    confidenceScore: input.confidenceScore != null ? String(input.confidenceScore) : null,
    requiredEffort: input.requiredEffort ?? null,
    riskLevel: (input.riskLevel ?? 'medium') as typeof bevRecommendations.$inferInsert.riskLevel,
    dependencies: input.dependencies ?? {},
    supportingEvidence: input.supportingEvidence ?? {},
    recommendedOwnerUserId: input.recommendedOwnerUserId ?? null,
    approvalRequired: input.approvalRequired ?? true,
    measurementPlan: input.measurementPlan ?? null,
    rollbackPlan: input.rollbackPlan ?? null,
    hypothesisId: input.hypothesisId ?? null,
  };
}

function mapUpdateRecommendationInput(input: UpdateBevRecommendationRequest) {
  return {
    ...(input.recommendationKey !== undefined
      ? { recommendationKey: input.recommendationKey.trim() }
      : {}),
    ...(input.category !== undefined ? { category: input.category.trim() } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.expectedBenefit !== undefined
      ? { expectedBenefit: input.expectedBenefit ?? null }
      : {}),
    ...(input.expectedCost !== undefined ? { expectedCost: input.expectedCost ?? null } : {}),
    ...(input.confidenceScore !== undefined
      ? { confidenceScore: input.confidenceScore != null ? String(input.confidenceScore) : null }
      : {}),
    ...(input.requiredEffort !== undefined ? { requiredEffort: input.requiredEffort ?? null } : {}),
    ...(input.riskLevel !== undefined
      ? { riskLevel: input.riskLevel as typeof bevRecommendations.$inferInsert.riskLevel }
      : {}),
    ...(input.dependencies !== undefined ? { dependencies: input.dependencies } : {}),
    ...(input.supportingEvidence !== undefined
      ? { supportingEvidence: input.supportingEvidence }
      : {}),
    ...(input.recommendedOwnerUserId !== undefined
      ? { recommendedOwnerUserId: input.recommendedOwnerUserId ?? null }
      : {}),
    ...(input.approvalRequired !== undefined ? { approvalRequired: input.approvalRequired } : {}),
    ...(input.measurementPlan !== undefined
      ? { measurementPlan: input.measurementPlan ?? null }
      : {}),
    ...(input.rollbackPlan !== undefined ? { rollbackPlan: input.rollbackPlan ?? null } : {}),
    ...(input.hypothesisId !== undefined ? { hypothesisId: input.hypothesisId ?? null } : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof bevRecommendations.$inferInsert.workflowStatus,
        }
      : {}),
  };
}

function toRecommendationEventSummary(
  row: typeof bevRecommendationEvents.$inferSelect,
): BevRecommendationEventSummary {
  return {
    id: row.id,
    recommendationId: row.recommendationId,
    eventType: row.eventType,
    decisionReason: row.decisionReason,
    reviewingUserId: row.reviewingUserId,
    implementationOwnerUserId: row.implementationOwnerUserId,
    expectedOutcome: row.expectedOutcome,
    actualOutcome: row.actualOutcome,
    variance: row.variance,
    lessonsLearned: row.lessonsLearned,
    createdAt: row.createdAt.toISOString(),
  };
}

function toExperimentSummary(row: typeof bevExperiments.$inferSelect): BevExperimentSummary {
  return {
    id: row.id,
    experimentKey: row.experimentKey,
    title: row.title,
    description: row.description,
    experimentType: row.experimentType,
    workflowStatus: row.workflowStatus,
    riskLevel: row.riskLevel,
    spendingLimitCents: row.spendingLimitCents,
    hasControlGroup: Object.keys(row.controlGroup ?? {}).length > 0,
    hasTestGroup: Object.keys(row.testGroup ?? {}).length > 0,
    hasEligibleRecords: Object.keys(row.eligibleRecords ?? {}).length > 0,
    hasExclusions: Object.keys(row.exclusions ?? {}).length > 0,
    hasSuccessMetrics: Object.keys(row.successMetrics ?? {}).length > 0,
    hasFailureThresholds: Object.keys(row.failureThresholds ?? {}).length > 0,
    hasStopConditions: Object.keys(row.stopConditions ?? {}).length > 0,
    hasSafetyControls: Object.keys(row.safetyControls ?? {}).length > 0,
    hypothesisId: row.hypothesisId,
    recommendationId: row.recommendationId,
    scheduledStartAt: row.scheduledStartAt?.toISOString() ?? null,
    scheduledEndAt: row.scheduledEndAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateExperimentInput(input: CreateBevExperimentRequest) {
  return {
    experimentKey: input.experimentKey.trim(),
    title: input.title.trim(),
    description: input.description ?? null,
    experimentType: input.experimentType.trim(),
    riskLevel: (input.riskLevel ?? 'medium') as typeof bevExperiments.$inferInsert.riskLevel,
    controlGroup: input.controlGroup ?? {},
    testGroup: input.testGroup ?? {},
    eligibleRecords: input.eligibleRecords ?? {},
    exclusions: input.exclusions ?? {},
    successMetrics: input.successMetrics ?? {},
    failureThresholds: input.failureThresholds ?? {},
    stopConditions: input.stopConditions ?? {},
    spendingLimitCents: input.spendingLimitCents ?? null,
    safetyControls: input.safetyControls ?? {},
    hypothesisId: input.hypothesisId ?? null,
    recommendationId: input.recommendationId ?? null,
    scheduledStartAt: parseOptionalDate(input.scheduledStartAt),
    scheduledEndAt: parseOptionalDate(input.scheduledEndAt),
  };
}

function mapUpdateExperimentInput(input: UpdateBevExperimentRequest) {
  return {
    ...(input.experimentKey !== undefined ? { experimentKey: input.experimentKey.trim() } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.experimentType !== undefined ? { experimentType: input.experimentType } : {}),
    ...(input.riskLevel !== undefined
      ? { riskLevel: input.riskLevel as typeof bevExperiments.$inferInsert.riskLevel }
      : {}),
    ...(input.controlGroup !== undefined ? { controlGroup: input.controlGroup } : {}),
    ...(input.testGroup !== undefined ? { testGroup: input.testGroup } : {}),
    ...(input.eligibleRecords !== undefined ? { eligibleRecords: input.eligibleRecords } : {}),
    ...(input.exclusions !== undefined ? { exclusions: input.exclusions } : {}),
    ...(input.successMetrics !== undefined ? { successMetrics: input.successMetrics } : {}),
    ...(input.failureThresholds !== undefined
      ? { failureThresholds: input.failureThresholds }
      : {}),
    ...(input.stopConditions !== undefined ? { stopConditions: input.stopConditions } : {}),
    ...(input.spendingLimitCents !== undefined
      ? { spendingLimitCents: input.spendingLimitCents ?? null }
      : {}),
    ...(input.safetyControls !== undefined ? { safetyControls: input.safetyControls } : {}),
    ...(input.hypothesisId !== undefined ? { hypothesisId: input.hypothesisId ?? null } : {}),
    ...(input.recommendationId !== undefined
      ? { recommendationId: input.recommendationId ?? null }
      : {}),
    ...(input.scheduledStartAt !== undefined
      ? { scheduledStartAt: parseOptionalDate(input.scheduledStartAt) }
      : {}),
    ...(input.scheduledEndAt !== undefined
      ? { scheduledEndAt: parseOptionalDate(input.scheduledEndAt) }
      : {}),
    ...(input.startedAt !== undefined ? { startedAt: parseOptionalDate(input.startedAt) } : {}),
    ...(input.completedAt !== undefined
      ? { completedAt: parseOptionalDate(input.completedAt) }
      : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus: input.workflowStatus as typeof bevExperiments.$inferInsert.workflowStatus,
        }
      : {}),
  };
}

function toOutcomeSummary(row: typeof bevOutcomes.$inferSelect): BevOutcomeSummary {
  return {
    id: row.id,
    experimentId: row.experimentId,
    recommendationId: row.recommendationId,
    title: row.title,
    operationalImpact: row.operationalImpact,
    financialImpactCents: row.financialImpactCents,
    customerImpact: row.customerImpact,
    workforceImpact: row.workforceImpact,
    complianceImpact: row.complianceImpact,
    statisticalConfidence:
      row.statisticalConfidence != null ? String(row.statisticalConfidence) : null,
    learningStage: row.learningStage,
    measuredAt: row.measuredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateOutcomeInput(input: CreateBevOutcomeRequest) {
  return {
    experimentId: input.experimentId ?? null,
    recommendationId: input.recommendationId ?? null,
    title: input.title.trim(),
    baselineMetrics: input.baselineMetrics ?? {},
    afterMetrics: input.afterMetrics ?? {},
    controlMetrics: input.controlMetrics ?? {},
    operationalImpact: input.operationalImpact ?? null,
    financialImpactCents: input.financialImpactCents ?? null,
    customerImpact: input.customerImpact ?? null,
    workforceImpact: input.workforceImpact ?? null,
    complianceImpact: input.complianceImpact ?? null,
    sideEffects: input.sideEffects ?? {},
    statisticalConfidence:
      input.statisticalConfidence != null ? String(input.statisticalConfidence) : null,
    learningStage: (input.learningStage ??
      'measured') as typeof bevOutcomes.$inferInsert.learningStage,
    measuredAt: parseOptionalDate(input.measuredAt) ?? new Date(),
  };
}

function mapUpdateOutcomeInput(input: UpdateBevOutcomeRequest) {
  return {
    ...(input.experimentId !== undefined ? { experimentId: input.experimentId ?? null } : {}),
    ...(input.recommendationId !== undefined
      ? { recommendationId: input.recommendationId ?? null }
      : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.baselineMetrics !== undefined ? { baselineMetrics: input.baselineMetrics } : {}),
    ...(input.afterMetrics !== undefined ? { afterMetrics: input.afterMetrics } : {}),
    ...(input.controlMetrics !== undefined ? { controlMetrics: input.controlMetrics } : {}),
    ...(input.operationalImpact !== undefined
      ? { operationalImpact: input.operationalImpact ?? null }
      : {}),
    ...(input.financialImpactCents !== undefined
      ? { financialImpactCents: input.financialImpactCents ?? null }
      : {}),
    ...(input.customerImpact !== undefined ? { customerImpact: input.customerImpact ?? null } : {}),
    ...(input.workforceImpact !== undefined
      ? { workforceImpact: input.workforceImpact ?? null }
      : {}),
    ...(input.complianceImpact !== undefined
      ? { complianceImpact: input.complianceImpact ?? null }
      : {}),
    ...(input.sideEffects !== undefined ? { sideEffects: input.sideEffects } : {}),
    ...(input.statisticalConfidence !== undefined
      ? {
          statisticalConfidence:
            input.statisticalConfidence != null ? String(input.statisticalConfidence) : null,
        }
      : {}),
    ...(input.learningStage !== undefined
      ? { learningStage: input.learningStage as typeof bevOutcomes.$inferInsert.learningStage }
      : {}),
    ...(input.measuredAt !== undefined
      ? { measuredAt: parseOptionalDate(input.measuredAt) ?? new Date() }
      : {}),
  };
}

function toUserFeedbackSummary(row: typeof bevUserFeedback.$inferSelect): BevUserFeedbackSummary {
  return {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    feedbackRating: row.feedbackRating,
    feedbackText: row.feedbackText,
    submittedByUserId: row.submittedByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toContinuousImprovementItemSummary(
  row: typeof bevContinuousImprovementItems.$inferSelect,
): BevContinuousImprovementItemSummary {
  return {
    id: row.id,
    itemKey: row.itemKey,
    sourceType: row.sourceType,
    title: row.title,
    description: row.description,
    priority: row.priority,
    workflowStatus: row.workflowStatus,
    ownerUserId: row.ownerUserId,
    expectedBenefit: row.expectedBenefit,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateContinuousImprovementItemInput(input: CreateBevContinuousImprovementItemRequest) {
  return {
    itemKey: input.itemKey.trim(),
    sourceType: input.sourceType.trim(),
    title: input.title.trim(),
    description: input.description ?? null,
    priority: input.priority ?? 'medium',
    ownerUserId: input.ownerUserId ?? null,
    expectedBenefit: input.expectedBenefit ?? null,
    evidence: input.evidence ?? {},
  };
}

function mapUpdateContinuousImprovementItemInput(input: UpdateBevContinuousImprovementItemRequest) {
  return {
    ...(input.itemKey !== undefined ? { itemKey: input.itemKey.trim() } : {}),
    ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId ?? null } : {}),
    ...(input.expectedBenefit !== undefined
      ? { expectedBenefit: input.expectedBenefit ?? null }
      : {}),
    ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof bevContinuousImprovementItems.$inferInsert.workflowStatus,
        }
      : {}),
  };
}

function toStrategicRoadmapItemSummary(
  row: typeof bevStrategicRoadmapItems.$inferSelect,
): BevStrategicRoadmapItemSummary {
  return {
    id: row.id,
    themeKey: row.themeKey,
    title: row.title,
    description: row.description,
    priority: row.priority,
    workflowStatus: row.workflowStatus,
    ownerUserId: row.ownerUserId,
    budgetCents: row.budgetCents,
    progressPercent: row.progressPercent != null ? String(row.progressPercent) : null,
    benefitRealizedCents: row.benefitRealizedCents,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateStrategicRoadmapItemInput(input: CreateBevStrategicRoadmapItemRequest) {
  return {
    themeKey: input.themeKey.trim(),
    title: input.title.trim(),
    description: input.description ?? null,
    priority: input.priority ?? 'medium',
    ownerUserId: input.ownerUserId ?? null,
    budgetCents: input.budgetCents ?? null,
    expectedOutcomes: input.expectedOutcomes ?? {},
    dependencies: input.dependencies ?? {},
    milestones: input.milestones ?? {},
  };
}

function mapUpdateStrategicRoadmapItemInput(input: UpdateBevStrategicRoadmapItemRequest) {
  return {
    ...(input.themeKey !== undefined ? { themeKey: input.themeKey.trim() } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId ?? null } : {}),
    ...(input.budgetCents !== undefined ? { budgetCents: input.budgetCents ?? null } : {}),
    ...(input.expectedOutcomes !== undefined ? { expectedOutcomes: input.expectedOutcomes } : {}),
    ...(input.dependencies !== undefined ? { dependencies: input.dependencies } : {}),
    ...(input.milestones !== undefined ? { milestones: input.milestones } : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof bevStrategicRoadmapItems.$inferInsert.workflowStatus,
        }
      : {}),
    ...(input.progressPercent !== undefined
      ? { progressPercent: input.progressPercent != null ? String(input.progressPercent) : null }
      : {}),
    ...(input.benefitRealizedCents !== undefined
      ? { benefitRealizedCents: input.benefitRealizedCents ?? null }
      : {}),
  };
}

function toMaturityAssessmentSummary(
  row: typeof bevMaturityAssessments.$inferSelect,
): BevMaturityAssessmentSummary {
  return {
    id: row.id,
    frameworkKey: row.frameworkKey,
    domain: row.domain,
    score: row.score != null ? String(row.score) : null,
    scoringMethod: row.scoringMethod,
    reviewerUserId: row.reviewerUserId,
    confidenceScore: row.confidenceScore != null ? String(row.confidenceScore) : null,
    assessedAt: row.assessedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateMaturityAssessmentInput(
  input: CreateBevMaturityAssessmentRequest,
  scope: StaffScope,
) {
  return {
    frameworkKey: input.frameworkKey.trim(),
    domain: input.domain.trim(),
    criteria: input.criteria ?? {},
    evidence: input.evidence ?? {},
    score: input.score != null ? String(input.score) : null,
    scoringMethod: input.scoringMethod ?? null,
    reviewerUserId: scope.userId,
    confidenceScore: input.confidenceScore != null ? String(input.confidenceScore) : null,
    gaps: input.gaps ?? {},
    recommendedSteps: input.recommendedSteps ?? {},
  };
}

function mapUpdateMaturityAssessmentInput(input: UpdateBevMaturityAssessmentRequest) {
  return {
    ...(input.frameworkKey !== undefined ? { frameworkKey: input.frameworkKey.trim() } : {}),
    ...(input.domain !== undefined ? { domain: input.domain.trim() } : {}),
    ...(input.criteria !== undefined ? { criteria: input.criteria } : {}),
    ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
    ...(input.score !== undefined
      ? { score: input.score != null ? String(input.score) : null }
      : {}),
    ...(input.scoringMethod !== undefined ? { scoringMethod: input.scoringMethod ?? null } : {}),
    ...(input.confidenceScore !== undefined
      ? { confidenceScore: input.confidenceScore != null ? String(input.confidenceScore) : null }
      : {}),
    ...(input.gaps !== undefined ? { gaps: input.gaps } : {}),
    ...(input.recommendedSteps !== undefined ? { recommendedSteps: input.recommendedSteps } : {}),
  };
}

function toAgentImprovementSummary(
  row: typeof bevAgentImprovements.$inferSelect,
): BevAgentImprovementSummary {
  return {
    id: row.id,
    agentKey: row.agentKey,
    improvementType: row.improvementType,
    title: row.title,
    description: row.description,
    workflowStatus: row.workflowStatus,
    versionLabel: row.versionLabel,
    changeReason: row.changeReason,
    securityReviewRequired: row.securityReviewRequired,
    stagingTestRequired: row.stagingTestRequired,
    rollbackVersionLabel: row.rollbackVersionLabel,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateAgentImprovementInput(input: CreateBevAgentImprovementRequest) {
  return {
    agentKey: input.agentKey.trim(),
    improvementType: input.improvementType.trim(),
    title: input.title.trim(),
    description: input.description ?? null,
    versionLabel: input.versionLabel ?? null,
    changeReason: input.changeReason ?? null,
    securityReviewRequired: input.securityReviewRequired ?? false,
    stagingTestRequired: input.stagingTestRequired ?? false,
    performanceBefore: input.performanceBefore ?? {},
    performanceAfter: input.performanceAfter ?? {},
    rollbackVersionLabel: input.rollbackVersionLabel ?? null,
  };
}

function mapUpdateAgentImprovementInput(input: UpdateBevAgentImprovementRequest) {
  return {
    ...(input.agentKey !== undefined ? { agentKey: input.agentKey.trim() } : {}),
    ...(input.improvementType !== undefined ? { improvementType: input.improvementType } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.versionLabel !== undefined ? { versionLabel: input.versionLabel ?? null } : {}),
    ...(input.changeReason !== undefined ? { changeReason: input.changeReason ?? null } : {}),
    ...(input.securityReviewRequired !== undefined
      ? { securityReviewRequired: input.securityReviewRequired }
      : {}),
    ...(input.stagingTestRequired !== undefined
      ? { stagingTestRequired: input.stagingTestRequired }
      : {}),
    ...(input.performanceBefore !== undefined
      ? { performanceBefore: input.performanceBefore }
      : {}),
    ...(input.performanceAfter !== undefined ? { performanceAfter: input.performanceAfter } : {}),
    ...(input.rollbackVersionLabel !== undefined
      ? { rollbackVersionLabel: input.rollbackVersionLabel ?? null }
      : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof bevAgentImprovements.$inferInsert.workflowStatus,
        }
      : {}),
  };
}

function toPromptPolicyVersionSummary(
  row: typeof bevPromptPolicyVersions.$inferSelect,
): BevPromptPolicyVersionSummary {
  return {
    id: row.id,
    policyType: row.policyType,
    policyKey: row.policyKey,
    versionLabel: row.versionLabel,
    changeReason: row.changeReason,
    approvedByUserId: row.approvedByUserId,
    effectiveAt: row.effectiveAt?.toISOString() ?? null,
    rollbackVersionLabel: row.rollbackVersionLabel,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreatePromptPolicyVersionInput(input: CreateBevPromptPolicyVersionRequest) {
  return {
    policyType: input.policyType.trim(),
    policyKey: input.policyKey.trim(),
    versionLabel: input.versionLabel.trim(),
    content: input.content,
    changeReason: input.changeReason ?? null,
    effectiveAt: parseOptionalDate(input.effectiveAt),
    rollbackVersionLabel: input.rollbackVersionLabel ?? null,
    performanceBefore: input.performanceBefore ?? {},
    performanceAfter: input.performanceAfter ?? {},
  };
}

function mapUpdatePromptPolicyVersionInput(input: UpdateBevPromptPolicyVersionRequest) {
  return {
    ...(input.policyType !== undefined ? { policyType: input.policyType } : {}),
    ...(input.policyKey !== undefined ? { policyKey: input.policyKey.trim() } : {}),
    ...(input.versionLabel !== undefined ? { versionLabel: input.versionLabel.trim() } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.changeReason !== undefined ? { changeReason: input.changeReason ?? null } : {}),
    ...(input.effectiveAt !== undefined
      ? { effectiveAt: parseOptionalDate(input.effectiveAt) }
      : {}),
    ...(input.rollbackVersionLabel !== undefined
      ? { rollbackVersionLabel: input.rollbackVersionLabel ?? null }
      : {}),
    ...(input.performanceBefore !== undefined
      ? { performanceBefore: input.performanceBefore }
      : {}),
    ...(input.performanceAfter !== undefined ? { performanceAfter: input.performanceAfter } : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof bevPromptPolicyVersions.$inferInsert.workflowStatus,
        }
      : {}),
  };
}

function toAiEvaluationSummary(row: typeof bevAiEvaluations.$inferSelect): BevAiEvaluationSummary {
  return {
    id: row.id,
    evaluationKey: row.evaluationKey,
    evaluationType: row.evaluationType,
    datasetRef: row.datasetRef,
    workflowStatus: row.workflowStatus,
    summary: row.summary,
    evaluatedAt: row.evaluatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateAiEvaluationInput(input: CreateBevAiEvaluationRequest) {
  return {
    evaluationKey: input.evaluationKey.trim(),
    evaluationType: input.evaluationType.trim(),
    datasetRef: input.datasetRef ?? null,
    metrics: input.metrics ?? {},
    summary: input.summary ?? null,
    evaluatedAt: parseOptionalDate(input.evaluatedAt),
  };
}

function mapUpdateAiEvaluationInput(input: UpdateBevAiEvaluationRequest) {
  return {
    ...(input.evaluationKey !== undefined ? { evaluationKey: input.evaluationKey.trim() } : {}),
    ...(input.evaluationType !== undefined ? { evaluationType: input.evaluationType } : {}),
    ...(input.datasetRef !== undefined ? { datasetRef: input.datasetRef ?? null } : {}),
    ...(input.metrics !== undefined ? { metrics: input.metrics } : {}),
    ...(input.summary !== undefined ? { summary: input.summary ?? null } : {}),
    ...(input.evaluatedAt !== undefined
      ? { evaluatedAt: parseOptionalDate(input.evaluatedAt) }
      : {}),
    ...(input.workflowStatus !== undefined
      ? {
          workflowStatus:
            input.workflowStatus as typeof bevAiEvaluations.$inferInsert.workflowStatus,
        }
      : {}),
  };
}

function toKnowledgeReinforcementSummary(
  row: typeof bevKnowledgeReinforcements.$inferSelect,
): BevKnowledgeReinforcementSummary {
  return {
    id: row.id,
    lessonTitle: row.lessonTitle,
    knowledgeNodeRef: row.knowledgeNodeRef,
    learningStage: row.learningStage,
    validatedAt: row.validatedAt?.toISOString() ?? null,
    validatedByUserId: row.validatedByUserId,
    sourceOutcomeId: row.sourceOutcomeId,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreateKnowledgeReinforcementInput(input: CreateBevKnowledgeReinforcementRequest) {
  return {
    lessonTitle: input.lessonTitle.trim(),
    lessonContent: input.lessonContent,
    knowledgeNodeRef: input.knowledgeNodeRef ?? null,
    linkedEntities: input.linkedEntities ?? {},
    sourceOutcomeId: input.sourceOutcomeId ?? null,
    learningStage: (input.learningStage ??
      'validated') as typeof bevKnowledgeReinforcements.$inferInsert.learningStage,
  };
}

function mapUpdateKnowledgeReinforcementInput(
  input: UpdateBevKnowledgeReinforcementRequest,
  scope: StaffScope,
) {
  return {
    ...(input.lessonTitle !== undefined ? { lessonTitle: input.lessonTitle.trim() } : {}),
    ...(input.lessonContent !== undefined ? { lessonContent: input.lessonContent } : {}),
    ...(input.knowledgeNodeRef !== undefined
      ? { knowledgeNodeRef: input.knowledgeNodeRef ?? null }
      : {}),
    ...(input.linkedEntities !== undefined ? { linkedEntities: input.linkedEntities } : {}),
    ...(input.sourceOutcomeId !== undefined
      ? { sourceOutcomeId: input.sourceOutcomeId ?? null }
      : {}),
    ...(input.learningStage !== undefined
      ? {
          learningStage:
            input.learningStage as typeof bevKnowledgeReinforcements.$inferInsert.learningStage,
        }
      : {}),
    ...(input.validatedAt !== undefined
      ? { validatedAt: parseOptionalDate(input.validatedAt) }
      : {}),
    ...(input.validatedByUserId !== undefined
      ? { validatedByUserId: input.validatedByUserId ?? scope.userId }
      : {}),
  };
}

function toProcessMiningResultSummary(
  row: typeof bevProcessMiningResults.$inferSelect,
): BevProcessMiningResultSummary {
  return {
    id: row.id,
    processKey: row.processKey,
    title: row.title,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function mapCreateProcessMiningResultInput(input: CreateBevProcessMiningResultRequest) {
  return {
    processKey: input.processKey.trim(),
    title: input.title.trim(),
    actualPath: input.actualPath ?? {},
    expectedPath: input.expectedPath ?? {},
    bottlenecks: input.bottlenecks ?? {},
    reworkLoops: input.reworkLoops ?? {},
    deviations: input.deviations ?? {},
  };
}

function mapUpdateProcessMiningResultInput(input: UpdateBevProcessMiningResultRequest) {
  return {
    ...(input.processKey !== undefined ? { processKey: input.processKey.trim() } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.actualPath !== undefined ? { actualPath: input.actualPath } : {}),
    ...(input.expectedPath !== undefined ? { expectedPath: input.expectedPath } : {}),
    ...(input.bottlenecks !== undefined ? { bottlenecks: input.bottlenecks } : {}),
    ...(input.reworkLoops !== undefined ? { reworkLoops: input.reworkLoops } : {}),
    ...(input.deviations !== undefined ? { deviations: input.deviations } : {}),
  };
}

function toEvolutionAlertSummary(
  row: typeof bevEvolutionAlerts.$inferSelect,
): BevEvolutionAlertSummary {
  return {
    id: row.id,
    alertType: row.alertType,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    sourceModule: row.sourceModule,
    incidentId: row.incidentId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toActionDraftSummary(row: typeof bevActionDrafts.$inferSelect): BevActionDraftSummary {
  return {
    id: row.id,
    draftType: row.draftType,
    title: row.title,
    content: row.content,
    aiGenerated: row.aiGenerated,
    workflowStatus: row.workflowStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAgentPerformanceSnapshotSummary(
  row: typeof bevAgentPerformanceSnapshots.$inferSelect,
): BevAgentPerformanceSnapshotSummary {
  return {
    id: row.id,
    agentKey: row.agentKey,
    taskVolume: row.taskVolume,
    successRate: row.successRate != null ? String(row.successRate) : null,
    failureRate: row.failureRate != null ? String(row.failureRate) : null,
    approvalRate: row.approvalRate != null ? String(row.approvalRate) : null,
    rejectionRate: row.rejectionRate != null ? String(row.rejectionRate) : null,
    correctionRate: row.correctionRate != null ? String(row.correctionRate) : null,
    avgLatencyMs: row.avgLatencyMs,
    toolFailureCount: row.toolFailureCount,
    policyViolationCount: row.policyViolationCount,
    costCents: row.costCents,
    providerKey: row.providerKey,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toAuditLogSummary(row: typeof bevAuditLogs.$inferSelect): BevAuditLogSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}
