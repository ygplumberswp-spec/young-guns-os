import { and, desc, eq, inArray } from 'drizzle-orm';
import type {
  AcknowledgeMissionControlAlertRequest,
  AddMissionControlIncidentTimelineRequest,
  CreateMissionControlCommandActionRequest,
  CreateMissionControlIncidentRequest,
  EnterpriseMissionControlAuraContext,
  EnterpriseMissionControlDashboard,
  MissionControlAlertSummary,
  MissionControlCommandActionSummary,
  MissionControlDepartmentHealthSummary,
  MissionControlIncidentSummary,
  MissionControlIncidentTimelineSummary,
  MissionControlModuleSnapshot,
  MissionControlOperationsMapPoint,
  MissionControlRecommendationSummary,
  MissionControlTimelineEventSummary,
  UpdateMissionControlIncidentRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  executiveAlerts,
  gpsPositions,
  integrationConnections,
  jobs,
  missionControlAlertHistory,
  missionControlAlerts,
  missionControlCommandActions,
  missionControlDepartmentHealth,
  missionControlIncidentTimeline,
  missionControlIncidents,
  missionControlOperationsMap,
  missionControlRecommendations,
  missionControlTimelineEvents,
  siSalesAlerts,
  miMarketingAlerts,
  sdServiceAlerts,
  itoIncidents,
  itoItAlerts,
  bevEvolutionAlerts,
  bevRecommendations,
  bevExperiments,
  bevKnowledgeReinforcements,
  abAppBuilderAlerts,
  abFeatureRequests,
  abDevelopmentWorkspaces,
  abApprovalRecords,
  abTestRuns,
  abDeployments,
  ipIndustryAlerts,
  ipPackInstallations,
  ipComplianceFrameworks,
  ipCertificates,
  pdpDeveloperAlerts,
  pdpRateLimitPolicies,
  pdpSdkGenerationRecords,
  smSaasAlerts,
  smLicenseRecords,
  smAnalyticsSnapshots,
  vrVoiceAlerts,
  vrAnalyticsSnapshots,
  vrAiReceptionistConfig,
  dipDocumentAlerts,
  dipAnalyticsSnapshots,
  dipOcrJobs,
  dipReviewQueueItems,
  dipOcrProviderConfigs,
  bcContinuityAlerts,
  bcAnalyticsSnapshots,
  bcBackupJobs,
  bcVerificationRecords,
  gsSearchAlerts,
  gsAnalyticsSnapshots,
  gsSearchIndexEntries,
  gsTimelineEntries,
  dmMigrationAlerts,
  dmAnalyticsSnapshots,
  dmImportJobs,
  dmExportJobs,
  ncPlatformAlerts,
  ncAnalyticsSnapshots,
  ncDeliveryJobs,
  ncAlerts,
  ncEscalations,
  phPlatformAlerts,
  phAnalyticsSnapshots,
  phHealthSnapshots,
  phDiagnosticRuns,
  phCapacitySnapshots,
  lncPlatformAlerts,
  lncReadinessScores,
  lncReadinessScans,
  lncGoLiveWizards,
  lncAnalyticsSnapshots,
  rcPlatformAlerts,
  rcReleaseCandidateReports,
  rcIntegrationValidationRuns,
  rcWorkflowValidationRuns,
  rcAnalyticsSnapshots,
  plPlatformAlerts,
  plGoLiveWizards,
  plDeploymentPipelineRuns,
  plLiveIntegrationVerificationRuns,
  plAnalyticsSnapshots,
  rlmPlatformAlerts,
  rlmVersionRecords,
  rlmLaunchChecklistItems,
  rlmDocumentationArtifacts,
  rlmAnalyticsSnapshots,
  itoHealthMonitors,
  itoSelfHealingActions,
  vehicles,
  voiceSessions,
  workflowRuns,
} from '@titan/db';
import type { CrmService } from './crm.service.js';
import type { LeadsService } from './leads.service.js';
import type { MarketingService } from './marketing.service.js';
import type { SalesService } from './sales.service.js';
import type { EnterpriseAutomationStudioService } from './enterprise-automation-studio.service.js';
import type { EnterpriseDigitalTwinService } from './enterprise-digital-twin.service.js';
import type { EnterpriseKnowledgeGraphService } from './enterprise-knowledge-graph.service.js';
import type { EnterpriseSecurityService } from './enterprise-security.service.js';
import type { ExecutiveService } from './executive.service.js';
import type { FinanceService } from './finance.service.js';
import type { FleetService } from './fleet.service.js';
import type { IntegrationPlatformService } from './integration-platform.service.js';
import type { InventoryService } from './inventory.service.js';
import type { JobsService } from './jobs.service.js';
import type { SchedulingService } from './scheduling.service.js';

export class EnterpriseMissionControlError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseMissionControlError';
  }
}

type StaffScope = { companyId: string; userId: string };

type EnterpriseMissionControlDeps = {
  db: DatabaseClient;
  executiveService: ExecutiveService;
  enterpriseDigitalTwinService: EnterpriseDigitalTwinService;
  enterpriseKnowledgeGraphService: EnterpriseKnowledgeGraphService;
  enterpriseAutomationStudioService: EnterpriseAutomationStudioService;
  enterpriseSecurityService: EnterpriseSecurityService;
  integrationPlatformService: IntegrationPlatformService;
  jobsService: JobsService;
  schedulingService: SchedulingService;
  fleetService: FleetService;
  inventoryService: InventoryService;
  financeService: FinanceService;
  crmService: CrmService;
  salesService: SalesService;
  leadsService: LeadsService;
  marketingService: MarketingService;
  aiOperationsService: import('./ai-operations.service.js').AiOperationsService;
};

export class EnterpriseMissionControlService {
  constructor(private readonly deps: EnterpriseMissionControlDeps) {}

  async getMissionControlDashboard(companyId: string): Promise<EnterpriseMissionControlDashboard> {
    const [
      executiveStats,
      healthSnapshot,
      moduleSnapshots,
      departmentHealth,
      alerts,
      incidents,
      timelineEvents,
      operationsMap,
      recommendations,
      pendingActions,
    ] = await Promise.all([
      this.deps.executiveService.getStats(companyId),
      this.deps.executiveService.getLatestHealthSnapshot(companyId),
      this.buildModuleSnapshots(companyId),
      this.listDepartmentHealth(companyId),
      this.listAlerts(companyId),
      this.listIncidents(companyId, ['open', 'investigating']),
      this.listTimelineEvents(companyId),
      this.listOperationsMap(companyId),
      this.listRecommendations(companyId),
      this.listCommandActions(companyId, 'pending_approval'),
    ]);

    const pendingAlerts = alerts.filter((a) => a.status === 'pending' || a.status === 'escalated');
    const criticalAlerts = alerts.filter((a) => a.severity === 'critical' || a.severity === 'high');
    const uniqueModuleSnapshots = dedupeModuleSnapshots(moduleSnapshots);

    return {
      summary: `Mission control live — health ${executiveStats.healthScore ?? 'Not assessed'}, ${pendingAlerts.length} pending alert(s), ${incidents.length} active incident(s), ${uniqueModuleSnapshots.length} module(s) monitored.`,
      executiveStats,
      businessHealthScore: healthSnapshot?.overallScore ?? executiveStats.healthScore,
      pendingAlertCount: pendingAlerts.length,
      criticalAlertCount: criticalAlerts.length,
      activeIncidentCount: incidents.length,
      systemHealthStatus: this.resolveSystemHealth(
        executiveStats.healthScore,
        criticalAlerts.length,
      ),
      moduleSnapshots: uniqueModuleSnapshots,
      departmentHealth: departmentHealth.slice(0, 12),
      recentAlerts: alerts.slice(0, 20),
      activeIncidents: incidents.slice(0, 10),
      timelineEvents: timelineEvents.slice(0, 25),
      operationsMap: operationsMap.slice(0, 50),
      recommendations: recommendations.slice(0, 15),
      pendingActionCount: pendingActions.length,
    };
  }

  async buildMissionControlAuraContext(
    companyId: string,
  ): Promise<EnterpriseMissionControlAuraContext> {
    const dashboard = await this.getMissionControlDashboard(companyId);
    return {
      summary: dashboard.summary,
      businessHealthScore: dashboard.businessHealthScore,
      pendingAlertCount: dashboard.pendingAlertCount,
      criticalAlertCount: dashboard.criticalAlertCount,
      activeIncidentCount: dashboard.activeIncidentCount,
      pendingRecommendationCount: dashboard.recommendations.filter((r) => r.status === 'pending')
        .length,
      pendingActionCount: dashboard.pendingActionCount,
    };
  }

  async syncAlertsFromModules(companyId: string): Promise<MissionControlAlertSummary[]> {
    const created: MissionControlAlertSummary[] = [];

    const [
      executiveAlertRows,
      failedRuns,
      errorIntegrations,
      twinDashboard,
      automationMonitoring,
      salesAlerts,
      marketingAlerts,
      serviceDeliveryAlerts,
      itOperationsAlerts,
      businessEvolutionAlerts,
      appBuilderAlerts,
      industryAlerts,
      developerPlatformAlerts,
      saasManagementAlerts,
      voiceReceptionAlerts,
      documentAiAlerts,
      businessContinuityAlerts,
      globalSearchAlerts,
      dataMigrationAlerts,
      notificationPlatformAlerts,
      platformHealthAlerts,
      launchCenterAlerts,
      releaseCenterAlerts,
      productionLaunchAlerts,
      releaseManagementAlerts,
    ] = await Promise.all([
      this.deps.db.query.executiveAlerts.findMany({
        where: and(
          eq(executiveAlerts.companyId, companyId),
          inArray(executiveAlerts.status, ['pending', 'acknowledged']),
        ),
        limit: 20,
      }),
      this.deps.db.query.workflowRuns.findMany({
        where: and(eq(workflowRuns.companyId, companyId), eq(workflowRuns.status, 'failed')),
        orderBy: [desc(workflowRuns.startedAt)],
        limit: 10,
      }),
      this.deps.db.query.integrationConnections.findMany({
        where: and(
          eq(integrationConnections.companyId, companyId),
          eq(integrationConnections.status, 'error'),
        ),
        limit: 10,
      }),
      this.deps.enterpriseDigitalTwinService.getExecutiveDashboard(companyId),
      this.deps.enterpriseAutomationStudioService.getMonitoringSummary(companyId),
      this.deps.db.query.siSalesAlerts.findMany({
        where: and(eq(siSalesAlerts.companyId, companyId), eq(siSalesAlerts.status, 'open')),
        orderBy: [desc(siSalesAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.miMarketingAlerts.findMany({
        where: and(
          eq(miMarketingAlerts.companyId, companyId),
          eq(miMarketingAlerts.status, 'open'),
        ),
        orderBy: [desc(miMarketingAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.sdServiceAlerts.findMany({
        where: and(eq(sdServiceAlerts.companyId, companyId), eq(sdServiceAlerts.status, 'open')),
        orderBy: [desc(sdServiceAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.itoItAlerts.findMany({
        where: and(eq(itoItAlerts.companyId, companyId), eq(itoItAlerts.status, 'open')),
        orderBy: [desc(itoItAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.bevEvolutionAlerts.findMany({
        where: and(
          eq(bevEvolutionAlerts.companyId, companyId),
          eq(bevEvolutionAlerts.status, 'open'),
        ),
        orderBy: [desc(bevEvolutionAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.abAppBuilderAlerts.findMany({
        where: and(
          eq(abAppBuilderAlerts.companyId, companyId),
          eq(abAppBuilderAlerts.status, 'open'),
        ),
        orderBy: [desc(abAppBuilderAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.ipIndustryAlerts.findMany({
        where: and(eq(ipIndustryAlerts.companyId, companyId), eq(ipIndustryAlerts.status, 'open')),
        orderBy: [desc(ipIndustryAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.pdpDeveloperAlerts.findMany({
        where: and(
          eq(pdpDeveloperAlerts.companyId, companyId),
          eq(pdpDeveloperAlerts.status, 'open'),
        ),
        orderBy: [desc(pdpDeveloperAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.smSaasAlerts.findMany({
        where: and(eq(smSaasAlerts.companyId, companyId), eq(smSaasAlerts.status, 'open')),
        orderBy: [desc(smSaasAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.vrVoiceAlerts.findMany({
        where: and(eq(vrVoiceAlerts.companyId, companyId), eq(vrVoiceAlerts.status, 'open')),
        orderBy: [desc(vrVoiceAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.dipDocumentAlerts.findMany({
        where: and(
          eq(dipDocumentAlerts.companyId, companyId),
          eq(dipDocumentAlerts.status, 'open'),
        ),
        orderBy: [desc(dipDocumentAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.bcContinuityAlerts.findMany({
        where: and(
          eq(bcContinuityAlerts.companyId, companyId),
          eq(bcContinuityAlerts.status, 'open'),
        ),
        orderBy: [desc(bcContinuityAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.gsSearchAlerts.findMany({
        where: and(eq(gsSearchAlerts.companyId, companyId), eq(gsSearchAlerts.status, 'open')),
        orderBy: [desc(gsSearchAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.dmMigrationAlerts.findMany({
        where: and(
          eq(dmMigrationAlerts.companyId, companyId),
          eq(dmMigrationAlerts.status, 'open'),
        ),
        orderBy: [desc(dmMigrationAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.ncPlatformAlerts.findMany({
        where: and(eq(ncPlatformAlerts.companyId, companyId), eq(ncPlatformAlerts.status, 'open')),
        orderBy: [desc(ncPlatformAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.phPlatformAlerts.findMany({
        where: and(eq(phPlatformAlerts.companyId, companyId), eq(phPlatformAlerts.status, 'open')),
        orderBy: [desc(phPlatformAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.lncPlatformAlerts.findMany({
        where: and(
          eq(lncPlatformAlerts.companyId, companyId),
          eq(lncPlatformAlerts.status, 'open'),
        ),
        orderBy: [desc(lncPlatformAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.rcPlatformAlerts.findMany({
        where: and(eq(rcPlatformAlerts.companyId, companyId), eq(rcPlatformAlerts.status, 'open')),
        orderBy: [desc(rcPlatformAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.plPlatformAlerts.findMany({
        where: and(eq(plPlatformAlerts.companyId, companyId), eq(plPlatformAlerts.status, 'open')),
        orderBy: [desc(plPlatformAlerts.createdAt)],
        limit: 20,
      }),
      this.deps.db.query.rlmPlatformAlerts.findMany({
        where: and(
          eq(rlmPlatformAlerts.companyId, companyId),
          eq(rlmPlatformAlerts.status, 'open'),
        ),
        orderBy: [desc(rlmPlatformAlerts.createdAt)],
        limit: 20,
      }),
    ]);

    for (const alert of executiveAlertRows) {
      const category = mapExecutiveAlertCategory(alert.alertType);
      const row = await this.upsertAlert(companyId, {
        category,
        severity: alert.priority === 'high' ? 'high' : 'medium',
        title: alert.title,
        description: alert.description,
        sourceModule: 'executive',
        sourceEntityId: alert.id,
        context: alert.context,
      });
      created.push(row);
    }

    for (const run of failedRuns) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity: 'medium',
        title: `Failed workflow run`,
        description: run.errorMessage ?? `Workflow run ${run.id} failed.`,
        sourceModule: 'automation',
        sourceEntityId: run.id,
        context: { workflowId: run.workflowId, status: run.status },
      });
      created.push(row);
    }

    for (const integration of errorIntegrations) {
      const row = await this.upsertAlert(companyId, {
        category: 'integration',
        severity: 'high',
        title: `Integration error: ${integration.provider}`,
        description: integration.lastError ?? `${integration.provider} connection in error state.`,
        sourceModule: 'integrations',
        sourceEntityId: integration.id,
        context: { provider: integration.provider },
      });
      created.push(row);
    }

    if (twinDashboard.riskIndicators.operationalRiskLevel === 'high') {
      const row = await this.upsertAlert(companyId, {
        category: 'critical',
        severity: 'high',
        title: 'High operational risk detected',
        description: twinDashboard.summary,
        sourceModule: 'digital_twin',
        context: twinDashboard.riskIndicators as unknown as Record<string, unknown>,
      });
      created.push(row);
    }

    if (automationMonitoring.failedCount > 0) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity: automationMonitoring.failedCount > 3 ? 'high' : 'medium',
        title: 'Automation failures detected',
        description: `${automationMonitoring.failedCount} failed workflow run(s), queue depth ${automationMonitoring.queueDepth}.`,
        sourceModule: 'automation',
        context: automationMonitoring as unknown as Record<string, unknown>,
      });
      created.push(row);
    }

    for (const alert of salesAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'financial',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'sales_intelligence',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status },
      });
      created.push(row);
    }

    for (const alert of marketingAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'marketing_intelligence',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status },
      });
      created.push(row);
    }

    for (const alert of serviceDeliveryAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'service_delivery',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status, jobId: alert.jobId },
      });
      created.push(row);
    }

    for (const alert of itOperationsAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'it_operations',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status, incidentId: alert.incidentId },
      });
      created.push(row);
    }

    for (const alert of businessEvolutionAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'business_evolution',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status },
      });
      created.push(row);
    }

    for (const alert of appBuilderAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'app_builder',
        sourceEntityId: alert.id,
        context: {
          alertType: alert.alertType,
          status: alert.status,
          featureRequestId: alert.featureRequestId,
        },
      });
      created.push(row);
    }

    for (const alert of industryAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'industry_packs',
        sourceEntityId: alert.id,
        context: {
          alertType: alert.alertType,
          status: alert.status,
          packCatalogId: alert.packCatalogId,
        },
      });
      created.push(row);
    }

    for (const alert of developerPlatformAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'integration',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'public_developer_platform',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status },
      });
      created.push(row);
    }

    for (const alert of saasManagementAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'financial',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'saas_management',
        sourceEntityId: alert.id,
        context: {
          alertType: alert.alertType,
          status: alert.status,
          targetCompanyId: alert.targetCompanyId,
        },
      });
      created.push(row);
    }

    for (const alert of voiceReceptionAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'voice_reception',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status },
      });
      created.push(row);
    }

    for (const alert of documentAiAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'document_ai',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status, documentId: alert.documentId },
      });
      created.push(row);
    }

    for (const alert of businessContinuityAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'business_continuity',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status },
      });
      created.push(row);
    }

    for (const alert of globalSearchAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'global_search',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status },
      });
      created.push(row);
    }

    for (const alert of dataMigrationAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'data_migration',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status },
      });
      created.push(row);
    }

    for (const alert of notificationPlatformAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'notifications',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status },
      });
      created.push(row);
    }

    for (const alert of platformHealthAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'platform_health',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status },
      });
      created.push(row);
    }

    for (const alert of launchCenterAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'launch_center',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status },
      });
      created.push(row);
    }

    for (const alert of releaseCenterAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'release_center',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status },
      });
      created.push(row);
    }

    for (const alert of productionLaunchAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'production_launch',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status },
      });
      created.push(row);
    }

    for (const alert of releaseManagementAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'operational',
        severity:
          alert.severity === 'critical'
            ? 'critical'
            : alert.severity === 'warning'
              ? 'medium'
              : 'low',
        title: alert.title,
        description: alert.description ?? alert.alertType,
        sourceModule: 'release_management',
        sourceEntityId: alert.id,
        context: { alertType: alert.alertType, status: alert.status },
      });
      created.push(row);
    }

    const aiAlerts =
      await this.deps.aiOperationsService.getMissionControlAlertCandidates(companyId);
    for (const alert of aiAlerts) {
      const row = await this.upsertAlert(companyId, {
        category: 'ai',
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        sourceModule: 'ai_orchestration',
        sourceEntityId: alert.sourceEntityId,
        context: alert.context,
      });
      created.push(row);
    }

    return created;
  }

  async upsertOperationalAlerts(
    companyId: string,
    alerts: Array<{
      title: string;
      description: string;
      severity: MissionControlAlertSummary['severity'];
      sourceEntityId: string;
      category?: MissionControlAlertSummary['category'];
    }>,
  ): Promise<MissionControlAlertSummary[]> {
    const created: MissionControlAlertSummary[] = [];
    for (const alert of alerts) {
      const row = await this.upsertAlert(companyId, {
        category: alert.category ?? 'operational',
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        sourceModule: 'production_operations',
        sourceEntityId: alert.sourceEntityId,
      });
      created.push(row);
    }
    return created;
  }

  async listAlerts(
    companyId: string,
    status?: MissionControlAlertSummary['status'][],
  ): Promise<MissionControlAlertSummary[]> {
    const rows = await this.deps.db.query.missionControlAlerts.findMany({
      where: status
        ? and(
            eq(missionControlAlerts.companyId, companyId),
            inArray(missionControlAlerts.status, status),
          )
        : eq(missionControlAlerts.companyId, companyId),
      orderBy: [desc(missionControlAlerts.createdAt)],
      limit: 100,
    });
    return rows.map(toAlertSummary);
  }

  async acknowledgeAlert(
    scope: StaffScope,
    input: AcknowledgeMissionControlAlertRequest,
  ): Promise<MissionControlAlertSummary> {
    const alert = await this.ensureAlert(scope.companyId, input.alertId);
    const [updated] = await this.deps.db
      .update(missionControlAlerts)
      .set({
        status: 'acknowledged',
        acknowledgedByUserId: scope.userId,
        acknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(missionControlAlerts.id, alert.id))
      .returning();

    await this.deps.db.insert(missionControlAlertHistory).values({
      companyId: scope.companyId,
      alertId: alert.id,
      changeType: 'acknowledged',
      snapshot: { status: 'acknowledged' },
      changedByUserId: scope.userId,
    });

    return toAlertSummary(updated!);
  }

  async createIncident(
    scope: StaffScope,
    input: CreateMissionControlIncidentRequest,
  ): Promise<MissionControlIncidentSummary> {
    const [row] = await this.deps.db
      .insert(missionControlIncidents)
      .values({
        companyId: scope.companyId,
        title: input.title,
        description: input.description,
        severity: input.severity ?? 'medium',
        ownerUserId: input.ownerUserId ?? null,
        linkedEntities: input.linkedEntities ?? [],
        branchKey: input.branchKey ?? null,
        createdByUserId: scope.userId,
      })
      .returning();

    await this.deps.db.insert(missionControlIncidentTimeline).values({
      companyId: scope.companyId,
      incidentId: row!.id,
      title: 'Incident opened',
      description: input.description,
      createdByUserId: scope.userId,
    });

    await this.deps.db.insert(missionControlTimelineEvents).values({
      companyId: scope.companyId,
      eventType: 'incident_event',
      title: `Incident opened: ${input.title}`,
      description: input.description,
      sourceModule: 'mission_control',
      entityId: row!.id,
      branchKey: input.branchKey ?? null,
      eventAt: new Date(),
    });

    return toIncidentSummary(row!);
  }

  async updateIncident(
    scope: StaffScope,
    incidentId: string,
    input: UpdateMissionControlIncidentRequest,
  ): Promise<MissionControlIncidentSummary> {
    await this.ensureIncident(scope.companyId, incidentId);

    const [updated] = await this.deps.db
      .update(missionControlIncidents)
      .set({
        status: input.status,
        ownerUserId: input.ownerUserId,
        rootCause: input.rootCause,
        resolutionSummary: input.resolutionSummary,
        resolvedAt:
          input.status === 'resolved' || input.status === 'closed' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(missionControlIncidents.id, incidentId))
      .returning();

    return toIncidentSummary(updated!);
  }

  async addIncidentTimelineEntry(
    scope: StaffScope,
    incidentId: string,
    input: AddMissionControlIncidentTimelineRequest,
  ): Promise<MissionControlIncidentTimelineSummary> {
    await this.ensureIncident(scope.companyId, incidentId);

    const [row] = await this.deps.db
      .insert(missionControlIncidentTimeline)
      .values({
        companyId: scope.companyId,
        incidentId,
        title: input.title,
        description: input.description ?? null,
        createdByUserId: scope.userId,
      })
      .returning();

    return {
      id: row!.id,
      incidentId,
      title: row!.title,
      description: row!.description,
      eventAt: row!.eventAt.toISOString(),
    };
  }

  async listIncidents(
    companyId: string,
    statuses?: MissionControlIncidentSummary['status'][],
  ): Promise<MissionControlIncidentSummary[]> {
    const rows = await this.deps.db.query.missionControlIncidents.findMany({
      where: statuses
        ? and(
            eq(missionControlIncidents.companyId, companyId),
            inArray(missionControlIncidents.status, statuses),
          )
        : eq(missionControlIncidents.companyId, companyId),
      orderBy: [desc(missionControlIncidents.updatedAt)],
      limit: 50,
    });
    return rows.map(toIncidentSummary);
  }

  async getIncidentTimeline(
    companyId: string,
    incidentId: string,
  ): Promise<MissionControlIncidentTimelineSummary[]> {
    await this.ensureIncident(companyId, incidentId);
    const rows = await this.deps.db.query.missionControlIncidentTimeline.findMany({
      where: and(
        eq(missionControlIncidentTimeline.companyId, companyId),
        eq(missionControlIncidentTimeline.incidentId, incidentId),
      ),
      orderBy: [desc(missionControlIncidentTimeline.eventAt)],
    });
    return rows.map((row) => ({
      id: row.id,
      incidentId: row.incidentId,
      title: row.title,
      description: row.description,
      eventAt: row.eventAt.toISOString(),
    }));
  }

  async captureOperationsMap(companyId: string): Promise<MissionControlOperationsMapPoint[]> {
    await this.deps.db
      .delete(missionControlOperationsMap)
      .where(eq(missionControlOperationsMap.companyId, companyId));

    const [gpsRows, vehicleRows, activeJobs] = await Promise.all([
      this.deps.db.query.gpsPositions.findMany({
        where: eq(gpsPositions.companyId, companyId),
        orderBy: [desc(gpsPositions.recordedAt)],
        limit: 50,
      }),
      this.deps.db.query.vehicles.findMany({ where: eq(vehicles.companyId, companyId), limit: 50 }),
      this.deps.db.query.jobs.findMany({
        where: and(
          eq(jobs.companyId, companyId),
          inArray(jobs.status, ['scheduled', 'in_progress']),
        ),
        limit: 30,
      }),
    ]);

    const vehicleNameById = new Map(vehicleRows.map((v) => [v.id, v.name]));
    const created: MissionControlOperationsMapPoint[] = [];

    for (const gps of gpsRows) {
      const [row] = await this.deps.db
        .insert(missionControlOperationsMap)
        .values({
          companyId,
          mapType: 'fleet_position',
          label: vehicleNameById.get(gps.vehicleId ?? '') ?? 'Vehicle',
          latitude: gps.latitude,
          longitude: gps.longitude,
          entityType: 'vehicle',
          entityId: gps.vehicleId,
          metadata: { speedKmh: gps.speedKmh, recordedAt: gps.recordedAt.toISOString() },
        })
        .returning();
      created.push(toMapPoint(row!));
    }

    for (const job of activeJobs) {
      const [row] = await this.deps.db
        .insert(missionControlOperationsMap)
        .values({
          companyId,
          mapType: 'active_job',
          label: job.title,
          entityType: 'job',
          entityId: job.id,
          metadata: { status: job.status },
        })
        .returning();
      created.push(toMapPoint(row!));
    }

    return created;
  }

  async listOperationsMap(companyId: string): Promise<MissionControlOperationsMapPoint[]> {
    const rows = await this.deps.db.query.missionControlOperationsMap.findMany({
      where: eq(missionControlOperationsMap.companyId, companyId),
      orderBy: [desc(missionControlOperationsMap.capturedAt)],
      limit: 100,
    });
    return rows.map(toMapPoint);
  }

  async syncTimelineFromModules(companyId: string): Promise<MissionControlTimelineEventSummary[]> {
    const jobRows = await this.deps.db.query.jobs.findMany({
      where: eq(jobs.companyId, companyId),
      orderBy: [desc(jobs.updatedAt)],
      limit: 20,
    });

    const created: MissionControlTimelineEventSummary[] = [];
    for (const job of jobRows) {
      const [row] = await this.deps.db
        .insert(missionControlTimelineEvents)
        .values({
          companyId,
          eventType: 'job_event',
          title: `Job: ${job.title}`,
          description: `Status ${job.status}`,
          sourceModule: 'jobs',
          entityType: 'job',
          entityId: job.id,
          eventAt: job.updatedAt,
          metadata: { status: job.status },
        })
        .returning();
      created.push(toTimelineSummary(row!));
    }

    return created;
  }

  async listTimelineEvents(companyId: string): Promise<MissionControlTimelineEventSummary[]> {
    const rows = await this.deps.db.query.missionControlTimelineEvents.findMany({
      where: eq(missionControlTimelineEvents.companyId, companyId),
      orderBy: [desc(missionControlTimelineEvents.eventAt)],
      limit: 100,
    });
    return rows.map(toTimelineSummary);
  }

  async refreshDepartmentHealth(
    companyId: string,
  ): Promise<MissionControlDepartmentHealthSummary[]> {
    const snapshots = dedupeModuleSnapshots(await this.buildModuleSnapshots(companyId));
    await this.deps.db
      .delete(missionControlDepartmentHealth)
      .where(eq(missionControlDepartmentHealth.companyId, companyId));

    const created: MissionControlDepartmentHealthSummary[] = [];
    for (const snapshot of snapshots) {
      const [row] = await this.deps.db
        .insert(missionControlDepartmentHealth)
        .values({
          companyId,
          departmentKey: snapshot.module,
          departmentName: formatDepartmentLabel(snapshot.module),
          healthScore: null,
          status: snapshot.status,
          metrics: snapshot.metrics,
        })
        .returning();
      created.push(toDepartmentHealthSummary(row!));
    }

    return created;
  }

  async listDepartmentHealth(companyId: string): Promise<MissionControlDepartmentHealthSummary[]> {
    const rows = await this.deps.db.query.missionControlDepartmentHealth.findMany({
      where: eq(missionControlDepartmentHealth.companyId, companyId),
      orderBy: [desc(missionControlDepartmentHealth.capturedAt)],
      limit: 50,
    });

    if (rows.length === 0) {
      return [];
    }

    const deduped = new Map<string, MissionControlDepartmentHealthSummary>();
    for (const row of rows) {
      const summary = toDepartmentHealthSummary(row);
      if (!deduped.has(summary.departmentKey)) {
        deduped.set(summary.departmentKey, summary);
      }
    }

    return [...deduped.values()];
  }

  async generateRecommendations(companyId: string): Promise<MissionControlRecommendationSummary[]> {
    const dashboard = await this.getMissionControlDashboard(companyId);
    const signals: Array<{ title: string; recommendation: string; priority: string }> = [];

    if (dashboard.criticalAlertCount > 0) {
      signals.push({
        title: 'Critical alerts require attention',
        recommendation: `${dashboard.criticalAlertCount} high/critical alert(s) pending — review alert center and assign incident ownership.`,
        priority: 'high',
      });
    }

    if (dashboard.activeIncidentCount > 0) {
      signals.push({
        title: 'Active incidents open',
        recommendation: `${dashboard.activeIncidentCount} incident(s) open — coordinate departments and document root cause analysis.`,
        priority: 'high',
      });
    }

    if (dashboard.businessHealthScore != null && dashboard.businessHealthScore < 70) {
      signals.push({
        title: 'Business health below target',
        recommendation: `Health score ${dashboard.businessHealthScore}/100 — review department health and executive dashboard modules.`,
        priority: 'medium',
      });
    }

    if (dashboard.pendingActionCount > 0) {
      signals.push({
        title: 'Pending executive actions',
        recommendation: `${dashboard.pendingActionCount} command action(s) awaiting approval — follow Draft → Approval → Execution workflow.`,
        priority: 'medium',
      });
    }

    const created: MissionControlRecommendationSummary[] = [];
    for (const signal of signals.slice(0, 8)) {
      const [row] = await this.deps.db
        .insert(missionControlRecommendations)
        .values({
          companyId,
          title: signal.title,
          recommendation: signal.recommendation,
          priority: signal.priority,
        })
        .returning();
      created.push(toRecommendationSummary(row!));
    }

    return created;
  }

  async listRecommendations(companyId: string): Promise<MissionControlRecommendationSummary[]> {
    const rows = await this.deps.db.query.missionControlRecommendations.findMany({
      where: eq(missionControlRecommendations.companyId, companyId),
      orderBy: [desc(missionControlRecommendations.createdAt)],
      limit: 50,
    });
    return rows.map(toRecommendationSummary);
  }

  async listCommandActions(
    companyId: string,
    status?: MissionControlCommandActionSummary['status'],
  ): Promise<MissionControlCommandActionSummary[]> {
    const rows = await this.deps.db.query.missionControlCommandActions.findMany({
      where: status
        ? and(
            eq(missionControlCommandActions.companyId, companyId),
            eq(missionControlCommandActions.status, status),
          )
        : eq(missionControlCommandActions.companyId, companyId),
      orderBy: [desc(missionControlCommandActions.createdAt)],
      limit: 50,
    });
    return rows.map(toActionSummary);
  }

  async createCommandAction(
    scope: StaffScope,
    input: CreateMissionControlCommandActionRequest,
  ): Promise<MissionControlCommandActionSummary> {
    if (input.incidentId) {
      await this.ensureIncident(scope.companyId, input.incidentId);
    }

    const [row] = await this.deps.db
      .insert(missionControlCommandActions)
      .values({
        companyId: scope.companyId,
        actionType: input.actionType,
        subject: input.subject,
        recommendation: input.recommendation,
        incidentId: input.incidentId ?? null,
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    await this.deps.db.insert(missionControlTimelineEvents).values({
      companyId: scope.companyId,
      eventType: 'executive_action',
      title: `Command action drafted: ${input.subject}`,
      description: input.recommendation,
      sourceModule: 'mission_control',
      entityId: row!.id,
      eventAt: new Date(),
    });

    return toActionSummary(row!);
  }

  private async buildModuleSnapshots(companyId: string): Promise<MissionControlModuleSnapshot[]> {
    const [
      jobsStats,
      schedulingStats,
      fleetStats,
      inventoryStats,
      financeStats,
      salesStats,
      leadStats,
      marketingStats,
      customers,
      automationMonitoring,
      securityContext,
      integrationContext,
      twinContext,
      knowledgeContext,
      itOperationsStats,
      businessEvolutionStats,
      appBuilderStats,
      industryPacksStats,
      publicDeveloperStats,
      saasManagementStats,
      voiceReceptionStats,
      documentAiStats,
      businessContinuityStats,
      globalSearchStats,
      dataMigrationStats,
      notificationStats,
      platformHealthStats,
      launchCenterStats,
      releaseCenterStats,
      productionLaunchStats,
      releaseManagementStats,
    ] = await Promise.all([
      this.deps.jobsService.getStats(companyId),
      this.deps.schedulingService.getStats(companyId),
      this.deps.fleetService.getStats(companyId),
      this.deps.inventoryService.getStats(companyId),
      this.deps.financeService.getStats(companyId),
      this.deps.salesService.getStats(companyId),
      this.deps.leadsService.getStats(companyId),
      this.deps.marketingService.getStats(companyId),
      this.deps.crmService.listCustomers(companyId),
      this.deps.enterpriseAutomationStudioService.getMonitoringSummary(companyId),
      this.deps.enterpriseSecurityService.buildSecurityAuraContext(companyId),
      this.deps.integrationPlatformService.buildIntegrationAuraContext(companyId),
      this.deps.enterpriseDigitalTwinService.buildDigitalTwinAuraContext(companyId),
      this.deps.enterpriseKnowledgeGraphService.buildKnowledgeGraphAuraContext(companyId),
      this.buildItOperationsModuleStats(companyId),
      this.buildBusinessEvolutionModuleStats(companyId),
      this.buildAppBuilderModuleStats(companyId),
      this.buildIndustryPacksModuleStats(companyId),
      this.buildPublicDeveloperModuleStats(companyId),
      this.buildSaasManagementModuleStats(companyId),
      this.buildVoiceReceptionModuleStats(companyId),
      this.buildDocumentAiModuleStats(companyId),
      this.buildBusinessContinuityModuleStats(companyId),
      this.buildGlobalSearchModuleStats(companyId),
      this.buildDataMigrationModuleStats(companyId),
      this.buildNotificationsModuleStats(companyId),
      this.buildPlatformHealthModuleStats(companyId),
      this.buildLaunchCenterModuleStats(companyId),
      this.buildReleaseCenterModuleStats(companyId),
      this.buildProductionLaunchModuleStats(companyId),
      this.buildReleaseManagementModuleStats(companyId),
    ]);

    return [
      {
        module: 'jobs',
        status: jobsStats.activeCount > 0 ? 'healthy' : 'warning',
        summary: `${jobsStats.activeCount} active job(s) of ${jobsStats.totalCount} total`,
        metrics: jobsStats as unknown as Record<string, unknown>,
      },
      {
        module: 'dispatch',
        status: schedulingStats.scheduledCount > 0 ? 'healthy' : 'warning',
        summary: `${schedulingStats.scheduledCount} scheduled job(s)`,
        metrics: schedulingStats as unknown as Record<string, unknown>,
      },
      {
        module: 'fleet',
        status: fleetStats.totalCount > 0 ? 'healthy' : 'warning',
        summary: `${fleetStats.assignedCount}/${fleetStats.totalCount} vehicles assigned`,
        metrics: fleetStats as unknown as Record<string, unknown>,
      },
      {
        module: 'inventory',
        status: inventoryStats.lowStockCount > 0 ? 'warning' : 'healthy',
        summary: `${inventoryStats.lowStockCount} low-stock item(s)`,
        metrics: inventoryStats as unknown as Record<string, unknown>,
      },
      {
        module: 'finance',
        status: 'healthy',
        summary: `${financeStats.openQuoteCount} open quote(s), ${financeStats.invoiceCount} invoice(s)`,
        metrics: financeStats as unknown as Record<string, unknown>,
      },
      {
        module: 'sales_intelligence',
        status:
          salesStats.openOpportunityCount > 0 || leadStats.activeLeadCount > 0
            ? 'healthy'
            : 'warning',
        summary: `${salesStats.openOpportunityCount} open opportunit${salesStats.openOpportunityCount === 1 ? 'y' : 'ies'}; pipeline ${(salesStats.pipelineValueCents / 100).toFixed(2)}; ${leadStats.activeLeadCount} active lead(s)`,
        metrics: { sales: salesStats, leads: leadStats } as unknown as Record<string, unknown>,
      },
      {
        module: 'marketing_intelligence',
        status: marketingStats.activeCampaignCount > 0 ? 'healthy' : 'warning',
        summary: `${marketingStats.activeCampaignCount} active campaign(s), ${marketingStats.segmentCount} segment(s), ${marketingStats.pendingRecommendationCount} recommendation(s)`,
        metrics: marketingStats as unknown as Record<string, unknown>,
      },
      {
        module: 'service_delivery',
        status: jobsStats.activeCount > 0 ? 'healthy' : 'warning',
        summary: `${jobsStats.activeCount} active job(s) of ${jobsStats.totalCount} total; dispatch ${schedulingStats.scheduledCount} scheduled`,
        metrics: { jobs: jobsStats, scheduling: schedulingStats } as unknown as Record<
          string,
          unknown
        >,
      },
      {
        module: 'it_operations',
        status:
          itOperationsStats.overallHealthStatus === 'healthy'
            ? 'healthy'
            : itOperationsStats.overallHealthStatus === 'degraded'
              ? 'warning'
              : 'critical',
        summary: `${itOperationsStats.openIncidentCount} open incident(s), ${itOperationsStats.openAlertCount} alert(s), ${itOperationsStats.degradedMonitorCount} degraded monitor(s), ${itOperationsStats.selfHealingSuccessCount} recent self-healing success(es)`,
        metrics: itOperationsStats as unknown as Record<string, unknown>,
      },
      {
        module: 'business_evolution',
        status:
          businessEvolutionStats.overallLearningStatus === 'healthy'
            ? 'healthy'
            : businessEvolutionStats.overallLearningStatus === 'degraded'
              ? 'warning'
              : 'critical',
        summary: `${businessEvolutionStats.openRecommendationCount} active recommendation(s), ${businessEvolutionStats.activeExperimentCount} active experiment(s), ${businessEvolutionStats.openAlertCount} evolution alert(s), ${businessEvolutionStats.validatedLessonCount} validated lesson(s)`,
        metrics: businessEvolutionStats as unknown as Record<string, unknown>,
      },
      {
        module: 'app_builder',
        status:
          appBuilderStats.overallBuildHealthStatus === 'healthy'
            ? 'healthy'
            : appBuilderStats.overallBuildHealthStatus === 'degraded'
              ? 'warning'
              : 'critical',
        summary: `${appBuilderStats.activeFeatureRequestCount} active feature request(s), ${appBuilderStats.pendingApprovalCount} pending approval(s), ${appBuilderStats.failedTestCount} failed test(s), ${appBuilderStats.openAlertCount} app builder alert(s)`,
        metrics: appBuilderStats as unknown as Record<string, unknown>,
      },
      {
        module: 'industry_packs',
        status:
          industryPacksStats.overallIndustryHealthStatus === 'healthy'
            ? 'healthy'
            : industryPacksStats.overallIndustryHealthStatus === 'degraded'
              ? 'warning'
              : 'critical',
        summary: `${industryPacksStats.activePackCount} active pack(s), ${industryPacksStats.openComplianceAlertCount} compliance alert(s), ${industryPacksStats.pendingCertificateCount} pending certificate(s), ${industryPacksStats.openAlertCount} industry alert(s)`,
        metrics: industryPacksStats as unknown as Record<string, unknown>,
      },
      {
        module: 'public_developer_platform',
        status:
          publicDeveloperStats.overallDeveloperHealthStatus === 'healthy'
            ? 'healthy'
            : publicDeveloperStats.overallDeveloperHealthStatus === 'degraded'
              ? 'warning'
              : 'critical',
        summary: `${publicDeveloperStats.openAlertCount} developer alert(s), ${publicDeveloperStats.webhookFailureCount} webhook failure(s), ${publicDeveloperStats.rateLimitPolicyCount} rate limit polic${publicDeveloperStats.rateLimitPolicyCount === 1 ? 'y' : 'ies'}, ${publicDeveloperStats.sdkGenerationCount} SDK generation(s)`,
        metrics: publicDeveloperStats as unknown as Record<string, unknown>,
      },
      {
        module: 'saas_management',
        status:
          saasManagementStats.overallSaasHealthStatus === 'healthy'
            ? 'healthy'
            : saasManagementStats.overallSaasHealthStatus === 'degraded'
              ? 'warning'
              : 'critical',
        summary: `${saasManagementStats.activeSubscriptionCount} active subscription(s), ${saasManagementStats.trialExpirationCount} trial(s), ${saasManagementStats.failedPaymentCount} failed payment(s), ${saasManagementStats.openAlertCount} SaaS alert(s)`,
        metrics: saasManagementStats as unknown as Record<string, unknown>,
      },
      {
        module: 'voice_reception',
        status:
          voiceReceptionStats.overallVoiceHealthStatus === 'healthy'
            ? 'healthy'
            : voiceReceptionStats.overallVoiceHealthStatus === 'degraded'
              ? 'warning'
              : 'critical',
        summary: `${voiceReceptionStats.activeCallCount} active call(s), ${voiceReceptionStats.missedCallCount} missed call(s), ${voiceReceptionStats.openAlertCount} voice alert(s), AI receptionist ${voiceReceptionStats.aiReceptionistEnabled ? 'enabled' : 'disabled'}`,
        metrics: voiceReceptionStats as unknown as Record<string, unknown>,
      },
      {
        module: 'document_ai',
        status:
          documentAiStats.overallDocumentAiHealthStatus === 'healthy'
            ? 'healthy'
            : documentAiStats.overallDocumentAiHealthStatus === 'degraded'
              ? 'warning'
              : 'critical',
        summary: `${documentAiStats.pendingOcrCount} OCR job(s) queued, ${documentAiStats.failedOcrCount} failed extraction(s), ${documentAiStats.reviewBacklogCount} review item(s), ${documentAiStats.expiringDocumentCount} expiring document(s), ${documentAiStats.duplicateAlertCount} duplicate alert(s)`,
        metrics: documentAiStats as unknown as Record<string, unknown>,
      },
      {
        module: 'business_continuity',
        status:
          businessContinuityStats.overallBusinessContinuityHealthStatus === 'healthy'
            ? 'healthy'
            : businessContinuityStats.overallBusinessContinuityHealthStatus === 'degraded'
              ? 'warning'
              : 'critical',
        summary: `${businessContinuityStats.failedBackupCount} failed backup(s), restore ${businessContinuityStats.restoreReadinessStatus}, recovery ${businessContinuityStats.recoveryReadinessStatus}, ${businessContinuityStats.verificationFailureCount} verification failure(s), ${businessContinuityStats.openAlertCount} alert(s)`,
        metrics: businessContinuityStats as unknown as Record<string, unknown>,
      },
      {
        module: 'global_search',
        status:
          globalSearchStats.overallSearchHealthStatus === 'healthy'
            ? 'healthy'
            : globalSearchStats.overallSearchHealthStatus === 'degraded'
              ? 'warning'
              : 'critical',
        summary: `${globalSearchStats.indexedCount} indexed record(s), ${globalSearchStats.failedIndexCount} failed index(es), ${globalSearchStats.pendingIndexCount} pending, ${globalSearchStats.timelineEntryCount} timeline event(s), ${globalSearchStats.openAlertCount} alert(s)`,
        metrics: globalSearchStats as unknown as Record<string, unknown>,
      },
      {
        module: 'data_migration',
        status:
          dataMigrationStats.overallMigrationHealthStatus === 'healthy'
            ? 'healthy'
            : dataMigrationStats.overallMigrationHealthStatus === 'degraded'
              ? 'warning'
              : 'critical',
        summary: `${dataMigrationStats.activeImportCount} active import(s), ${dataMigrationStats.failedImportCount} failed import(s), ${dataMigrationStats.rollbackAvailableCount} rollback available, ${dataMigrationStats.activeExportCount} export job(s), ${dataMigrationStats.openAlertCount} alert(s)`,
        metrics: dataMigrationStats as unknown as Record<string, unknown>,
      },
      {
        module: 'notifications',
        status:
          notificationStats.overallNotificationHealthStatus === 'healthy'
            ? 'healthy'
            : notificationStats.overallNotificationHealthStatus === 'degraded'
              ? 'warning'
              : 'critical',
        summary: `${notificationStats.activeAlertCount} active alert(s), ${notificationStats.failedDeliveryCount} failed delivery(s), ${notificationStats.pendingEscalationCount} pending escalation(s), ${notificationStats.queuedDeliveryCount} queued delivery(s), ${notificationStats.openAlertCount} platform alert(s)`,
        metrics: notificationStats as unknown as Record<string, unknown>,
      },
      {
        module: 'platform_health',
        status:
          platformHealthStats.overallPlatformHealthStatus === 'healthy'
            ? 'healthy'
            : platformHealthStats.overallPlatformHealthStatus === 'degraded'
              ? 'warning'
              : 'critical',
        summary: `Health score ${platformHealthStats.overallHealthScore ?? '—'}, ${platformHealthStats.criticalIncidentCount} critical incident(s), ${platformHealthStats.failedDiagnosticCount} failed diagnostic(s), ${platformHealthStats.degradedServiceCount} degraded service(s), ${platformHealthStats.openAlertCount} alert(s)`,
        metrics: platformHealthStats as unknown as Record<string, unknown>,
      },
      {
        module: 'launch_center',
        status:
          launchCenterStats.overallLaunchReadinessStatus === 'healthy'
            ? 'healthy'
            : launchCenterStats.overallLaunchReadinessStatus === 'warning'
              ? 'warning'
              : launchCenterStats.overallLaunchReadinessStatus === 'degraded'
                ? 'warning'
                : 'critical',
        summary: `Readiness score ${launchCenterStats.overallScore ?? '—'}, ${launchCenterStats.criticalBlockerCount} critical blocker(s), ${launchCenterStats.failedCheckCount} failed check(s), ${launchCenterStats.pendingApprovalCount} pending approval(s), ${launchCenterStats.openAlertCount} alert(s)`,
        metrics: launchCenterStats as unknown as Record<string, unknown>,
      },
      {
        module: 'release_center',
        status:
          releaseCenterStats.overallReleaseStatus === 'healthy'
            ? 'healthy'
            : releaseCenterStats.overallReleaseStatus === 'warning'
              ? 'warning'
              : 'critical',
        summary: `Readiness score ${releaseCenterStats.readinessScore ?? '—'}, ${releaseCenterStats.failedValidationCount} failed validation(s), ${releaseCenterStats.warningCount} warning(s), ${releaseCenterStats.openAlertCount} alert(s)`,
        metrics: releaseCenterStats as unknown as Record<string, unknown>,
      },
      {
        module: 'production_launch',
        status:
          productionLaunchStats.overallProductionStatus === 'healthy'
            ? 'healthy'
            : productionLaunchStats.overallProductionStatus === 'warning'
              ? 'warning'
              : 'critical',
        summary: `Launch status ${productionLaunchStats.launchStatus}, ${productionLaunchStats.failedProviderCount} provider failure(s), ${productionLaunchStats.pendingApprovalCount} pending approval(s), ${productionLaunchStats.openAlertCount} alert(s)`,
        metrics: productionLaunchStats as unknown as Record<string, unknown>,
      },
      {
        module: 'release_management',
        status:
          releaseManagementStats.overallReleaseStatus === 'healthy'
            ? 'healthy'
            : releaseManagementStats.overallReleaseStatus === 'warning'
              ? 'warning'
              : 'critical',
        summary: `Release status ${releaseManagementStats.releaseStatus}, documentation ${releaseManagementStats.documentationCompleteness}%, ${releaseManagementStats.pendingChecklistCount} pending checklist item(s), ${releaseManagementStats.openAlertCount} alert(s)`,
        metrics: releaseManagementStats as unknown as Record<string, unknown>,
      },
      {
        module: 'customers',
        status: customers.length > 0 ? 'healthy' : 'warning',
        summary: `${customers.length} customer record(s)`,
        metrics: { count: customers.length },
      },
      {
        module: 'automation',
        status: automationMonitoring.failedCount > 0 ? 'warning' : 'healthy',
        summary: `${automationMonitoring.runningCount} running, ${automationMonitoring.failedCount} failed`,
        metrics: automationMonitoring as unknown as Record<string, unknown>,
      },
      {
        module: 'security',
        status: securityContext.riskAlertCount > 0 ? 'warning' : 'healthy',
        summary: securityContext.summary,
        metrics: securityContext as unknown as Record<string, unknown>,
      },
      {
        module: 'integrations',
        status: integrationContext.errorServiceCount > 0 ? 'warning' : 'healthy',
        summary: integrationContext.summary,
        metrics: integrationContext as unknown as Record<string, unknown>,
      },
      {
        module: 'digital_twin',
        status: twinContext.operationalRiskLevel === 'high' ? 'critical' : 'healthy',
        summary: twinContext.summary,
        metrics: twinContext as unknown as Record<string, unknown>,
      },
      {
        module: 'knowledge_graph',
        status: knowledgeContext.entityCount > 0 ? 'healthy' : 'warning',
        summary: knowledgeContext.summary,
        metrics: knowledgeContext as unknown as Record<string, unknown>,
      },
    ];
  }

  private async buildItOperationsModuleStats(companyId: string) {
    const [incidents, alerts, monitors, healingActions] = await Promise.all([
      this.deps.db.query.itoIncidents.findMany({
        where: eq(itoIncidents.companyId, companyId),
        columns: { id: true, status: true },
      }),
      this.deps.db.query.itoItAlerts.findMany({
        where: and(eq(itoItAlerts.companyId, companyId), eq(itoItAlerts.status, 'open')),
        columns: { id: true },
      }),
      this.deps.db.query.itoHealthMonitors.findMany({
        where: eq(itoHealthMonitors.companyId, companyId),
        columns: { id: true, healthStatus: true },
      }),
      this.deps.db.query.itoSelfHealingActions.findMany({
        where: and(
          eq(itoSelfHealingActions.companyId, companyId),
          eq(itoSelfHealingActions.workflowStatus, 'executed'),
        ),
        columns: { id: true },
        limit: 100,
      }),
    ]);

    const openIncidentCount = incidents.filter(
      (i) => !['resolved', 'closed'].includes(i.status),
    ).length;
    const openAlertCount = alerts.length;
    const degradedMonitorCount = monitors.filter(
      (m) => m.healthStatus === 'degraded' || m.healthStatus === 'unhealthy',
    ).length;
    const unhealthyMonitorCount = monitors.filter((m) => m.healthStatus === 'unhealthy').length;
    const overallHealthStatus =
      openIncidentCount > 0 || unhealthyMonitorCount > 0
        ? 'unhealthy'
        : degradedMonitorCount > 0 || openAlertCount > 0
          ? 'degraded'
          : 'healthy';

    return {
      openIncidentCount,
      openAlertCount,
      degradedMonitorCount,
      monitorCount: monitors.length,
      selfHealingSuccessCount: healingActions.length,
      overallHealthStatus,
    };
  }

  private async buildBusinessEvolutionModuleStats(companyId: string) {
    const [recommendations, experiments, alerts, lessons] = await Promise.all([
      this.deps.db.query.bevRecommendations.findMany({
        where: eq(bevRecommendations.companyId, companyId),
        columns: { id: true, workflowStatus: true },
      }),
      this.deps.db.query.bevExperiments.findMany({
        where: eq(bevExperiments.companyId, companyId),
        columns: { id: true, workflowStatus: true },
      }),
      this.deps.db.query.bevEvolutionAlerts.findMany({
        where: and(
          eq(bevEvolutionAlerts.companyId, companyId),
          eq(bevEvolutionAlerts.status, 'open'),
        ),
        columns: { id: true },
      }),
      this.deps.db.query.bevKnowledgeReinforcements.findMany({
        where: and(
          eq(bevKnowledgeReinforcements.companyId, companyId),
          eq(bevKnowledgeReinforcements.learningStage, 'validated'),
        ),
        columns: { id: true },
        limit: 100,
      }),
    ]);

    const openRecommendationCount = recommendations.filter(
      (r) => !['validated', 'rejected', 'rolled_back', 'failed'].includes(r.workflowStatus),
    ).length;
    const activeExperimentCount = experiments.filter((e) =>
      ['active', 'scheduled', 'approved'].includes(e.workflowStatus),
    ).length;
    const openAlertCount = alerts.length;
    const validatedLessonCount = lessons.length;
    const overallLearningStatus =
      openAlertCount > 0
        ? 'degraded'
        : openRecommendationCount > 0 || activeExperimentCount > 0
          ? 'healthy'
          : 'healthy';

    return {
      openRecommendationCount,
      activeExperimentCount,
      openAlertCount,
      validatedLessonCount,
      overallLearningStatus,
    };
  }

  private async buildAppBuilderModuleStats(companyId: string) {
    const [featureRequests, workspaces, approvals, testRuns, deployments, alerts] =
      await Promise.all([
        this.deps.db.query.abFeatureRequests.findMany({
          where: eq(abFeatureRequests.companyId, companyId),
          columns: { id: true, workflowStatus: true },
        }),
        this.deps.db.query.abDevelopmentWorkspaces.findMany({
          where: eq(abDevelopmentWorkspaces.companyId, companyId),
          columns: { id: true, status: true },
        }),
        this.deps.db.query.abApprovalRecords.findMany({
          where: eq(abApprovalRecords.companyId, companyId),
          columns: { id: true, workflowStatus: true },
        }),
        this.deps.db.query.abTestRuns.findMany({
          where: eq(abTestRuns.companyId, companyId),
          columns: { id: true, workflowStatus: true },
        }),
        this.deps.db.query.abDeployments.findMany({
          where: eq(abDeployments.companyId, companyId),
          columns: { id: true, workflowStatus: true },
        }),
        this.deps.db.query.abAppBuilderAlerts.findMany({
          where: and(
            eq(abAppBuilderAlerts.companyId, companyId),
            eq(abAppBuilderAlerts.status, 'open'),
          ),
          columns: { id: true },
        }),
      ]);

    const activeFeatureRequestCount = featureRequests.filter(
      (request) =>
        !['deployed', 'rejected', 'rolled_back', 'cancelled'].includes(request.workflowStatus),
    ).length;
    const activeWorkspaceCount = workspaces.filter(
      (workspace) => workspace.status === 'active',
    ).length;
    const pendingApprovalCount = approvals.filter(
      (approval) => approval.workflowStatus === 'pending',
    ).length;
    const failedTestCount = testRuns.filter(
      (testRun) => testRun.workflowStatus === 'failed',
    ).length;
    const failedDeploymentCount = deployments.filter(
      (deployment) => deployment.workflowStatus === 'failed',
    ).length;
    const openAlertCount = alerts.length;
    const overallBuildHealthStatus =
      openAlertCount > 0 || failedTestCount > 0 || failedDeploymentCount > 0
        ? 'degraded'
        : pendingApprovalCount > 0 || activeFeatureRequestCount > 0
          ? 'healthy'
          : 'healthy';

    return {
      activeFeatureRequestCount,
      activeWorkspaceCount,
      pendingApprovalCount,
      failedTestCount,
      failedDeploymentCount,
      openAlertCount,
      overallBuildHealthStatus,
    };
  }

  private async buildIndustryPacksModuleStats(companyId: string) {
    const [installations, frameworks, certificates, alerts] = await Promise.all([
      this.deps.db.query.ipPackInstallations.findMany({
        where: eq(ipPackInstallations.companyId, companyId),
        columns: { id: true, status: true },
      }),
      this.deps.db.query.ipComplianceFrameworks.findMany({
        where: eq(ipComplianceFrameworks.companyId, companyId),
        columns: { id: true, workflowStatus: true },
      }),
      this.deps.db.query.ipCertificates.findMany({
        where: eq(ipCertificates.companyId, companyId),
        columns: { id: true, status: true },
      }),
      this.deps.db.query.ipIndustryAlerts.findMany({
        where: and(eq(ipIndustryAlerts.companyId, companyId), eq(ipIndustryAlerts.status, 'open')),
        columns: { id: true, alertType: true },
      }),
    ]);

    const activePackCount = installations.filter((i) => i.status === 'installed').length;
    const draftFrameworkCount = frameworks.filter((f) => f.workflowStatus === 'draft').length;
    const pendingCertificateCount = certificates.filter(
      (c) => c.status === 'pending_approval',
    ).length;
    const openAlertCount = alerts.length;
    const openComplianceAlertCount = alerts.filter((a) =>
      a.alertType.includes('compliance'),
    ).length;
    const overallIndustryHealthStatus =
      openAlertCount > 2
        ? 'critical'
        : openAlertCount > 0 || pendingCertificateCount > 0
          ? 'degraded'
          : 'healthy';

    return {
      activePackCount,
      installedPackCount: installations.length,
      draftFrameworkCount,
      pendingCertificateCount,
      openComplianceAlertCount,
      openAlertCount,
      overallIndustryHealthStatus,
    };
  }

  private async buildPublicDeveloperModuleStats(companyId: string) {
    const [alerts, rateLimitPolicies, sdkGenerations] = await Promise.all([
      this.deps.db.query.pdpDeveloperAlerts.findMany({
        where: and(
          eq(pdpDeveloperAlerts.companyId, companyId),
          eq(pdpDeveloperAlerts.status, 'open'),
        ),
        columns: { id: true, alertType: true, severity: true },
      }),
      this.deps.db.query.pdpRateLimitPolicies.findMany({
        where: eq(pdpRateLimitPolicies.companyId, companyId),
        columns: { id: true },
      }),
      this.deps.db.query.pdpSdkGenerationRecords.findMany({
        where: eq(pdpSdkGenerationRecords.companyId, companyId),
        columns: { id: true, language: true },
        limit: 100,
      }),
    ]);

    const openAlertCount = alerts.length;
    const criticalAlertCount = alerts.filter((a) => a.severity === 'critical').length;
    const webhookFailureCount = alerts.filter((a) => a.alertType.includes('webhook')).length;
    const rateLimitAlertCount = alerts.filter((a) => a.alertType.includes('rate_limit')).length;
    const overallDeveloperHealthStatus =
      criticalAlertCount > 0 || openAlertCount > 3
        ? 'critical'
        : openAlertCount > 0 || webhookFailureCount > 0
          ? 'degraded'
          : 'healthy';

    return {
      openAlertCount,
      criticalAlertCount,
      webhookFailureCount,
      rateLimitAlertCount,
      rateLimitPolicyCount: rateLimitPolicies.length,
      sdkGenerationCount: sdkGenerations.length,
      overallDeveloperHealthStatus,
    };
  }

  private async buildSaasManagementModuleStats(companyId: string) {
    const [alerts, licenses, analytics] = await Promise.all([
      this.deps.db.query.smSaasAlerts.findMany({
        where: and(eq(smSaasAlerts.companyId, companyId), eq(smSaasAlerts.status, 'open')),
        columns: { id: true, alertType: true, severity: true },
      }),
      this.deps.db.query.smLicenseRecords.findMany({
        where: eq(smLicenseRecords.companyId, companyId),
        columns: { id: true, status: true },
      }),
      this.deps.db.query.smAnalyticsSnapshots.findFirst({
        where: eq(smAnalyticsSnapshots.companyId, companyId),
        orderBy: [desc(smAnalyticsSnapshots.capturedAt)],
      }),
    ]);

    const openAlertCount = alerts.length;
    const criticalAlertCount = alerts.filter((a) => a.severity === 'critical').length;
    const failedPaymentCount = alerts.filter((a) => a.alertType === 'payment_failed').length;
    const trialExpirationCount = alerts.filter((a) => a.alertType.includes('trial')).length;
    const activeLicenseCount = licenses.filter((l) => l.status === 'active').length;
    const metrics = (analytics?.metrics ?? {}) as Record<string, unknown>;
    const activeSubscriptionCount =
      typeof metrics.activeSubscriptions === 'number' ? metrics.activeSubscriptions : 0;
    const overallSaasHealthStatus =
      criticalAlertCount > 0 || failedPaymentCount > 2
        ? 'critical'
        : openAlertCount > 0 || failedPaymentCount > 0
          ? 'degraded'
          : 'healthy';

    return {
      openAlertCount,
      criticalAlertCount,
      failedPaymentCount,
      trialExpirationCount,
      activeSubscriptionCount,
      activeLicenseCount,
      licenseCount: licenses.length,
      overallSaasHealthStatus,
    };
  }

  private async buildVoiceReceptionModuleStats(companyId: string) {
    const [alerts, aiConfig, analytics, voiceSessionsRows] = await Promise.all([
      this.deps.db.query.vrVoiceAlerts.findMany({
        where: and(eq(vrVoiceAlerts.companyId, companyId), eq(vrVoiceAlerts.status, 'open')),
        columns: { id: true, alertType: true, severity: true },
      }),
      this.deps.db.query.vrAiReceptionistConfig.findFirst({
        where: eq(vrAiReceptionistConfig.companyId, companyId),
        columns: { enabled: true },
      }),
      this.deps.db.query.vrAnalyticsSnapshots.findFirst({
        where: eq(vrAnalyticsSnapshots.companyId, companyId),
        orderBy: [desc(vrAnalyticsSnapshots.capturedAt)],
      }),
      this.deps.db.query.voiceSessions.findMany({
        where: eq(voiceSessions.companyId, companyId),
        columns: { id: true, status: true },
        limit: 200,
      }),
    ]);

    const openAlertCount = alerts.length;
    const criticalAlertCount = alerts.filter((a) => a.severity === 'critical').length;
    const activeCallCount = voiceSessionsRows.filter((s) => s.status === 'active').length;
    const missedCallCount = voiceSessionsRows.filter(
      (s) => s.status === 'missed' || s.status === 'abandoned',
    ).length;
    const aiReceptionistEnabled = aiConfig?.enabled ?? false;
    const metrics = (analytics?.metrics ?? {}) as Record<string, unknown>;
    const queuedCallCount =
      typeof metrics.queuedCallCount === 'number' ? metrics.queuedCallCount : 0;
    const overallVoiceHealthStatus =
      criticalAlertCount > 0
        ? 'critical'
        : openAlertCount > 0 || missedCallCount > 10
          ? 'degraded'
          : 'healthy';

    return {
      openAlertCount,
      criticalAlertCount,
      activeCallCount,
      missedCallCount,
      queuedCallCount,
      aiReceptionistEnabled,
      emergencyRoutingConfigured: alerts.every(
        (a) => a.alertType !== 'emergency_routing_unconfigured',
      ),
      overallVoiceHealthStatus,
    };
  }

  private async buildDocumentAiModuleStats(companyId: string) {
    const [alerts, ocrProviders, analytics, ocrJobs, reviewQueue] = await Promise.all([
      this.deps.db.query.dipDocumentAlerts.findMany({
        where: and(
          eq(dipDocumentAlerts.companyId, companyId),
          eq(dipDocumentAlerts.status, 'open'),
        ),
        columns: { id: true, alertType: true, severity: true },
      }),
      this.deps.db.query.dipOcrProviderConfigs.findMany({
        where: eq(dipOcrProviderConfigs.companyId, companyId),
        columns: { id: true, enabled: true },
      }),
      this.deps.db.query.dipAnalyticsSnapshots.findFirst({
        where: eq(dipAnalyticsSnapshots.companyId, companyId),
        orderBy: [desc(dipAnalyticsSnapshots.capturedAt)],
      }),
      this.deps.db.query.dipOcrJobs.findMany({
        where: eq(dipOcrJobs.companyId, companyId),
        columns: { id: true, status: true },
        limit: 500,
      }),
      this.deps.db.query.dipReviewQueueItems.findMany({
        where: and(
          eq(dipReviewQueueItems.companyId, companyId),
          inArray(dipReviewQueueItems.status, ['pending', 'in_review']),
        ),
        columns: { id: true, status: true },
      }),
    ]);

    const openAlertCount = alerts.length;
    const criticalAlertCount = alerts.filter((a) => a.severity === 'critical').length;
    const pendingOcrCount = ocrJobs.filter(
      (j) => j.status === 'pending' || j.status === 'processing',
    ).length;
    const failedOcrCount = ocrJobs.filter((j) => j.status === 'failed').length;
    const reviewBacklogCount = reviewQueue.length;
    const metrics = (analytics?.metrics ?? {}) as Record<string, unknown>;
    const expiringDocumentCount =
      typeof metrics.expiringDocumentCount === 'number'
        ? metrics.expiringDocumentCount
        : alerts.filter((a) => a.alertType === 'expiry' || a.alertType === 'expiring_document')
            .length;
    const duplicateAlertCount =
      typeof metrics.duplicateAlertCount === 'number'
        ? metrics.duplicateAlertCount
        : alerts.filter((a) => a.alertType === 'duplicate').length;
    const platformEnabled = ocrProviders.some((p) => p.enabled);
    const overallDocumentAiHealthStatus =
      criticalAlertCount > 0 || failedOcrCount > 5
        ? 'critical'
        : openAlertCount > 0 || reviewBacklogCount > 10 || failedOcrCount > 0
          ? 'degraded'
          : 'healthy';

    return {
      openAlertCount,
      criticalAlertCount,
      pendingOcrCount,
      failedOcrCount,
      reviewBacklogCount,
      expiringDocumentCount,
      duplicateAlertCount,
      platformEnabled,
      overallDocumentAiHealthStatus,
    };
  }

  private async buildBusinessContinuityModuleStats(companyId: string) {
    const [alerts, analytics, backupJobs, verificationRecords] = await Promise.all([
      this.deps.db.query.bcContinuityAlerts.findMany({
        where: and(
          eq(bcContinuityAlerts.companyId, companyId),
          eq(bcContinuityAlerts.status, 'open'),
        ),
        columns: { id: true, alertType: true, severity: true },
      }),
      this.deps.db.query.bcAnalyticsSnapshots.findFirst({
        where: eq(bcAnalyticsSnapshots.companyId, companyId),
        orderBy: [desc(bcAnalyticsSnapshots.capturedAt)],
      }),
      this.deps.db.query.bcBackupJobs.findMany({
        where: eq(bcBackupJobs.companyId, companyId),
        columns: { id: true, status: true, completedAt: true },
        limit: 200,
      }),
      this.deps.db.query.bcVerificationRecords.findMany({
        where: eq(bcVerificationRecords.companyId, companyId),
        columns: { id: true, status: true, passed: true },
        limit: 100,
      }),
    ]);

    const openAlertCount = alerts.length;
    const criticalAlertCount = alerts.filter(
      (a: { severity: string }) => a.severity === 'critical',
    ).length;
    const failedBackupCount = backupJobs.filter(
      (j: { status: string }) => j.status === 'failed',
    ).length;
    const verificationFailureCount = verificationRecords.filter(
      (v: { status: string; passed: boolean | null }) =>
        v.status === 'failed' || v.passed === false,
    ).length;
    const metrics = (analytics?.metrics ?? {}) as Record<string, unknown>;
    const restoreReadinessStatus =
      typeof metrics.restoreReadinessStatus === 'string'
        ? metrics.restoreReadinessStatus
        : verificationFailureCount > 0
          ? 'not_ready'
          : 'ready';
    const recoveryReadinessStatus =
      typeof metrics.recoveryReadinessStatus === 'string'
        ? metrics.recoveryReadinessStatus
        : failedBackupCount > 0
          ? 'degraded'
          : 'ready';
    const overallBusinessContinuityHealthStatus =
      criticalAlertCount > 0 || failedBackupCount > 3
        ? 'critical'
        : openAlertCount > 0 || verificationFailureCount > 0
          ? 'degraded'
          : 'healthy';

    return {
      openAlertCount,
      criticalAlertCount,
      failedBackupCount,
      verificationFailureCount,
      restoreReadinessStatus,
      recoveryReadinessStatus,
      overallBusinessContinuityHealthStatus,
    };
  }

  private async buildGlobalSearchModuleStats(companyId: string) {
    const [alerts, analytics, indexEntries, timelineEntries] = await Promise.all([
      this.deps.db.query.gsSearchAlerts.findMany({
        where: and(eq(gsSearchAlerts.companyId, companyId), eq(gsSearchAlerts.status, 'open')),
        columns: { id: true, alertType: true, severity: true },
      }),
      this.deps.db.query.gsAnalyticsSnapshots.findFirst({
        where: eq(gsAnalyticsSnapshots.companyId, companyId),
        orderBy: [desc(gsAnalyticsSnapshots.capturedAt)],
      }),
      this.deps.db.query.gsSearchIndexEntries.findMany({
        where: eq(gsSearchIndexEntries.companyId, companyId),
        columns: { id: true, status: true },
        limit: 1000,
      }),
      this.deps.db.query.gsTimelineEntries.findMany({
        where: eq(gsTimelineEntries.companyId, companyId),
        columns: { id: true },
        limit: 200,
      }),
    ]);

    const openAlertCount = alerts.length;
    const criticalAlertCount = alerts.filter(
      (a: { severity: string }) => a.severity === 'critical',
    ).length;
    const indexedCount = indexEntries.filter(
      (e: { status: string }) => e.status === 'indexed',
    ).length;
    const pendingIndexCount = indexEntries.filter(
      (e: { status: string }) => e.status === 'pending',
    ).length;
    const failedIndexCount = indexEntries.filter(
      (e: { status: string }) => e.status === 'failed',
    ).length;
    const timelineEntryCount = timelineEntries.length;
    const metrics = (analytics?.metrics ?? {}) as Record<string, unknown>;
    const overallSearchHealthStatus =
      criticalAlertCount > 0 || failedIndexCount > 10
        ? 'critical'
        : openAlertCount > 0 || pendingIndexCount > 20
          ? 'degraded'
          : 'healthy';

    return {
      openAlertCount,
      criticalAlertCount,
      indexedCount,
      pendingIndexCount,
      failedIndexCount,
      timelineEntryCount,
      recentSearchCount:
        typeof metrics.recentSearchCount === 'number' ? metrics.recentSearchCount : 0,
      overallSearchHealthStatus,
    };
  }

  private async buildDataMigrationModuleStats(companyId: string) {
    const [alerts, analytics, importJobs, exportJobs] = await Promise.all([
      this.deps.db.query.dmMigrationAlerts.findMany({
        where: and(
          eq(dmMigrationAlerts.companyId, companyId),
          eq(dmMigrationAlerts.status, 'open'),
        ),
        columns: { id: true, alertType: true, severity: true },
      }),
      this.deps.db.query.dmAnalyticsSnapshots.findFirst({
        where: eq(dmAnalyticsSnapshots.companyId, companyId),
        orderBy: [desc(dmAnalyticsSnapshots.capturedAt)],
      }),
      this.deps.db.query.dmImportJobs.findMany({
        where: eq(dmImportJobs.companyId, companyId),
        columns: { id: true, status: true, rollbackStatus: true },
        limit: 200,
      }),
      this.deps.db.query.dmExportJobs.findMany({
        where: eq(dmExportJobs.companyId, companyId),
        columns: { id: true, status: true },
        limit: 100,
      }),
    ]);

    const openAlertCount = alerts.length;
    const criticalAlertCount = alerts.filter(
      (a: { severity: string }) => a.severity === 'critical',
    ).length;
    const activeImportCount = importJobs.filter((j: { status: string }) =>
      ['importing', 'pending_approval', 'approved'].includes(j.status),
    ).length;
    const failedImportCount = importJobs.filter(
      (j: { status: string }) => j.status === 'failed',
    ).length;
    const rollbackAvailableCount = importJobs.filter(
      (j: { rollbackStatus: string }) => j.rollbackStatus === 'available',
    ).length;
    const activeExportCount = exportJobs.filter(
      (j: { status: string }) => j.status === 'running' || j.status === 'pending',
    ).length;
    const failedExportCount = exportJobs.filter(
      (j: { status: string }) => j.status === 'failed',
    ).length;
    const overallMigrationHealthStatus =
      criticalAlertCount > 0 || failedImportCount > 5
        ? 'critical'
        : openAlertCount > 0 || failedExportCount > 0
          ? 'degraded'
          : 'healthy';

    return {
      openAlertCount,
      criticalAlertCount,
      activeImportCount,
      failedImportCount,
      rollbackAvailableCount,
      activeExportCount,
      failedExportCount,
      analyticsMetrics: (analytics?.metrics ?? {}) as Record<string, unknown>,
      overallMigrationHealthStatus,
    };
  }

  private async buildNotificationsModuleStats(companyId: string) {
    const [platformAlerts, analytics, deliveryJobs, alerts, escalations] = await Promise.all([
      this.deps.db.query.ncPlatformAlerts.findMany({
        where: and(eq(ncPlatformAlerts.companyId, companyId), eq(ncPlatformAlerts.status, 'open')),
        columns: { id: true, alertType: true, severity: true },
      }),
      this.deps.db.query.ncAnalyticsSnapshots.findFirst({
        where: eq(ncAnalyticsSnapshots.companyId, companyId),
        orderBy: [desc(ncAnalyticsSnapshots.capturedAt)],
      }),
      this.deps.db.query.ncDeliveryJobs.findMany({
        where: eq(ncDeliveryJobs.companyId, companyId),
        columns: { id: true, status: true },
        limit: 200,
      }),
      this.deps.db.query.ncAlerts.findMany({
        where: and(eq(ncAlerts.companyId, companyId), eq(ncAlerts.status, 'open')),
        columns: { id: true, alertLevel: true },
        limit: 200,
      }),
      this.deps.db.query.ncEscalations.findMany({
        where: and(eq(ncEscalations.companyId, companyId), eq(ncEscalations.status, 'pending')),
        columns: { id: true },
        limit: 100,
      }),
    ]);

    const openAlertCount = platformAlerts.length;
    const criticalAlertCount = platformAlerts.filter(
      (a: { severity: string }) => a.severity === 'critical',
    ).length;
    const activeAlertCount = alerts.length;
    const failedDeliveryCount = deliveryJobs.filter(
      (j: { status: string }) => j.status === 'failed',
    ).length;
    const queuedDeliveryCount = deliveryJobs.filter(
      (j: { status: string }) => j.status === 'queued',
    ).length;
    const pendingEscalationCount = escalations.length;
    const overallNotificationHealthStatus =
      criticalAlertCount > 0 || failedDeliveryCount > 10
        ? 'critical'
        : openAlertCount > 0 || pendingEscalationCount > 5
          ? 'degraded'
          : 'healthy';

    return {
      openAlertCount,
      criticalAlertCount,
      activeAlertCount,
      failedDeliveryCount,
      queuedDeliveryCount,
      pendingEscalationCount,
      analyticsMetrics: (analytics?.metrics ?? {}) as Record<string, unknown>,
      overallNotificationHealthStatus,
    };
  }

  private async buildPlatformHealthModuleStats(companyId: string) {
    const [
      platformAlerts,
      analytics,
      healthSnapshots,
      diagnosticRuns,
      capacitySnapshots,
      incidents,
    ] = await Promise.all([
      this.deps.db.query.phPlatformAlerts.findMany({
        where: and(eq(phPlatformAlerts.companyId, companyId), eq(phPlatformAlerts.status, 'open')),
        columns: { id: true, alertType: true, severity: true },
      }),
      this.deps.db.query.phAnalyticsSnapshots.findFirst({
        where: eq(phAnalyticsSnapshots.companyId, companyId),
        orderBy: [desc(phAnalyticsSnapshots.capturedAt)],
      }),
      this.deps.db.query.phHealthSnapshots.findFirst({
        where: eq(phHealthSnapshots.companyId, companyId),
        orderBy: [desc(phHealthSnapshots.capturedAt)],
      }),
      this.deps.db.query.phDiagnosticRuns.findMany({
        where: eq(phDiagnosticRuns.companyId, companyId),
        columns: { id: true, failedCount: true, status: true },
        limit: 10,
      }),
      this.deps.db.query.phCapacitySnapshots.findFirst({
        where: eq(phCapacitySnapshots.companyId, companyId),
        orderBy: [desc(phCapacitySnapshots.capturedAt)],
      }),
      this.deps.db.query.itoIncidents.findMany({
        where: eq(itoIncidents.companyId, companyId),
        columns: { id: true, severity: true, status: true },
        limit: 100,
      }),
    ]);

    const openAlertCount = platformAlerts.length;
    const criticalAlertCount = platformAlerts.filter(
      (a: { severity: string }) => a.severity === 'critical',
    ).length;
    const openIncidents = incidents.filter(
      (i: { status: string }) => !['resolved', 'closed'].includes(i.status),
    );
    const criticalIncidentCount = openIncidents.filter(
      (i: { severity: string }) => i.severity === 'critical',
    ).length;
    const failedDiagnosticCount = diagnosticRuns[0]?.failedCount ?? 0;
    const overallHealthScore = healthSnapshots?.overallHealthScore ?? null;
    const degradedServiceCount =
      healthSnapshots?.overallHealthStatus === 'degraded' ||
      healthSnapshots?.overallHealthStatus === 'unhealthy'
        ? 1
        : 0;
    const overallPlatformHealthStatus =
      criticalAlertCount > 0 || criticalIncidentCount > 0
        ? 'critical'
        : openAlertCount > 0 || failedDiagnosticCount > 0
          ? 'degraded'
          : 'healthy';

    return {
      openAlertCount,
      criticalAlertCount,
      criticalIncidentCount,
      failedDiagnosticCount,
      overallHealthScore,
      degradedServiceCount,
      capacityTrend:
        (capacitySnapshots?.forecast as Record<string, unknown> | undefined)?.trend ?? 'unknown',
      analyticsMetrics: (analytics?.metrics ?? {}) as Record<string, unknown>,
      overallPlatformHealthStatus,
    };
  }

  private async buildLaunchCenterModuleStats(companyId: string) {
    const [platformAlerts, latestScore, latestScan, pendingWizards, analytics] = await Promise.all([
      this.deps.db.query.lncPlatformAlerts.findMany({
        where: and(
          eq(lncPlatformAlerts.companyId, companyId),
          eq(lncPlatformAlerts.status, 'open'),
        ),
        columns: { id: true, alertType: true, severity: true },
      }),
      this.deps.db.query.lncReadinessScores.findFirst({
        where: eq(lncReadinessScores.companyId, companyId),
        orderBy: [desc(lncReadinessScores.capturedAt)],
      }),
      this.deps.db.query.lncReadinessScans.findFirst({
        where: eq(lncReadinessScans.companyId, companyId),
        orderBy: [desc(lncReadinessScans.createdAt)],
      }),
      this.deps.db.query.lncGoLiveWizards.findMany({
        where: eq(lncGoLiveWizards.companyId, companyId),
        columns: { id: true, status: true },
      }),
      this.deps.db.query.lncAnalyticsSnapshots.findFirst({
        where: eq(lncAnalyticsSnapshots.companyId, companyId),
        orderBy: [desc(lncAnalyticsSnapshots.capturedAt)],
      }),
    ]);

    const openAlertCount = platformAlerts.length;
    const criticalBlockerCount =
      latestScore?.criticalBlockerCount ?? latestScan?.criticalBlockerCount ?? 0;
    const failedCheckCount = latestScan?.failedCount ?? 0;
    const pendingApprovalCount = pendingWizards.filter(
      (w) => w.status === 'pending_approval',
    ).length;
    const overallScore = latestScore?.overallScore ?? null;
    const overallLaunchReadinessStatus =
      criticalBlockerCount > 0
        ? 'critical'
        : failedCheckCount > 0 || pendingApprovalCount > 0
          ? 'degraded'
          : latestScore?.overallStatus === 'ready'
            ? 'healthy'
            : 'warning';

    return {
      openAlertCount,
      overallScore,
      criticalBlockerCount,
      failedCheckCount,
      pendingApprovalCount,
      deploymentStatus: latestScore?.overallStatus ?? 'unknown',
      analyticsMetrics: (analytics?.metrics ?? {}) as Record<string, unknown>,
      overallLaunchReadinessStatus,
    };
  }

  private async buildReleaseCenterModuleStats(companyId: string) {
    const [platformAlerts, latestReport, latestIntegrationRun, latestWorkflowRun, analytics] =
      await Promise.all([
        this.deps.db.query.rcPlatformAlerts.findMany({
          where: and(
            eq(rcPlatformAlerts.companyId, companyId),
            eq(rcPlatformAlerts.status, 'open'),
          ),
          columns: { id: true, alertType: true, severity: true },
        }),
        this.deps.db.query.rcReleaseCandidateReports.findFirst({
          where: eq(rcReleaseCandidateReports.companyId, companyId),
          orderBy: [desc(rcReleaseCandidateReports.generatedAt)],
        }),
        this.deps.db.query.rcIntegrationValidationRuns.findFirst({
          where: eq(rcIntegrationValidationRuns.companyId, companyId),
          orderBy: [desc(rcIntegrationValidationRuns.createdAt)],
        }),
        this.deps.db.query.rcWorkflowValidationRuns.findFirst({
          where: eq(rcWorkflowValidationRuns.companyId, companyId),
          orderBy: [desc(rcWorkflowValidationRuns.createdAt)],
        }),
        this.deps.db.query.rcAnalyticsSnapshots.findFirst({
          where: eq(rcAnalyticsSnapshots.companyId, companyId),
          orderBy: [desc(rcAnalyticsSnapshots.capturedAt)],
        }),
      ]);

    const openAlertCount = platformAlerts.length;
    const failedValidationCount =
      latestReport?.failedValidationCount ??
      (latestIntegrationRun?.failedCount ?? 0) + (latestWorkflowRun?.failedCount ?? 0);
    const warningCount =
      latestReport?.warningCount ??
      (latestIntegrationRun?.warningCount ?? 0) + (latestWorkflowRun?.warningCount ?? 0);
    const readinessScore = latestReport?.readinessScore ?? null;
    const overallReleaseStatus =
      latestReport?.overallStatus === 'blocked' || latestReport?.overallStatus === 'not_ready'
        ? 'critical'
        : failedValidationCount > 0
          ? 'degraded'
          : latestReport?.overallStatus === 'ready'
            ? 'healthy'
            : 'warning';

    return {
      openAlertCount,
      readinessScore,
      failedValidationCount,
      warningCount,
      optimizationCount: latestReport?.optimizationCount ?? 0,
      overallStatus: latestReport?.overallStatus ?? 'unknown',
      analyticsMetrics: (analytics?.metrics ?? {}) as Record<string, unknown>,
      overallReleaseStatus,
    };
  }

  private async buildProductionLaunchModuleStats(companyId: string) {
    const [platformAlerts, latestIntegrationRun, pendingDeployments, pendingWizards, analytics] =
      await Promise.all([
        this.deps.db.query.plPlatformAlerts.findMany({
          where: and(
            eq(plPlatformAlerts.companyId, companyId),
            eq(plPlatformAlerts.status, 'open'),
          ),
          columns: { id: true, alertType: true, severity: true },
        }),
        this.deps.db.query.plLiveIntegrationVerificationRuns.findFirst({
          where: eq(plLiveIntegrationVerificationRuns.companyId, companyId),
          orderBy: [desc(plLiveIntegrationVerificationRuns.createdAt)],
        }),
        this.deps.db.query.plDeploymentPipelineRuns.findMany({
          where: eq(plDeploymentPipelineRuns.companyId, companyId),
          columns: { id: true, status: true },
        }),
        this.deps.db.query.plGoLiveWizards.findMany({
          where: eq(plGoLiveWizards.companyId, companyId),
          columns: { id: true, status: true },
        }),
        this.deps.db.query.plAnalyticsSnapshots.findFirst({
          where: eq(plAnalyticsSnapshots.companyId, companyId),
          orderBy: [desc(plAnalyticsSnapshots.capturedAt)],
        }),
      ]);

    const openAlertCount = platformAlerts.length;
    const failedProviderCount = latestIntegrationRun?.failedCount ?? 0;
    const pendingApprovalCount =
      pendingDeployments.filter((d) => d.status === 'pending_approval').length +
      pendingWizards.filter((w) => w.status === 'pending_approval').length;
    const launchStatus = pendingWizards.some((w) => w.status === 'launched')
      ? 'launched'
      : failedProviderCount > 0
        ? 'blocked'
        : pendingApprovalCount > 0
          ? 'warning'
          : 'ready';
    const overallProductionStatus =
      launchStatus === 'launched'
        ? 'healthy'
        : launchStatus === 'blocked'
          ? 'critical'
          : pendingApprovalCount > 0
            ? 'warning'
            : 'unknown';

    return {
      openAlertCount,
      launchStatus,
      failedProviderCount,
      pendingApprovalCount,
      connectedProviderCount: latestIntegrationRun?.connectedCount ?? 0,
      analyticsMetrics: (analytics?.metrics ?? {}) as Record<string, unknown>,
      overallProductionStatus,
    };
  }

  private async buildReleaseManagementModuleStats(companyId: string) {
    const [platformAlerts, versionRecord, checklistItems, documentationArtifacts, analytics] =
      await Promise.all([
        this.deps.db.query.rlmPlatformAlerts.findMany({
          where: and(
            eq(rlmPlatformAlerts.companyId, companyId),
            eq(rlmPlatformAlerts.status, 'open'),
          ),
          columns: { id: true, alertType: true, severity: true },
        }),
        this.deps.db.query.rlmVersionRecords.findFirst({
          where: eq(rlmVersionRecords.companyId, companyId),
          orderBy: [desc(rlmVersionRecords.createdAt)],
        }),
        this.deps.db.query.rlmLaunchChecklistItems.findMany({
          where: eq(rlmLaunchChecklistItems.companyId, companyId),
          columns: { id: true, status: true, isRequired: true },
        }),
        this.deps.db.query.rlmDocumentationArtifacts.findMany({
          where: eq(rlmDocumentationArtifacts.companyId, companyId),
          columns: { id: true, completenessPercent: true },
        }),
        this.deps.db.query.rlmAnalyticsSnapshots.findFirst({
          where: eq(rlmAnalyticsSnapshots.companyId, companyId),
          orderBy: [desc(rlmAnalyticsSnapshots.capturedAt)],
        }),
      ]);

    const openAlertCount = platformAlerts.length;
    const pendingChecklistCount = checklistItems.filter(
      (i) => i.isRequired && i.status === 'pending',
    ).length;
    const documentationCompleteness =
      documentationArtifacts.length > 0
        ? Math.round(
            documentationArtifacts.reduce((sum, doc) => sum + doc.completenessPercent, 0) /
              documentationArtifacts.length,
          )
        : 0;
    const releaseStatus = versionRecord?.status ?? 'unknown';
    const overallReleaseStatus =
      releaseStatus === 'ready' || releaseStatus === 'released'
        ? 'healthy'
        : releaseStatus === 'blocked' || releaseStatus === 'not_ready'
          ? 'critical'
          : pendingChecklistCount > 0 || documentationCompleteness < 80
            ? 'warning'
            : 'unknown';

    return {
      openAlertCount,
      releaseStatus,
      documentationCompleteness,
      pendingChecklistCount,
      versionNumber: versionRecord?.versionNumber ?? '1.0.0',
      analyticsMetrics: (analytics?.metrics ?? {}) as Record<string, unknown>,
      overallReleaseStatus,
    };
  }

  private resolveSystemHealth(healthScore: number | null, criticalCount: number): string {
    if (criticalCount > 0) return 'critical';
    if (healthScore == null) return 'unknown';
    if (healthScore >= 80) return 'healthy';
    if (healthScore >= 60) return 'warning';
    return 'critical';
  }

  private async upsertAlert(
    companyId: string,
    input: {
      category: MissionControlAlertSummary['category'];
      severity: MissionControlAlertSummary['severity'];
      title: string;
      description: string;
      sourceModule?: string;
      sourceEntityId?: string;
      context?: Record<string, unknown>;
    },
  ): Promise<MissionControlAlertSummary> {
    if (input.sourceEntityId) {
      const existing = await this.deps.db.query.missionControlAlerts.findFirst({
        where: and(
          eq(missionControlAlerts.companyId, companyId),
          eq(missionControlAlerts.sourceEntityId, input.sourceEntityId),
          inArray(missionControlAlerts.status, ['pending', 'acknowledged', 'escalated']),
        ),
      });
      if (existing) return toAlertSummary(existing);
    }

    const [row] = await this.deps.db
      .insert(missionControlAlerts)
      .values({
        companyId,
        category: input.category,
        severity: input.severity,
        title: input.title,
        description: input.description,
        sourceModule: input.sourceModule ?? null,
        sourceEntityId: input.sourceEntityId ?? null,
        context: input.context ?? {},
      })
      .returning();

    return toAlertSummary(row!);
  }

  private async ensureAlert(companyId: string, alertId: string) {
    const row = await this.deps.db.query.missionControlAlerts.findFirst({
      where: and(
        eq(missionControlAlerts.companyId, companyId),
        eq(missionControlAlerts.id, alertId),
      ),
    });
    if (!row) throw new EnterpriseMissionControlError('NOT_FOUND', 'Alert not found');
    return row;
  }

  private async ensureIncident(companyId: string, incidentId: string) {
    const row = await this.deps.db.query.missionControlIncidents.findFirst({
      where: and(
        eq(missionControlIncidents.companyId, companyId),
        eq(missionControlIncidents.id, incidentId),
      ),
    });
    if (!row) throw new EnterpriseMissionControlError('NOT_FOUND', 'Incident not found');
    return row;
  }
}

function mapExecutiveAlertCategory(alertType: string): MissionControlAlertSummary['category'] {
  if (
    alertType.includes('invoice') ||
    alertType.includes('revenue') ||
    alertType.includes('margin')
  )
    return 'financial';
  if (alertType.includes('stock')) return 'inventory';
  if (alertType.includes('customer')) return 'operational';
  return 'operational';
}

function toAlertSummary(row: typeof missionControlAlerts.$inferSelect): MissionControlAlertSummary {
  return {
    id: row.id,
    category: row.category,
    severity: row.severity,
    status: row.status,
    escalationLevel: row.escalationLevel,
    title: row.title,
    description: row.description,
    sourceModule: row.sourceModule,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toIncidentSummary(
  row: typeof missionControlIncidents.$inferSelect,
): MissionControlIncidentSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    ownerUserId: row.ownerUserId,
    rootCause: row.rootCause,
    resolutionSummary: row.resolutionSummary,
    branchKey: row.branchKey,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

function toMapPoint(
  row: typeof missionControlOperationsMap.$inferSelect,
): MissionControlOperationsMapPoint {
  return {
    id: row.id,
    mapType: row.mapType,
    label: row.label,
    latitude: row.latitude,
    longitude: row.longitude,
    entityType: row.entityType,
    entityId: row.entityId,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toTimelineSummary(
  row: typeof missionControlTimelineEvents.$inferSelect,
): MissionControlTimelineEventSummary {
  return {
    id: row.id,
    eventType: row.eventType,
    title: row.title,
    description: row.description,
    sourceModule: row.sourceModule,
    branchKey: row.branchKey,
    eventAt: row.eventAt.toISOString(),
  };
}

function toDepartmentHealthSummary(
  row: typeof missionControlDepartmentHealth.$inferSelect,
): MissionControlDepartmentHealthSummary {
  return {
    id: row.id,
    departmentKey: row.departmentKey,
    departmentName: row.departmentName,
    healthScore: row.healthScore,
    status: row.status,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toRecommendationSummary(
  row: typeof missionControlRecommendations.$inferSelect,
): MissionControlRecommendationSummary {
  return {
    id: row.id,
    title: row.title,
    recommendation: row.recommendation,
    priority: row.priority,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function toActionSummary(
  row: typeof missionControlCommandActions.$inferSelect,
): MissionControlCommandActionSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    status: row.status,
    subject: row.subject,
    recommendation: row.recommendation,
    incidentId: row.incidentId,
    createdAt: row.createdAt.toISOString(),
  };
}

function formatDepartmentLabel(moduleKey: string): string {
  return moduleKey
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function dedupeModuleSnapshots(
  snapshots: MissionControlModuleSnapshot[],
): MissionControlModuleSnapshot[] {
  const byModule = new Map<string, MissionControlModuleSnapshot>();

  for (const snapshot of snapshots) {
    if (!byModule.has(snapshot.module)) {
      byModule.set(snapshot.module, snapshot);
    }
  }

  return [...byModule.values()];
}
