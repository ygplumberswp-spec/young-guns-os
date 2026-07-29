import { and, desc, eq, inArray } from 'drizzle-orm';
import type {
  ApproveBusinessReportRequest,
  BiReportTemplateSummary,
  BusinessDashboardDetail,
  BusinessDashboardSummary,
  BusinessDashboardType,
  BusinessInsightSummary,
  BusinessIntelligenceAuraContext,
  BusinessIntelligenceStats,
  BusinessKpiKey,
  BusinessKpiSnapshotSummary,
  BusinessKpiSummary,
  BusinessReportDetail,
  BusinessReportSummary,
  CreateBiReportTemplateRequest,
  CreateBusinessDashboardRequest,
  CreateBusinessKpiRequest,
  CreateBusinessReportRequest,
  CreateDashboardWidgetRequest,
  DashboardWidgetSummary,
  DataLakeModuleSummary,
  GenerateBusinessReportRequest,
  GenerateKpiSnapshotsRequest,
  GeneratePredictiveForecastRequest,
  PredictiveForecastSummary,
  PredictiveForecastType,
  ScheduleBusinessReportRequest,
  UpdateBiReportTemplateRequest,
  UpdateBusinessDashboardRequest,
  UpdateBusinessInsightRequest,
  UpdateBusinessKpiRequest,
  UpdateBusinessReportRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  biReportTemplates,
  businessDashboards,
  businessInsights,
  businessKpiSnapshots,
  businessKpis,
  businessReports,
  customers,
  dashboardWidgets,
  invoices,
  jobs,
  payments,
  predictiveForecasts,
  quotes,
  aiUsageRecords,
} from '@titan/db';
import type { AnalyticsService } from './analytics.service.js';
import type { AutomationService } from './automation.service.js';
import type { CustomerSupportService } from './customer-support.service.js';
import type { ExecutiveService } from './executive.service.js';
import type { FinanceIntelligenceService } from './finance-intelligence.service.js';
import type { FleetService } from './fleet.service.js';
import type { InventoryService } from './inventory.service.js';
import type { LeadsService } from './leads.service.js';
import type { MarketingService } from './marketing.service.js';
import type { ProcurementService } from './procurement.service.js';
import type { SalesService } from './sales.service.js';
import type { WorkforceService } from './workforce.service.js';

export class BusinessIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BusinessIntelligenceError';
  }
}

type TenantScope = { companyId: string; userId: string };

type BusinessIntelligenceServiceDeps = {
  db: DatabaseClient;
  analyticsService: AnalyticsService;
  financeIntelligenceService: FinanceIntelligenceService;
  executiveService: ExecutiveService;
  salesService: SalesService;
  marketingService: MarketingService;
  procurementService: ProcurementService;
  workforceService: WorkforceService;
  fleetService: FleetService;
  inventoryService: InventoryService;
  leadsService: LeadsService;
  customerSupportService: CustomerSupportService;
  automationService: AutomationService;
};

export class BusinessIntelligenceService {
  constructor(private readonly deps: BusinessIntelligenceServiceDeps) {}

  async getStats(companyId: string): Promise<BusinessIntelligenceStats> {
    const [kpis, dashboards, insights, reports, forecasts] = await Promise.all([
      this.deps.db.query.businessKpis.findMany({ where: eq(businessKpis.companyId, companyId) }),
      this.deps.db.query.businessDashboards.findMany({ where: eq(businessDashboards.companyId, companyId) }),
      this.listInsights(companyId),
      this.deps.db.query.businessReports.findMany({ where: eq(businessReports.companyId, companyId) }),
      this.listForecasts(companyId),
    ]);

    return {
      activeKpiCount: kpis.filter((row) => row.isActive).length,
      dashboardCount: dashboards.length,
      pendingInsightCount: insights.filter((row) => row.status === 'pending').length,
      scheduledReportCount: reports.filter((row) => row.status === 'scheduled').length,
      latestForecastCount: forecasts.length,
    };
  }

  async getDataLakeSummary(companyId: string): Promise<DataLakeModuleSummary[]> {
    const [
      customerRows,
      jobRows,
      quoteRows,
      invoiceRows,
      paymentRows,
      salesStats,
      marketingStats,
      procurementStats,
      workforceStats,
      fleetStats,
      inventoryStats,
      leadsStats,
      supportStats,
      automationStats,
    ] = await Promise.all([
      this.deps.db.query.customers.findMany({ where: eq(customers.companyId, companyId), columns: { id: true, updatedAt: true } }),
      this.deps.db.query.jobs.findMany({ where: eq(jobs.companyId, companyId), columns: { id: true, updatedAt: true } }),
      this.deps.db.query.quotes.findMany({ where: eq(quotes.companyId, companyId), columns: { id: true, updatedAt: true } }),
      this.deps.db.query.invoices.findMany({ where: eq(invoices.companyId, companyId), columns: { id: true, updatedAt: true } }),
      this.deps.db.query.payments.findMany({ where: eq(payments.companyId, companyId), columns: { id: true, paidAt: true } }),
      this.deps.salesService.getStats(companyId),
      this.deps.marketingService.getStats(companyId),
      this.deps.procurementService.getStats(companyId),
      this.deps.workforceService.getStats(companyId),
      this.deps.fleetService.getStats(companyId),
      this.deps.inventoryService.getStats(companyId),
      this.deps.leadsService.getStats(companyId),
      this.deps.customerSupportService.getStats(companyId),
      this.deps.automationService.getStats(companyId),
    ]);

    const modules: DataLakeModuleSummary[] = [
      moduleSummary('crm', customerRows.length, maxDate(customerRows.map((r) => r.updatedAt))),
      moduleSummary('jobs', jobRows.length, maxDate(jobRows.map((r) => r.updatedAt))),
      moduleSummary('quotes', quoteRows.length, maxDate(quoteRows.map((r) => r.updatedAt))),
      moduleSummary('invoices', invoiceRows.length, maxDate(invoiceRows.map((r) => r.updatedAt))),
      moduleSummary('payments', paymentRows.length, maxDate(paymentRows.map((r) => r.paidAt))),
      moduleSummary('sales', salesStats.openOpportunityCount + salesStats.wonOpportunityCount, null),
      moduleSummary('marketing', marketingStats.activeCampaignCount, null),
      moduleSummary('procurement', procurementStats.purchaseOrderCount, null),
      moduleSummary('workforce', workforceStats.candidateCount, null),
      moduleSummary('fleet', fleetStats.totalCount, null),
      moduleSummary('inventory', inventoryStats.itemCount, null),
      moduleSummary('leads', leadsStats.totalLeadCount, null),
      moduleSummary('customer_support', supportStats.openConversationCount, null),
      moduleSummary('automation', automationStats.workflowCount, null),
    ];

    return modules.filter((row) => row.recordCount > 0 || row.module === 'crm' || row.module === 'jobs');
  }

  async listKpis(companyId: string): Promise<BusinessKpiSummary[]> {
    const rows = await this.deps.db.query.businessKpis.findMany({
      where: eq(businessKpis.companyId, companyId),
      orderBy: [desc(businessKpis.updatedAt)],
    });

    const summaries: BusinessKpiSummary[] = [];
    for (const row of rows) {
      const currentValue = await this.computeKpiValue(companyId, row.kpiKey);
      const latestSnapshot = await this.deps.db.query.businessKpiSnapshots.findFirst({
        where: and(eq(businessKpiSnapshots.kpiId, row.id), eq(businessKpiSnapshots.companyId, companyId)),
        orderBy: [desc(businessKpiSnapshots.generatedAt)],
      });

      summaries.push({
        id: row.id,
        kpiKey: row.kpiKey,
        name: row.name,
        description: row.description,
        targetValue: row.targetValue,
        unit: row.unit,
        isActive: row.isActive,
        currentValue,
        changePercent: latestSnapshot?.changePercent ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    }

    return summaries;
  }

  async createKpi(companyId: string, input: CreateBusinessKpiRequest): Promise<BusinessKpiSummary> {
    const name = input.name.trim();
    if (!name) throw new BusinessIntelligenceError('VALIDATION_ERROR', 'KPI name is required');

    const [created] = await this.deps.db
      .insert(businessKpis)
      .values({
        companyId,
        kpiKey: input.kpiKey,
        name,
        description: normalizeOptionalText(input.description),
        targetValue: input.targetValue ?? null,
        unit: input.unit ?? defaultUnit(input.kpiKey),
        isActive: input.isActive ?? true,
        config: input.config ?? {},
      })
      .returning();

    const kpis = await this.listKpis(companyId);
    return kpis.find((row) => row.id === created!.id)!;
  }

  async updateKpi(companyId: string, kpiId: string, input: UpdateBusinessKpiRequest): Promise<BusinessKpiSummary> {
    await this.ensureKpi(companyId, kpiId);

    await this.deps.db
      .update(businessKpis)
      .set({
        kpiKey: input.kpiKey,
        name: input.name?.trim(),
        description: input.description !== undefined ? normalizeOptionalText(input.description) : undefined,
        targetValue: input.targetValue,
        unit: input.unit,
        isActive: input.isActive,
        config: input.config,
        updatedAt: new Date(),
      })
      .where(and(eq(businessKpis.id, kpiId), eq(businessKpis.companyId, companyId)));

    const kpis = await this.listKpis(companyId);
    return kpis.find((row) => row.id === kpiId)!;
  }

  async generateKpiSnapshots(
    companyId: string,
    input: GenerateKpiSnapshotsRequest = {},
  ): Promise<BusinessKpiSnapshotSummary[]> {
    const kpiRows = await this.deps.db.query.businessKpis.findMany({
      where: input.kpiIds?.length
        ? and(eq(businessKpis.companyId, companyId), inArray(businessKpis.id, input.kpiIds))
        : eq(businessKpis.companyId, companyId),
    });

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = now;
    const created: BusinessKpiSnapshotSummary[] = [];

    for (const kpi of kpiRows.filter((row) => row.isActive)) {
      const value = await this.computeKpiValue(companyId, kpi.kpiKey);
      const previous = await this.deps.db.query.businessKpiSnapshots.findFirst({
        where: and(eq(businessKpiSnapshots.kpiId, kpi.id), eq(businessKpiSnapshots.companyId, companyId)),
        orderBy: [desc(businessKpiSnapshots.generatedAt)],
      });

      const changePercent =
        previous && previous.value > 0
          ? Math.round(((value - previous.value) / previous.value) * 100)
          : null;

      const [row] = await this.deps.db
        .insert(businessKpiSnapshots)
        .values({
          companyId,
          kpiId: kpi.id,
          kpiKey: kpi.kpiKey,
          value,
          previousValue: previous?.value ?? null,
          changePercent,
          periodStart,
          periodEnd,
          context: { unit: kpi.unit },
        })
        .returning();

      if (row) created.push(toKpiSnapshotSummary(row));
    }

    return created;
  }

  async listKpiSnapshots(companyId: string, kpiId?: string): Promise<BusinessKpiSnapshotSummary[]> {
    const rows = await this.deps.db.query.businessKpiSnapshots.findMany({
      where: kpiId
        ? and(eq(businessKpiSnapshots.companyId, companyId), eq(businessKpiSnapshots.kpiId, kpiId))
        : eq(businessKpiSnapshots.companyId, companyId),
      orderBy: [desc(businessKpiSnapshots.generatedAt)],
      limit: 50,
    });

    return rows.map(toKpiSnapshotSummary);
  }

  async listDashboards(companyId: string): Promise<BusinessDashboardSummary[]> {
    const rows = await this.deps.db.query.businessDashboards.findMany({
      where: eq(businessDashboards.companyId, companyId),
      with: { widgets: true },
      orderBy: [desc(businessDashboards.updatedAt)],
    });

    return rows.map((row) => ({
      id: row.id,
      dashboardType: row.dashboardType,
      name: row.name,
      description: row.description,
      isDefault: row.isDefault,
      widgetCount: row.widgets.length,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async getDashboard(companyId: string, dashboardId: string): Promise<BusinessDashboardDetail | null> {
    const row = await this.deps.db.query.businessDashboards.findFirst({
      where: and(eq(businessDashboards.id, dashboardId), eq(businessDashboards.companyId, companyId)),
      with: { widgets: true },
    });

    if (!row) return null;

    const widgets: DashboardWidgetSummary[] = [];
    for (const widget of row.widgets.sort((a, b) => a.position - b.position)) {
      widgets.push({
        id: widget.id,
        dashboardId: widget.dashboardId,
        widgetKey: widget.widgetKey,
        title: widget.title,
        kpiKey: widget.kpiKey,
        position: widget.position,
        config: widget.config,
        currentValue: widget.kpiKey ? await this.computeKpiValue(companyId, widget.kpiKey) : null,
      });
    }

    return {
      id: row.id,
      dashboardType: row.dashboardType,
      name: row.name,
      description: row.description,
      isDefault: row.isDefault,
      widgetCount: widgets.length,
      widgets,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async createDashboard(scope: TenantScope, input: CreateBusinessDashboardRequest): Promise<BusinessDashboardDetail> {
    const name = input.name.trim();
    if (!name) throw new BusinessIntelligenceError('VALIDATION_ERROR', 'Dashboard name is required');

    const [created] = await this.deps.db
      .insert(businessDashboards)
      .values({
        companyId: scope.companyId,
        dashboardType: input.dashboardType,
        name,
        description: normalizeOptionalText(input.description),
        isDefault: input.isDefault ?? false,
        config: input.config ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    if (input.widgets?.length) {
      await this.deps.db.insert(dashboardWidgets).values(
        input.widgets.map((widget, index) => ({
          companyId: scope.companyId,
          dashboardId: created!.id,
          widgetKey: widget.widgetKey,
          title: widget.title,
          kpiKey: widget.kpiKey ?? null,
          position: widget.position ?? index,
          config: widget.config ?? {},
        })),
      );
    }

    return (await this.getDashboard(scope.companyId, created!.id))!;
  }

  async updateDashboard(
    companyId: string,
    dashboardId: string,
    input: UpdateBusinessDashboardRequest,
  ): Promise<BusinessDashboardDetail> {
    await this.ensureDashboard(companyId, dashboardId);

    await this.deps.db
      .update(businessDashboards)
      .set({
        dashboardType: input.dashboardType,
        name: input.name?.trim(),
        description: input.description !== undefined ? normalizeOptionalText(input.description) : undefined,
        isDefault: input.isDefault,
        config: input.config,
        updatedAt: new Date(),
      })
      .where(and(eq(businessDashboards.id, dashboardId), eq(businessDashboards.companyId, companyId)));

    return (await this.getDashboard(companyId, dashboardId))!;
  }

  async addDashboardWidget(
    companyId: string,
    dashboardId: string,
    input: CreateDashboardWidgetRequest,
  ): Promise<BusinessDashboardDetail> {
    await this.ensureDashboard(companyId, dashboardId);

    await this.deps.db.insert(dashboardWidgets).values({
      companyId,
      dashboardId,
      widgetKey: input.widgetKey,
      title: input.title,
      kpiKey: input.kpiKey ?? null,
      position: input.position ?? 0,
      config: input.config ?? {},
    });

    return (await this.getDashboard(companyId, dashboardId))!;
  }

  async getDashboardByType(companyId: string, dashboardType: BusinessDashboardType): Promise<BusinessDashboardDetail | null> {
    const row = await this.deps.db.query.businessDashboards.findFirst({
      where: and(eq(businessDashboards.companyId, companyId), eq(businessDashboards.dashboardType, dashboardType)),
      orderBy: [desc(businessDashboards.isDefault), desc(businessDashboards.updatedAt)],
    });

    return row ? this.getDashboard(companyId, row.id) : null;
  }

  async listReportTemplates(companyId: string): Promise<BiReportTemplateSummary[]> {
    const rows = await this.deps.db.query.biReportTemplates.findMany({
      where: eq(biReportTemplates.companyId, companyId),
      orderBy: [desc(biReportTemplates.updatedAt)],
    });

    return rows.map(toReportTemplateSummary);
  }

  async createReportTemplate(companyId: string, input: CreateBiReportTemplateRequest): Promise<BiReportTemplateSummary> {
    const name = input.name.trim();
    if (!name) throw new BusinessIntelligenceError('VALIDATION_ERROR', 'Template name is required');

    const [created] = await this.deps.db
      .insert(biReportTemplates)
      .values({
        companyId,
        name,
        description: normalizeOptionalText(input.description),
        templateKey: input.templateKey.trim(),
        modules: input.modules ?? [],
        defaultFilters: input.defaultFilters ?? {},
        isActive: input.isActive ?? true,
      })
      .returning();

    const templates = await this.listReportTemplates(companyId);
    return templates.find((row) => row.id === created!.id)!;
  }

  async updateReportTemplate(
    companyId: string,
    templateId: string,
    input: UpdateBiReportTemplateRequest,
  ): Promise<BiReportTemplateSummary> {
    await this.ensureReportTemplate(companyId, templateId);

    await this.deps.db
      .update(biReportTemplates)
      .set({
        name: input.name?.trim(),
        description: input.description !== undefined ? normalizeOptionalText(input.description) : undefined,
        templateKey: input.templateKey?.trim(),
        modules: input.modules,
        defaultFilters: input.defaultFilters,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(and(eq(biReportTemplates.id, templateId), eq(biReportTemplates.companyId, companyId)));

    const templates = await this.listReportTemplates(companyId);
    return templates.find((row) => row.id === templateId)!;
  }

  async listReports(companyId: string): Promise<BusinessReportSummary[]> {
    const rows = await this.deps.db.query.businessReports.findMany({
      where: eq(businessReports.companyId, companyId),
      orderBy: [desc(businessReports.updatedAt)],
    });

    return rows.map(toReportSummary);
  }

  async createReport(scope: TenantScope, input: CreateBusinessReportRequest): Promise<BusinessReportDetail> {
    const name = input.name.trim();
    if (!name) throw new BusinessIntelligenceError('VALIDATION_ERROR', 'Report name is required');

    const [created] = await this.deps.db
      .insert(businessReports)
      .values({
        companyId: scope.companyId,
        templateId: input.templateId ?? null,
        name,
        description: normalizeOptionalText(input.description),
        filters: input.filters ?? {},
        scheduleCron: input.scheduleCron?.trim() || null,
        status: input.scheduleCron ? 'scheduled' : 'draft',
        createdByUserId: scope.userId,
      })
      .returning();

    return (await this.getReport(scope.companyId, created!.id))!;
  }

  async updateReport(
    companyId: string,
    reportId: string,
    input: UpdateBusinessReportRequest,
  ): Promise<BusinessReportDetail> {
    await this.ensureReport(companyId, reportId);

    await this.deps.db
      .update(businessReports)
      .set({
        templateId: input.templateId !== undefined ? input.templateId : undefined,
        name: input.name?.trim(),
        description: input.description !== undefined ? normalizeOptionalText(input.description) : undefined,
        filters: input.filters,
        scheduleCron: input.scheduleCron !== undefined ? input.scheduleCron?.trim() || null : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(businessReports.id, reportId), eq(businessReports.companyId, companyId)));

    return (await this.getReport(companyId, reportId))!;
  }

  async getReport(companyId: string, reportId: string): Promise<BusinessReportDetail | null> {
    const row = await this.deps.db.query.businessReports.findFirst({
      where: and(eq(businessReports.id, reportId), eq(businessReports.companyId, companyId)),
    });

    if (!row) return null;

    return {
      ...toReportSummary(row),
      filters: row.filters,
      exportMetadata: row.exportMetadata,
    };
  }

  async submitReport(scope: TenantScope, reportId: string): Promise<BusinessReportDetail> {
    await this.ensureReport(scope.companyId, reportId);
    await this.deps.db
      .update(businessReports)
      .set({ status: 'pending_approval', updatedAt: new Date() })
      .where(and(eq(businessReports.id, reportId), eq(businessReports.companyId, scope.companyId)));
    return (await this.getReport(scope.companyId, reportId))!;
  }

  async approveReport(
    scope: TenantScope,
    reportId: string,
    _input: ApproveBusinessReportRequest,
  ): Promise<BusinessReportDetail> {
    await this.ensureReport(scope.companyId, reportId);
    await this.deps.db
      .update(businessReports)
      .set({ status: 'approved', approvedByUserId: scope.userId, updatedAt: new Date() })
      .where(and(eq(businessReports.id, reportId), eq(businessReports.companyId, scope.companyId)));
    return (await this.getReport(scope.companyId, reportId))!;
  }

  async scheduleReport(
    companyId: string,
    reportId: string,
    input: ScheduleBusinessReportRequest,
  ): Promise<BusinessReportDetail> {
    await this.ensureReport(companyId, reportId);
    await this.deps.db
      .update(businessReports)
      .set({ status: 'scheduled', scheduleCron: input.scheduleCron, updatedAt: new Date() })
      .where(and(eq(businessReports.id, reportId), eq(businessReports.companyId, companyId)));
    return (await this.getReport(companyId, reportId))!;
  }

  async generateReport(
    scope: TenantScope,
    reportId: string,
    input: GenerateBusinessReportRequest = {},
  ): Promise<BusinessReportDetail> {
    const report = await this.ensureReport(scope.companyId, reportId);
    if (!['approved', 'scheduled'].includes(report.status)) {
      throw new BusinessIntelligenceError('VALIDATION_ERROR', 'Report must be approved before generation');
    }

    const [dataLake, dashboard, kpis] = await Promise.all([
      this.getDataLakeSummary(scope.companyId),
      this.getDashboardByType(scope.companyId, 'executive'),
      this.listKpis(scope.companyId),
    ]);

    const summary = `Report "${report.name}" generated from ${dataLake.length} module(s), ${kpis.length} KPI(s)${dashboard ? `, dashboard "${dashboard.name}"` : ''}.`;

    await this.deps.db
      .update(businessReports)
      .set({
        status: 'generated',
        filters: input.filters ?? report.filters,
        resultSummary: summary,
        lastGeneratedAt: new Date(),
        exportMetadata: {
          moduleCount: dataLake.length,
          kpiCount: kpis.length,
          generatedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(and(eq(businessReports.id, reportId), eq(businessReports.companyId, scope.companyId)));

    return (await this.getReport(scope.companyId, reportId))!;
  }

  async listInsights(companyId: string): Promise<BusinessInsightSummary[]> {
    const rows = await this.deps.db.query.businessInsights.findMany({
      where: and(
        eq(businessInsights.companyId, companyId),
        inArray(businessInsights.status, ['pending', 'accepted']),
      ),
      orderBy: [desc(businessInsights.updatedAt)],
      limit: 50,
    });

    return rows.map(toInsightSummary);
  }

  async generateInsights(companyId: string): Promise<BusinessInsightSummary[]> {
    const [dashboard, finance, sales, procurement, automation, executive] = await Promise.all([
      this.deps.analyticsService.getDashboard(companyId, { period: 'monthly' }),
      this.deps.financeIntelligenceService.getCashFlowIntelligence(companyId),
      this.deps.salesService.getStats(companyId),
      this.deps.procurementService.getStats(companyId),
      this.deps.automationService.getStats(companyId),
      this.deps.executiveService.getLatestHealthSnapshot(companyId),
    ]);

    const signals: Array<{
      insightType: BusinessInsightSummary['insightType'];
      title: string;
      description: string;
      priority: string;
      context: Record<string, unknown>;
    }> = [];

    if (dashboard.revenue.changePercent !== null && dashboard.revenue.changePercent < -10) {
      signals.push({
        insightType: 'business_trend',
        title: 'Revenue decline detected',
        description: `Revenue changed ${dashboard.revenue.changePercent}% vs prior period.`,
        priority: 'high',
        context: { revenueChangePercent: dashboard.revenue.changePercent },
      });
    }

    if (finance.cashShortageWarning) {
      signals.push({
        insightType: 'cost_optimization',
        title: 'Cash flow optimisation opportunity',
        description: finance.summary,
        priority: 'high',
        context: { weeklyForecastCents: finance.weeklyForecastCents },
      });
    }

    if (sales.pendingRecommendationCount > 0) {
      signals.push({
        insightType: 'revenue_opportunity',
        title: 'Sales opportunities pending review',
        description: `${sales.pendingRecommendationCount} sales recommendation(s) require review.`,
        priority: 'medium',
        context: { pendingRecommendationCount: sales.pendingRecommendationCount },
      });
    }

    if (procurement.lowStockCount > 0) {
      signals.push({
        insightType: 'procurement_optimization',
        title: 'Procurement attention needed',
        description: `${procurement.lowStockCount} low stock item(s) and ${procurement.openOrderCount} open PO(s).`,
        priority: 'medium',
        context: { lowStockCount: procurement.lowStockCount },
      });
    }

    if (automation.workflowCount > 0) {
      signals.push({
        insightType: 'automation_effectiveness',
        title: 'Automation engine active',
        description: `${automation.activeWorkflowCount} active workflow(s) of ${automation.workflowCount} total.`,
        priority: 'low',
        context: { activeWorkflowCount: automation.activeWorkflowCount },
      });
    }

    if (executive && executive.overallScore < 60) {
      signals.push({
        insightType: 'operational_bottleneck',
        title: 'Business health below threshold',
        description: `Health score ${executive.overallScore}/100 — review executive alerts.`,
        priority: 'high',
        context: { healthScore: executive.overallScore },
      });
    }

    const created: BusinessInsightSummary[] = [];
    for (const signal of signals.slice(0, 12)) {
      const [row] = await this.deps.db
        .insert(businessInsights)
        .values({
          companyId,
          insightType: signal.insightType,
          title: signal.title,
          description: signal.description,
          priority: signal.priority,
          context: signal.context,
        })
        .returning();

      if (row) created.push(toInsightSummary(row));
    }

    return created;
  }

  async updateInsight(
    companyId: string,
    insightId: string,
    input: UpdateBusinessInsightRequest,
  ): Promise<BusinessInsightSummary> {
    await this.ensureInsight(companyId, insightId);

    await this.deps.db
      .update(businessInsights)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(businessInsights.id, insightId));

    const row = await this.deps.db.query.businessInsights.findFirst({ where: eq(businessInsights.id, insightId) });
    return toInsightSummary(row!);
  }

  async listForecasts(companyId: string): Promise<PredictiveForecastSummary[]> {
    const rows = await this.deps.db.query.predictiveForecasts.findMany({
      where: eq(predictiveForecasts.companyId, companyId),
      orderBy: [desc(predictiveForecasts.generatedAt)],
      limit: 30,
    });

    return rows.map(toForecastSummary);
  }

  async generateForecast(
    companyId: string,
    input: GeneratePredictiveForecastRequest,
  ): Promise<PredictiveForecastSummary> {
    const now = new Date();
    const horizonEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const forecast = await this.buildForecast(companyId, input.forecastType, now, horizonEnd);

    const [created] = await this.deps.db
      .insert(predictiveForecasts)
      .values({
        companyId,
        forecastType: input.forecastType,
        horizonStart: now,
        horizonEnd,
        forecastValue: forecast.value,
        confidencePercent: forecast.confidencePercent,
        summary: forecast.summary,
        context: forecast.context,
      })
      .returning();

    return toForecastSummary(created!);
  }

  async buildAuraContext(companyId: string): Promise<BusinessIntelligenceAuraContext> {
    const [stats, kpis, dataLake, insights, forecasts] = await Promise.all([
      this.getStats(companyId),
      this.listKpis(companyId),
      this.getDataLakeSummary(companyId),
      this.listInsights(companyId),
      this.listForecasts(companyId),
    ]);

    return {
      stats,
      topKpis: kpis.slice(0, 8).map((row) => ({
        kpiKey: row.kpiKey,
        name: row.name,
        value: row.currentValue,
        unit: row.unit,
      })),
      dataLakeModules: dataLake,
      topInsights: insights.slice(0, 8).map((row) => ({
        title: row.title,
        insightType: row.insightType,
        priority: row.priority,
      })),
      recentForecasts: forecasts.slice(0, 5).map((row) => ({
        forecastType: row.forecastType,
        summary: row.summary,
      })),
      summary: `${stats.activeKpiCount} active KPI(s), ${stats.dashboardCount} dashboard(s), ${dataLake.length} data lake module(s), ${stats.pendingInsightCount} pending insight(s).`,
    };
  }

  private async computeKpiValue(companyId: string, kpiKey: BusinessKpiKey): Promise<number> {
    const [dashboard, profitability, cashFlow, techPerformance, customerAnalytics, leadsStats, procurementStats, inventoryStats, automationStats, supportStats] =
      await Promise.all([
        this.deps.analyticsService.getDashboard(companyId, { period: 'monthly' }),
        this.deps.analyticsService.getProfitability(companyId, { period: 'monthly' }),
        this.deps.financeIntelligenceService.getCashFlowIntelligence(companyId),
        this.deps.analyticsService.getTechnicianPerformance(companyId, { period: 'monthly' }),
        this.deps.analyticsService.getCustomerAnalytics(companyId, { period: 'monthly' }),
        this.deps.leadsService.getStats(companyId),
        this.deps.procurementService.getStats(companyId),
        this.deps.inventoryService.getStats(companyId),
        this.deps.automationService.getStats(companyId),
        this.deps.customerSupportService.getStats(companyId),
      ]);

    switch (kpiKey) {
      case 'revenue':
        return dashboard.revenue.totalCents;
      case 'gross_profit':
        return profitability.totals.estimatedProfitCents ?? 0;
      case 'net_profit':
        return profitability.totals.estimatedProfitCents ?? 0;
      case 'cash_flow':
        return cashFlow.inflowCents - cashFlow.outflowCents;
      case 'job_completion_rate':
        return dashboard.operationalKpis.completionRatePercent ?? 0;
      case 'technician_utilization':
        return techPerformance.technicians.length > 0
          ? Math.round(
              techPerformance.technicians.reduce((sum, tech) => sum + tech.jobsCompleted, 0) /
                techPerformance.technicians.length,
            )
          : 0;
      case 'customer_retention':
        return customerAnalytics.totalCustomers > 0
          ? Math.round((customerAnalytics.repeatCustomers / customerAnalytics.totalCustomers) * 100)
          : 0;
      case 'quote_conversion':
        return customerAnalytics.quoteConversionRatePercent ?? 0;
      case 'lead_conversion':
        return leadsStats.totalLeadCount > 0
          ? Math.round((leadsStats.convertedLeadCount / leadsStats.totalLeadCount) * 100)
          : 0;
      case 'marketing_roi':
        return 0;
      case 'inventory_turnover':
        return inventoryStats.totalUnitsOnHand;
      case 'procurement_costs':
        return procurementStats.purchaseOrderCount;
      case 'customer_satisfaction':
        return supportStats.averageSentimentScore ?? 0;
      case 'automation_savings':
        return automationStats.activeWorkflowCount;
      case 'fleet_efficiency': {
        const fleetStats = await this.deps.fleetService.getStats(companyId);
        return fleetStats.totalCount > 0
          ? Math.round((fleetStats.inUseCount / fleetStats.totalCount) * 100)
          : 0;
      }
      case 'ai_performance': {
        const usageRows = await this.deps.db.query.aiUsageRecords.findMany({
          where: eq(aiUsageRecords.companyId, companyId),
        });
        return usageRows.length;
      }
      default:
        return 0;
    }
  }

  private async buildForecast(
    companyId: string,
    forecastType: PredictiveForecastType,
    _horizonStart: Date,
    _horizonEnd: Date,
  ): Promise<{ value: number; confidencePercent: number; summary: string; context: Record<string, unknown> }> {
    const dashboard = await this.deps.analyticsService.getDashboard(companyId, { period: 'monthly' });

    switch (forecastType) {
      case 'revenue': {
        const trend = dashboard.revenue.changePercent ?? 0;
        const projected = Math.round(dashboard.revenue.totalCents * (1 + trend / 100));
        return {
          value: projected,
          confidencePercent: Math.min(85, 50 + Math.abs(trend)),
          summary: `30-day revenue forecast: ${(projected / 100).toFixed(2)} based on ${trend}% trend.`,
          context: { currentRevenueCents: dashboard.revenue.totalCents, trendPercent: trend },
        };
      }
      case 'workload': {
        const jobs = dashboard.jobVolume.active + dashboard.operationalKpis.scheduledJobs;
        return {
          value: jobs,
          confidencePercent: 70,
          summary: `Workload forecast: ${jobs} active/scheduled job(s) in current period.`,
          context: { activeJobs: dashboard.jobVolume.active, scheduledJobs: dashboard.operationalKpis.scheduledJobs },
        };
      }
      case 'inventory_demand': {
        const stats = await this.deps.inventoryService.getStats(companyId);
        return {
          value: stats.lowStockCount,
          confidencePercent: 65,
          summary: `${stats.lowStockCount} item(s) below reorder level — review procurement.`,
          context: { lowStockCount: stats.lowStockCount },
        };
      }
      case 'staffing': {
        const workforce = await this.deps.workforceService.getStats(companyId);
        return {
          value: workforce.activePipelineCount,
          confidencePercent: 60,
          summary: `${workforce.activePipelineCount} active pipeline candidate(s), ${workforce.candidateCount} total candidate(s).`,
          context: { activePipelineCount: workforce.activePipelineCount },
        };
      }
      case 'cash_flow': {
        const cashFlow = await this.deps.financeIntelligenceService.getCashFlowIntelligence(companyId);
        return {
          value: cashFlow.monthlyForecastCents,
          confidencePercent: cashFlow.cashShortageWarning ? 55 : 75,
          summary: cashFlow.summary,
          context: { cashShortageWarning: cashFlow.cashShortageWarning },
        };
      }
      case 'customer_churn': {
        const customerAnalytics = await this.deps.analyticsService.getCustomerAnalytics(companyId, { period: 'monthly' });
        const repeatRate =
          customerAnalytics.totalCustomers > 0
            ? Math.round((customerAnalytics.repeatCustomers / customerAnalytics.totalCustomers) * 100)
            : 0;
        const atRisk = 100 - repeatRate;
        return {
          value: atRisk,
          confidencePercent: 55,
          summary: `Churn risk signal: ${atRisk}% non-repeat customer rate in period.`,
          context: { repeatCustomerRatePercent: repeatRate },
        };
      }
      case 'demand': {
        const stats = await this.deps.inventoryService.getStats(companyId);
        return {
          value: stats.lowStockCount + dashboard.jobVolume.active,
          confidencePercent: 62,
          summary: `Demand forecast combines ${dashboard.jobVolume.active} active job(s) and ${stats.lowStockCount} low-stock item(s).`,
          context: { activeJobs: dashboard.jobVolume.active, lowStockCount: stats.lowStockCount },
        };
      }
      case 'lead_scoring': {
        const leadsStats = await this.deps.leadsService.getStats(companyId);
        const score =
          leadsStats.totalLeadCount > 0
            ? Math.round((leadsStats.qualifiedLeadCount / leadsStats.totalLeadCount) * 100)
            : 0;
        return {
          value: score,
          confidencePercent: 58,
          summary: `Lead quality score: ${score}% qualified of ${leadsStats.totalLeadCount} lead(s).`,
          context: { qualifiedLeadCount: leadsStats.qualifiedLeadCount, totalLeadCount: leadsStats.totalLeadCount },
        };
      }
      case 'risk': {
        const health = await this.deps.executiveService.getLatestHealthSnapshot(companyId);
        const healthScore = health?.overallScore ?? 50;
        const riskScore = 100 - healthScore;
        return {
          value: riskScore,
          confidencePercent: 60,
          summary: `Business risk index: ${riskScore} (inverse of health score ${healthScore}).`,
          context: { healthScore },
        };
      }
      default:
        return { value: 0, confidencePercent: 50, summary: 'Insufficient historical data.', context: {} };
    }
  }

  private async ensureKpi(companyId: string, kpiId: string) {
    const row = await this.deps.db.query.businessKpis.findFirst({
      where: and(eq(businessKpis.id, kpiId), eq(businessKpis.companyId, companyId)),
    });
    if (!row) throw new BusinessIntelligenceError('NOT_FOUND', 'KPI not found');
    return row;
  }

  private async ensureDashboard(companyId: string, dashboardId: string) {
    const row = await this.deps.db.query.businessDashboards.findFirst({
      where: and(eq(businessDashboards.id, dashboardId), eq(businessDashboards.companyId, companyId)),
    });
    if (!row) throw new BusinessIntelligenceError('NOT_FOUND', 'Dashboard not found');
    return row;
  }

  private async ensureReportTemplate(companyId: string, templateId: string) {
    const row = await this.deps.db.query.biReportTemplates.findFirst({
      where: and(eq(biReportTemplates.id, templateId), eq(biReportTemplates.companyId, companyId)),
    });
    if (!row) throw new BusinessIntelligenceError('NOT_FOUND', 'Report template not found');
    return row;
  }

  private async ensureReport(companyId: string, reportId: string) {
    const row = await this.deps.db.query.businessReports.findFirst({
      where: and(eq(businessReports.id, reportId), eq(businessReports.companyId, companyId)),
    });
    if (!row) throw new BusinessIntelligenceError('NOT_FOUND', 'Report not found');
    return row;
  }

  private async ensureInsight(companyId: string, insightId: string) {
    const row = await this.deps.db.query.businessInsights.findFirst({
      where: and(eq(businessInsights.id, insightId), eq(businessInsights.companyId, companyId)),
    });
    if (!row) throw new BusinessIntelligenceError('NOT_FOUND', 'Insight not found');
    return row;
  }
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function defaultUnit(kpiKey: BusinessKpiKey): string {
  if (['revenue', 'gross_profit', 'net_profit', 'cash_flow', 'procurement_costs'].includes(kpiKey)) return 'cents';
  if (kpiKey.endsWith('_rate') || kpiKey.includes('conversion') || kpiKey.includes('retention') || kpiKey.includes('utilization') || kpiKey === 'marketing_roi') return 'percent';
  return 'count';
}

function moduleSummary(module: string, recordCount: number, lastActivityAt: Date | null): DataLakeModuleSummary {
  return { module, recordCount, lastActivityAt: lastActivityAt?.toISOString() ?? null };
}

function maxDate(dates: Date[]): Date | null {
  if (dates.length === 0) return null;
  return dates.reduce((latest, date) => (date > latest ? date : latest));
}

function toKpiSnapshotSummary(row: typeof businessKpiSnapshots.$inferSelect): BusinessKpiSnapshotSummary {
  return {
    id: row.id,
    kpiId: row.kpiId,
    kpiKey: row.kpiKey,
    value: row.value,
    previousValue: row.previousValue,
    changePercent: row.changePercent,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    generatedAt: row.generatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toReportTemplateSummary(row: typeof biReportTemplates.$inferSelect): BiReportTemplateSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    templateKey: row.templateKey,
    modules: row.modules,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toReportSummary(row: typeof businessReports.$inferSelect): BusinessReportSummary {
  return {
    id: row.id,
    templateId: row.templateId,
    name: row.name,
    description: row.description,
    status: row.status,
    scheduleCron: row.scheduleCron,
    lastGeneratedAt: row.lastGeneratedAt?.toISOString() ?? null,
    resultSummary: row.resultSummary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toInsightSummary(row: typeof businessInsights.$inferSelect): BusinessInsightSummary {
  return {
    id: row.id,
    insightType: row.insightType,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    context: row.context,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toForecastSummary(row: typeof predictiveForecasts.$inferSelect): PredictiveForecastSummary {
  return {
    id: row.id,
    forecastType: row.forecastType,
    horizonStart: row.horizonStart.toISOString(),
    horizonEnd: row.horizonEnd.toISOString(),
    forecastValue: row.forecastValue,
    confidencePercent: row.confidencePercent,
    summary: row.summary,
    generatedAt: row.generatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
