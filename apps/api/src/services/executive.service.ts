import { and, desc, eq, inArray } from 'drizzle-orm';
import type {
  BusinessHealthComponent,
  BusinessHealthSnapshotSummary,
  BusinessHealthTrend,
  BusinessSummary,
  ExecutiveAlertSummary,
  ExecutiveAuraContext,
  ExecutiveRecommendationSummary,
  ExecutiveReportSummary,
  ExecutiveReportType,
  ExecutiveStats,
  GenerateExecutiveReportRequest,
  UpdateExecutiveAlertRequest,
  UpdateExecutiveRecommendationRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  businessHealthSnapshots,
  executiveAlerts,
  executiveRecommendations,
  executiveReports,
} from '@titan/db';
import type { AnalyticsService } from './analytics.service.js';
import type { IntelligenceService } from './intelligence.service.js';
import type { SalesService } from './sales.service.js';
import type { MarketingService } from './marketing.service.js';
import type { WorkforceService } from './workforce.service.js';
import type { ProcurementService } from './procurement.service.js';

export class ExecutiveError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ExecutiveError';
  }
}

type ExecutiveServiceDeps = {
  db: DatabaseClient;
  intelligenceService: IntelligenceService;
  analyticsService: AnalyticsService;
  salesService: SalesService;
  marketingService: MarketingService;
  workforceService: WorkforceService;
  procurementService: ProcurementService;
};

export class ExecutiveService {
  constructor(private readonly deps: ExecutiveServiceDeps) {}

  async getStats(companyId: string): Promise<ExecutiveStats> {
    const [latestHealth, alerts, recommendations, reports] = await Promise.all([
      this.getLatestHealthSnapshot(companyId),
      this.listAlerts(companyId),
      this.listRecommendations(companyId),
      this.listReports(companyId),
    ]);

    return {
      healthScore: latestHealth?.overallScore ?? null,
      healthTrend: latestHealth?.trend ?? 'unknown',
      pendingAlertCount: alerts.filter((row) => row.status === 'pending').length,
      pendingRecommendationCount: recommendations.filter((row) => row.status === 'pending').length,
      reportCount: reports.length,
    };
  }

  async getLatestHealthSnapshot(companyId: string): Promise<BusinessHealthSnapshotSummary | null> {
    const row = await this.deps.db.query.businessHealthSnapshots.findFirst({
      where: eq(businessHealthSnapshots.companyId, companyId),
      orderBy: [desc(businessHealthSnapshots.generatedAt)],
    });

    return row ? toHealthSnapshotSummary(row) : null;
  }

  async generateHealthSnapshot(companyId: string): Promise<BusinessHealthSnapshotSummary> {
    const components = await this.computeHealthComponents(companyId);
    const overallScore = Math.round(
      components.reduce((sum, component) => sum + component.score * component.weight, 0),
    );
    const trend = this.resolveHealthTrend(components);
    const summary = `Business health score ${overallScore}/100 (${trend}). Based on revenue, profitability, cash flow, jobs, customers, sales, workforce, and inventory signals.`;

    const [created] = await this.deps.db
      .insert(businessHealthSnapshots)
      .values({
        companyId,
        overallScore,
        trend,
        components: Object.fromEntries(components.map((component) => [component.key, component])),
        summary,
      })
      .returning();

    if (!created) {
      throw new ExecutiveError('INTERNAL_ERROR', 'Unable to generate health snapshot');
    }

    return toHealthSnapshotSummary(created);
  }

  async listHealthSnapshots(companyId: string): Promise<BusinessHealthSnapshotSummary[]> {
    const rows = await this.deps.db.query.businessHealthSnapshots.findMany({
      where: eq(businessHealthSnapshots.companyId, companyId),
      orderBy: [desc(businessHealthSnapshots.generatedAt)],
      limit: 20,
    });

    return rows.map(toHealthSnapshotSummary);
  }

  async listAlerts(companyId: string): Promise<ExecutiveAlertSummary[]> {
    const rows = await this.deps.db.query.executiveAlerts.findMany({
      where: and(
        eq(executiveAlerts.companyId, companyId),
        inArray(executiveAlerts.status, ['pending', 'acknowledged']),
      ),
      orderBy: [desc(executiveAlerts.updatedAt)],
      limit: 50,
    });

    return rows.map(toAlertSummary);
  }

  async generateAlerts(companyId: string): Promise<ExecutiveAlertSummary[]> {
    const signals = await this.buildAlertSignals(companyId);
    const created: ExecutiveAlertSummary[] = [];

    for (const signal of signals.slice(0, 15)) {
      const [row] = await this.deps.db
        .insert(executiveAlerts)
        .values({
          companyId,
          alertType: signal.alertType,
          title: signal.title,
          description: signal.description,
          priority: signal.priority,
          context: signal.context,
        })
        .returning();

      if (row) {
        created.push(toAlertSummary(row));
      }
    }

    return created;
  }

  async updateAlert(
    companyId: string,
    alertId: string,
    input: UpdateExecutiveAlertRequest,
  ): Promise<ExecutiveAlertSummary> {
    const existing = await this.deps.db.query.executiveAlerts.findFirst({
      where: and(eq(executiveAlerts.id, alertId), eq(executiveAlerts.companyId, companyId)),
    });

    if (!existing) {
      throw new ExecutiveError('NOT_FOUND', 'Executive alert not found');
    }

    await this.deps.db
      .update(executiveAlerts)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(executiveAlerts.id, alertId));

    const row = await this.deps.db.query.executiveAlerts.findFirst({
      where: eq(executiveAlerts.id, alertId),
    });

    return toAlertSummary(row!);
  }

  async listRecommendations(companyId: string): Promise<ExecutiveRecommendationSummary[]> {
    const rows = await this.deps.db.query.executiveRecommendations.findMany({
      where: and(
        eq(executiveRecommendations.companyId, companyId),
        inArray(executiveRecommendations.status, ['pending', 'accepted']),
      ),
      orderBy: [desc(executiveRecommendations.updatedAt)],
      limit: 50,
    });

    return rows.map(toRecommendationSummary);
  }

  async generateRecommendations(companyId: string): Promise<ExecutiveRecommendationSummary[]> {
    const signals = await this.buildRecommendationSignals(companyId);
    const created: ExecutiveRecommendationSummary[] = [];

    for (const signal of signals.slice(0, 15)) {
      const [row] = await this.deps.db
        .insert(executiveRecommendations)
        .values({
          companyId,
          recommendationType: signal.recommendationType,
          title: signal.title,
          description: signal.description,
          priority: signal.priority,
          context: signal.context,
        })
        .returning();

      if (row) {
        created.push(toRecommendationSummary(row));
      }
    }

    return created;
  }

  async updateRecommendation(
    companyId: string,
    recommendationId: string,
    input: UpdateExecutiveRecommendationRequest,
  ): Promise<ExecutiveRecommendationSummary> {
    const existing = await this.deps.db.query.executiveRecommendations.findFirst({
      where: and(
        eq(executiveRecommendations.id, recommendationId),
        eq(executiveRecommendations.companyId, companyId),
      ),
    });

    if (!existing) {
      throw new ExecutiveError('NOT_FOUND', 'Executive recommendation not found');
    }

    await this.deps.db
      .update(executiveRecommendations)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(executiveRecommendations.id, recommendationId));

    const row = await this.deps.db.query.executiveRecommendations.findFirst({
      where: eq(executiveRecommendations.id, recommendationId),
    });

    return toRecommendationSummary(row!);
  }

  async listReports(companyId: string): Promise<ExecutiveReportSummary[]> {
    const rows = await this.deps.db.query.executiveReports.findMany({
      where: eq(executiveReports.companyId, companyId),
      orderBy: [desc(executiveReports.generatedAt)],
      limit: 30,
    });

    return rows.map(toReportSummary);
  }

  async generateReport(
    companyId: string,
    input: GenerateExecutiveReportRequest,
  ): Promise<ExecutiveReportSummary> {
    const content = await this.buildReportContent(companyId, input.reportType);
    const title =
      input.reportType === 'daily_summary'
        ? 'Daily Business Summary'
        : input.reportType === 'weekly_review'
          ? 'Weekly Business Review'
          : 'Monthly Performance Review';

    const [created] = await this.deps.db
      .insert(executiveReports)
      .values({
        companyId,
        reportType: input.reportType,
        title,
        content: content.text,
        context: content.context,
      })
      .returning();

    if (!created) {
      throw new ExecutiveError('INTERNAL_ERROR', 'Unable to generate executive report');
    }

    return toReportSummary(created);
  }

  async getBusinessSummary(companyId: string): Promise<BusinessSummary> {
    const period =
      'monthly' as const;
    const [dashboard, intelligence, health, alerts] = await Promise.all([
      this.deps.analyticsService.getDashboard(companyId, { period }),
      this.deps.intelligenceService.getDashboard(companyId),
      this.getLatestHealthSnapshot(companyId),
      this.listAlerts(companyId),
    ]);

    const highlights: string[] = [];
    if (dashboard.revenue.changePercent !== null && dashboard.revenue.changePercent < 0) {
      highlights.push(`Revenue down ${Math.abs(dashboard.revenue.changePercent)}% vs prior period.`);
    } else if (dashboard.revenue.changePercent !== null && dashboard.revenue.changePercent > 0) {
      highlights.push(`Revenue up ${dashboard.revenue.changePercent}% vs prior period.`);
    }

    if (intelligence.outstandingInvoices.count > 0) {
      highlights.push(
        `${intelligence.outstandingInvoices.count} outstanding invoice(s) totalling ${(intelligence.outstandingInvoices.totalOutstandingCents / 100).toFixed(2)} ${intelligence.outstandingInvoices.currency}.`,
      );
    }

    if (intelligence.lowStockCount > 0) {
      highlights.push(`${intelligence.lowStockCount} low-stock inventory item(s) need attention.`);
    }

    if (intelligence.pendingApprovals.count > 0) {
      highlights.push(`${intelligence.pendingApprovals.count} item(s) awaiting approval.`);
    }

    return {
      period,
      headline: intelligence.greeting.message,
      revenueCents: dashboard.revenue.totalCents,
      currency: dashboard.currency,
      revenueChangePercent: dashboard.revenue.changePercent,
      activeJobs: dashboard.jobVolume.active,
      completedJobs: dashboard.jobVolume.completed,
      outstandingInvoiceCents: intelligence.outstandingInvoices.totalOutstandingCents,
      lowStockCount: intelligence.lowStockCount,
      pendingAlertCount: alerts.filter((row) => row.status === 'pending').length,
      healthScore: health?.overallScore ?? null,
      highlights,
    };
  }

  async buildAuraContext(companyId: string): Promise<ExecutiveAuraContext> {
    const [stats, alerts, recommendations, businessSummary] = await Promise.all([
      this.getStats(companyId),
      this.listAlerts(companyId),
      this.listRecommendations(companyId),
      this.getBusinessSummary(companyId),
    ]);

    return {
      healthScore: stats.healthScore,
      healthTrend: stats.healthTrend,
      pendingAlertCount: stats.pendingAlertCount,
      pendingRecommendationCount: stats.pendingRecommendationCount,
      topAlerts: alerts.slice(0, 8).map((row) => ({
        title: row.title,
        alertType: row.alertType,
        priority: row.priority,
      })),
      topRecommendations: recommendations.slice(0, 8).map((row) => ({
        title: row.title,
        recommendationType: row.recommendationType,
        priority: row.priority,
      })),
      businessSummary,
      summary: `Health ${stats.healthScore ?? 'n/a'}/100 (${stats.healthTrend}), ${stats.pendingAlertCount} alert(s), ${stats.pendingRecommendationCount} recommendation(s). ${businessSummary.headline}`,
    };
  }

  private async computeHealthComponents(companyId: string): Promise<BusinessHealthComponent[]> {
    const [monthly, weekly, profitability, finance, sales, workforce, procurement] =
      await Promise.all([
        this.deps.analyticsService.getDashboard(companyId, { period: 'monthly' }),
        this.deps.analyticsService.getDashboard(companyId, { period: 'weekly' }),
        this.deps.analyticsService.getProfitability(companyId, { period: 'monthly' }),
        this.deps.analyticsService.getFinanceAnalytics(companyId, { period: 'monthly' }),
        this.deps.salesService.buildAuraContext(companyId),
        this.deps.workforceService.buildAuraContext(companyId),
        this.deps.procurementService.buildAuraContext(companyId),
      ]);

    const revenueScore = scoreFromChange(monthly.revenue.changePercent);
    const profitabilityScore =
      profitability.totals.revenueCents > 0 && profitability.totals.estimatedProfitCents !== null
        ? Math.min(
            100,
            Math.round(
              (profitability.totals.estimatedProfitCents / profitability.totals.revenueCents) * 100 + 50,
            ),
          )
        : 50;
    const cashFlowScore =
      finance.cashFlow.outstandingCents > 0 && monthly.revenue.totalCents > 0
        ? Math.max(
            0,
            100 -
              Math.round((finance.cashFlow.outstandingCents / monthly.revenue.totalCents) * 100),
          )
        : 85;
    const jobScore =
      monthly.jobVolume.total > 0
        ? Math.round((monthly.jobVolume.completed / monthly.jobVolume.total) * 100)
        : 50;
    const customerScore = scoreFromChange(
      monthly.customerGrowth.previousPeriodNew > 0
        ? Math.round(
            ((monthly.customerGrowth.newInPeriod - monthly.customerGrowth.previousPeriodNew) /
              monthly.customerGrowth.previousPeriodNew) *
              100,
          )
        : monthly.customerGrowth.newInPeriod > 0
          ? 100
          : null,
    );
    const salesScore = Math.min(100, sales.openOpportunityCount * 10 + sales.pipelineValueCents > 0 ? 70 : 40);
    const workforceScore = Math.max(0, 100 - workforce.skillGapCount * 8 - workforce.activePipelineCount * 2);
    const inventoryScore = Math.max(0, 100 - procurement.lowStockCount * 10);

    return [
      {
        key: 'revenue',
        label: 'Revenue trends',
        score: revenueScore,
        weight: 0.2,
        summary: `Revenue ${(monthly.revenue.totalCents / 100).toFixed(2)} ${monthly.currency}${monthly.revenue.changePercent !== null ? ` (${monthly.revenue.changePercent}% vs prior)` : ''}.`,
      },
      {
        key: 'profitability',
        label: 'Profitability',
        score: profitabilityScore,
        weight: 0.15,
        summary: `Profit ${profitability.totals.estimatedProfitCents !== null ? (profitability.totals.estimatedProfitCents / 100).toFixed(2) : 'n/a'} ${profitability.currency} on ${(profitability.totals.revenueCents / 100).toFixed(2)} revenue.`,
      },
      {
        key: 'cash_flow',
        label: 'Cash flow',
        score: cashFlowScore,
        weight: 0.15,
        summary: `${finance.outstandingInvoices.length} outstanding invoice(s), ${(finance.cashFlow.outstandingCents / 100).toFixed(2)} ${finance.currency} due.`,
      },
      {
        key: 'job_performance',
        label: 'Job performance',
        score: jobScore,
        weight: 0.15,
        summary: `${monthly.jobVolume.completed}/${monthly.jobVolume.total} jobs completed this month; ${weekly.jobVolume.active} active this week.`,
      },
      {
        key: 'customer_activity',
        label: 'Customer activity',
        score: customerScore,
        weight: 0.1,
        summary: `${monthly.customerGrowth.newInPeriod} new customer(s) in period.`,
      },
      {
        key: 'sales_pipeline',
        label: 'Sales pipeline',
        score: salesScore,
        weight: 0.1,
        summary: `${sales.openOpportunityCount} open opportunit${sales.openOpportunityCount === 1 ? 'y' : 'ies'}; pipeline value ${(sales.pipelineValueCents / 100).toFixed(2)}.`,
      },
      {
        key: 'workforce_capacity',
        label: 'Workforce capacity',
        score: workforceScore,
        weight: 0.075,
        summary: `${workforce.activePipelineCount} active hiring pipeline; ${workforce.skillGapCount} skill gap signal(s).`,
      },
      {
        key: 'inventory_risk',
        label: 'Inventory risks',
        score: inventoryScore,
        weight: 0.075,
        summary: `${procurement.lowStockCount} low-stock item(s); ${procurement.openOrderCount} open purchase order(s).`,
      },
    ];
  }

  private resolveHealthTrend(components: BusinessHealthComponent[]): BusinessHealthTrend {
    const revenue = components.find((component) => component.key === 'revenue');
    const cashFlow = components.find((component) => component.key === 'cash_flow');
    const avg = Math.round(components.reduce((sum, component) => sum + component.score, 0) / components.length);

    if ((revenue?.score ?? 50) >= 70 && (cashFlow?.score ?? 50) >= 60 && avg >= 65) {
      return 'improving';
    }
    if ((revenue?.score ?? 50) < 45 || (cashFlow?.score ?? 50) < 40 || avg < 45) {
      return 'declining';
    }
    if (avg >= 45) {
      return 'stable';
    }
    return 'unknown';
  }

  private async buildAlertSignals(companyId: string) {
    const [monthly, profitability, intelligence, workforce, procurement, marketing] = await Promise.all([
      this.deps.analyticsService.getDashboard(companyId, { period: 'monthly' }),
      this.deps.analyticsService.getProfitability(companyId, { period: 'monthly' }),
      this.deps.intelligenceService.getDashboard(companyId),
      this.deps.workforceService.getStaffingInsights(companyId),
      this.deps.procurementService.getStockIntelligence(companyId),
      this.deps.marketingService.buildAuraContext(companyId),
    ]);

    const signals: Array<{
      alertType: ExecutiveAlertSummary['alertType'];
      title: string;
      description: string;
      priority: string;
      context: Record<string, unknown>;
    }> = [];

    if (monthly.revenue.changePercent !== null && monthly.revenue.changePercent <= -10) {
      signals.push({
        alertType: 'revenue_decline',
        title: 'Revenue decline detected',
        description: `Revenue is down ${Math.abs(monthly.revenue.changePercent)}% compared to the prior period.`,
        priority: 'high',
        context: { changePercent: monthly.revenue.changePercent, revenueCents: monthly.revenue.totalCents },
      });
    }

    if (intelligence.outstandingInvoices.count > 0) {
      signals.push({
        alertType: 'unpaid_invoices',
        title: 'Outstanding invoices require attention',
        description: `${intelligence.outstandingInvoices.count} unpaid/partial invoice(s) totalling ${(intelligence.outstandingInvoices.totalOutstandingCents / 100).toFixed(2)} ${intelligence.outstandingInvoices.currency}.`,
        priority: intelligence.outstandingInvoices.totalOutstandingCents > 100000 ? 'high' : 'medium',
        context: {
          count: intelligence.outstandingInvoices.count,
          totalOutstandingCents: intelligence.outstandingInvoices.totalOutstandingCents,
        },
      });
    }

    if (
      profitability.totals.revenueCents > 0 &&
      profitability.totals.estimatedProfitCents !== null &&
      profitability.totals.estimatedProfitCents / profitability.totals.revenueCents < 0.15
    ) {
      signals.push({
        alertType: 'low_margin',
        title: 'Low margin signal',
        description: `Profit margin is below 15% on ${profitability.jobs.length} analysed job(s) this period.`,
        priority: 'medium',
        context: {
          estimatedProfitCents: profitability.totals.estimatedProfitCents,
          revenueCents: profitability.totals.revenueCents,
        },
      });
    }

    for (const insight of workforce.filter((row) => row.priority === 'high').slice(0, 3)) {
      signals.push({
        alertType: 'capacity_issue',
        title: insight.title,
        description: insight.description,
        priority: insight.priority,
        context: insight.context,
      });
    }

    if (intelligence.customerFollowUps.count >= 3) {
      signals.push({
        alertType: 'customer_risk',
        title: 'Customer follow-up backlog',
        description: `${intelligence.customerFollowUps.count} customer(s) need follow-up based on recent activity gaps.`,
        priority: 'medium',
        context: { count: intelligence.customerFollowUps.count },
      });
    }

    for (const signal of procurement.filter((row) => ['low_stock', 'zero_stock'].includes(row.signalType)).slice(0, 4)) {
      signals.push({
        alertType: 'stock_risk',
        title: `Stock risk — ${signal.itemName}`,
        description: signal.description,
        priority: signal.priority,
        context: { itemId: signal.itemId, itemSku: signal.itemSku },
      });
    }

    if (intelligence.automationFailures.count > 0 || intelligence.schedulingConflicts > 0) {
      signals.push({
        alertType: 'operational_issue',
        title: 'Operational issues detected',
        description: `${intelligence.automationFailures.count} automation failure(s) and ${intelligence.schedulingConflicts} scheduling conflict(s) need review.`,
        priority: 'medium',
        context: {
          automationFailures: intelligence.automationFailures.count,
          schedulingConflicts: intelligence.schedulingConflicts,
        },
      });
    }

    if (monthly.customerGrowth.newInPeriod >= 3 || marketing.activeCampaignCount > 0) {
      signals.push({
        alertType: 'growth_opportunity',
        title: 'Growth opportunity signal',
        description: `${monthly.customerGrowth.newInPeriod} new customer(s) and ${marketing.activeCampaignCount} active marketing campaign signal(s) indicate growth potential.`,
        priority: 'low',
        context: {
          newCustomers: monthly.customerGrowth.newInPeriod,
          activeCampaigns: marketing.activeCampaignCount,
        },
      });
    }

    return signals;
  }

  private async buildRecommendationSignals(companyId: string) {
    const [monthly, sales, marketing, workforce, procurement, intelligence] = await Promise.all([
      this.deps.analyticsService.getDashboard(companyId, { period: 'monthly' }),
      this.deps.salesService.buildAuraContext(companyId),
      this.deps.marketingService.buildAuraContext(companyId),
      this.deps.workforceService.listRecommendations(companyId),
      this.deps.procurementService.listRecommendations(companyId),
      this.deps.intelligenceService.getDashboard(companyId),
    ]);

    const signals: Array<{
      recommendationType: ExecutiveRecommendationSummary['recommendationType'];
      title: string;
      description: string;
      priority: string;
      context: Record<string, unknown>;
    }> = [];

    if (sales.openOpportunityCount > 0) {
      signals.push({
        recommendationType: 'growth',
        title: 'Convert open sales opportunities',
        description: `${sales.openOpportunityCount} open opportunit${sales.openOpportunityCount === 1 ? 'y' : 'ies'} in pipeline — review follow-ups and quote readiness.`,
        priority: 'medium',
        context: { openOpportunityCount: sales.openOpportunityCount, pipelineValueCents: sales.pipelineValueCents },
      });
    }

    if (monthly.revenue.changePercent !== null && monthly.revenue.changePercent > 5) {
      signals.push({
        recommendationType: 'growth',
        title: 'Capitalise on revenue momentum',
        description: `Revenue is up ${monthly.revenue.changePercent}% — consider expanding capacity or marketing while demand is strong.`,
        priority: 'medium',
        context: { changePercent: monthly.revenue.changePercent },
      });
    }

    if (intelligence.outstandingInvoices.count > 0) {
      signals.push({
        recommendationType: 'cost_optimization',
        title: 'Improve cash collection',
        description: `${intelligence.outstandingInvoices.count} outstanding invoice(s) — prioritise payment follow-up to improve cash flow.`,
        priority: 'high',
        context: { outstandingInvoiceCount: intelligence.outstandingInvoices.count },
      });
    }

    for (const rec of procurement.filter((row) => row.recommendationType === 'low_stock').slice(0, 3)) {
      signals.push({
        recommendationType: 'operational_improvement',
        title: rec.title,
        description: rec.description,
        priority: rec.priority,
        context: rec.context,
      });
    }

    if (marketing.topSegments.length > 0) {
      signals.push({
        recommendationType: 'customer_retention',
        title: 'Review customer segments for retention',
        description: `${marketing.topSegments.length} customer segment(s) available — review engagement and retention campaigns.`,
        priority: 'medium',
        context: { segmentCount: marketing.topSegments.length },
      });
    }

    for (const rec of workforce.slice(0, 3)) {
      signals.push({
        recommendationType: 'strategic',
        title: rec.title,
        description: rec.description,
        priority: rec.priority,
        context: rec.context,
      });
    }

    return signals;
  }

  private async buildReportContent(companyId: string, reportType: ExecutiveReportType) {
    const period =
      reportType === 'daily_summary' ? 'weekly' : reportType === 'weekly_review' ? 'weekly' : 'monthly';
    const [dashboard, intelligence, summary, health] = await Promise.all([
      this.deps.analyticsService.getDashboard(companyId, { period }),
      this.deps.intelligenceService.getDashboard(companyId),
      this.getBusinessSummary(companyId),
      this.getLatestHealthSnapshot(companyId),
    ]);

    const lines = [
      summary.headline,
      '',
      `Revenue: ${(dashboard.revenue.totalCents / 100).toFixed(2)} ${dashboard.currency}${dashboard.revenue.changePercent !== null ? ` (${dashboard.revenue.changePercent}% vs prior)` : ''}`,
      `Jobs: ${dashboard.jobVolume.completed} completed, ${dashboard.jobVolume.active} active`,
      `Outstanding invoices: ${intelligence.outstandingInvoices.count} (${(intelligence.outstandingInvoices.totalOutstandingCents / 100).toFixed(2)} ${intelligence.outstandingInvoices.currency})`,
      `Low stock items: ${intelligence.lowStockCount}`,
      `Pending approvals: ${intelligence.pendingApprovals.count}`,
      health ? `Business health score: ${health.overallScore}/100 (${health.trend})` : 'Business health score: not yet calculated',
      '',
      'Highlights:',
      ...summary.highlights.map((line) => `- ${line}`),
      '',
      "This report uses real TITAN data only. Recommended actions require explicit human approval before execution.",
    ];

    return {
      text: lines.join('\n'),
      context: {
        reportType,
        period,
        revenueCents: dashboard.revenue.totalCents,
        healthScore: health?.overallScore ?? null,
      },
    };
  }
}

function scoreFromChange(changePercent: number | null): number {
  if (changePercent === null) {
    return 50;
  }
  if (changePercent >= 20) {
    return 95;
  }
  if (changePercent >= 5) {
    return 80;
  }
  if (changePercent >= 0) {
    return 65;
  }
  if (changePercent >= -10) {
    return 45;
  }
  return 25;
}

function toHealthSnapshotSummary(
  row: typeof businessHealthSnapshots.$inferSelect,
): BusinessHealthSnapshotSummary {
  const rawComponents = row.components as Record<string, BusinessHealthComponent>;
  return {
    id: row.id,
    overallScore: row.overallScore,
    trend: row.trend,
    components: Object.values(rawComponents),
    summary: row.summary,
    generatedAt: row.generatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toAlertSummary(row: typeof executiveAlerts.$inferSelect): ExecutiveAlertSummary {
  return {
    id: row.id,
    alertType: row.alertType,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    context: (row.context as Record<string, unknown>) ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRecommendationSummary(
  row: typeof executiveRecommendations.$inferSelect,
): ExecutiveRecommendationSummary {
  return {
    id: row.id,
    recommendationType: row.recommendationType,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    context: (row.context as Record<string, unknown>) ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toReportSummary(row: typeof executiveReports.$inferSelect): ExecutiveReportSummary {
  return {
    id: row.id,
    reportType: row.reportType,
    title: row.title,
    content: row.content,
    context: (row.context as Record<string, unknown>) ?? {},
    generatedAt: row.generatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
