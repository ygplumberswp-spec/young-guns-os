import { and, desc, eq } from 'drizzle-orm';
import type {
  AnalyticsAccessAuditSummary,
  AnalyticsDataLineageSummary,
  AnalyticsDataModule,
  AnalyticsDataSnapshotSummary,
  AnalyticsDatasetPermissionSummary,
  AnalyticsGovernanceSummary,
  AnalyticsPlatformActionStatus,
  AnalyticsPlatformActionSummary,
  AnalyticsReportPermissionSummary,
  AnalyticsRetentionPolicySummary,
  AnalyticsSavedLayoutSummary,
  AnalyticsWarehouseSummary,
  CreateAnalyticsDatasetPermissionRequest,
  CreateAnalyticsPlatformActionRequest,
  CreateAnalyticsRetentionPolicyRequest,
  CreateAnalyticsSavedLayoutRequest,
  EnterpriseAnalyticsAuraContext,
  EnterpriseAnalyticsExecutiveDashboard,
  RunAnalyticsAggregationRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  analyticsAccessAudit,
  analyticsAggregationCursors,
  analyticsDataLineage,
  analyticsDataSnapshots,
  analyticsDatasetPermissions,
  analyticsPlatformActions,
  analyticsReportPermissions,
  analyticsRetentionPolicies,
  analyticsSavedLayouts,
  customers,
  invoices,
  jobs,
  payments,
  quotes,
} from '@titan/db';
import type { BusinessIntelligenceService } from './business-intelligence.service.js';

export class EnterpriseAnalyticsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnterpriseAnalyticsError';
  }
}

type StaffScope = { companyId: string; userId: string };

type EnterpriseAnalyticsDeps = {
  db: DatabaseClient;
  businessIntelligenceService: BusinessIntelligenceService;
};

const ALL_MODULES: AnalyticsDataModule[] = [
  'finance',
  'sales',
  'marketing',
  'operations',
  'dispatch',
  'fleet',
  'inventory',
  'procurement',
  'hr',
  'customer_success',
  'ai',
  'productivity',
];

export class EnterpriseAnalyticsService {
  constructor(private readonly deps: EnterpriseAnalyticsDeps) {}

  async getExecutiveDashboard(companyId: string): Promise<EnterpriseAnalyticsExecutiveDashboard> {
    const [stats, kpis, insights, forecasts, warehouse, governance, savedLayouts, pendingActions, reports] =
      await Promise.all([
        this.deps.businessIntelligenceService.getStats(companyId),
        this.deps.businessIntelligenceService.listKpis(companyId),
        this.deps.businessIntelligenceService.listInsights(companyId),
        this.deps.businessIntelligenceService.listForecasts(companyId),
        this.getWarehouseSummary(companyId),
        this.getGovernanceSummary(companyId),
        this.listSavedLayouts(companyId),
        this.listActions(companyId, 'pending_approval'),
        this.deps.businessIntelligenceService.listReports(companyId),
      ]);

    return {
      summary: `${stats.activeKpiCount} active KPI(s), ${warehouse.modules.length} data module(s), ${insights.filter((i) => i.status === 'pending').length} pending insight(s).`,
      stats,
      kpis,
      insights: insights.slice(0, 20),
      forecasts: forecasts.slice(0, 10),
      warehouse,
      governance,
      savedLayouts,
      pendingActionCount: pendingActions.length,
      recentReports: reports.slice(0, 10),
    };
  }

  async buildAnalyticsAuraContext(companyId: string): Promise<EnterpriseAnalyticsAuraContext> {
    const dashboard = await this.getExecutiveDashboard(companyId);
    return {
      summary: dashboard.summary,
      activeKpiCount: dashboard.stats.activeKpiCount,
      pendingInsightCount: dashboard.insights.filter((i) => i.status === 'pending').length,
      pendingActionCount: dashboard.pendingActionCount,
      moduleCount: dashboard.warehouse.modules.length,
      snapshotCount: dashboard.warehouse.snapshots.length,
    };
  }

  async getWarehouseSummary(companyId: string): Promise<AnalyticsWarehouseSummary> {
    const [modules, snapshots, lineage, cursors] = await Promise.all([
      this.deps.businessIntelligenceService.getDataLakeSummary(companyId),
      this.listSnapshots(companyId, 30),
      this.listLineage(companyId, 30),
      this.deps.db.query.analyticsAggregationCursors.findMany({
        where: eq(analyticsAggregationCursors.companyId, companyId),
      }),
    ]);

    const lastAggregatedAt = cursors.reduce<Date | null>((latest, cursor) => {
      if (!cursor.lastAggregatedAt) return latest;
      if (!latest || cursor.lastAggregatedAt > latest) return cursor.lastAggregatedAt;
      return latest;
    }, null);

    return {
      modules,
      snapshots,
      lineage,
      lastAggregatedAt: lastAggregatedAt?.toISOString() ?? null,
    };
  }

  async listSnapshots(companyId: string, limit = 50): Promise<AnalyticsDataSnapshotSummary[]> {
    const rows = await this.deps.db.query.analyticsDataSnapshots.findMany({
      where: eq(analyticsDataSnapshots.companyId, companyId),
      orderBy: [desc(analyticsDataSnapshots.generatedAt)],
      limit,
    });

    return rows.map((row) => ({
      id: row.id,
      module: row.module,
      snapshotKey: row.snapshotKey,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      recordCount: row.recordCount,
      metrics: row.metrics,
      generatedAt: row.generatedAt.toISOString(),
    }));
  }

  async listLineage(companyId: string, limit = 50): Promise<AnalyticsDataLineageSummary[]> {
    const rows = await this.deps.db.query.analyticsDataLineage.findMany({
      where: eq(analyticsDataLineage.companyId, companyId),
      orderBy: [desc(analyticsDataLineage.recordedAt)],
      limit,
    });

    return rows.map((row) => ({
      id: row.id,
      sourceModule: row.sourceModule,
      targetModule: row.targetModule,
      transformation: row.transformation,
      recordCount: row.recordCount,
      recordedAt: row.recordedAt.toISOString(),
    }));
  }

  async runIncrementalAggregation(
    companyId: string,
    input: RunAnalyticsAggregationRequest = {},
  ): Promise<AnalyticsDataSnapshotSummary[]> {
    const modules = input.modules?.length ? input.modules : ALL_MODULES;
    const now = new Date();
    const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const created: AnalyticsDataSnapshotSummary[] = [];

    for (const module of modules) {
      const aggregation = await this.aggregateModule(companyId, module);
      if (!aggregation) continue;

      const snapshotKey = `${module}_monthly_${periodStart.toISOString().slice(0, 10)}`;
      const [row] = await this.deps.db
        .insert(analyticsDataSnapshots)
        .values({
          companyId,
          module,
          snapshotKey,
          periodStart,
          periodEnd: now,
          recordCount: aggregation.recordCount,
          metrics: aggregation.metrics,
        })
        .returning();

      await this.upsertAggregationCursor(companyId, module, now, aggregation.recordCount);

      await this.deps.db.insert(analyticsDataLineage).values({
        companyId,
        sourceModule: module,
        targetModule: 'productivity',
        transformation: `incremental_aggregation:${module}`,
        recordCount: aggregation.recordCount,
        metadata: { snapshotKey },
      });

      if (row) {
        created.push({
          id: row.id,
          module: row.module,
          snapshotKey: row.snapshotKey,
          periodStart: row.periodStart.toISOString(),
          periodEnd: row.periodEnd.toISOString(),
          recordCount: row.recordCount,
          metrics: row.metrics,
          generatedAt: row.generatedAt.toISOString(),
        });
      }
    }

    return created;
  }

  async getGovernanceSummary(companyId: string): Promise<AnalyticsGovernanceSummary> {
    const [datasetPermissions, reportPermissions, retentionPolicies, recentAudit] = await Promise.all([
      this.listDatasetPermissions(companyId),
      this.listReportPermissions(companyId),
      this.listRetentionPolicies(companyId),
      this.listAccessAudit(companyId, 30),
    ]);

    return { datasetPermissions, reportPermissions, retentionPolicies, recentAudit };
  }

  async listDatasetPermissions(companyId: string): Promise<AnalyticsDatasetPermissionSummary[]> {
    const rows = await this.deps.db.query.analyticsDatasetPermissions.findMany({
      where: eq(analyticsDatasetPermissions.companyId, companyId),
    });
    return rows.map((row) => ({
      id: row.id,
      datasetKey: row.datasetKey,
      permission: row.permission,
      roleId: row.roleId,
      userId: row.userId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listReportPermissions(companyId: string): Promise<AnalyticsReportPermissionSummary[]> {
    const rows = await this.deps.db.query.analyticsReportPermissions.findMany({
      where: eq(analyticsReportPermissions.companyId, companyId),
    });
    return rows.map((row) => ({
      id: row.id,
      reportId: row.reportId,
      templateKey: row.templateKey,
      permission: row.permission,
      roleId: row.roleId,
      userId: row.userId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listRetentionPolicies(companyId: string): Promise<AnalyticsRetentionPolicySummary[]> {
    const rows = await this.deps.db.query.analyticsRetentionPolicies.findMany({
      where: eq(analyticsRetentionPolicies.companyId, companyId),
    });
    return rows.map((row) => ({
      id: row.id,
      datasetKey: row.datasetKey,
      retentionDays: row.retentionDays,
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async listAccessAudit(companyId: string, limit = 50): Promise<AnalyticsAccessAuditSummary[]> {
    const rows = await this.deps.db.query.analyticsAccessAudit.findMany({
      where: eq(analyticsAccessAudit.companyId, companyId),
      orderBy: [desc(analyticsAccessAudit.occurredAt)],
      limit,
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  async recordAccessAudit(
    scope: StaffScope,
    input: { action: string; resourceType: string; resourceId?: string; metadata?: Record<string, unknown> },
  ): Promise<void> {
    await this.deps.db.insert(analyticsAccessAudit).values({
      companyId: scope.companyId,
      userId: scope.userId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata ?? {},
    });
  }

  async createDatasetPermission(
    companyId: string,
    input: CreateAnalyticsDatasetPermissionRequest,
  ): Promise<AnalyticsDatasetPermissionSummary> {
    const [row] = await this.deps.db
      .insert(analyticsDatasetPermissions)
      .values({
        companyId,
        datasetKey: input.datasetKey,
        permission: input.permission,
        roleId: input.roleId ?? null,
        userId: input.userId ?? null,
      })
      .returning();

    return {
      id: row!.id,
      datasetKey: row!.datasetKey,
      permission: row!.permission,
      roleId: row!.roleId,
      userId: row!.userId,
      createdAt: row!.createdAt.toISOString(),
    };
  }

  async createRetentionPolicy(
    companyId: string,
    input: CreateAnalyticsRetentionPolicyRequest,
  ): Promise<AnalyticsRetentionPolicySummary> {
    const [row] = await this.deps.db
      .insert(analyticsRetentionPolicies)
      .values({
        companyId,
        datasetKey: input.datasetKey,
        retentionDays: input.retentionDays,
        enabled: input.enabled ?? true,
      })
      .returning();

    return {
      id: row!.id,
      datasetKey: row!.datasetKey,
      retentionDays: row!.retentionDays,
      enabled: row!.enabled,
      createdAt: row!.createdAt.toISOString(),
      updatedAt: row!.updatedAt.toISOString(),
    };
  }

  async listSavedLayouts(companyId: string): Promise<AnalyticsSavedLayoutSummary[]> {
    const rows = await this.deps.db.query.analyticsSavedLayouts.findMany({
      where: eq(analyticsSavedLayouts.companyId, companyId),
      orderBy: [desc(analyticsSavedLayouts.updatedAt)],
    });
    return rows.map((row) => ({
      id: row.id,
      dashboardType: row.dashboardType,
      name: row.name,
      layout: row.layout,
      isDefault: row.isDefault,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createSavedLayout(
    scope: StaffScope,
    input: CreateAnalyticsSavedLayoutRequest,
  ): Promise<AnalyticsSavedLayoutSummary> {
    const [row] = await this.deps.db
      .insert(analyticsSavedLayouts)
      .values({
        companyId: scope.companyId,
        dashboardType: input.dashboardType,
        name: input.name,
        layout: input.layout ?? {},
        isDefault: input.isDefault ?? false,
        createdByUserId: scope.userId,
      })
      .returning();

    await this.recordAccessAudit(scope, {
      action: 'create_layout',
      resourceType: 'saved_layout',
      resourceId: row!.id,
    });

    return {
      id: row!.id,
      dashboardType: row!.dashboardType,
      name: row!.name,
      layout: row!.layout,
      isDefault: row!.isDefault,
      createdAt: row!.createdAt.toISOString(),
      updatedAt: row!.updatedAt.toISOString(),
    };
  }

  async listActions(
    companyId: string,
    status?: AnalyticsPlatformActionStatus,
  ): Promise<AnalyticsPlatformActionSummary[]> {
    const rows = await this.deps.db.query.analyticsPlatformActions.findMany({
      where: status
        ? and(eq(analyticsPlatformActions.companyId, companyId), eq(analyticsPlatformActions.status, status))
        : eq(analyticsPlatformActions.companyId, companyId),
      orderBy: [desc(analyticsPlatformActions.createdAt)],
      limit: 50,
    });

    return rows.map((row) => ({
      id: row.id,
      actionType: row.actionType,
      status: row.status,
      subject: row.subject,
      recommendation: row.recommendation,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createAction(
    scope: StaffScope,
    input: CreateAnalyticsPlatformActionRequest,
  ): Promise<AnalyticsPlatformActionSummary> {
    const [row] = await this.deps.db
      .insert(analyticsPlatformActions)
      .values({
        companyId: scope.companyId,
        actionType: input.actionType,
        subject: input.subject,
        recommendation: input.recommendation,
        payload: input.payload ?? {},
        createdByUserId: scope.userId,
      })
      .returning();

    await this.recordAccessAudit(scope, {
      action: 'create_action',
      resourceType: 'platform_action',
      resourceId: row!.id,
    });

    return {
      id: row!.id,
      actionType: row!.actionType,
      status: row!.status,
      subject: row!.subject,
      recommendation: row!.recommendation,
      payload: row!.payload,
      createdAt: row!.createdAt.toISOString(),
    };
  }

  private async upsertAggregationCursor(
    companyId: string,
    module: AnalyticsDataModule,
    aggregatedAt: Date,
    recordCount: number,
  ): Promise<void> {
    const existing = await this.deps.db.query.analyticsAggregationCursors.findFirst({
      where: and(
        eq(analyticsAggregationCursors.companyId, companyId),
        eq(analyticsAggregationCursors.module, module),
        eq(analyticsAggregationCursors.cursorKey, 'default'),
      ),
    });

    if (existing) {
      await this.deps.db
        .update(analyticsAggregationCursors)
        .set({
          lastAggregatedAt: aggregatedAt,
          state: { recordCount },
          updatedAt: aggregatedAt,
        })
        .where(eq(analyticsAggregationCursors.id, existing.id));
      return;
    }

    await this.deps.db.insert(analyticsAggregationCursors).values({
      companyId,
      module,
      cursorKey: 'default',
      lastAggregatedAt: aggregatedAt,
      state: { recordCount },
    });
  }

  private async aggregateModule(
    companyId: string,
    module: AnalyticsDataModule,
  ): Promise<{ recordCount: number; metrics: Record<string, unknown> } | null> {
    switch (module) {
      case 'finance': {
        const [invoiceRows, paymentRows] = await Promise.all([
          this.deps.db.query.invoices.findMany({ where: eq(invoices.companyId, companyId) }),
          this.deps.db.query.payments.findMany({ where: eq(payments.companyId, companyId) }),
        ]);
        const totalRevenue = paymentRows.reduce((sum, row) => sum + row.amountCents, 0);
        return {
          recordCount: invoiceRows.length + paymentRows.length,
          metrics: { invoiceCount: invoiceRows.length, paymentCount: paymentRows.length, totalRevenueCents: totalRevenue },
        };
      }
      case 'sales': {
        const quoteRows = await this.deps.db.query.quotes.findMany({ where: eq(quotes.companyId, companyId) });
        const accepted = quoteRows.filter((row) => row.status === 'accepted').length;
        return {
          recordCount: quoteRows.length,
          metrics: { quoteCount: quoteRows.length, acceptedCount: accepted },
        };
      }
      case 'operations': {
        const jobRows = await this.deps.db.query.jobs.findMany({ where: eq(jobs.companyId, companyId) });
        const completed = jobRows.filter((row) => row.status === 'completed').length;
        return {
          recordCount: jobRows.length,
          metrics: { jobCount: jobRows.length, completedCount: completed },
        };
      }
      case 'customer_success': {
        const customerRows = await this.deps.db.query.customers.findMany({ where: eq(customers.companyId, companyId) });
        return { recordCount: customerRows.length, metrics: { customerCount: customerRows.length } };
      }
      default:
        return { recordCount: 0, metrics: { note: 'Module aggregation uses cross-service summaries when records exist' } };
    }
  }
}
