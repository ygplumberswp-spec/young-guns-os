import { and, desc, eq } from 'drizzle-orm';
import type {
  ApproveSiLeadMergeRequest,
  CreateSiAccountPlanRequest,
  CreateSiAccountRequest,
  CreateSiCommissionPlanRequest,
  CreateSiCrmProviderRequest,
  CreateSiDiscountPolicyRequest,
  CreateSiDiscountRequestRequest,
  CreateSiForecastRequest,
  CreateSiPartnerRequest,
  CreateSiPipelineRequest,
  CreateSiPlaybookRequest,
  CreateSiPricingRuleRequest,
  CreateSiRenewalRequest,
  CreateSiSalesActionDraftRequest,
  CreateSiSalesCategoryRequest,
  CreateSiSalesTargetRequest,
  CreateSiSalesTeamRequest,
  CreateSiTenderRequest,
  CreateSiTerritoryRequest,
  CreateSiWinLossRecordRequest,
  EnterpriseSalesIntelligenceAuraContext,
  EnterpriseSalesIntelligenceDashboard,
  RequestSiLeadQualificationRequest,
  SiAccountPlanSummary,
  SiAccountSummary,
  SiAnalyticsSummary,
  SiCommissionEntrySummary,
  SiCommissionPlanSummary,
  SiCrmProviderSummary,
  SiCustomerGrowthSnapshotSummary,
  SiDiscountPolicySummary,
  SiDiscountRequestSummary,
  SiForecastSummary,
  SiLeadDeduplicationCandidateSummary,
  SiPartnerSummary,
  SiPipelineStageSummary,
  SiPipelineSummary,
  SiPlatformConfigSummary,
  SiPlaybookSummary,
  SiPortalSalesSummary,
  SiPricingRuleSummary,
  SiQualificationAnalysisSummary,
  SiReferralSummary,
  SiRenewalSummary,
  SiRetentionRiskSnapshotSummary,
  SiRevenueLeakageFindingSummary,
  SiRevenueMonitoringSummary,
  SiSalesAlertSummary,
  SiSalesCategorySummary,
  SiSalesTargetSummary,
  SiSalesTeamSummary,
  SiTenderSummary,
  SiTerritorySummary,
  SiWinLossRecordSummary,
  UpdateSiPlatformConfigRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  jobs,
  siAccountPlans,
  siAccounts,
  siAnalyticsSnapshots,
  siAuditLogs,
  siCommissionEntries,
  siCommissionPlans,
  siCrmProviderAdapters,
  siCustomerGrowthSnapshots,
  siDiscountPolicies,
  siDiscountRequests,
  siForecastSnapshots,
  siForecasts,
  siLeadDeduplicationCandidates,
  siLeadMergeRecords,
  siPartnerProfiles,
  siPipelineStages,
  siPipelines,
  siPlatformConfig,
  siPlaybooks,
  siPricingRules,
  siQualificationAnalyses,
  siReferralRecords,
  siRenewalRecords,
  siRetentionRiskSnapshots,
  siRevenueLeakageFindings,
  siSalesActionDrafts,
  siSalesAlerts,
  siSalesCategories,
  siSalesTargets,
  siSalesTeams,
  siTenders,
  siTerritories,
  siWinLossRecords,
  users,
} from '@titan/db';
import type { AnalyticsService } from './analytics.service.js';
import type { CrmService } from './crm.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { FinanceService } from './finance.service.js';
import type { LeadsService } from './leads.service.js';
import type { MarketingService } from './marketing.service.js';
import type { SalesService } from './sales.service.js';

export class EnterpriseSalesIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseSalesIntelligenceError';
  }
}

type StaffScope = { companyId: string; userId: string };

type SalesIntelligenceDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  crmService: CrmService;
  salesService: SalesService;
  leadsService: LeadsService;
  marketingService: MarketingService;
  financeService: FinanceService;
  analyticsService: AnalyticsService;
};

const STALL_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const LEAD_SLA_HOURS = 48;

export class EnterpriseSalesIntelligenceService {
  constructor(private readonly deps: SalesIntelligenceDeps) {}

  async getDashboard(companyId: string): Promise<EnterpriseSalesIntelligenceDashboard> {
    const isPlatformOwner =
      await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId);
    const [
      platformConfig,
      salesStats,
      leadStats,
      crmStats,
      pipelines,
      forecasts,
      targets,
      renewals,
      alerts,
      providers,
      revenueMonitoring,
      growthSnapshots,
      retentionSnapshots,
      leakageFindings,
      analytics,
      financeStats,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.deps.salesService.getStats(companyId),
      this.deps.leadsService.getStats(companyId),
      this.deps.crmService.getStats(companyId),
      this.listPipelines(companyId),
      this.listForecasts(companyId),
      this.listSalesTargets(companyId),
      this.listRenewals(companyId),
      this.listSalesAlerts(companyId, { status: 'open' }),
      this.listCrmProviders(companyId),
      this.getRevenueMonitoring(companyId),
      this.listCustomerGrowthSnapshots(companyId),
      this.listRetentionRiskSnapshots(companyId),
      this.listRevenueLeakageFindings(companyId),
      this.getLatestAnalytics(companyId),
      this.deps.financeService.getStats(companyId),
    ]);

    const activeForecasts = forecasts.filter(
      (f) => f.workflowStatus === 'executed' || f.workflowStatus === 'approved',
    );

    return {
      summary: `${pipelines.length} pipeline(s), ${forecasts.length} forecast(s), ${targets.length} target(s), ${alerts.length} open alert(s).`,
      isPlatformOwner,
      platformConfig,
      salesStats: {
        openOpportunityCount: salesStats.openOpportunityCount,
        wonOpportunityCount: salesStats.wonOpportunityCount,
        pipelineValueCents: salesStats.pipelineValueCents,
        quoteConversionRatePercent: salesStats.quoteConversionRatePercent,
      },
      leadStats: {
        activeLeadCount: leadStats.activeLeadCount,
        qualifiedLeadCount: leadStats.qualifiedLeadCount,
        convertedLeadCount: leadStats.convertedLeadCount,
      },
      crmStats: {
        customerCount: crmStats.customerCount,
      },
      pipelineCount: pipelines.length,
      forecastCount: forecasts.length,
      activeForecastCount: activeForecasts.length,
      targetCount: targets.length,
      renewalCount: renewals.length,
      openAlertCount: alerts.length,
      crmProviderCount: providers.length,
      currency: financeStats.currency,
      analytics,
      revenueMonitoring,
      recentPipelines: pipelines.slice(0, 10),
      recentForecasts: forecasts.slice(0, 10),
      recentTargets: targets.slice(0, 10),
      recentRenewals: renewals.slice(0, 10),
      recentAlerts: alerts.slice(0, 10),
      recentGrowthSnapshots: growthSnapshots.slice(0, 10),
      recentRetentionSnapshots: retentionSnapshots.slice(0, 10),
      recentLeakageFindings: leakageFindings.slice(0, 10),
    };
  }

  async getRevenueMonitoring(companyId: string): Promise<SiRevenueMonitoringSummary> {
    const [leadRows, opportunities, quoteRows, providers, pipelineStages] = await Promise.all([
      this.deps.leadsService.listLeads(companyId),
      this.deps.salesService.listOpportunities(companyId),
      this.deps.financeService.listQuotes(companyId),
      this.listCrmProviders(companyId),
      this.deps.db.query.siPipelineStages.findMany({
        where: eq(siPipelineStages.companyId, companyId),
      }),
    ]);

    const now = Date.now();
    const activeLeads = leadRows.filter((row) => !['converted', 'lost'].includes(row.status));
    const unassignedLeadCount = activeLeads.filter((row) => !row.assignedUserId).length;

    const openOpportunities = opportunities.filter((row) => row.status === 'open');
    const stalledOpportunityCount = openOpportunities.filter((row) => {
      const updatedAt = new Date(row.updatedAt).getTime();
      return now - updatedAt >= STALL_DAYS_MS;
    }).length;

    const expiringQuoteCount = quoteRows.filter((row) => {
      if (!['sent', 'draft'].includes(row.status) || !row.validUntil) return false;
      return new Date(row.validUntil).getTime() < now;
    }).length;

    const stageSlaByKey = new Map(
      pipelineStages
        .filter((row) => row.slaHours != null)
        .map((row) => [row.stageKey.toLowerCase(), row.slaHours!]),
    );
    let slaBreachCount = 0;
    for (const opportunity of openOpportunities) {
      if (opportunity.stageName) {
        const slaHours = stageSlaByKey.get(opportunity.stageName.toLowerCase());
        if (slaHours != null) {
          const ageHours = (now - new Date(opportunity.updatedAt).getTime()) / 3600000;
          if (ageHours > slaHours) slaBreachCount += 1;
        }
      }
    }

    const newLeadsPastSla = leadRows.filter((row) => {
      if (row.status !== 'new') return false;
      const ageHours = (now - new Date(row.createdAt).getTime()) / 3600000;
      return ageHours > LEAD_SLA_HOURS;
    }).length;
    slaBreachCount += newLeadsPastSla;

    const crmSyncFailureCount = providers.filter((provider) => provider.status === 'error').length;

    const alerts: string[] = [];
    if (unassignedLeadCount > 0) alerts.push(`${unassignedLeadCount} unassigned active lead(s)`);
    if (stalledOpportunityCount > 0)
      alerts.push(`${stalledOpportunityCount} stalled opportunity(ies)`);
    if (expiringQuoteCount > 0) alerts.push(`${expiringQuoteCount} expired quote(s)`);
    if (slaBreachCount > 0) alerts.push(`${slaBreachCount} pipeline SLA breach(es)`);
    if (crmSyncFailureCount > 0) alerts.push(`${crmSyncFailureCount} CRM provider sync failure(s)`);

    return {
      unassignedLeadCount,
      stalledOpportunityCount,
      expiringQuoteCount,
      slaBreachCount,
      crmSyncFailureCount,
      alerts,
    };
  }

  async getPortalSalesSummary(
    companyId: string,
    customerId?: string,
  ): Promise<SiPortalSalesSummary> {
    const [salesStats, leadStats, financeStats, opportunities, quotes] = await Promise.all([
      this.deps.salesService.getStats(companyId),
      this.deps.leadsService.getStats(companyId),
      this.deps.financeService.getStats(companyId),
      this.deps.salesService.listOpportunities(companyId),
      this.deps.financeService.listQuotes(companyId),
    ]);

    const filteredOpportunities = customerId
      ? opportunities.filter((row) => row.customerId === customerId && row.status === 'open')
      : opportunities.filter((row) => row.status === 'open');
    const filteredQuotes = customerId
      ? quotes.filter((row) => row.customerId === customerId)
      : quotes;
    const pendingQuoteCount = filteredQuotes.filter((row) =>
      ['draft', 'sent'].includes(row.status),
    ).length;

    return {
      openOpportunityCount: filteredOpportunities.length,
      pendingQuoteCount,
      activeLeadCount: leadStats.activeLeadCount,
      currency: financeStats.currency,
      summary:
        filteredOpportunities.length > 0 || pendingQuoteCount > 0
          ? `${filteredOpportunities.length} open opportunity(ies), ${pendingQuoteCount} pending quote(s). Pipeline value ${(salesStats.pipelineValueCents / 100).toFixed(2)} ${financeStats.currency}.`
          : 'No open sales activity.',
    };
  }

  async getPlatformConfig(companyId: string): Promise<SiPlatformConfigSummary> {
    const row = await this.ensurePlatformConfig(companyId);
    return toPlatformConfigSummary(row);
  }

  async updatePlatformConfig(
    scope: StaffScope,
    input: UpdateSiPlatformConfigRequest,
  ): Promise<SiPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(siPlatformConfig)
      .set({
        salesStandards: input.salesStandards ?? existing.salesStandards,
        providerAdapterTemplates:
          input.providerAdapterTemplates ?? existing.providerAdapterTemplates,
        pipelineTemplates: input.pipelineTemplates ?? existing.pipelineTemplates,
        playbookTemplates: input.playbookTemplates ?? existing.playbookTemplates,
        targetTemplates: input.targetTemplates ?? existing.targetTemplates,
        forecastMethodology: input.forecastMethodology ?? existing.forecastMethodology,
        attributionStandards: input.attributionStandards ?? existing.attributionStandards,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(siPlatformConfig.companyId, scope.companyId))
      .returning();

    await this.recordAudit(scope, 'platform_config_updated');
    return toPlatformConfigSummary(updated!);
  }

  async createCategory(
    scope: StaffScope,
    input: CreateSiSalesCategoryRequest,
  ): Promise<SiSalesCategorySummary> {
    const [created] = await this.deps.db
      .insert(siSalesCategories)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        categoryKey: input.categoryKey.trim(),
        description: input.description?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'category_created', 'si_sales_category', created!.id);
    return toCategorySummary(created!);
  }

  async listCategories(companyId: string): Promise<SiSalesCategorySummary[]> {
    const rows = await this.deps.db.query.siSalesCategories.findMany({
      where: eq(siSalesCategories.companyId, companyId),
      orderBy: [desc(siSalesCategories.createdAt)],
    });
    return rows.map(toCategorySummary);
  }

  async createTerritory(
    scope: StaffScope,
    input: CreateSiTerritoryRequest,
  ): Promise<SiTerritorySummary> {
    const [created] = await this.deps.db
      .insert(siTerritories)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        territoryKey: input.territoryKey.trim(),
        territoryType: input.territoryType?.trim() ?? null,
        branch: input.branch?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'territory_created', 'si_territory', created!.id);
    return toTerritorySummary(created!);
  }

  async listTerritories(companyId: string): Promise<SiTerritorySummary[]> {
    const rows = await this.deps.db.query.siTerritories.findMany({
      where: eq(siTerritories.companyId, companyId),
      orderBy: [desc(siTerritories.createdAt)],
    });
    return rows.map(toTerritorySummary);
  }

  async createSalesTeam(
    scope: StaffScope,
    input: CreateSiSalesTeamRequest,
  ): Promise<SiSalesTeamSummary> {
    if (input.territoryId) await this.ensureTerritory(scope.companyId, input.territoryId);

    const [created] = await this.deps.db
      .insert(siSalesTeams)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        teamKey: input.teamKey.trim(),
        territoryId: input.territoryId ?? null,
        leaderUserId: input.leaderUserId ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'sales_team_created', 'si_sales_team', created!.id);
    return toSalesTeamSummary(created!);
  }

  async listSalesTeams(companyId: string): Promise<SiSalesTeamSummary[]> {
    const rows = await this.deps.db.query.siSalesTeams.findMany({
      where: eq(siSalesTeams.companyId, companyId),
      orderBy: [desc(siSalesTeams.createdAt)],
    });
    return rows.map(toSalesTeamSummary);
  }

  async createPipeline(
    scope: StaffScope,
    input: CreateSiPipelineRequest,
  ): Promise<SiPipelineSummary> {
    const [created] = await this.deps.db
      .insert(siPipelines)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        pipelineKey: input.pipelineKey.trim(),
        pipelineType: input.pipelineType?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    if (input.stages?.length) {
      await this.deps.db.insert(siPipelineStages).values(
        input.stages.map((stage, index) => ({
          companyId: scope.companyId,
          pipelineId: created!.id,
          name: stage.name.trim(),
          stageKey: stage.stageKey.trim(),
          sortOrder: stage.sortOrder ?? index,
          probabilityPercent:
            stage.probabilityPercent != null ? String(stage.probabilityPercent) : null,
          slaHours: stage.slaHours ?? null,
        })),
      );
    }

    await this.recordAudit(scope, 'pipeline_created', 'si_pipeline', created!.id);
    return this.buildPipelineSummary(created!);
  }

  async listPipelines(companyId: string): Promise<SiPipelineSummary[]> {
    const rows = await this.deps.db.query.siPipelines.findMany({
      where: eq(siPipelines.companyId, companyId),
      orderBy: [desc(siPipelines.updatedAt)],
      limit: 100,
    });

    const summaries: SiPipelineSummary[] = [];
    for (const row of rows) {
      summaries.push(await this.buildPipelineSummary(row));
    }
    return summaries;
  }

  async listPipelineStages(
    companyId: string,
    pipelineId: string,
  ): Promise<SiPipelineStageSummary[]> {
    await this.ensurePipeline(companyId, pipelineId);
    const rows = await this.deps.db.query.siPipelineStages.findMany({
      where: and(
        eq(siPipelineStages.companyId, companyId),
        eq(siPipelineStages.pipelineId, pipelineId),
      ),
      orderBy: [siPipelineStages.sortOrder],
    });
    return rows.map(toPipelineStageSummary);
  }

  async listLeadDeduplicationCandidates(
    companyId: string,
  ): Promise<SiLeadDeduplicationCandidateSummary[]> {
    await this.syncLeadDeduplicationCandidates(companyId);
    const rows = await this.deps.db.query.siLeadDeduplicationCandidates.findMany({
      where: eq(siLeadDeduplicationCandidates.companyId, companyId),
      orderBy: [desc(siLeadDeduplicationCandidates.createdAt)],
      limit: 100,
    });
    return rows.map(toLeadDeduplicationCandidateSummary);
  }

  async approveLeadMerge(scope: StaffScope, input: ApproveSiLeadMergeRequest) {
    const candidate = await this.deps.db.query.siLeadDeduplicationCandidates.findFirst({
      where: and(
        eq(siLeadDeduplicationCandidates.companyId, scope.companyId),
        eq(siLeadDeduplicationCandidates.id, input.candidateId),
      ),
    });

    if (!candidate) {
      throw new EnterpriseSalesIntelligenceError('NOT_FOUND', 'Deduplication candidate not found');
    }
    if (candidate.status !== 'pending') {
      throw new EnterpriseSalesIntelligenceError(
        'VALIDATION_ERROR',
        'Candidate has already been reviewed',
      );
    }
    if (!candidate.primaryLeadId || !candidate.duplicateLeadId) {
      throw new EnterpriseSalesIntelligenceError(
        'VALIDATION_ERROR',
        'Candidate is missing lead references',
      );
    }

    const [primaryLead, duplicateLead] = await Promise.all([
      this.deps.leadsService.getLead(scope.companyId, candidate.primaryLeadId),
      this.deps.leadsService.getLead(scope.companyId, candidate.duplicateLeadId),
    ]);

    if (!primaryLead || !duplicateLead) {
      throw new EnterpriseSalesIntelligenceError('NOT_FOUND', 'One or both leads no longer exist');
    }

    const [mergeRecord] = await this.deps.db
      .insert(siLeadMergeRecords)
      .values({
        companyId: scope.companyId,
        survivingLeadId: candidate.primaryLeadId,
        mergedLeadId: candidate.duplicateLeadId,
        mergeReason: input.mergeReason.trim(),
        approvedByUserId: scope.userId,
        sourceHistory: {
          primaryLead,
          duplicateLead,
          candidateId: candidate.id,
          approvedAt: new Date().toISOString(),
        },
      })
      .returning();

    await this.deps.db
      .update(siLeadDeduplicationCandidates)
      .set({
        status: 'approved',
        reviewedByUserId: scope.userId,
        reviewedAt: new Date(),
      })
      .where(eq(siLeadDeduplicationCandidates.id, candidate.id));

    await this.recordAudit(scope, 'lead_merge_approved', 'si_lead_merge_record', mergeRecord!.id, {
      survivingLeadId: candidate.primaryLeadId,
      mergedLeadId: candidate.duplicateLeadId,
    });

    return {
      mergeRecordId: mergeRecord!.id,
      survivingLeadId: candidate.primaryLeadId,
      mergedLeadId: candidate.duplicateLeadId,
      status: 'approved',
    };
  }

  async createPlaybook(
    scope: StaffScope,
    input: CreateSiPlaybookRequest,
  ): Promise<SiPlaybookSummary> {
    const [created] = await this.deps.db
      .insert(siPlaybooks)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        playbookKey: input.playbookKey.trim(),
        playbookType: input.playbookType?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'playbook_created', 'si_playbook', created!.id);
    return toPlaybookSummary(created!);
  }

  async listPlaybooks(companyId: string): Promise<SiPlaybookSummary[]> {
    const rows = await this.deps.db.query.siPlaybooks.findMany({
      where: eq(siPlaybooks.companyId, companyId),
      orderBy: [desc(siPlaybooks.updatedAt)],
    });
    return rows.map(toPlaybookSummary);
  }

  async createForecast(
    scope: StaffScope,
    input: CreateSiForecastRequest,
  ): Promise<SiForecastSummary> {
    const [salesStats, financeStats, opportunities] = await Promise.all([
      this.deps.salesService.getStats(scope.companyId),
      this.deps.financeService.getStats(scope.companyId),
      this.deps.salesService.listOpportunities(scope.companyId),
    ]);

    const openOpportunities = opportunities.filter((row) => row.status === 'open');
    const weightedPipelineCents = openOpportunities.reduce((sum, row) => {
      const value = row.estimatedValueCents ?? 0;
      return sum + value;
    }, 0);

    const [created] = await this.deps.db
      .insert(siForecasts)
      .values({
        companyId: scope.companyId,
        ownerUserId: scope.userId,
        title: input.title.trim(),
        forecastType: input.forecastType?.trim() ?? 'pipeline',
        workflowStatus: 'draft',
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        currency: input.currency ?? financeStats.currency,
        pipelineValueCents: salesStats.pipelineValueCents,
        weightedPipelineCents,
        commitCents: Math.round(weightedPipelineCents * 0.7),
        bestCaseCents: Math.round(weightedPipelineCents * 1.2),
        assumptions: input.assumptions ?? {},
        sourceRecords: {
          openOpportunityCount: salesStats.openOpportunityCount,
          generatedAt: new Date().toISOString(),
        },
        isSimulation: input.isSimulation ?? false,
      })
      .returning();

    await this.recordAudit(scope, 'forecast_created', 'si_forecast', created!.id);
    return this.buildForecastSummary(created!);
  }

  async listForecasts(companyId: string): Promise<SiForecastSummary[]> {
    const rows = await this.deps.db.query.siForecasts.findMany({
      where: eq(siForecasts.companyId, companyId),
      orderBy: [desc(siForecasts.updatedAt)],
      limit: 100,
    });

    const summaries: SiForecastSummary[] = [];
    for (const row of rows) {
      summaries.push(await this.buildForecastSummary(row));
    }
    return summaries;
  }

  async captureForecastSnapshot(scope: StaffScope, forecastId: string) {
    const forecast = await this.ensureForecast(scope.companyId, forecastId);
    const [salesStats, opportunities] = await Promise.all([
      this.deps.salesService.getStats(scope.companyId),
      this.deps.salesService.listOpportunities(scope.companyId),
    ]);

    const openOpportunities = opportunities.filter((row) => row.status === 'open');
    const weightedPipelineCents = openOpportunities.reduce(
      (sum, row) => sum + (row.estimatedValueCents ?? 0),
      0,
    );

    const [created] = await this.deps.db
      .insert(siForecastSnapshots)
      .values({
        companyId: scope.companyId,
        forecastId,
        pipelineValueCents: salesStats.pipelineValueCents,
        weightedPipelineCents,
        commitCents: forecast.commitCents ?? Math.round(weightedPipelineCents * 0.7),
        confidenceScore: forecast.confidenceScore,
        assumptions: forecast.assumptions,
        sourceRecords: {
          openOpportunityCount: salesStats.openOpportunityCount,
          capturedAt: new Date().toISOString(),
        },
      })
      .returning();

    await this.recordAudit(
      scope,
      'forecast_snapshot_captured',
      'si_forecast_snapshot',
      created!.id,
    );
    return {
      id: created!.id,
      forecastId: created!.forecastId,
      pipelineValueCents: created!.pipelineValueCents,
      weightedPipelineCents: created!.weightedPipelineCents,
      commitCents: created!.commitCents,
      capturedAt: created!.capturedAt.toISOString(),
    };
  }

  async createSalesTarget(
    scope: StaffScope,
    input: CreateSiSalesTargetRequest,
  ): Promise<SiSalesTargetSummary> {
    if (input.teamId) await this.ensureSalesTeam(scope.companyId, input.teamId);

    const [created] = await this.deps.db
      .insert(siSalesTargets)
      .values({
        companyId: scope.companyId,
        ownerUserId: scope.userId,
        teamId: input.teamId ?? null,
        targetKey: input.targetKey.trim(),
        title: input.title.trim(),
        targetType: input.targetType.trim(),
        status: 'draft',
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        targetValue: input.targetValue != null ? String(input.targetValue) : null,
        unit: input.unit?.trim() ?? null,
        currency: input.currency ?? null,
      })
      .returning();

    await this.recordAudit(scope, 'sales_target_created', 'si_sales_target', created!.id);
    return toSalesTargetSummary(created!);
  }

  async listSalesTargets(companyId: string): Promise<SiSalesTargetSummary[]> {
    const rows = await this.deps.db.query.siSalesTargets.findMany({
      where: eq(siSalesTargets.companyId, companyId),
      orderBy: [desc(siSalesTargets.updatedAt)],
      limit: 100,
    });
    return rows.map(toSalesTargetSummary);
  }

  async createAccount(scope: StaffScope, input: CreateSiAccountRequest): Promise<SiAccountSummary> {
    if (input.territoryId) await this.ensureTerritory(scope.companyId, input.territoryId);

    const [created] = await this.deps.db
      .insert(siAccounts)
      .values({
        companyId: scope.companyId,
        customerId: input.customerId ?? null,
        name: input.name.trim(),
        accountType: input.accountType?.trim() ?? null,
        ownerUserId: scope.userId,
        territoryId: input.territoryId ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'account_created', 'si_account', created!.id);
    return toAccountSummary(created!);
  }

  async listAccounts(companyId: string): Promise<SiAccountSummary[]> {
    const rows = await this.deps.db.query.siAccounts.findMany({
      where: eq(siAccounts.companyId, companyId),
      orderBy: [desc(siAccounts.updatedAt)],
      limit: 100,
    });
    return rows.map(toAccountSummary);
  }

  async createAccountPlan(
    scope: StaffScope,
    input: CreateSiAccountPlanRequest,
  ): Promise<SiAccountPlanSummary> {
    await this.ensureAccount(scope.companyId, input.accountId);

    const [created] = await this.deps.db
      .insert(siAccountPlans)
      .values({
        companyId: scope.companyId,
        accountId: input.accountId,
        title: input.title.trim(),
        workflowStatus: 'draft',
        goals: input.goals ?? {},
        stakeholders: input.stakeholders ?? [],
        actionPlan: input.actionPlan ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'account_plan_created', 'si_account_plan', created!.id);
    return toAccountPlanSummary(created!);
  }

  async createRenewal(scope: StaffScope, input: CreateSiRenewalRequest): Promise<SiRenewalSummary> {
    if (input.accountId) await this.ensureAccount(scope.companyId, input.accountId);

    const [created] = await this.deps.db
      .insert(siRenewalRecords)
      .values({
        companyId: scope.companyId,
        accountId: input.accountId ?? null,
        customerId: input.customerId ?? null,
        title: input.title.trim(),
        renewalType: input.renewalType?.trim() ?? null,
        renewalDate: input.renewalDate ?? null,
        noticePeriodDays: input.noticePeriodDays ?? null,
        currentValueCents: input.currentValueCents ?? null,
        proposedValueCents: input.proposedValueCents ?? null,
        ownerUserId: scope.userId,
        workflowStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'renewal_created', 'si_renewal_record', created!.id);
    return toRenewalSummary(created!);
  }

  async listRenewals(companyId: string): Promise<SiRenewalSummary[]> {
    const rows = await this.deps.db.query.siRenewalRecords.findMany({
      where: eq(siRenewalRecords.companyId, companyId),
      orderBy: [desc(siRenewalRecords.updatedAt)],
      limit: 100,
    });
    return rows.map(toRenewalSummary);
  }

  async listCustomerGrowthSnapshots(companyId: string): Promise<SiCustomerGrowthSnapshotSummary[]> {
    const rows = await this.deps.db.query.siCustomerGrowthSnapshots.findMany({
      where: eq(siCustomerGrowthSnapshots.companyId, companyId),
      orderBy: [desc(siCustomerGrowthSnapshots.capturedAt)],
      limit: 100,
    });
    return rows.map(toCustomerGrowthSnapshotSummary);
  }

  async captureCustomerGrowthSnapshot(scope: StaffScope, customerId?: string) {
    const [quotes, jobRows, opportunities, customerAnalytics] = await Promise.all([
      this.deps.financeService.listQuotes(scope.companyId),
      this.deps.db.query.jobs.findMany({ where: eq(jobs.companyId, scope.companyId) }),
      this.deps.salesService.listOpportunities(scope.companyId),
      this.deps.analyticsService.getCustomerAnalytics(scope.companyId).catch(() => null),
    ]);

    const scopedQuotes = customerId
      ? quotes.filter((row) => row.customerId === customerId)
      : quotes;
    const scopedJobs = customerId
      ? jobRows.filter((row) => row.customerId === customerId)
      : jobRows;
    const scopedOpportunities = customerId
      ? opportunities.filter((row) => row.customerId === customerId)
      : opportunities;

    const acceptedQuotes = scopedQuotes.filter((row) => row.status === 'accepted');
    const openOpportunities = scopedOpportunities.filter((row) => row.status === 'open');
    const completedJobs = scopedJobs.filter((row) => row.status === 'completed');

    let opportunityType = 'expansion';
    let title = 'Customer growth opportunity';
    let confidenceScore = '0.5';
    const supportingEvidence: Record<string, unknown> = {
      acceptedQuoteCount: acceptedQuotes.length,
      openOpportunityCount: openOpportunities.length,
      completedJobCount: completedJobs.length,
      customerAnalytics: customerAnalytics
        ? {
            totalCustomers: customerAnalytics.totalCustomers,
            quoteConversionRatePercent: customerAnalytics.quoteConversionRatePercent,
          }
        : null,
    };

    if (openOpportunities.length > 0) {
      opportunityType = 'pipeline_expansion';
      title = `${openOpportunities.length} open opportunity(ies) indicate growth potential`;
      confidenceScore = '0.75';
    } else if (acceptedQuotes.length > 0 && completedJobs.length > 0) {
      opportunityType = 'cross_sell';
      title = 'Repeat business pattern from accepted quotes and completed jobs';
      confidenceScore = '0.65';
    } else if (scopedQuotes.filter((row) => row.status === 'sent').length > 0) {
      opportunityType = 'quote_conversion';
      title = 'Pending quote conversion opportunity';
      confidenceScore = '0.55';
    } else {
      title = 'No strong growth signals detected';
      confidenceScore = '0.3';
    }

    const limitations =
      scopedQuotes.length === 0 && scopedJobs.length === 0 && scopedOpportunities.length === 0
        ? 'Insufficient customer transaction history for high-confidence growth analysis.'
        : null;

    const [created] = await this.deps.db
      .insert(siCustomerGrowthSnapshots)
      .values({
        companyId: scope.companyId,
        customerId: customerId ?? null,
        opportunityType,
        title,
        confidenceScore,
        supportingEvidence,
        limitations,
      })
      .returning();

    await this.recordAudit(
      scope,
      'customer_growth_snapshot_captured',
      'si_customer_growth_snapshot',
      created!.id,
    );
    return toCustomerGrowthSnapshotSummary(created!);
  }

  async listRetentionRiskSnapshots(companyId: string): Promise<SiRetentionRiskSnapshotSummary[]> {
    const rows = await this.deps.db.query.siRetentionRiskSnapshots.findMany({
      where: eq(siRetentionRiskSnapshots.companyId, companyId),
      orderBy: [desc(siRetentionRiskSnapshots.capturedAt)],
      limit: 100,
    });
    return rows.map(toRetentionRiskSnapshotSummary);
  }

  async captureRetentionRiskSnapshot(scope: StaffScope, customerId?: string) {
    const [invoices, quotes, opportunities] = await Promise.all([
      this.deps.financeService.listInvoices(scope.companyId),
      this.deps.financeService.listQuotes(scope.companyId),
      this.deps.salesService.listOpportunities(scope.companyId),
    ]);

    const scopedInvoices = customerId
      ? invoices.filter((row) => row.customerId === customerId)
      : invoices;
    const scopedQuotes = customerId
      ? quotes.filter((row) => row.customerId === customerId)
      : quotes;
    const scopedOpportunities = customerId
      ? opportunities.filter((row) => row.customerId === customerId)
      : opportunities;

    const now = Date.now();
    const overdueInvoices = scopedInvoices.filter(
      (row) =>
        row.dueDate &&
        new Date(row.dueDate).getTime() < now &&
        !['paid', 'cancelled'].includes(row.status),
    );
    const lostOpportunities = scopedOpportunities.filter((row) => row.status === 'lost');
    const declinedQuotes = scopedQuotes.filter((row) => row.status === 'declined');

    const riskFactors: unknown[] = [];
    if (overdueInvoices.length > 0)
      riskFactors.push({ type: 'overdue_invoices', count: overdueInvoices.length });
    if (lostOpportunities.length > 0)
      riskFactors.push({ type: 'lost_opportunities', count: lostOpportunities.length });
    if (declinedQuotes.length > 0)
      riskFactors.push({ type: 'declined_quotes', count: declinedQuotes.length });

    let riskLevel = 'low';
    let confidenceScore = '0.4';
    if (riskFactors.length >= 2) {
      riskLevel = 'high';
      confidenceScore = '0.8';
    } else if (riskFactors.length === 1) {
      riskLevel = 'medium';
      confidenceScore = '0.6';
    }

    const [created] = await this.deps.db
      .insert(siRetentionRiskSnapshots)
      .values({
        companyId: scope.companyId,
        customerId: customerId ?? null,
        riskLevel,
        riskFactors,
        confidenceScore,
        supportingEvidence: {
          overdueInvoiceCount: overdueInvoices.length,
          lostOpportunityCount: lostOpportunities.length,
          declinedQuoteCount: declinedQuotes.length,
        },
      })
      .returning();

    await this.recordAudit(
      scope,
      'retention_risk_snapshot_captured',
      'si_retention_risk_snapshot',
      created!.id,
    );
    return toRetentionRiskSnapshotSummary(created!);
  }

  async createPricingRule(
    scope: StaffScope,
    input: CreateSiPricingRuleRequest,
  ): Promise<SiPricingRuleSummary> {
    const [created] = await this.deps.db
      .insert(siPricingRules)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        ruleKey: input.ruleKey.trim(),
        ruleType: input.ruleType.trim(),
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'pricing_rule_created', 'si_pricing_rule', created!.id);
    return toPricingRuleSummary(created!);
  }

  async listPricingRules(companyId: string): Promise<SiPricingRuleSummary[]> {
    const rows = await this.deps.db.query.siPricingRules.findMany({
      where: eq(siPricingRules.companyId, companyId),
      orderBy: [desc(siPricingRules.createdAt)],
    });
    return rows.map(toPricingRuleSummary);
  }

  async createDiscountPolicy(
    scope: StaffScope,
    input: CreateSiDiscountPolicyRequest,
  ): Promise<SiDiscountPolicySummary> {
    const [created] = await this.deps.db
      .insert(siDiscountPolicies)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        policyKey: input.policyKey.trim(),
        maxDiscountPercent:
          input.maxDiscountPercent != null ? String(input.maxDiscountPercent) : null,
        marginFloorPercent:
          input.marginFloorPercent != null ? String(input.marginFloorPercent) : null,
        approvalThresholdPercent:
          input.approvalThresholdPercent != null ? String(input.approvalThresholdPercent) : null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'discount_policy_created', 'si_discount_policy', created!.id);
    return toDiscountPolicySummary(created!);
  }

  async listDiscountPolicies(companyId: string): Promise<SiDiscountPolicySummary[]> {
    const rows = await this.deps.db.query.siDiscountPolicies.findMany({
      where: eq(siDiscountPolicies.companyId, companyId),
      orderBy: [desc(siDiscountPolicies.createdAt)],
    });
    return rows.map(toDiscountPolicySummary);
  }

  async createDiscountRequest(
    scope: StaffScope,
    input: CreateSiDiscountRequestRequest,
  ): Promise<SiDiscountRequestSummary> {
    const [created] = await this.deps.db
      .insert(siDiscountRequests)
      .values({
        companyId: scope.companyId,
        quoteId: input.quoteId ?? null,
        requestedByUserId: scope.userId,
        discountPercent: input.discountPercent != null ? String(input.discountPercent) : null,
        discountAmountCents: input.discountAmountCents ?? null,
        reason: input.reason?.trim() ?? null,
        marginImpactPercent:
          input.marginImpactPercent != null ? String(input.marginImpactPercent) : null,
        workflowStatus: 'draft',
      })
      .returning();

    await this.recordAudit(scope, 'discount_request_created', 'si_discount_request', created!.id);
    return toDiscountRequestSummary(created!);
  }

  async submitDiscountRequestForReview(
    scope: StaffScope,
    requestId: string,
  ): Promise<SiDiscountRequestSummary> {
    const request = await this.ensureDiscountRequest(scope.companyId, requestId);
    if (request.workflowStatus !== 'draft') {
      throw new EnterpriseSalesIntelligenceError(
        'VALIDATION_ERROR',
        'Discount request must be in draft to submit',
      );
    }

    const [updated] = await this.deps.db
      .update(siDiscountRequests)
      .set({ workflowStatus: 'review' })
      .where(eq(siDiscountRequests.id, requestId))
      .returning();

    await this.recordAudit(
      scope,
      'discount_request_submitted_for_review',
      'si_discount_request',
      requestId,
    );
    return toDiscountRequestSummary(updated!);
  }

  async submitDiscountRequestForApproval(
    scope: StaffScope,
    requestId: string,
  ): Promise<SiDiscountRequestSummary> {
    const request = await this.ensureDiscountRequest(scope.companyId, requestId);
    if (request.workflowStatus !== 'review') {
      throw new EnterpriseSalesIntelligenceError(
        'VALIDATION_ERROR',
        'Discount request must be in review to submit for approval',
      );
    }

    const [updated] = await this.deps.db
      .update(siDiscountRequests)
      .set({ workflowStatus: 'pending_approval' })
      .where(eq(siDiscountRequests.id, requestId))
      .returning();

    await this.recordAudit(
      scope,
      'discount_request_submitted_for_approval',
      'si_discount_request',
      requestId,
    );
    return toDiscountRequestSummary(updated!);
  }

  async approveDiscountRequest(
    scope: StaffScope,
    requestId: string,
  ): Promise<SiDiscountRequestSummary> {
    const request = await this.ensureDiscountRequest(scope.companyId, requestId);
    if (request.workflowStatus !== 'pending_approval') {
      throw new EnterpriseSalesIntelligenceError(
        'VALIDATION_ERROR',
        'Discount request is not pending approval',
      );
    }

    const [updated] = await this.deps.db
      .update(siDiscountRequests)
      .set({
        workflowStatus: 'approved',
        approvedByUserId: scope.userId,
        approvedAt: new Date(),
      })
      .where(eq(siDiscountRequests.id, requestId))
      .returning();

    await this.recordAudit(scope, 'discount_request_approved', 'si_discount_request', requestId);
    return toDiscountRequestSummary(updated!);
  }

  async executeDiscountRequest(
    scope: StaffScope,
    requestId: string,
  ): Promise<SiDiscountRequestSummary> {
    const request = await this.ensureDiscountRequest(scope.companyId, requestId);
    if (request.workflowStatus !== 'approved') {
      throw new EnterpriseSalesIntelligenceError(
        'VALIDATION_ERROR',
        'Discount request must be approved before execution',
      );
    }

    const [updated] = await this.deps.db
      .update(siDiscountRequests)
      .set({ workflowStatus: 'executed' })
      .where(eq(siDiscountRequests.id, requestId))
      .returning();

    await this.recordAudit(scope, 'discount_request_executed', 'si_discount_request', requestId);
    return toDiscountRequestSummary(updated!);
  }

  async listDiscountRequests(companyId: string): Promise<SiDiscountRequestSummary[]> {
    const rows = await this.deps.db.query.siDiscountRequests.findMany({
      where: eq(siDiscountRequests.companyId, companyId),
      orderBy: [desc(siDiscountRequests.createdAt)],
      limit: 100,
    });
    return rows.map(toDiscountRequestSummary);
  }

  async createCommissionPlan(
    scope: StaffScope,
    input: CreateSiCommissionPlanRequest,
  ): Promise<SiCommissionPlanSummary> {
    const [created] = await this.deps.db
      .insert(siCommissionPlans)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        planKey: input.planKey.trim(),
        formula: input.formula?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'commission_plan_created', 'si_commission_plan', created!.id);
    return toCommissionPlanSummary(created!);
  }

  async listCommissionPlans(companyId: string): Promise<SiCommissionPlanSummary[]> {
    const rows = await this.deps.db.query.siCommissionPlans.findMany({
      where: eq(siCommissionPlans.companyId, companyId),
      orderBy: [desc(siCommissionPlans.createdAt)],
    });
    return rows.map(toCommissionPlanSummary);
  }

  async listCommissionEntries(companyId: string): Promise<SiCommissionEntrySummary[]> {
    const rows = await this.deps.db.query.siCommissionEntries.findMany({
      where: eq(siCommissionEntries.companyId, companyId),
      orderBy: [desc(siCommissionEntries.updatedAt)],
      limit: 100,
    });
    return rows.map(toCommissionEntrySummary);
  }

  async requestLeadQualification(
    scope: StaffScope,
    input: RequestSiLeadQualificationRequest,
  ): Promise<SiQualificationAnalysisSummary> {
    const lead = await this.deps.leadsService.getLead(scope.companyId, input.leadId);
    if (!lead) {
      throw new EnterpriseSalesIntelligenceError('NOT_FOUND', 'Lead not found');
    }

    const scoring = await this.deps.leadsService.analyzeLeadScore(scope.companyId, input.leadId);
    const activities = await this.deps.leadsService.listActivities(scope.companyId, input.leadId);

    let recommendation = 'Continue nurturing';
    let priority = 'medium';
    if (scoring.score >= 75) {
      recommendation = 'Prioritize for sales handoff';
      priority = 'high';
    } else if (scoring.score < 40) {
      recommendation = 'Re-qualify or deprioritize';
      priority = 'low';
    }

    const confidenceScore = String(Math.min(0.95, Math.max(0.35, scoring.score / 100)));
    const supportingEvidence = {
      score: scoring.score,
      signals: scoring.signals,
      activityCount: activities.length,
      leadStatus: lead.status,
      hasContactEmail: Boolean(lead.contactEmail),
      hasContactPhone: Boolean(lead.contactPhone),
    };
    const limitations =
      activities.length === 0
        ? 'Limited engagement history — qualification is based primarily on lead profile signals.'
        : 'Recommendations only — human review required before status changes or handoff.';

    const [created] = await this.deps.db
      .insert(siQualificationAnalyses)
      .values({
        companyId: scope.companyId,
        leadId: input.leadId,
        recommendation,
        priority,
        confidenceScore,
        supportingEvidence,
        limitations,
        requiresHumanReview: true,
      })
      .returning();

    await this.recordAudit(
      scope,
      'lead_qualification_requested',
      'si_qualification_analysis',
      created!.id,
    );
    return toQualificationAnalysisSummary(created!);
  }

  async createWinLossRecord(
    scope: StaffScope,
    input: CreateSiWinLossRecordRequest,
  ): Promise<SiWinLossRecordSummary> {
    const [created] = await this.deps.db
      .insert(siWinLossRecords)
      .values({
        companyId: scope.companyId,
        opportunityId: input.opportunityId ?? null,
        outcome: input.outcome.trim(),
        reason: input.reason?.trim() ?? null,
        competitor: input.competitor?.trim() ?? null,
        priceImpact: input.priceImpact?.trim() ?? null,
        customerFeedback: input.customerFeedback?.trim() ?? null,
        metadata: input.metadata ?? {},
        recordedByUserId: scope.userId,
      })
      .returning();

    await this.recordAudit(scope, 'win_loss_record_created', 'si_win_loss_record', created!.id);
    return toWinLossRecordSummary(created!);
  }

  async listWinLossRecords(companyId: string): Promise<SiWinLossRecordSummary[]> {
    const rows = await this.deps.db.query.siWinLossRecords.findMany({
      where: eq(siWinLossRecords.companyId, companyId),
      orderBy: [desc(siWinLossRecords.createdAt)],
      limit: 100,
    });
    return rows.map(toWinLossRecordSummary);
  }

  async listRevenueLeakageFindings(companyId: string): Promise<SiRevenueLeakageFindingSummary[]> {
    const rows = await this.deps.db.query.siRevenueLeakageFindings.findMany({
      where: eq(siRevenueLeakageFindings.companyId, companyId),
      orderBy: [desc(siRevenueLeakageFindings.createdAt)],
      limit: 100,
    });
    return rows.map(toRevenueLeakageFindingSummary);
  }

  async syncRevenueLeakageFindings(scope: StaffScope): Promise<SiRevenueLeakageFindingSummary[]> {
    const [quotes, invoices, jobRows] = await Promise.all([
      this.deps.financeService.listQuotes(scope.companyId),
      this.deps.financeService.listInvoices(scope.companyId),
      this.deps.db.query.jobs.findMany({ where: eq(jobs.companyId, scope.companyId) }),
    ]);

    const now = Date.now();
    const existingOpen = await this.listRevenueLeakageFindings(scope.companyId);
    const openByType = new Map(
      existingOpen.filter((row) => row.status === 'open').map((row) => [row.findingType, row]),
    );

    const findings: Array<{
      findingType: string;
      title: string;
      description: string;
      estimatedAmountCents: number;
      sourceRecords: Record<string, unknown>;
    }> = [];

    const unconvertedQuotes = quotes.filter(
      (row) => row.status === 'sent' && row.validUntil && new Date(row.validUntil).getTime() < now,
    );
    if (unconvertedQuotes.length > 0) {
      const amount = unconvertedQuotes.reduce((sum, row) => sum + row.amountCents, 0);
      findings.push({
        findingType: 'expired_quotes',
        title: 'Expired unconverted quotes',
        description: `${unconvertedQuotes.length} sent quote(s) have expired without conversion.`,
        estimatedAmountCents: amount,
        sourceRecords: { quoteIds: unconvertedQuotes.map((row) => row.id) },
      });
    }

    const incompleteJobs = jobRows.filter((row) =>
      ['scheduled', 'in_progress'].includes(row.status),
    );
    const jobsWithoutInvoice = incompleteJobs.filter((job) => {
      return !invoices.some((invoice) => invoice.jobId === job.id);
    });
    if (jobsWithoutInvoice.length > 0) {
      findings.push({
        findingType: 'unbilled_jobs',
        title: 'Active jobs without invoices',
        description: `${jobsWithoutInvoice.length} active job(s) have no linked invoice.`,
        estimatedAmountCents: 0,
        sourceRecords: { jobIds: jobsWithoutInvoice.map((row) => row.id) },
      });
    }

    const overdueInvoices = invoices.filter(
      (row) =>
        row.dueDate &&
        new Date(row.dueDate).getTime() < now &&
        !['paid', 'cancelled'].includes(row.status),
    );
    if (overdueInvoices.length > 0) {
      const amount = overdueInvoices.reduce(
        (sum, row) => sum + Math.max(0, row.amountCents - row.amountPaidCents),
        0,
      );
      findings.push({
        findingType: 'overdue_invoices',
        title: 'Overdue invoice revenue at risk',
        description: `${overdueInvoices.length} invoice(s) are overdue.`,
        estimatedAmountCents: amount,
        sourceRecords: { invoiceIds: overdueInvoices.map((row) => row.id) },
      });
    }

    for (const finding of findings) {
      const existing = openByType.get(finding.findingType);
      if (!existing) {
        await this.deps.db.insert(siRevenueLeakageFindings).values({
          companyId: scope.companyId,
          findingType: finding.findingType,
          title: finding.title,
          description: finding.description,
          estimatedAmountCents: finding.estimatedAmountCents,
          sourceRecords: finding.sourceRecords,
          status: 'open',
        });
      } else {
        await this.deps.db
          .update(siRevenueLeakageFindings)
          .set({
            description: finding.description,
            estimatedAmountCents: finding.estimatedAmountCents,
            sourceRecords: finding.sourceRecords,
          })
          .where(eq(siRevenueLeakageFindings.id, existing.id));
      }
    }

    for (const existing of existingOpen.filter((row) => row.status === 'open')) {
      if (!findings.some((finding) => finding.findingType === existing.findingType)) {
        await this.deps.db
          .update(siRevenueLeakageFindings)
          .set({ status: 'resolved' })
          .where(eq(siRevenueLeakageFindings.id, existing.id));
      }
    }

    await this.recordAudit(scope, 'revenue_leakage_synced');
    return this.listRevenueLeakageFindings(scope.companyId);
  }

  async createPartner(scope: StaffScope, input: CreateSiPartnerRequest): Promise<SiPartnerSummary> {
    const [created] = await this.deps.db
      .insert(siPartnerProfiles)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        partnerType: input.partnerType?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'partner_created', 'si_partner_profile', created!.id);
    return toPartnerSummary(created!);
  }

  async listPartners(companyId: string): Promise<SiPartnerSummary[]> {
    const rows = await this.deps.db.query.siPartnerProfiles.findMany({
      where: eq(siPartnerProfiles.companyId, companyId),
      orderBy: [desc(siPartnerProfiles.createdAt)],
    });
    return rows.map(toPartnerSummary);
  }

  async listReferrals(companyId: string): Promise<SiReferralSummary[]> {
    const rows = await this.deps.db.query.siReferralRecords.findMany({
      where: eq(siReferralRecords.companyId, companyId),
      orderBy: [desc(siReferralRecords.createdAt)],
      limit: 100,
    });
    return rows.map(toReferralSummary);
  }

  async createTender(scope: StaffScope, input: CreateSiTenderRequest): Promise<SiTenderSummary> {
    const [created] = await this.deps.db
      .insert(siTenders)
      .values({
        companyId: scope.companyId,
        title: input.title.trim(),
        tenderNumber: input.tenderNumber?.trim() ?? null,
        deadline: input.deadline ? new Date(input.deadline) : null,
        ownerUserId: scope.userId,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'tender_created', 'si_tender', created!.id);
    return toTenderSummary(created!);
  }

  async listTenders(companyId: string): Promise<SiTenderSummary[]> {
    const rows = await this.deps.db.query.siTenders.findMany({
      where: eq(siTenders.companyId, companyId),
      orderBy: [desc(siTenders.updatedAt)],
      limit: 100,
    });
    return rows.map(toTenderSummary);
  }

  async createCrmProvider(
    scope: StaffScope,
    input: CreateSiCrmProviderRequest,
  ): Promise<SiCrmProviderSummary> {
    const [created] = await this.deps.db
      .insert(siCrmProviderAdapters)
      .values({
        companyId: scope.companyId,
        providerType: input.providerType as typeof siCrmProviderAdapters.$inferInsert.providerType,
        name: input.name.trim(),
        syncDirection: input.syncDirection ?? 'bidirectional',
        syncFrequency: input.syncFrequency?.trim() ?? null,
        fieldMappings: input.fieldMappings ?? {},
        config: input.config ?? {},
        status: 'inactive',
      })
      .returning();

    await this.recordAudit(scope, 'crm_provider_created', 'si_crm_provider', created!.id);
    return toCrmProviderSummary(created!);
  }

  async listCrmProviders(companyId: string): Promise<SiCrmProviderSummary[]> {
    const rows = await this.deps.db.query.siCrmProviderAdapters.findMany({
      where: eq(siCrmProviderAdapters.companyId, companyId),
      orderBy: [desc(siCrmProviderAdapters.createdAt)],
    });
    return rows.map(toCrmProviderSummary);
  }

  async testCrmProvider(scope: StaffScope, providerId: string): Promise<SiCrmProviderSummary> {
    const provider = await this.ensureCrmProvider(scope.companyId, providerId);
    const hasConfig = Object.keys(provider.config ?? {}).length > 0;
    const nextStatus = hasConfig ? 'testing' : provider.status;

    const [updated] = await this.deps.db
      .update(siCrmProviderAdapters)
      .set({
        status: nextStatus,
        lastHealthCheckAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(siCrmProviderAdapters.id, providerId))
      .returning();

    await this.recordAudit(scope, 'crm_provider_tested', 'si_crm_provider', providerId);
    return toCrmProviderSummary(updated!);
  }

  async listSalesAlerts(
    companyId: string,
    filters?: { status?: string },
  ): Promise<SiSalesAlertSummary[]> {
    const conditions = [eq(siSalesAlerts.companyId, companyId)];
    if (filters?.status) {
      conditions.push(
        eq(siSalesAlerts.status, filters.status as typeof siSalesAlerts.$inferSelect.status),
      );
    }

    const rows = await this.deps.db.query.siSalesAlerts.findMany({
      where: and(...conditions),
      orderBy: [desc(siSalesAlerts.createdAt)],
      limit: 100,
    });
    return rows.map(toSalesAlertSummary);
  }

  async syncSalesAlerts(scope: StaffScope): Promise<SiSalesAlertSummary[]> {
    const monitoring = await this.getRevenueMonitoring(scope.companyId);
    const existingOpen = await this.listSalesAlerts(scope.companyId, { status: 'open' });
    const syncedAt = new Date();

    const alertDefinitions: Array<{
      alertType: string;
      severity: 'info' | 'warning' | 'critical';
      title: string;
      description: string;
      active: boolean;
    }> = [
      {
        alertType: 'unassigned_leads',
        severity: 'warning',
        title: 'Unassigned leads',
        description: `${monitoring.unassignedLeadCount} active lead(s) have no owner.`,
        active: monitoring.unassignedLeadCount > 0,
      },
      {
        alertType: 'stalled_opportunities',
        severity: 'warning',
        title: 'Stalled opportunities',
        description: `${monitoring.stalledOpportunityCount} open opportunity(ies) have not progressed recently.`,
        active: monitoring.stalledOpportunityCount > 0,
      },
      {
        alertType: 'quote_expiry',
        severity: 'warning',
        title: 'Expired quotes',
        description: `${monitoring.expiringQuoteCount} quote(s) have passed their validity date.`,
        active: monitoring.expiringQuoteCount > 0,
      },
      {
        alertType: 'sla_breach',
        severity: 'critical',
        title: 'Pipeline SLA breaches',
        description: `${monitoring.slaBreachCount} opportunity(ies) exceeded stage SLA thresholds.`,
        active: monitoring.slaBreachCount > 0,
      },
      {
        alertType: 'crm_sync_failure',
        severity: 'critical',
        title: 'CRM sync failure',
        description: `${monitoring.crmSyncFailureCount} CRM provider(s) in error state.`,
        active: monitoring.crmSyncFailureCount > 0,
      },
    ];

    for (const definition of alertDefinitions) {
      const existing = existingOpen.find((row) => row.alertType === definition.alertType);
      if (definition.active && !existing) {
        await this.deps.db.insert(siSalesAlerts).values({
          companyId: scope.companyId,
          alertType: definition.alertType,
          severity: definition.severity,
          status: 'open',
          title: definition.title,
          description: definition.description,
          sourceModule: 'sales_intelligence',
          context: { syncedAt: syncedAt.toISOString(), monitoring },
        });
      } else if (!definition.active && existing) {
        await this.deps.db
          .update(siSalesAlerts)
          .set({ status: 'resolved', updatedAt: syncedAt })
          .where(eq(siSalesAlerts.id, existing.id));
      }
    }

    await this.recordAudit(scope, 'sales_alerts_synced');
    return this.listSalesAlerts(scope.companyId, { status: 'open' });
  }

  async createSalesActionDraft(
    scope: StaffScope,
    input: CreateSiSalesActionDraftRequest,
  ): Promise<{ id: string; title: string; draftType: string; workflowStatus: string }> {
    const [created] = await this.deps.db
      .insert(siSalesActionDrafts)
      .values({
        companyId: scope.companyId,
        userId: scope.userId,
        draftType: input.draftType.trim(),
        title: input.title.trim(),
        content: input.content.trim(),
        workflowStatus: 'draft',
        sourceRecords: input.sourceRecords ?? {},
        aiGenerated: input.aiGenerated ?? false,
        requiresHumanReview: true,
      })
      .returning();

    await this.recordAudit(scope, 'sales_draft_created', 'si_sales_action_draft', created!.id);
    return {
      id: created!.id,
      title: created!.title,
      draftType: created!.draftType,
      workflowStatus: created!.workflowStatus,
    };
  }

  async captureAnalytics(scope: StaffScope): Promise<SiAnalyticsSummary> {
    const [dashboard, marketingStats] = await Promise.all([
      this.getDashboard(scope.companyId),
      this.deps.marketingService.getStats(scope.companyId),
    ]);
    const renewalExposureCents = dashboard.recentRenewals.reduce(
      (sum, renewal) => sum + (renewal.currentValueCents ?? 0),
      0,
    );
    const revenueLeakageCents = dashboard.recentLeakageFindings.reduce(
      (sum, finding) => sum + (finding.estimatedAmountCents ?? 0),
      0,
    );

    const [created] = await this.deps.db
      .insert(siAnalyticsSnapshots)
      .values({
        companyId: scope.companyId,
        pipelineValueCents: dashboard.salesStats.pipelineValueCents,
        weightedPipelineCents: dashboard.salesStats.pipelineValueCents,
        openOpportunityCount: dashboard.salesStats.openOpportunityCount,
        activeLeadCount: dashboard.leadStats.activeLeadCount,
        openAlertCount: dashboard.openAlertCount,
        renewalExposureCents,
        revenueLeakageCents,
        currency: dashboard.currency,
      })
      .returning();

    await this.recordAudit(scope, 'analytics_captured', undefined, undefined, {
      activeCampaignCount: marketingStats.activeCampaignCount,
    });
    return toAnalyticsSummary(created!);
  }

  async getLatestAnalytics(companyId: string): Promise<SiAnalyticsSummary | null> {
    const row = await this.deps.db.query.siAnalyticsSnapshots.findFirst({
      where: eq(siAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(siAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseSalesIntelligenceAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    const renewalExposureCents = dashboard.recentRenewals.reduce(
      (sum, renewal) => sum + (renewal.currentValueCents ?? 0),
      0,
    );

    return {
      pipelineValueCents: dashboard.salesStats.pipelineValueCents,
      openOpportunityCount: dashboard.salesStats.openOpportunityCount,
      activeLeadCount: dashboard.leadStats.activeLeadCount,
      openAlertCount: dashboard.openAlertCount,
      renewalExposureCents,
      summary: dashboard.summary,
    };
  }

  private async syncLeadDeduplicationCandidates(companyId: string) {
    const leadRows = await this.deps.leadsService.listLeads(companyId);
    const activeLeads = leadRows.filter((row) => !['converted', 'lost'].includes(row.status));
    const existing = await this.deps.db.query.siLeadDeduplicationCandidates.findMany({
      where: and(
        eq(siLeadDeduplicationCandidates.companyId, companyId),
        eq(siLeadDeduplicationCandidates.status, 'pending'),
      ),
    });
    const existingPairs = new Set(
      existing.map((row) => `${row.primaryLeadId}:${row.duplicateLeadId}`),
    );

    for (let i = 0; i < activeLeads.length; i += 1) {
      for (let j = i + 1; j < activeLeads.length; j += 1) {
        const primary = activeLeads[i]!;
        const duplicate = activeLeads[j]!;
        const pairKey = `${primary.id}:${duplicate.id}`;
        if (existingPairs.has(pairKey)) continue;

        const matchReasons: string[] = [];
        let matchScore = 0;

        if (
          primary.contactEmail &&
          duplicate.contactEmail &&
          primary.contactEmail.toLowerCase() === duplicate.contactEmail.toLowerCase()
        ) {
          matchReasons.push('matching_email');
          matchScore += 50;
        }
        if (
          primary.contactPhone &&
          duplicate.contactPhone &&
          normalizePhone(primary.contactPhone) === normalizePhone(duplicate.contactPhone)
        ) {
          matchReasons.push('matching_phone');
          matchScore += 40;
        }
        if (
          primary.contactName.toLowerCase() === duplicate.contactName.toLowerCase() &&
          primary.title.toLowerCase() === duplicate.title.toLowerCase()
        ) {
          matchReasons.push('matching_name_and_title');
          matchScore += 25;
        }

        if (matchScore >= 40) {
          await this.deps.db.insert(siLeadDeduplicationCandidates).values({
            companyId,
            primaryLeadId: primary.id,
            duplicateLeadId: duplicate.id,
            matchScore: String(matchScore),
            matchReason: matchReasons.join(', '),
            status: 'pending',
          });
          existingPairs.add(pairKey);
        }
      }
    }
  }

  private async buildPipelineSummary(
    row: typeof siPipelines.$inferSelect,
  ): Promise<SiPipelineSummary> {
    const stages = await this.deps.db.query.siPipelineStages.findMany({
      where: eq(siPipelineStages.pipelineId, row.id),
    });
    return {
      id: row.id,
      name: row.name,
      pipelineKey: row.pipelineKey,
      pipelineType: row.pipelineType,
      isActive: row.isActive,
      stageCount: stages.length,
    };
  }

  private async buildForecastSummary(
    row: typeof siForecasts.$inferSelect,
  ): Promise<SiForecastSummary> {
    const owner = row.ownerUserId
      ? await this.deps.db.query.users.findFirst({ where: eq(users.id, row.ownerUserId) })
      : null;

    return {
      id: row.id,
      title: row.title,
      forecastType: row.forecastType,
      workflowStatus: row.workflowStatus,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      currency: row.currency,
      pipelineValueCents: row.pipelineValueCents,
      weightedPipelineCents: row.weightedPipelineCents,
      commitCents: row.commitCents,
      confidenceScore: row.confidenceScore != null ? String(row.confidenceScore) : null,
      isSimulation: row.isSimulation,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
    };
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.siPlatformConfig.findFirst({
      where: eq(siPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db.insert(siPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async ensureTerritory(companyId: string, territoryId: string) {
    const territory = await this.deps.db.query.siTerritories.findFirst({
      where: and(eq(siTerritories.companyId, companyId), eq(siTerritories.id, territoryId)),
    });
    if (!territory) throw new EnterpriseSalesIntelligenceError('NOT_FOUND', 'Territory not found');
    return territory;
  }

  private async ensureSalesTeam(companyId: string, teamId: string) {
    const team = await this.deps.db.query.siSalesTeams.findFirst({
      where: and(eq(siSalesTeams.companyId, companyId), eq(siSalesTeams.id, teamId)),
    });
    if (!team) throw new EnterpriseSalesIntelligenceError('NOT_FOUND', 'Sales team not found');
    return team;
  }

  private async ensurePipeline(companyId: string, pipelineId: string) {
    const pipeline = await this.deps.db.query.siPipelines.findFirst({
      where: and(eq(siPipelines.companyId, companyId), eq(siPipelines.id, pipelineId)),
    });
    if (!pipeline) throw new EnterpriseSalesIntelligenceError('NOT_FOUND', 'Pipeline not found');
    return pipeline;
  }

  private async ensureForecast(companyId: string, forecastId: string) {
    const forecast = await this.deps.db.query.siForecasts.findFirst({
      where: and(eq(siForecasts.companyId, companyId), eq(siForecasts.id, forecastId)),
    });
    if (!forecast) throw new EnterpriseSalesIntelligenceError('NOT_FOUND', 'Forecast not found');
    return forecast;
  }

  private async ensureAccount(companyId: string, accountId: string) {
    const account = await this.deps.db.query.siAccounts.findFirst({
      where: and(eq(siAccounts.companyId, companyId), eq(siAccounts.id, accountId)),
    });
    if (!account) throw new EnterpriseSalesIntelligenceError('NOT_FOUND', 'Account not found');
    return account;
  }

  private async ensureDiscountRequest(companyId: string, requestId: string) {
    const request = await this.deps.db.query.siDiscountRequests.findFirst({
      where: and(eq(siDiscountRequests.companyId, companyId), eq(siDiscountRequests.id, requestId)),
    });
    if (!request)
      throw new EnterpriseSalesIntelligenceError('NOT_FOUND', 'Discount request not found');
    return request;
  }

  private async ensureCrmProvider(companyId: string, providerId: string) {
    const provider = await this.deps.db.query.siCrmProviderAdapters.findFirst({
      where: and(
        eq(siCrmProviderAdapters.companyId, companyId),
        eq(siCrmProviderAdapters.id, providerId),
      ),
    });
    if (!provider)
      throw new EnterpriseSalesIntelligenceError('NOT_FOUND', 'CRM provider not found');
    return provider;
  }

  private async recordAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(siAuditLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      metadata: metadata ?? {},
    });
  }
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

function toPlatformConfigSummary(
  row: typeof siPlatformConfig.$inferSelect,
): SiPlatformConfigSummary {
  return {
    salesStandards: row.salesStandards,
    providerAdapterTemplates: row.providerAdapterTemplates,
    pipelineTemplates: row.pipelineTemplates,
    playbookTemplates: row.playbookTemplates,
    targetTemplates: row.targetTemplates,
    forecastMethodology: row.forecastMethodology,
    attributionStandards: row.attributionStandards,
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toCategorySummary(row: typeof siSalesCategories.$inferSelect): SiSalesCategorySummary {
  return {
    id: row.id,
    name: row.name,
    categoryKey: row.categoryKey,
    description: row.description,
    isActive: row.isActive,
  };
}

function toTerritorySummary(row: typeof siTerritories.$inferSelect): SiTerritorySummary {
  return {
    id: row.id,
    name: row.name,
    territoryKey: row.territoryKey,
    territoryType: row.territoryType,
    branch: row.branch,
    isActive: row.isActive,
  };
}

function toSalesTeamSummary(row: typeof siSalesTeams.$inferSelect): SiSalesTeamSummary {
  return {
    id: row.id,
    name: row.name,
    teamKey: row.teamKey,
    territoryId: row.territoryId,
    leaderUserId: row.leaderUserId,
    isActive: row.isActive,
  };
}

function toPipelineStageSummary(row: typeof siPipelineStages.$inferSelect): SiPipelineStageSummary {
  return {
    id: row.id,
    pipelineId: row.pipelineId,
    name: row.name,
    stageKey: row.stageKey,
    sortOrder: row.sortOrder,
    probabilityPercent: row.probabilityPercent != null ? String(row.probabilityPercent) : null,
    slaHours: row.slaHours,
  };
}

function toLeadDeduplicationCandidateSummary(
  row: typeof siLeadDeduplicationCandidates.$inferSelect,
): SiLeadDeduplicationCandidateSummary {
  return {
    id: row.id,
    primaryLeadId: row.primaryLeadId,
    duplicateLeadId: row.duplicateLeadId,
    matchScore: row.matchScore != null ? String(row.matchScore) : null,
    matchReason: row.matchReason,
    status: row.status,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

function toPlaybookSummary(row: typeof siPlaybooks.$inferSelect): SiPlaybookSummary {
  return {
    id: row.id,
    name: row.name,
    playbookKey: row.playbookKey,
    playbookType: row.playbookType,
    isActive: row.isActive,
  };
}

function toSalesTargetSummary(row: typeof siSalesTargets.$inferSelect): SiSalesTargetSummary {
  return {
    id: row.id,
    targetKey: row.targetKey,
    title: row.title,
    targetType: row.targetType,
    status: row.status,
    targetValue: row.targetValue != null ? String(row.targetValue) : null,
    currentValue: row.currentValue != null ? String(row.currentValue) : null,
    unit: row.unit,
    progressPercent: row.progressPercent != null ? String(row.progressPercent) : null,
  };
}

function toAccountSummary(row: typeof siAccounts.$inferSelect): SiAccountSummary {
  return {
    id: row.id,
    name: row.name,
    accountType: row.accountType,
    customerId: row.customerId,
    ownerUserId: row.ownerUserId,
    territoryId: row.territoryId,
    isActive: row.isActive,
  };
}

function toAccountPlanSummary(row: typeof siAccountPlans.$inferSelect): SiAccountPlanSummary {
  return {
    id: row.id,
    accountId: row.accountId,
    title: row.title,
    workflowStatus: row.workflowStatus,
  };
}

function toRenewalSummary(row: typeof siRenewalRecords.$inferSelect): SiRenewalSummary {
  return {
    id: row.id,
    title: row.title,
    renewalType: row.renewalType,
    renewalDate: row.renewalDate,
    currentValueCents: row.currentValueCents,
    proposedValueCents: row.proposedValueCents,
    renewalProbability: row.renewalProbability != null ? String(row.renewalProbability) : null,
    workflowStatus: row.workflowStatus,
  };
}

function toCustomerGrowthSnapshotSummary(
  row: typeof siCustomerGrowthSnapshots.$inferSelect,
): SiCustomerGrowthSnapshotSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    opportunityType: row.opportunityType,
    title: row.title,
    confidenceScore: row.confidenceScore != null ? String(row.confidenceScore) : null,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toRetentionRiskSnapshotSummary(
  row: typeof siRetentionRiskSnapshots.$inferSelect,
): SiRetentionRiskSnapshotSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    riskLevel: row.riskLevel,
    riskFactors: row.riskFactors,
    confidenceScore: row.confidenceScore != null ? String(row.confidenceScore) : null,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toPricingRuleSummary(row: typeof siPricingRules.$inferSelect): SiPricingRuleSummary {
  return {
    id: row.id,
    name: row.name,
    ruleKey: row.ruleKey,
    ruleType: row.ruleType,
    isActive: row.isActive,
  };
}

function toDiscountPolicySummary(
  row: typeof siDiscountPolicies.$inferSelect,
): SiDiscountPolicySummary {
  return {
    id: row.id,
    name: row.name,
    policyKey: row.policyKey,
    maxDiscountPercent: row.maxDiscountPercent != null ? String(row.maxDiscountPercent) : null,
    marginFloorPercent: row.marginFloorPercent != null ? String(row.marginFloorPercent) : null,
    approvalThresholdPercent:
      row.approvalThresholdPercent != null ? String(row.approvalThresholdPercent) : null,
    isActive: row.isActive,
  };
}

function toDiscountRequestSummary(
  row: typeof siDiscountRequests.$inferSelect,
): SiDiscountRequestSummary {
  return {
    id: row.id,
    quoteId: row.quoteId,
    discountPercent: row.discountPercent != null ? String(row.discountPercent) : null,
    discountAmountCents: row.discountAmountCents,
    reason: row.reason,
    workflowStatus: row.workflowStatus,
    approvedAt: row.approvedAt?.toISOString() ?? null,
  };
}

function toCommissionPlanSummary(
  row: typeof siCommissionPlans.$inferSelect,
): SiCommissionPlanSummary {
  return {
    id: row.id,
    name: row.name,
    planKey: row.planKey,
    formula: row.formula,
    isActive: row.isActive,
  };
}

function toCommissionEntrySummary(
  row: typeof siCommissionEntries.$inferSelect,
): SiCommissionEntrySummary {
  return {
    id: row.id,
    planId: row.planId,
    userId: row.userId,
    status: row.status,
    amountCents: row.amountCents,
    workflowStatus: row.workflowStatus,
  };
}

function toQualificationAnalysisSummary(
  row: typeof siQualificationAnalyses.$inferSelect,
): SiQualificationAnalysisSummary {
  return {
    id: row.id,
    leadId: row.leadId,
    recommendation: row.recommendation,
    priority: row.priority,
    confidenceScore: row.confidenceScore != null ? String(row.confidenceScore) : null,
    supportingEvidence: row.supportingEvidence,
    limitations: row.limitations,
    requiresHumanReview: row.requiresHumanReview,
    createdAt: row.createdAt.toISOString(),
  };
}

function toWinLossRecordSummary(row: typeof siWinLossRecords.$inferSelect): SiWinLossRecordSummary {
  return {
    id: row.id,
    opportunityId: row.opportunityId,
    outcome: row.outcome,
    reason: row.reason,
    competitor: row.competitor,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRevenueLeakageFindingSummary(
  row: typeof siRevenueLeakageFindings.$inferSelect,
): SiRevenueLeakageFindingSummary {
  return {
    id: row.id,
    findingType: row.findingType,
    title: row.title,
    description: row.description,
    estimatedAmountCents: row.estimatedAmountCents,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPartnerSummary(row: typeof siPartnerProfiles.$inferSelect): SiPartnerSummary {
  return {
    id: row.id,
    name: row.name,
    partnerType: row.partnerType,
    isActive: row.isActive,
  };
}

function toReferralSummary(row: typeof siReferralRecords.$inferSelect): SiReferralSummary {
  return {
    id: row.id,
    partnerId: row.partnerId,
    leadId: row.leadId,
    customerId: row.customerId,
    status: row.status,
    revenueCents: row.revenueCents,
  };
}

function toTenderSummary(row: typeof siTenders.$inferSelect): SiTenderSummary {
  return {
    id: row.id,
    title: row.title,
    tenderNumber: row.tenderNumber,
    deadline: row.deadline?.toISOString() ?? null,
    status: row.status,
    workflowStatus: row.workflowStatus,
  };
}

function toCrmProviderSummary(
  row: typeof siCrmProviderAdapters.$inferSelect,
): SiCrmProviderSummary {
  return {
    id: row.id,
    name: row.name,
    providerType: row.providerType,
    status: row.status,
    syncDirection: row.syncDirection,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastHealthCheckAt: row.lastHealthCheckAt?.toISOString() ?? null,
  };
}

function toSalesAlertSummary(row: typeof siSalesAlerts.$inferSelect): SiSalesAlertSummary {
  return {
    id: row.id,
    alertType: row.alertType,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    sourceModule: row.sourceModule,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof siAnalyticsSnapshots.$inferSelect): SiAnalyticsSummary {
  return {
    pipelineValueCents: row.pipelineValueCents,
    weightedPipelineCents: row.weightedPipelineCents,
    openOpportunityCount: row.openOpportunityCount,
    activeLeadCount: row.activeLeadCount,
    openAlertCount: row.openAlertCount,
    renewalExposureCents: row.renewalExposureCents,
    revenueLeakageCents: row.revenueLeakageCents,
    currency: row.currency,
    capturedAt: row.capturedAt.toISOString(),
  };
}
