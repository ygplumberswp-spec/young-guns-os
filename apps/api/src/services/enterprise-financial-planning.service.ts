import { and, desc, eq } from 'drizzle-orm';
import type {
  CaptureFpProfitabilityRequest,
  CreateFpAccountingProviderRequest,
  CreateFpBankingProviderRequest,
  CreateFpBudgetRequest,
  CreateFpEntityRequest,
  CreateFpFinancialTargetRequest,
  CreateFpForecastRequest,
  CreateFpPlanningActionDraftRequest,
  CreateFpPlanningCategoryRequest,
  CreateFpScenarioRequest,
  CreateFpTreasuryAccountRequest,
  EnterpriseFinancialPlanningAuraContext,
  EnterpriseFinancialPlanningDashboard,
  FpAccountingProviderSummary,
  FpAnalyticsSummary,
  FpBankingProviderSummary,
  FpBudgetSummary,
  FpCashFlowProjectionSummary,
  FpFinancialAlertSummary,
  FpFinancialMonitoringSummary,
  FpFinancialTargetSummary,
  FpForecastSummary,
  FpPayablesIntelligenceSummary,
  FpPlatformConfigSummary,
  FpPortalFinanceSummary,
  FpProfitabilitySnapshotSummary,
  FpReceivablesIntelligenceSummary,
  FpScenarioSummary,
  FpTreasuryAccountSummary,
  FpWorkingCapitalSummary,
  UpdateFpPlatformConfigRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  fpAccountingProviderAdapters,
  fpAnalyticsSnapshots,
  fpAuditLogs,
  fpBankingProviderAdapters,
  fpBudgetLines,
  fpBudgets,
  fpBudgetVersions,
  fpCashFlowProjections,
  fpEntities,
  fpFinancialAlerts,
  fpFinancialTargets,
  fpForecastSnapshots,
  fpForecasts,
  fpPlanningActionDrafts,
  fpPlanningCategories,
  fpPlatformConfig,
  fpProfitabilitySnapshots,
  fpScenarioLines,
  fpScenarios,
  fpTreasuryAccounts,
  users,
} from '@titan/db';
import type { AnalyticsService } from './analytics.service.js';
import type { EnterpriseSaasPlatformService } from './enterprise-saas-platform.service.js';
import type { FinanceIntelligenceService } from './finance-intelligence.service.js';
import type { FinanceService } from './finance.service.js';
import type { ProcurementService } from './procurement.service.js';

export class EnterpriseFinancialPlanningError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseFinancialPlanningError';
  }
}

type StaffScope = { companyId: string; userId: string };

type FinancialPlanningDeps = {
  db: DatabaseClient;
  enterpriseSaasPlatformService: EnterpriseSaasPlatformService;
  financeService: FinanceService;
  financeIntelligenceService: FinanceIntelligenceService;
  analyticsService: AnalyticsService;
  procurementService: ProcurementService;
};

export class EnterpriseFinancialPlanningService {
  constructor(private readonly deps: FinancialPlanningDeps) {}

  async getDashboard(companyId: string): Promise<EnterpriseFinancialPlanningDashboard> {
    const isPlatformOwner =
      await this.deps.enterpriseSaasPlatformService.isPlatformOwnerTenant(companyId);
    const [
      platformConfig,
      budgets,
      forecasts,
      scenarios,
      targets,
      alerts,
      treasuryAccounts,
      accountingProviders,
      bankingProviders,
      cashFlowProjections,
      profitabilitySnapshots,
      analytics,
      financialMonitoring,
      receivables,
      payables,
      workingCapital,
      cashFlow,
    ] = await Promise.all([
      this.getPlatformConfig(companyId),
      this.listBudgets(companyId),
      this.listForecasts(companyId),
      this.listScenarios(companyId),
      this.listFinancialTargets(companyId),
      this.listFinancialAlerts(companyId, { status: 'open' }),
      this.listTreasuryAccounts(companyId),
      this.listAccountingProviders(companyId),
      this.listBankingProviders(companyId),
      this.listCashFlowProjections(companyId),
      this.listProfitabilitySnapshots(companyId),
      this.getLatestAnalytics(companyId),
      this.getFinancialMonitoring(companyId),
      this.buildReceivablesSummary(companyId),
      this.buildPayablesSummary(companyId),
      this.buildWorkingCapitalSummary(companyId),
      this.deps.financeIntelligenceService.getCashFlowIntelligence(companyId),
    ]);

    const activeBudgets = budgets.filter((b) => b.status === 'active');
    const activeForecasts = forecasts.filter(
      (f) => f.workflowStatus === 'executed' || f.workflowStatus === 'approved',
    );
    const treasuryBalanceCents = treasuryAccounts.reduce(
      (sum, account) => sum + (account.currentBalanceCents ?? 0),
      0,
    );
    const cashPositionCents =
      treasuryBalanceCents > 0 ? treasuryBalanceCents : cashFlow.currentPositionCents;
    const cashRunwayDays = this.estimateCashRunwayDays(cashPositionCents, cashFlow.outflowCents);

    return {
      summary: `${budgets.length} budget(s), ${forecasts.length} forecast(s), ${scenarios.length} scenario(s), ${alerts.length} open alert(s).`,
      isPlatformOwner,
      platformConfig,
      budgetCount: budgets.length,
      activeBudgetCount: activeBudgets.length,
      forecastCount: forecasts.length,
      activeForecastCount: activeForecasts.length,
      scenarioCount: scenarios.length,
      targetCount: targets.length,
      openAlertCount: alerts.length,
      treasuryAccountCount: treasuryAccounts.length,
      accountingProviderCount: accountingProviders.length,
      bankingProviderCount: bankingProviders.length,
      cashPositionCents,
      cashRunwayDays,
      cashShortageWarning: cashFlow.cashShortageWarning,
      currency: cashFlow.currency,
      analytics,
      financialMonitoring,
      receivables,
      payables,
      workingCapital,
      recentBudgets: budgets.slice(0, 10),
      recentForecasts: forecasts.slice(0, 10),
      recentScenarios: scenarios.slice(0, 10),
      recentAlerts: alerts.slice(0, 10),
      recentCashFlowProjections: cashFlowProjections.slice(0, 10),
      recentProfitabilitySnapshots: profitabilitySnapshots.slice(0, 10),
    };
  }

  async getFinancialMonitoring(companyId: string): Promise<FpFinancialMonitoringSummary> {
    const [cashFlow, receivables, budgets, accountingProviders, bankingProviders] =
      await Promise.all([
        this.deps.financeIntelligenceService.getCashFlowIntelligence(companyId),
        this.deps.financeIntelligenceService.getReceivablesIntelligence(companyId),
        this.listBudgets(companyId),
        this.listAccountingProviders(companyId),
        this.listBankingProviders(companyId),
      ]);

    const activeBudgets = budgets.filter((b) => b.status === 'active');
    let budgetOverspendCount = 0;
    for (const budget of activeBudgets) {
      if (budget.varianceAmountCents != null && budget.varianceAmountCents < 0) {
        budgetOverspendCount += 1;
      }
    }

    const financeBudgets = await this.deps.financeIntelligenceService.listBudgets(companyId);
    for (const budget of financeBudgets.filter((row) => row.status === 'active')) {
      try {
        const variance = await this.deps.financeIntelligenceService.getBudgetVariance(
          companyId,
          budget.id,
        );
        if (variance.totalVarianceCents < 0) {
          budgetOverspendCount += 1;
        }
      } catch {
        // Skip budgets that cannot be resolved.
      }
    }

    const syncFailureCount = [...accountingProviders, ...bankingProviders].filter(
      (provider) => provider.status === 'error',
    ).length;

    const profitability = await this.deps.financeIntelligenceService
      .getProfitabilityIntelligence(companyId)
      .catch(() => null);
    const marginDeclineCount =
      profitability != null &&
      profitability.netMarginPercent != null &&
      profitability.netMarginPercent < 10
        ? 1
        : 0;

    const cashShortfallRisk = cashFlow.cashShortageWarning;
    const treasuryAccounts = await this.listTreasuryAccounts(companyId);
    const treasuryBalanceCents = treasuryAccounts.reduce(
      (sum, account) => sum + (account.currentBalanceCents ?? 0),
      0,
    );
    const cashPositionCents =
      treasuryBalanceCents > 0 ? treasuryBalanceCents : cashFlow.currentPositionCents;
    const cashRunwayDays = this.estimateCashRunwayDays(cashPositionCents, cashFlow.outflowCents);
    const lowCashRunway = cashRunwayDays != null && cashRunwayDays < 30;

    const alerts: string[] = [];
    if (cashShortfallRisk) alerts.push('Projected cash shortfall detected');
    if (lowCashRunway) alerts.push(`Low cash runway (${cashRunwayDays} day(s))`);
    if (receivables.overdueCount > 0) {
      alerts.push(`${receivables.overdueCount} overdue invoice(s)`);
    }
    if (budgetOverspendCount > 0) alerts.push(`${budgetOverspendCount} budget(s) over plan`);
    if (syncFailureCount > 0) alerts.push(`${syncFailureCount} provider sync failure(s)`);
    if (marginDeclineCount > 0) alerts.push('Margin below target threshold');

    return {
      cashShortfallRisk,
      lowCashRunway,
      budgetOverspendCount,
      marginDeclineCount,
      syncFailureCount,
      alerts,
    };
  }

  async getPortalFinanceSummary(
    companyId: string,
    customerId?: string,
  ): Promise<FpPortalFinanceSummary> {
    const [stats, invoiceRows, quoteRows] = await Promise.all([
      this.deps.financeService.getStats(companyId),
      this.deps.financeService.listInvoices(companyId),
      this.deps.financeService.listQuotes(companyId),
    ]);

    const filteredInvoices = customerId
      ? invoiceRows.filter((row) => row.customerId === customerId)
      : invoiceRows;
    const filteredQuotes = customerId
      ? quoteRows.filter((row) => row.customerId === customerId)
      : quoteRows;

    const now = new Date();
    let outstandingBalanceCents = 0;
    let overdueBalanceCents = 0;

    for (const invoice of filteredInvoices) {
      const outstanding = Math.max(0, invoice.amountCents - invoice.amountPaidCents);
      if (outstanding <= 0 || ['paid', 'cancelled', 'draft'].includes(invoice.status)) {
        continue;
      }
      outstandingBalanceCents += outstanding;
      if (invoice.dueDate && new Date(invoice.dueDate) < now) {
        overdueBalanceCents += outstanding;
      }
    }

    const pendingQuoteCount = filteredQuotes.filter((row) =>
      ['draft', 'sent'].includes(row.status),
    ).length;

    return {
      outstandingBalanceCents,
      overdueBalanceCents,
      pendingQuoteCount,
      currency: stats.currency,
      summary:
        outstandingBalanceCents > 0
          ? `Outstanding balance ${(outstandingBalanceCents / 100).toFixed(2)} ${stats.currency}${overdueBalanceCents > 0 ? ` including ${(overdueBalanceCents / 100).toFixed(2)} overdue` : ''}.`
          : 'No outstanding balance.',
    };
  }

  async getPlatformConfig(companyId: string): Promise<FpPlatformConfigSummary> {
    const row = await this.ensurePlatformConfig(companyId);
    return toPlatformConfigSummary(row);
  }

  async updatePlatformConfig(
    scope: StaffScope,
    input: UpdateFpPlatformConfigRequest,
  ): Promise<FpPlatformConfigSummary> {
    const existing = await this.ensurePlatformConfig(scope.companyId);
    const [updated] = await this.deps.db
      .update(fpPlatformConfig)
      .set({
        financeStandards: input.financeStandards ?? existing.financeStandards,
        providerAdapterTemplates:
          input.providerAdapterTemplates ?? existing.providerAdapterTemplates,
        currencyStandards: input.currencyStandards ?? existing.currencyStandards,
        planningTemplates: input.planningTemplates ?? existing.planningTemplates,
        kpiTemplates: input.kpiTemplates ?? existing.kpiTemplates,
        riskThresholds: input.riskThresholds ?? existing.riskThresholds,
        allocationMethods: input.allocationMethods ?? existing.allocationMethods,
        auditRetentionDays: input.auditRetentionDays ?? existing.auditRetentionDays,
        updatedAt: new Date(),
      })
      .where(eq(fpPlatformConfig.companyId, scope.companyId))
      .returning();

    await this.recordAudit(scope, 'platform_config_updated');
    return toPlatformConfigSummary(updated!);
  }

  async createCategory(
    scope: StaffScope,
    input: CreateFpPlanningCategoryRequest,
  ): Promise<ReturnType<typeof toCategorySummary>> {
    const [created] = await this.deps.db
      .insert(fpPlanningCategories)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        categoryKey: input.categoryKey.trim(),
        description: input.description?.trim() ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'category_created', 'fp_planning_category', created!.id);
    return toCategorySummary(created!);
  }

  async listCategories(companyId: string) {
    const rows = await this.deps.db.query.fpPlanningCategories.findMany({
      where: eq(fpPlanningCategories.companyId, companyId),
      orderBy: [desc(fpPlanningCategories.createdAt)],
    });
    return rows.map(toCategorySummary);
  }

  async createEntity(scope: StaffScope, input: CreateFpEntityRequest) {
    if (input.parentEntityId) {
      await this.ensureEntity(scope.companyId, input.parentEntityId);
    }

    const [created] = await this.deps.db
      .insert(fpEntities)
      .values({
        companyId: scope.companyId,
        name: input.name.trim(),
        entityKey: input.entityKey.trim(),
        entityType: input.entityType?.trim() ?? null,
        currency: input.currency?.trim() ?? null,
        taxJurisdiction: input.taxJurisdiction?.trim() ?? null,
        parentEntityId: input.parentEntityId ?? null,
        config: input.config ?? {},
      })
      .returning();

    await this.recordAudit(scope, 'entity_created', 'fp_entity', created!.id);
    return toEntitySummary(created!);
  }

  async listEntities(companyId: string) {
    const rows = await this.deps.db.query.fpEntities.findMany({
      where: eq(fpEntities.companyId, companyId),
      orderBy: [desc(fpEntities.createdAt)],
    });
    return rows.map(toEntitySummary);
  }

  async createBudget(scope: StaffScope, input: CreateFpBudgetRequest): Promise<FpBudgetSummary> {
    if (input.entityId) await this.ensureEntity(scope.companyId, input.entityId);
    if (input.categoryId) await this.ensureCategory(scope.companyId, input.categoryId);

    const [created] = await this.deps.db
      .insert(fpBudgets)
      .values({
        companyId: scope.companyId,
        entityId: input.entityId ?? null,
        categoryId: input.categoryId ?? null,
        ownerUserId: scope.userId,
        title: input.title.trim(),
        budgetPeriod:
          (input.budgetPeriod as typeof fpBudgets.$inferInsert.budgetPeriod) ?? 'annual',
        status: 'draft',
        workflowStatus: 'draft',
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        currency: input.currency ?? 'ZAR',
        version: 1,
        assumptions: input.assumptions?.trim() ?? null,
        notes: input.notes?.trim() ?? null,
        totalAmountCents: input.totalAmountCents ?? null,
      })
      .returning();

    const [version] = await this.deps.db
      .insert(fpBudgetVersions)
      .values({
        companyId: scope.companyId,
        budgetId: created!.id,
        versionNumber: 1,
        status: 'draft',
        workflowStatus: 'draft',
        assumptions: input.assumptions?.trim() ?? null,
        notes: input.notes?.trim() ?? null,
        totalAmountCents: input.totalAmountCents ?? null,
      })
      .returning();

    if (input.lines?.length) {
      await this.deps.db.insert(fpBudgetLines).values(
        input.lines.map((line) => ({
          companyId: scope.companyId,
          budgetId: created!.id,
          budgetVersionId: version!.id,
          lineKey: line.lineKey.trim(),
          description: line.description.trim(),
          department: line.department?.trim() ?? null,
          branch: line.branch?.trim() ?? null,
          project: line.project?.trim() ?? null,
          costCentre: line.costCentre?.trim() ?? null,
          plannedAmountCents: line.plannedAmountCents,
          currency: input.currency ?? 'ZAR',
        })),
      );
    }

    await this.recordAudit(scope, 'budget_created', 'fp_budget', created!.id);
    return this.buildBudgetSummary(created!);
  }

  async listBudgets(companyId: string): Promise<FpBudgetSummary[]> {
    const rows = await this.deps.db.query.fpBudgets.findMany({
      where: eq(fpBudgets.companyId, companyId),
      orderBy: [desc(fpBudgets.updatedAt)],
      limit: 100,
    });

    const summaries: FpBudgetSummary[] = [];
    for (const row of rows) {
      summaries.push(await this.buildBudgetSummary(row));
    }
    return summaries;
  }

  async submitBudgetForReview(scope: StaffScope, budgetId: string): Promise<FpBudgetSummary> {
    const budget = await this.ensureBudget(scope.companyId, budgetId);
    if (budget.workflowStatus !== 'draft') {
      throw new EnterpriseFinancialPlanningError(
        'VALIDATION_ERROR',
        'Budget must be in draft to submit for review',
      );
    }

    const [updated] = await this.deps.db
      .update(fpBudgets)
      .set({ workflowStatus: 'review', status: 'review', updatedAt: new Date() })
      .where(eq(fpBudgets.id, budgetId))
      .returning();

    await this.syncLatestBudgetVersion(scope.companyId, budgetId, {
      workflowStatus: 'review',
      status: 'review',
    });
    await this.recordAudit(scope, 'budget_submitted_for_review', 'fp_budget', budgetId);
    return this.buildBudgetSummary(updated!);
  }

  async submitBudgetForApproval(scope: StaffScope, budgetId: string): Promise<FpBudgetSummary> {
    const budget = await this.ensureBudget(scope.companyId, budgetId);
    if (budget.workflowStatus !== 'review') {
      throw new EnterpriseFinancialPlanningError(
        'VALIDATION_ERROR',
        'Budget must be in review to submit for approval',
      );
    }

    const [updated] = await this.deps.db
      .update(fpBudgets)
      .set({
        workflowStatus: 'pending_approval',
        status: 'pending_approval',
        updatedAt: new Date(),
      })
      .where(eq(fpBudgets.id, budgetId))
      .returning();

    await this.syncLatestBudgetVersion(scope.companyId, budgetId, {
      workflowStatus: 'pending_approval',
      status: 'pending_approval',
    });
    await this.recordAudit(scope, 'budget_submitted_for_approval', 'fp_budget', budgetId);
    return this.buildBudgetSummary(updated!);
  }

  async approveBudget(scope: StaffScope, budgetId: string): Promise<FpBudgetSummary> {
    const budget = await this.ensureBudget(scope.companyId, budgetId);
    if (budget.workflowStatus !== 'pending_approval') {
      throw new EnterpriseFinancialPlanningError(
        'VALIDATION_ERROR',
        'Budget is not pending approval',
      );
    }

    const latestVersion = await this.getLatestBudgetVersion(scope.companyId, budgetId);
    if (latestVersion?.workflowStatus === 'approved') {
      throw new EnterpriseFinancialPlanningError(
        'VALIDATION_ERROR',
        'Approved budget versions cannot be overwritten — create a new version',
      );
    }

    const [updated] = await this.deps.db
      .update(fpBudgets)
      .set({ workflowStatus: 'approved', status: 'pending_approval', updatedAt: new Date() })
      .where(eq(fpBudgets.id, budgetId))
      .returning();

    if (latestVersion) {
      await this.deps.db
        .update(fpBudgetVersions)
        .set({
          workflowStatus: 'approved',
          status: 'pending_approval',
          approvedByUserId: scope.userId,
          approvedAt: new Date(),
        })
        .where(eq(fpBudgetVersions.id, latestVersion.id));
    }

    await this.recordAudit(scope, 'budget_approved', 'fp_budget', budgetId);
    return this.buildBudgetSummary(updated!);
  }

  async activateBudget(scope: StaffScope, budgetId: string): Promise<FpBudgetSummary> {
    const budget = await this.ensureBudget(scope.companyId, budgetId);
    if (budget.workflowStatus !== 'approved') {
      throw new EnterpriseFinancialPlanningError(
        'VALIDATION_ERROR',
        'Budget must be approved before activation',
      );
    }

    const supersedeConditions = [
      eq(fpBudgets.companyId, scope.companyId),
      eq(fpBudgets.status, 'active'),
    ];
    if (budget.entityId) {
      await this.deps.db
        .update(fpBudgets)
        .set({ status: 'superseded', updatedAt: new Date() })
        .where(and(...supersedeConditions, eq(fpBudgets.entityId, budget.entityId)));
    } else {
      await this.deps.db
        .update(fpBudgets)
        .set({ status: 'superseded', updatedAt: new Date() })
        .where(and(...supersedeConditions));
    }

    const [updated] = await this.deps.db
      .update(fpBudgets)
      .set({ workflowStatus: 'executed', status: 'active', updatedAt: new Date() })
      .where(eq(fpBudgets.id, budgetId))
      .returning();

    const latestVersion = await this.getLatestBudgetVersion(scope.companyId, budgetId);
    if (latestVersion) {
      await this.deps.db
        .update(fpBudgetVersions)
        .set({ workflowStatus: 'executed', status: 'active' })
        .where(eq(fpBudgetVersions.id, latestVersion.id));
    }

    await this.recordAudit(scope, 'budget_activated', 'fp_budget', budgetId);
    return this.buildBudgetSummary(updated!);
  }

  async createBudgetVersion(scope: StaffScope, budgetId: string): Promise<FpBudgetSummary> {
    const budget = await this.ensureBudget(scope.companyId, budgetId);
    if (!['approved', 'active', 'superseded'].includes(budget.status)) {
      throw new EnterpriseFinancialPlanningError(
        'VALIDATION_ERROR',
        'New versions can only be created from approved or active budgets',
      );
    }

    const latestVersion = await this.getLatestBudgetVersion(scope.companyId, budgetId);
    const nextVersion = budget.version + 1;
    const existingLines = await this.deps.db.query.fpBudgetLines.findMany({
      where: eq(fpBudgetLines.budgetId, budgetId),
    });

    const [version] = await this.deps.db
      .insert(fpBudgetVersions)
      .values({
        companyId: scope.companyId,
        budgetId,
        versionNumber: nextVersion,
        status: 'draft',
        workflowStatus: 'draft',
        assumptions: latestVersion?.assumptions ?? budget.assumptions,
        notes: latestVersion?.notes ?? budget.notes,
        totalAmountCents: latestVersion?.totalAmountCents ?? budget.totalAmountCents,
      })
      .returning();

    if (existingLines.length > 0) {
      await this.deps.db.insert(fpBudgetLines).values(
        existingLines.map((line) => ({
          companyId: scope.companyId,
          budgetId,
          budgetVersionId: version!.id,
          lineKey: line.lineKey,
          description: line.description,
          department: line.department,
          branch: line.branch,
          project: line.project,
          costCentre: line.costCentre,
          plannedAmountCents: line.plannedAmountCents,
          actualAmountCents: 0,
          forecastAmountCents: line.forecastAmountCents,
          varianceAmountCents: null,
          currency: line.currency,
          metadata: line.metadata,
        })),
      );
    }

    const [updated] = await this.deps.db
      .update(fpBudgets)
      .set({
        version: nextVersion,
        status: 'draft',
        workflowStatus: 'draft',
        updatedAt: new Date(),
      })
      .where(eq(fpBudgets.id, budgetId))
      .returning();

    await this.recordAudit(scope, 'budget_version_created', 'fp_budget', budgetId, {
      version: nextVersion,
    });
    return this.buildBudgetSummary(updated!);
  }

  async createForecast(
    scope: StaffScope,
    input: CreateFpForecastRequest,
  ): Promise<FpForecastSummary> {
    if (input.entityId) await this.ensureEntity(scope.companyId, input.entityId);

    const cashFlow = await this.deps.financeIntelligenceService.getCashFlowIntelligence(
      scope.companyId,
    );

    const [created] = await this.deps.db
      .insert(fpForecasts)
      .values({
        companyId: scope.companyId,
        entityId: input.entityId ?? null,
        ownerUserId: scope.userId,
        title: input.title.trim(),
        forecastType:
          (input.forecastType as typeof fpForecasts.$inferInsert.forecastType) ?? 'base',
        workflowStatus: 'draft',
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        currency: input.currency ?? cashFlow.currency,
        assumptions: input.assumptions ?? {},
        sourceRecords: {
          cashFlowSummary: cashFlow.summary,
          generatedAt: new Date().toISOString(),
        },
        isSimulation: input.isSimulation ?? false,
      })
      .returning();

    await this.recordAudit(scope, 'forecast_created', 'fp_forecast', created!.id);
    return this.buildForecastSummary(created!);
  }

  async listForecasts(companyId: string): Promise<FpForecastSummary[]> {
    const rows = await this.deps.db.query.fpForecasts.findMany({
      where: eq(fpForecasts.companyId, companyId),
      orderBy: [desc(fpForecasts.updatedAt)],
      limit: 100,
    });

    const summaries: FpForecastSummary[] = [];
    for (const row of rows) {
      summaries.push(await this.buildForecastSummary(row));
    }
    return summaries;
  }

  async captureForecastSnapshot(scope: StaffScope, forecastId: string) {
    const forecast = await this.ensureForecast(scope.companyId, forecastId);
    const [cashFlow, expenseIntel, profitability] = await Promise.all([
      this.deps.financeIntelligenceService.getCashFlowIntelligence(scope.companyId),
      this.deps.financeIntelligenceService.getExpenseIntelligence(scope.companyId),
      this.deps.financeIntelligenceService.getProfitabilityIntelligence(scope.companyId),
    ]);

    const revenueCents = profitability.totalRevenueCents;
    const expenseCents = expenseIntel.totalOutflowCents;
    const priorSnapshot = await this.deps.db.query.fpForecastSnapshots.findFirst({
      where: eq(fpForecastSnapshots.forecastId, forecastId),
      orderBy: [desc(fpForecastSnapshots.capturedAt)],
    });

    const [created] = await this.deps.db
      .insert(fpForecastSnapshots)
      .values({
        companyId: scope.companyId,
        forecastId,
        forecastType: forecast.forecastType,
        revenueCents,
        expenseCents,
        netPositionCents: revenueCents - expenseCents,
        varianceFromPriorCents: priorSnapshot
          ? revenueCents - expenseCents - priorSnapshot.netPositionCents
          : null,
        confidenceScore: forecast.confidenceScore,
        assumptions: forecast.assumptions,
        sourceRecords: {
          cashFlow: cashFlow.summary,
          expense: expenseIntel.summary,
          profitability: profitability.summary,
        },
      })
      .returning();

    await this.recordAudit(
      scope,
      'forecast_snapshot_captured',
      'fp_forecast_snapshot',
      created!.id,
    );
    return {
      id: created!.id,
      forecastId: created!.forecastId,
      revenueCents: created!.revenueCents,
      expenseCents: created!.expenseCents,
      netPositionCents: created!.netPositionCents,
      capturedAt: created!.capturedAt.toISOString(),
    };
  }

  async listCashFlowProjections(companyId: string): Promise<FpCashFlowProjectionSummary[]> {
    const rows = await this.deps.db.query.fpCashFlowProjections.findMany({
      where: eq(fpCashFlowProjections.companyId, companyId),
      orderBy: [desc(fpCashFlowProjections.projectionDate)],
      limit: 100,
    });
    return rows.map(toCashFlowProjectionSummary);
  }

  async generateCashFlowProjection(
    scope: StaffScope,
    entityId?: string,
  ): Promise<FpCashFlowProjectionSummary> {
    if (entityId) await this.ensureEntity(scope.companyId, entityId);

    const [cashFlow, receivables, invoiceRows, purchaseOrders] = await Promise.all([
      this.deps.financeIntelligenceService.getCashFlowIntelligence(scope.companyId),
      this.deps.financeIntelligenceService.getReceivablesIntelligence(scope.companyId),
      this.deps.financeService.listInvoices(scope.companyId),
      this.deps.procurementService.listPurchaseOrders(scope.companyId),
    ]);

    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 86400000);

    const expectedInflowCents = invoiceRows
      .filter((row) => row.dueDate && new Date(row.dueDate) <= weekAhead)
      .reduce((sum, row) => sum + Math.max(0, row.amountCents - row.amountPaidCents), 0);

    const expectedOutflowCents = purchaseOrders
      .filter((row) => ['approved', 'ordered', 'received'].includes(row.status))
      .reduce((sum, row) => sum + row.totalCostCents, 0);

    const openingBalanceCents = cashFlow.currentPositionCents;
    const closingBalanceCents = openingBalanceCents + expectedInflowCents - expectedOutflowCents;
    const dailyOutflow = cashFlow.outflowCents > 0 ? Math.round(cashFlow.outflowCents / 30) : 0;
    const cashRunwayDays =
      dailyOutflow > 0 && closingBalanceCents > 0
        ? Math.floor(closingBalanceCents / dailyOutflow)
        : null;

    const [created] = await this.deps.db
      .insert(fpCashFlowProjections)
      .values({
        companyId: scope.companyId,
        entityId: entityId ?? null,
        projectionDate: now.toISOString().slice(0, 10),
        periodType: 'weekly',
        openingBalanceCents,
        expectedInflowCents,
        expectedOutflowCents,
        closingBalanceCents,
        cashRunwayDays,
        workingCapitalCents: cashFlow.outstandingReceivableCents - cashFlow.outstandingPayableCents,
        confidenceScore: receivables.overdueCount === 0 ? '0.85' : '0.65',
        dataFreshness: now,
        sourceRecords: {
          cashFlowSummary: cashFlow.summary,
          receivablesSummary: receivables.summary,
          generatedAt: now.toISOString(),
        },
      })
      .returning();

    await this.recordAudit(
      scope,
      'cash_flow_projection_generated',
      'fp_cash_flow_projection',
      created!.id,
    );
    return toCashFlowProjectionSummary(created!);
  }

  async createTreasuryAccount(
    scope: StaffScope,
    input: CreateFpTreasuryAccountRequest,
  ): Promise<FpTreasuryAccountSummary> {
    if (input.entityId) await this.ensureEntity(scope.companyId, input.entityId);

    const [created] = await this.deps.db
      .insert(fpTreasuryAccounts)
      .values({
        companyId: scope.companyId,
        entityId: input.entityId ?? null,
        bankingProviderId: input.bankingProviderId ?? null,
        accountName: input.accountName.trim(),
        accountNumberMasked: input.accountNumberMasked?.trim() ?? null,
        bankName: input.bankName?.trim() ?? null,
        currency: input.currency ?? 'ZAR',
        currentBalanceCents: input.currentBalanceCents ?? null,
        availableBalanceCents: input.currentBalanceCents ?? null,
        lastRefreshedAt: input.currentBalanceCents != null ? new Date() : null,
      })
      .returning();

    await this.recordAudit(scope, 'treasury_account_created', 'fp_treasury_account', created!.id);
    return toTreasuryAccountSummary(created!);
  }

  async listTreasuryAccounts(companyId: string): Promise<FpTreasuryAccountSummary[]> {
    const rows = await this.deps.db.query.fpTreasuryAccounts.findMany({
      where: eq(fpTreasuryAccounts.companyId, companyId),
      orderBy: [desc(fpTreasuryAccounts.updatedAt)],
    });
    return rows.map(toTreasuryAccountSummary);
  }

  async createScenario(
    scope: StaffScope,
    input: CreateFpScenarioRequest,
  ): Promise<FpScenarioSummary> {
    if (input.entityId) await this.ensureEntity(scope.companyId, input.entityId);

    const cashImpactCents = input.lines?.reduce((sum, line) => sum + line.amountCents, 0) ?? null;

    const [created] = await this.deps.db
      .insert(fpScenarios)
      .values({
        companyId: scope.companyId,
        entityId: input.entityId ?? null,
        ownerUserId: scope.userId,
        title: input.title.trim(),
        scenarioType: input.scenarioType.trim(),
        workflowStatus: 'draft',
        assumptions: input.assumptions ?? {},
        cashImpactCents,
        isSimulation: true,
      })
      .returning();

    if (input.lines?.length) {
      await this.deps.db.insert(fpScenarioLines).values(
        input.lines.map((line) => ({
          companyId: scope.companyId,
          scenarioId: created!.id,
          lineKey: line.lineKey.trim(),
          description: line.description.trim(),
          impactType: line.impactType?.trim() ?? null,
          amountCents: line.amountCents,
        })),
      );
    }

    await this.recordAudit(scope, 'scenario_created', 'fp_scenario', created!.id);
    return toScenarioSummary(created!);
  }

  async listScenarios(companyId: string): Promise<FpScenarioSummary[]> {
    const rows = await this.deps.db.query.fpScenarios.findMany({
      where: eq(fpScenarios.companyId, companyId),
      orderBy: [desc(fpScenarios.updatedAt)],
      limit: 100,
    });
    return rows.map(toScenarioSummary);
  }

  async createFinancialTarget(
    scope: StaffScope,
    input: CreateFpFinancialTargetRequest,
  ): Promise<FpFinancialTargetSummary> {
    if (input.entityId) await this.ensureEntity(scope.companyId, input.entityId);

    const [created] = await this.deps.db
      .insert(fpFinancialTargets)
      .values({
        companyId: scope.companyId,
        entityId: input.entityId ?? null,
        ownerUserId: scope.userId,
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

    await this.recordAudit(scope, 'financial_target_created', 'fp_financial_target', created!.id);
    return toFinancialTargetSummary(created!);
  }

  async listFinancialTargets(companyId: string): Promise<FpFinancialTargetSummary[]> {
    const rows = await this.deps.db.query.fpFinancialTargets.findMany({
      where: eq(fpFinancialTargets.companyId, companyId),
      orderBy: [desc(fpFinancialTargets.updatedAt)],
      limit: 100,
    });
    return rows.map(toFinancialTargetSummary);
  }

  async listFinancialAlerts(
    companyId: string,
    filters?: { status?: string },
  ): Promise<FpFinancialAlertSummary[]> {
    const conditions = [eq(fpFinancialAlerts.companyId, companyId)];
    if (filters?.status) {
      conditions.push(
        eq(
          fpFinancialAlerts.status,
          filters.status as typeof fpFinancialAlerts.$inferSelect.status,
        ),
      );
    }

    const rows = await this.deps.db.query.fpFinancialAlerts.findMany({
      where: and(...conditions),
      orderBy: [desc(fpFinancialAlerts.createdAt)],
      limit: 100,
    });
    return rows.map(toFinancialAlertSummary);
  }

  async syncFinancialAlerts(scope: StaffScope): Promise<FpFinancialAlertSummary[]> {
    const monitoring = await this.getFinancialMonitoring(scope.companyId);
    const existingOpen = await this.listFinancialAlerts(scope.companyId, { status: 'open' });
    const syncedAt = new Date();

    const alertDefinitions: Array<{
      alertType: string;
      severity: 'info' | 'warning' | 'critical';
      title: string;
      description: string;
      active: boolean;
    }> = [
      {
        alertType: 'cash_shortfall',
        severity: 'critical',
        title: 'Projected cash shortfall',
        description: 'Cash flow forecast indicates a potential shortfall.',
        active: monitoring.cashShortfallRisk,
      },
      {
        alertType: 'low_cash_runway',
        severity: 'warning',
        title: 'Low cash runway',
        description: 'Cash runway is below 30 days based on current outflow.',
        active: monitoring.lowCashRunway,
      },
      {
        alertType: 'budget_overspend',
        severity: 'warning',
        title: 'Budget overspend detected',
        description: `${monitoring.budgetOverspendCount} budget(s) are over plan.`,
        active: monitoring.budgetOverspendCount > 0,
      },
      {
        alertType: 'provider_sync_failure',
        severity: 'critical',
        title: 'Provider sync failure',
        description: `${monitoring.syncFailureCount} accounting or banking provider(s) in error state.`,
        active: monitoring.syncFailureCount > 0,
      },
      {
        alertType: 'margin_decline',
        severity: 'warning',
        title: 'Margin below threshold',
        description: 'Profitability margin is below the configured planning threshold.',
        active: monitoring.marginDeclineCount > 0,
      },
    ];

    for (const definition of alertDefinitions) {
      const existing = existingOpen.find((row) => row.alertType === definition.alertType);
      if (definition.active && !existing) {
        await this.deps.db.insert(fpFinancialAlerts).values({
          companyId: scope.companyId,
          alertType: definition.alertType,
          severity: definition.severity,
          status: 'open',
          title: definition.title,
          description: definition.description,
          sourceModule: 'financial_planning',
          context: { syncedAt: syncedAt.toISOString(), monitoring },
        });
      } else if (!definition.active && existing) {
        await this.deps.db
          .update(fpFinancialAlerts)
          .set({ status: 'resolved', updatedAt: syncedAt })
          .where(eq(fpFinancialAlerts.id, existing.id));
      }
    }

    for (const receivableAlert of monitoring.alerts.filter((msg) =>
      msg.includes('overdue invoice'),
    )) {
      const alertType = 'overdue_invoices';
      const existing = existingOpen.find((row) => row.alertType === alertType);
      if (!existing) {
        await this.deps.db.insert(fpFinancialAlerts).values({
          companyId: scope.companyId,
          alertType,
          severity: 'warning',
          status: 'open',
          title: 'Overdue invoices',
          description: receivableAlert,
          sourceModule: 'finance',
          context: { syncedAt: syncedAt.toISOString() },
        });
      }
    }

    await this.recordAudit(scope, 'financial_alerts_synced');
    return this.listFinancialAlerts(scope.companyId, { status: 'open' });
  }

  async createAccountingProvider(
    scope: StaffScope,
    input: CreateFpAccountingProviderRequest,
  ): Promise<FpAccountingProviderSummary> {
    if (input.entityId) await this.ensureEntity(scope.companyId, input.entityId);

    const [created] = await this.deps.db
      .insert(fpAccountingProviderAdapters)
      .values({
        companyId: scope.companyId,
        entityId: input.entityId ?? null,
        providerType:
          input.providerType as typeof fpAccountingProviderAdapters.$inferInsert.providerType,
        name: input.name.trim(),
        syncDirection: input.syncDirection ?? 'bidirectional',
        syncFrequency: input.syncFrequency?.trim() ?? null,
        accountMappings: input.accountMappings ?? {},
        config: input.config ?? {},
        status: 'inactive',
      })
      .returning();

    await this.recordAudit(
      scope,
      'accounting_provider_created',
      'fp_accounting_provider',
      created!.id,
    );
    return toAccountingProviderSummary(created!);
  }

  async listAccountingProviders(companyId: string): Promise<FpAccountingProviderSummary[]> {
    const rows = await this.deps.db.query.fpAccountingProviderAdapters.findMany({
      where: eq(fpAccountingProviderAdapters.companyId, companyId),
      orderBy: [desc(fpAccountingProviderAdapters.createdAt)],
    });
    return rows.map(toAccountingProviderSummary);
  }

  async testAccountingProvider(
    scope: StaffScope,
    providerId: string,
  ): Promise<FpAccountingProviderSummary> {
    const provider = await this.ensureAccountingProvider(scope.companyId, providerId);
    const hasConfig = Object.keys(provider.config ?? {}).length > 0;
    const testStatus = hasConfig ? 'success' : 'pending_configuration';
    const nextStatus = testStatus === 'success' ? 'testing' : provider.status;

    const [updated] = await this.deps.db
      .update(fpAccountingProviderAdapters)
      .set({
        status: nextStatus,
        lastHealthCheckAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(fpAccountingProviderAdapters.id, providerId))
      .returning();

    await this.recordAudit(
      scope,
      'accounting_provider_tested',
      'fp_accounting_provider',
      providerId,
    );
    return toAccountingProviderSummary(updated!);
  }

  async createBankingProvider(
    scope: StaffScope,
    input: CreateFpBankingProviderRequest,
  ): Promise<FpBankingProviderSummary> {
    if (input.entityId) await this.ensureEntity(scope.companyId, input.entityId);

    const [created] = await this.deps.db
      .insert(fpBankingProviderAdapters)
      .values({
        companyId: scope.companyId,
        entityId: input.entityId ?? null,
        providerType:
          input.providerType as typeof fpBankingProviderAdapters.$inferInsert.providerType,
        name: input.name.trim(),
        refreshSchedule: input.refreshSchedule?.trim() ?? null,
        accountMappings: input.accountMappings ?? {},
        config: input.config ?? {},
        status: 'inactive',
      })
      .returning();

    await this.recordAudit(scope, 'banking_provider_created', 'fp_banking_provider', created!.id);
    return toBankingProviderSummary(created!);
  }

  async listBankingProviders(companyId: string): Promise<FpBankingProviderSummary[]> {
    const rows = await this.deps.db.query.fpBankingProviderAdapters.findMany({
      where: eq(fpBankingProviderAdapters.companyId, companyId),
      orderBy: [desc(fpBankingProviderAdapters.createdAt)],
    });
    return rows.map(toBankingProviderSummary);
  }

  async testBankingProvider(
    scope: StaffScope,
    providerId: string,
  ): Promise<FpBankingProviderSummary> {
    const provider = await this.ensureBankingProvider(scope.companyId, providerId);
    const hasConfig = Object.keys(provider.config ?? {}).length > 0;
    const testStatus = hasConfig ? 'success' : 'pending_configuration';
    const nextStatus = testStatus === 'success' ? 'testing' : provider.status;

    const [updated] = await this.deps.db
      .update(fpBankingProviderAdapters)
      .set({
        status: nextStatus,
        lastHealthCheckAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(fpBankingProviderAdapters.id, providerId))
      .returning();

    await this.recordAudit(scope, 'banking_provider_tested', 'fp_banking_provider', providerId);
    return toBankingProviderSummary(updated!);
  }

  async captureProfitabilitySnapshot(
    scope: StaffScope,
    input: CaptureFpProfitabilityRequest,
  ): Promise<FpProfitabilitySnapshotSummary> {
    const [profitability, analyticsProfitability] = await Promise.all([
      this.deps.financeIntelligenceService.getProfitabilityIntelligence(scope.companyId),
      this.deps.analyticsService.getProfitability(scope.companyId, { period: 'monthly' }),
    ]);

    let revenueCents = 0;
    let directCostCents = 0;
    let dimensionName = input.dimensionName?.trim() ?? null;
    const sourceTransactions: Record<string, unknown> = {
      capturedAt: new Date().toISOString(),
      dimensionType: input.dimensionType,
    };

    if (input.dimensionType === 'customer' && input.dimensionName) {
      const match = profitability.byCustomer.find(
        (row) => row.customerName.toLowerCase() === input.dimensionName!.toLowerCase(),
      );
      revenueCents = match?.revenueCents ?? 0;
      dimensionName = match?.customerName ?? input.dimensionName;
      sourceTransactions.customer = match ?? null;
    } else if (input.dimensionType === 'job' && input.dimensionId) {
      const match = analyticsProfitability.jobs.find((row) => row.jobId === input.dimensionId);
      revenueCents = match?.revenueCents ?? 0;
      directCostCents =
        match?.materialCostCents != null || match?.labourCostCents != null
          ? (match.materialCostCents ?? 0) + (match.labourCostCents ?? 0)
          : 0;
      dimensionName = match?.jobTitle ?? dimensionName;
      sourceTransactions.job = match ?? null;
    } else if (input.dimensionType === 'service') {
      const topService = profitability.byService[0];
      revenueCents = topService?.revenueCents ?? profitability.totalRevenueCents;
      dimensionName = topService?.serviceName ?? dimensionName;
      sourceTransactions.service = topService ?? null;
    } else {
      revenueCents = profitability.totalRevenueCents;
      directCostCents =
        profitability.totalProfitCents != null
          ? Math.max(0, profitability.totalRevenueCents - profitability.totalProfitCents)
          : 0;
      sourceTransactions.totals = {
        revenueCents: profitability.totalRevenueCents,
        profitCents: profitability.totalProfitCents,
      };
    }

    const grossProfitCents = revenueCents - directCostCents;
    const marginPercent =
      revenueCents > 0 ? String(Math.round((grossProfitCents / revenueCents) * 100)) : null;

    const [created] = await this.deps.db
      .insert(fpProfitabilitySnapshots)
      .values({
        companyId: scope.companyId,
        dimensionType: input.dimensionType.trim(),
        dimensionId: input.dimensionId ?? null,
        dimensionName,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        revenueCents,
        directCostCents,
        grossProfitCents,
        marginPercent,
        allocationMethod: 'analytics_profitability',
        formula: 'revenue − direct_cost',
        sourceTransactions,
        dataFreshness: new Date(),
      })
      .returning();

    await this.recordAudit(
      scope,
      'profitability_snapshot_captured',
      'fp_profitability_snapshot',
      created!.id,
    );
    return toProfitabilitySnapshotSummary(created!);
  }

  async listProfitabilitySnapshots(companyId: string): Promise<FpProfitabilitySnapshotSummary[]> {
    const rows = await this.deps.db.query.fpProfitabilitySnapshots.findMany({
      where: eq(fpProfitabilitySnapshots.companyId, companyId),
      orderBy: [desc(fpProfitabilitySnapshots.capturedAt)],
      limit: 100,
    });
    return rows.map(toProfitabilitySnapshotSummary);
  }

  async createPlanningActionDraft(
    scope: StaffScope,
    input: CreateFpPlanningActionDraftRequest,
  ): Promise<{ id: string; title: string; draftType: string; workflowStatus: string }> {
    const [created] = await this.deps.db
      .insert(fpPlanningActionDrafts)
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

    await this.recordAudit(
      scope,
      'planning_draft_created',
      'fp_planning_action_draft',
      created!.id,
    );
    return {
      id: created!.id,
      title: created!.title,
      draftType: created!.draftType,
      workflowStatus: created!.workflowStatus,
    };
  }

  async captureAnalytics(scope: StaffScope): Promise<FpAnalyticsSummary> {
    const dashboard = await this.getDashboard(scope.companyId);

    const [created] = await this.deps.db
      .insert(fpAnalyticsSnapshots)
      .values({
        companyId: scope.companyId,
        activeBudgetCount: dashboard.activeBudgetCount,
        activeForecastCount: dashboard.activeForecastCount,
        cashPositionCents: dashboard.cashPositionCents,
        cashRunwayDays: dashboard.cashRunwayDays,
        overdueReceivableCents: dashboard.receivables.overdueAmountCents,
        upcomingPayableCents: dashboard.payables.upcomingAmountCents,
        openAlertCount: dashboard.openAlertCount,
        budgetVarianceCents: dashboard.recentBudgets.reduce(
          (sum, budget) => sum + (budget.varianceAmountCents ?? 0),
          0,
        ),
        currency: dashboard.currency,
      })
      .returning();

    await this.recordAudit(scope, 'analytics_captured');
    return toAnalyticsSummary(created!);
  }

  async getLatestAnalytics(companyId: string): Promise<FpAnalyticsSummary | null> {
    const row = await this.deps.db.query.fpAnalyticsSnapshots.findFirst({
      where: eq(fpAnalyticsSnapshots.companyId, companyId),
      orderBy: [desc(fpAnalyticsSnapshots.capturedAt)],
    });
    return row ? toAnalyticsSummary(row) : null;
  }

  async buildAuraContext(companyId: string): Promise<EnterpriseFinancialPlanningAuraContext> {
    const dashboard = await this.getDashboard(companyId);
    return {
      budgetCount: dashboard.budgetCount,
      activeBudgetCount: dashboard.activeBudgetCount,
      cashPositionCents: dashboard.cashPositionCents,
      cashShortageWarning: dashboard.cashShortageWarning,
      openAlertCount: dashboard.openAlertCount,
      overdueReceivableCents: dashboard.receivables.overdueAmountCents,
      summary: dashboard.summary,
    };
  }

  async getReceivablesIntelligence(companyId: string): Promise<FpReceivablesIntelligenceSummary> {
    return this.buildReceivablesSummary(companyId);
  }

  async getPayablesIntelligence(companyId: string): Promise<FpPayablesIntelligenceSummary> {
    return this.buildPayablesSummary(companyId);
  }

  async getWorkingCapitalSummary(companyId: string): Promise<FpWorkingCapitalSummary> {
    return this.buildWorkingCapitalSummary(companyId);
  }

  private async buildReceivablesSummary(
    companyId: string,
  ): Promise<FpReceivablesIntelligenceSummary> {
    const receivables =
      await this.deps.financeIntelligenceService.getReceivablesIntelligence(companyId);
    const invoiceRows = await this.deps.financeService.listInvoices(companyId);

    let outstandingAmountCents = 0;
    for (const invoice of invoiceRows) {
      const outstanding = Math.max(0, invoice.amountCents - invoice.amountPaidCents);
      if (outstanding > 0 && !['paid', 'cancelled', 'draft'].includes(invoice.status)) {
        outstandingAmountCents += outstanding;
      }
    }

    const avgDays =
      receivables.customerPaymentBehaviour.length > 0
        ? Math.round(
            receivables.customerPaymentBehaviour
              .filter((row) => row.averageDaysToPay != null)
              .reduce((sum, row) => sum + (row.averageDaysToPay ?? 0), 0) /
              Math.max(
                1,
                receivables.customerPaymentBehaviour.filter((row) => row.averageDaysToPay != null)
                  .length,
              ),
          )
        : null;

    return {
      overdueCount: receivables.overdueCount,
      overdueAmountCents: receivables.overdueAmountCents,
      outstandingAmountCents,
      averageDaysToPay: avgDays,
      collectionPriorities: receivables.collectionPriorities.map((row) => ({
        invoiceId: row.invoiceId,
        customerName: row.customerName,
        amountDueCents: row.outstandingCents,
        daysOverdue: row.daysOverdue ?? 0,
        priority: row.priority,
      })),
      summary: receivables.summary,
    };
  }

  private async buildPayablesSummary(companyId: string): Promise<FpPayablesIntelligenceSummary> {
    const [purchaseOrders, cashFlow] = await Promise.all([
      this.deps.procurementService.listPurchaseOrders(companyId),
      this.deps.financeIntelligenceService.getCashFlowIntelligence(companyId),
    ]);

    const now = new Date();
    const monthAhead = new Date(now.getTime() + 30 * 86400000);
    const openOrders = purchaseOrders.filter((row) =>
      ['approved', 'ordered', 'received'].includes(row.status),
    );

    const upcomingOrders = openOrders.filter(
      (row) => !row.orderedAt || new Date(row.orderedAt) <= monthAhead,
    );

    const paymentPriorities = upcomingOrders
      .map((row) => ({
        supplierName: row.supplierName,
        amountCents: row.totalCostCents,
        dueDate: row.orderedAt ? row.orderedAt.slice(0, 10) : null,
        priority: row.totalCostCents > 100000 ? 'high' : 'medium',
      }))
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 15);

    const duplicateRiskCount = openOrders.filter((row, index, arr) =>
      arr.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          other.supplierId === row.supplierId &&
          other.totalCostCents === row.totalCostCents,
      ),
    ).length;

    return {
      upcomingCount: upcomingOrders.length,
      upcomingAmountCents: cashFlow.outstandingPayableCents,
      duplicateRiskCount,
      paymentPriorities,
      summary:
        upcomingOrders.length > 0
          ? `${upcomingOrders.length} upcoming payable(s) totalling ${(cashFlow.outstandingPayableCents / 100).toFixed(2)} ${cashFlow.currency}.`
          : 'No upcoming payables.',
    };
  }

  private async buildWorkingCapitalSummary(companyId: string): Promise<FpWorkingCapitalSummary> {
    const [cashFlow, receivables] = await Promise.all([
      this.deps.financeIntelligenceService.getCashFlowIntelligence(companyId),
      this.deps.financeIntelligenceService.getReceivablesIntelligence(companyId),
    ]);

    const receivablesCents = cashFlow.outstandingReceivableCents;
    const payablesCents = cashFlow.outstandingPayableCents;
    const inventoryValueCents = 0;

    const daysSalesOutstanding =
      receivables.overdueCount > 0 && receivables.overdueAmountCents > 0
        ? Math.round((receivablesCents / Math.max(receivables.overdueAmountCents, 1)) * 30)
        : null;
    const daysPayableOutstanding =
      payablesCents > 0
        ? Math.round((payablesCents / Math.max(cashFlow.inflowCents, 1)) * 30)
        : null;
    const cashConversionCycleDays =
      daysSalesOutstanding != null && daysPayableOutstanding != null
        ? daysSalesOutstanding - daysPayableOutstanding
        : null;

    return {
      receivablesCents,
      payablesCents,
      inventoryValueCents,
      cashConversionCycleDays,
      daysSalesOutstanding,
      daysPayableOutstanding,
      summary: `Working capital: receivables ${(receivablesCents / 100).toFixed(2)}, payables ${(payablesCents / 100).toFixed(2)} ${cashFlow.currency}.`,
    };
  }

  private estimateCashRunwayDays(
    cashPositionCents: number,
    monthlyOutflowCents: number,
  ): number | null {
    if (cashPositionCents <= 0) return 0;
    const dailyOutflow = monthlyOutflowCents > 0 ? monthlyOutflowCents / 30 : 0;
    if (dailyOutflow <= 0) return null;
    return Math.floor(cashPositionCents / dailyOutflow);
  }

  private async buildBudgetSummary(row: typeof fpBudgets.$inferSelect): Promise<FpBudgetSummary> {
    const owner = row.ownerUserId
      ? await this.deps.db.query.users.findFirst({ where: eq(users.id, row.ownerUserId) })
      : null;

    const lines = await this.deps.db.query.fpBudgetLines.findMany({
      where: eq(fpBudgetLines.budgetId, row.id),
    });

    const varianceAmountCents = lines.reduce((sum, line) => {
      const variance =
        line.varianceAmountCents ??
        (line.plannedAmountCents != null ? line.plannedAmountCents - line.actualAmountCents : 0);
      return sum + variance;
    }, 0);

    return {
      id: row.id,
      title: row.title,
      budgetPeriod: row.budgetPeriod,
      status: row.status,
      workflowStatus: row.workflowStatus,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      currency: row.currency,
      version: row.version,
      totalAmountCents: row.totalAmountCents,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
      varianceAmountCents: lines.length > 0 ? varianceAmountCents : null,
    };
  }

  private async buildForecastSummary(
    row: typeof fpForecasts.$inferSelect,
  ): Promise<FpForecastSummary> {
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
      confidenceScore: row.confidenceScore != null ? String(row.confidenceScore) : null,
      isSimulation: row.isSimulation,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
    };
  }

  private async syncLatestBudgetVersion(
    companyId: string,
    budgetId: string,
    patch: Partial<typeof fpBudgetVersions.$inferInsert>,
  ) {
    const latestVersion = await this.getLatestBudgetVersion(companyId, budgetId);
    if (!latestVersion || latestVersion.workflowStatus === 'approved') return;
    await this.deps.db
      .update(fpBudgetVersions)
      .set(patch)
      .where(eq(fpBudgetVersions.id, latestVersion.id));
  }

  private async getLatestBudgetVersion(companyId: string, budgetId: string) {
    return this.deps.db.query.fpBudgetVersions.findFirst({
      where: and(
        eq(fpBudgetVersions.companyId, companyId),
        eq(fpBudgetVersions.budgetId, budgetId),
      ),
      orderBy: [desc(fpBudgetVersions.versionNumber)],
    });
  }

  private async ensurePlatformConfig(companyId: string) {
    const existing = await this.deps.db.query.fpPlatformConfig.findFirst({
      where: eq(fpPlatformConfig.companyId, companyId),
    });
    if (existing) return existing;
    const [created] = await this.deps.db.insert(fpPlatformConfig).values({ companyId }).returning();
    return created!;
  }

  private async ensureCategory(companyId: string, categoryId: string) {
    const category = await this.deps.db.query.fpPlanningCategories.findFirst({
      where: and(
        eq(fpPlanningCategories.companyId, companyId),
        eq(fpPlanningCategories.id, categoryId),
      ),
    });
    if (!category)
      throw new EnterpriseFinancialPlanningError('NOT_FOUND', 'Planning category not found');
    return category;
  }

  private async ensureEntity(companyId: string, entityId: string) {
    const entity = await this.deps.db.query.fpEntities.findFirst({
      where: and(eq(fpEntities.companyId, companyId), eq(fpEntities.id, entityId)),
    });
    if (!entity) throw new EnterpriseFinancialPlanningError('NOT_FOUND', 'Entity not found');
    return entity;
  }

  private async ensureBudget(companyId: string, budgetId: string) {
    const budget = await this.deps.db.query.fpBudgets.findFirst({
      where: and(eq(fpBudgets.companyId, companyId), eq(fpBudgets.id, budgetId)),
    });
    if (!budget) throw new EnterpriseFinancialPlanningError('NOT_FOUND', 'Budget not found');
    return budget;
  }

  private async ensureForecast(companyId: string, forecastId: string) {
    const forecast = await this.deps.db.query.fpForecasts.findFirst({
      where: and(eq(fpForecasts.companyId, companyId), eq(fpForecasts.id, forecastId)),
    });
    if (!forecast) throw new EnterpriseFinancialPlanningError('NOT_FOUND', 'Forecast not found');
    return forecast;
  }

  private async ensureAccountingProvider(companyId: string, providerId: string) {
    const provider = await this.deps.db.query.fpAccountingProviderAdapters.findFirst({
      where: and(
        eq(fpAccountingProviderAdapters.companyId, companyId),
        eq(fpAccountingProviderAdapters.id, providerId),
      ),
    });
    if (!provider)
      throw new EnterpriseFinancialPlanningError('NOT_FOUND', 'Accounting provider not found');
    return provider;
  }

  private async ensureBankingProvider(companyId: string, providerId: string) {
    const provider = await this.deps.db.query.fpBankingProviderAdapters.findFirst({
      where: and(
        eq(fpBankingProviderAdapters.companyId, companyId),
        eq(fpBankingProviderAdapters.id, providerId),
      ),
    });
    if (!provider)
      throw new EnterpriseFinancialPlanningError('NOT_FOUND', 'Banking provider not found');
    return provider;
  }

  private async recordAudit(
    scope: StaffScope,
    actionType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.deps.db.insert(fpAuditLogs).values({
      companyId: scope.companyId,
      userId: scope.userId,
      actionType,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      metadata: metadata ?? {},
    });
  }
}

function toPlatformConfigSummary(
  row: typeof fpPlatformConfig.$inferSelect,
): FpPlatformConfigSummary {
  return {
    financeStandards: row.financeStandards,
    providerAdapterTemplates: row.providerAdapterTemplates,
    currencyStandards: row.currencyStandards,
    planningTemplates: row.planningTemplates,
    kpiTemplates: row.kpiTemplates,
    riskThresholds: row.riskThresholds,
    allocationMethods: row.allocationMethods,
    auditRetentionDays: row.auditRetentionDays,
  };
}

function toCategorySummary(row: typeof fpPlanningCategories.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    categoryKey: row.categoryKey,
    description: row.description,
    isActive: row.isActive,
  };
}

function toEntitySummary(row: typeof fpEntities.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    entityKey: row.entityKey,
    entityType: row.entityType,
    currency: row.currency,
    taxJurisdiction: row.taxJurisdiction,
    isActive: row.isActive,
  };
}

function toCashFlowProjectionSummary(
  row: typeof fpCashFlowProjections.$inferSelect,
): FpCashFlowProjectionSummary {
  return {
    id: row.id,
    projectionDate: row.projectionDate,
    periodType: row.periodType,
    openingBalanceCents: row.openingBalanceCents,
    expectedInflowCents: row.expectedInflowCents,
    expectedOutflowCents: row.expectedOutflowCents,
    closingBalanceCents: row.closingBalanceCents,
    cashRunwayDays: row.cashRunwayDays,
    confidenceScore: row.confidenceScore != null ? String(row.confidenceScore) : null,
  };
}

function toTreasuryAccountSummary(
  row: typeof fpTreasuryAccounts.$inferSelect,
): FpTreasuryAccountSummary {
  return {
    id: row.id,
    accountName: row.accountName,
    bankName: row.bankName,
    currency: row.currency,
    currentBalanceCents: row.currentBalanceCents,
    availableBalanceCents: row.availableBalanceCents,
    lastRefreshedAt: row.lastRefreshedAt?.toISOString() ?? null,
    isActive: row.isActive,
  };
}

function toScenarioSummary(row: typeof fpScenarios.$inferSelect): FpScenarioSummary {
  return {
    id: row.id,
    title: row.title,
    scenarioType: row.scenarioType,
    workflowStatus: row.workflowStatus,
    isSimulation: row.isSimulation,
    cashImpactCents: row.cashImpactCents,
    profitImpactCents: row.profitImpactCents,
    confidenceScore: row.confidenceScore != null ? String(row.confidenceScore) : null,
  };
}

function toFinancialTargetSummary(
  row: typeof fpFinancialTargets.$inferSelect,
): FpFinancialTargetSummary {
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

function toFinancialAlertSummary(
  row: typeof fpFinancialAlerts.$inferSelect,
): FpFinancialAlertSummary {
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

function toAccountingProviderSummary(
  row: typeof fpAccountingProviderAdapters.$inferSelect,
): FpAccountingProviderSummary {
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

function toBankingProviderSummary(
  row: typeof fpBankingProviderAdapters.$inferSelect,
): FpBankingProviderSummary {
  return {
    id: row.id,
    name: row.name,
    providerType: row.providerType,
    status: row.status,
    refreshSchedule: row.refreshSchedule,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastHealthCheckAt: row.lastHealthCheckAt?.toISOString() ?? null,
  };
}

function toProfitabilitySnapshotSummary(
  row: typeof fpProfitabilitySnapshots.$inferSelect,
): FpProfitabilitySnapshotSummary {
  return {
    id: row.id,
    dimensionType: row.dimensionType,
    dimensionName: row.dimensionName,
    revenueCents: row.revenueCents,
    directCostCents: row.directCostCents,
    grossProfitCents: row.grossProfitCents,
    marginPercent: row.marginPercent != null ? String(row.marginPercent) : null,
    allocationMethod: row.allocationMethod,
    formula: row.formula,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function toAnalyticsSummary(row: typeof fpAnalyticsSnapshots.$inferSelect): FpAnalyticsSummary {
  return {
    activeBudgetCount: row.activeBudgetCount,
    activeForecastCount: row.activeForecastCount,
    cashPositionCents: row.cashPositionCents,
    cashRunwayDays: row.cashRunwayDays,
    overdueReceivableCents: row.overdueReceivableCents,
    upcomingPayableCents: row.upcomingPayableCents,
    openAlertCount: row.openAlertCount,
    budgetVarianceCents: row.budgetVarianceCents,
    currency: row.currency,
    capturedAt: row.capturedAt.toISOString(),
  };
}
