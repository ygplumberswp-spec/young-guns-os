import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type {
  AnalyticsDashboard,
  AnalyticsDashboardQuery,
  AnalyticsPeriod,
  AnalyticsTrendPoint,
  AnalyticsTrends,
  CustomerAnalytics,
  FinanceAnalytics,
  GenerateReportRequest,
  JobProfitabilityAnalytics,
  JobProfitabilityRecord,
  ReportDefinitionSummary,
  ReportRunDetail,
  ReportRunSummary,
  ReportType,
  TechnicianPerformanceAnalytics,
} from '@titan/shared';
import { REPORT_TYPE_OPTIONS } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  analyticsSnapshots,
  customerActivities,
  customers,
  invoices,
  jobs,
  payments,
  quotes,
  reportDefinitions,
  reportRuns,
} from '@titan/db';
import type { FinanceService } from './finance.service.js';
import type { FleetService } from './fleet.service.js';
import type { InventoryService } from './inventory.service.js';
import { CustomerValueClassificationService } from './customer-value-classification.service.js';

export class AnalyticsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AnalyticsError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
};

type ResolvedRange = {
  period: AnalyticsPeriod;
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
};

export type AuraAnalyticsContext = {
  period: AnalyticsPeriod;
  revenueCents: number;
  jobCount: number;
  newCustomers: number;
  outstandingCents: number;
  completionRatePercent: number | null;
  summary: string;
};

export class AnalyticsService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly financeService: FinanceService,
    private readonly fleetService: FleetService,
    private readonly inventoryService: InventoryService,
  ) {}

  async getDashboard(
    companyId: string,
    query: AnalyticsDashboardQuery = {},
  ): Promise<AnalyticsDashboard> {
    const range = resolveRange(query);
    const currency = (await this.financeService.getStats(companyId)).currency;
    const fleetStats = await this.fleetService.getStats(companyId);
    const inventoryStats = await this.inventoryService.getStats(companyId);

    const [
      currentPayments,
      previousPayments,
      currentJobs,
      previousJobs,
      currentCustomers,
      previousCustomers,
      invoiceRows,
      outstandingRows,
    ] = await Promise.all([
      this.sumPayments(companyId, range.from, range.to),
      this.sumPayments(companyId, range.previousFrom, range.previousTo),
      this.countJobs(companyId, range.from, range.to),
      this.countJobs(companyId, range.previousFrom, range.previousTo),
      this.countNewCustomers(companyId, range.from, range.to),
      this.countNewCustomers(companyId, range.previousFrom, range.previousTo),
      this.db.query.invoices.findMany({
        where: and(
          eq(invoices.companyId, companyId),
          gte(invoices.createdAt, range.from),
          lte(invoices.createdAt, range.to),
        ),
      }),
      this.db.query.invoices.findMany({
        where: and(
          eq(invoices.companyId, companyId),
          inArray(invoices.status, ['sent', 'partial', 'overdue']),
        ),
      }),
    ]);

    const completedJobs = currentJobs.filter((job) => job.status === 'completed').length;
    const activeJobs = currentJobs.filter((job) =>
      ['new', 'scheduled', 'in_progress'].includes(job.status),
    ).length;
    const scheduledJobs = currentJobs.filter(
      (job) => job.status === 'scheduled' || job.scheduledAt,
    ).length;

    const valueMetrics = await new CustomerValueClassificationService(this.db).getValueMetrics(
      companyId,
    );
    const verifiedCustomerCount = valueMetrics.totals.qualifyingCustomers;
    const rawContactRecords = valueMetrics.totals.customerRecords;

    const paymentRows = await this.db.query.payments.findMany({
      where: and(
        eq(payments.companyId, companyId),
        gte(payments.paidAt, range.from),
        lte(payments.paidAt, range.to),
      ),
    });

    const outstandingTotal = outstandingRows.reduce(
      (sum, invoice) => sum + Math.max(0, invoice.amountCents - invoice.amountPaidCents),
      0,
    );

    const revenueChange =
      previousPayments > 0
        ? Math.round(((currentPayments - previousPayments) / previousPayments) * 100)
        : null;

    const completionRate =
      currentJobs.length > 0 ? Math.round((completedJobs / currentJobs.length) * 100) : null;

    return {
      period: range.period,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      currency,
      revenue: {
        totalCents: currentPayments,
        previousPeriodCents: previousPayments,
        changePercent: revenueChange,
      },
      jobVolume: {
        total: currentJobs.length,
        completed: completedJobs,
        active: activeJobs,
        previousPeriodTotal: previousJobs.length,
        trend: buildTrend(currentJobs, range, 'createdAt'),
      },
      customerGrowth: {
        totalCustomers: verifiedCustomerCount,
        rawContactRecords,
        newInPeriod: currentCustomers,
        previousPeriodNew: previousCustomers,
        trend: await this.buildCustomerTrend(companyId, range),
      },
      invoicePerformance: {
        created: invoiceRows.length,
        sent: invoiceRows.filter((row) => row.status !== 'draft' && row.status !== 'cancelled')
          .length,
        paid: invoiceRows.filter((row) => row.status === 'paid').length,
        overdue: invoiceRows.filter((row) => row.status === 'overdue').length,
        totalInvoicedCents: invoiceRows.reduce((sum, row) => sum + row.amountCents, 0),
        totalPaidCents: invoiceRows.reduce((sum, row) => sum + row.amountPaidCents, 0),
      },
      paymentPerformance: {
        count: paymentRows.length,
        totalCents: currentPayments,
        averageCents: paymentRows.length > 0 ? Math.round(currentPayments / paymentRows.length) : 0,
      },
      outstandingBalances: {
        count: outstandingRows.length,
        totalCents: outstandingTotal,
      },
      operationalKpis: {
        scheduledJobs,
        completionRatePercent: completionRate,
        lowStockItems: inventoryStats.lowStockCount,
        fleetInUse: fleetStats.inUseCount,
        fleetMaintenance: fleetStats.maintenanceCount,
      },
    };
  }

  async getTrends(
    companyId: string,
    query: AnalyticsDashboardQuery = {},
  ): Promise<AnalyticsTrends> {
    const range = resolveRange(query);

    const [jobRows, paymentRows, customerRows] = await Promise.all([
      this.db.query.jobs.findMany({
        where: and(
          eq(jobs.companyId, companyId),
          gte(jobs.createdAt, range.from),
          lte(jobs.createdAt, range.to),
        ),
      }),
      this.db.query.payments.findMany({
        where: and(
          eq(payments.companyId, companyId),
          gte(payments.paidAt, range.from),
          lte(payments.paidAt, range.to),
        ),
      }),
      this.db.query.customers.findMany({
        where: and(
          eq(customers.companyId, companyId),
          gte(customers.createdAt, range.from),
          lte(customers.createdAt, range.to),
        ),
      }),
    ]);

    return {
      period: range.period,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      revenue: buildTrendFromAmounts(paymentRows, range, 'paidAt', 'amountCents'),
      jobVolume: buildTrend(jobRows, range, 'createdAt'),
      customerGrowth: buildTrend(customerRows, range, 'createdAt'),
      payments: buildTrendFromAmounts(paymentRows, range, 'paidAt', 'amountCents'),
    };
  }

  async getProfitability(
    companyId: string,
    query: AnalyticsDashboardQuery = {},
  ): Promise<JobProfitabilityAnalytics> {
    const range = resolveRange(query);
    const currency = (await this.financeService.getStats(companyId)).currency;

    const jobRows = await this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        gte(jobs.createdAt, range.from),
        lte(jobs.createdAt, range.to),
      ),
      with: { customer: true },
    });

    const invoiceRows = await this.db.query.invoices.findMany({
      where: and(eq(invoices.companyId, companyId), sql`${invoices.jobId} is not null`),
    });

    const invoiceByJob = new Map(
      invoiceRows.filter((row) => row.jobId).map((row) => [row.jobId!, row]),
    );

    const records: JobProfitabilityRecord[] = jobRows.map((job) => {
      const invoice = invoiceByJob.get(job.id);
      const revenueCents = invoice?.amountPaidCents ?? invoice?.amountCents ?? 0;
      const labourHours = calculateLabourHours(job.scheduledAt, job.scheduledEndAt);
      const materialCostCents = null;
      const labourCostCents = null;
      const costTrackingAvailable = false;
      const estimatedProfitCents = costTrackingAvailable
        ? null
        : revenueCents > 0
          ? revenueCents
          : null;
      const marginPercent =
        estimatedProfitCents !== null && revenueCents > 0
          ? Math.round((estimatedProfitCents / revenueCents) * 100)
          : null;

      return {
        jobId: job.id,
        jobTitle: job.title,
        customerName: job.customer?.name ?? 'Unknown',
        status: job.status,
        revenueCents,
        materialCostCents,
        labourHours,
        labourCostCents,
        estimatedProfitCents,
        marginPercent,
        costTrackingAvailable,
      };
    });

    const totalRevenue = records.reduce((sum, row) => sum + row.revenueCents, 0);
    const margins = records
      .filter((row) => row.marginPercent !== null)
      .map((row) => row.marginPercent!);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      currency,
      jobs: records,
      totals: {
        revenueCents: totalRevenue,
        estimatedProfitCents: totalRevenue > 0 ? totalRevenue : null,
        averageMarginPercent:
          margins.length > 0
            ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length)
            : null,
      },
    };
  }

  async getTechnicianPerformance(
    companyId: string,
    query: AnalyticsDashboardQuery = {},
  ): Promise<TechnicianPerformanceAnalytics> {
    const range = resolveRange(query);

    const jobRows = await this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        gte(jobs.createdAt, range.from),
        lte(jobs.createdAt, range.to),
      ),
      with: { assignedUser: true },
    });

    const byUser = new Map<
      string,
      { name: string; completed: number; assigned: number; totalHours: number; hourSamples: number }
    >();

    for (const job of jobRows) {
      if (!job.assignedUserId) continue;

      const entry = byUser.get(job.assignedUserId) ?? {
        name: job.assignedUser
          ? `${job.assignedUser.firstName} ${job.assignedUser.lastName}`.trim()
          : 'Unknown',
        completed: 0,
        assigned: 0,
        totalHours: 0,
        hourSamples: 0,
      };

      entry.assigned += 1;
      if (job.status === 'completed') entry.completed += 1;

      const hours = calculateLabourHours(job.scheduledAt, job.scheduledEndAt);
      if (hours !== null) {
        entry.totalHours += hours;
        entry.hourSamples += 1;
      }

      byUser.set(job.assignedUserId, entry);
    }

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      technicians: Array.from(byUser.entries()).map(([userId, entry]) => ({
        userId,
        name: entry.name,
        jobsCompleted: entry.completed,
        jobsAssigned: entry.assigned,
        averageCompletionHours:
          entry.hourSamples > 0
            ? Math.round((entry.totalHours / entry.hourSamples) * 10) / 10
            : null,
        workloadScore: entry.assigned,
        customerRatingsAvailable: false as const,
      })),
    };
  }

  async getCustomerAnalytics(
    companyId: string,
    query: AnalyticsDashboardQuery = {},
  ): Promise<CustomerAnalytics> {
    const range = resolveRange(query);

    const [customerRows, quoteRows, activityCountRow, invoiceRows, paymentRows] = await Promise.all(
      [
        this.db.query.customers.findMany({ where: eq(customers.companyId, companyId) }),
        this.db.query.quotes.findMany({
          where: and(
            eq(quotes.companyId, companyId),
            gte(quotes.createdAt, range.from),
            lte(quotes.createdAt, range.to),
          ),
        }),
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(customerActivities)
          .where(
            and(
              eq(customerActivities.companyId, companyId),
              gte(customerActivities.createdAt, range.from),
              lte(customerActivities.createdAt, range.to),
            ),
          ),
        this.db.query.invoices.findMany({
          where: and(
            eq(invoices.companyId, companyId),
            inArray(invoices.status, ['sent', 'partial', 'overdue']),
          ),
          with: { customer: true },
        }),
        this.db.query.payments.findMany({
          where: and(
            eq(payments.companyId, companyId),
            gte(payments.paidAt, range.from),
            lte(payments.paidAt, range.to),
          ),
          with: { invoice: { with: { customer: true } } },
        }),
      ],
    );

    const newCustomers = customerRows.filter(
      (row) => row.createdAt >= range.from && row.createdAt <= range.to,
    ).length;

    const jobCounts = await this.db
      .select({ customerId: jobs.customerId, count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(eq(jobs.companyId, companyId))
      .groupBy(jobs.customerId);

    const repeatCustomers = jobCounts.filter((row) => row.count > 1).length;
    const quotesSent = quoteRows.filter(
      (row) => row.status === 'sent' || row.status === 'accepted',
    ).length;
    const quotesAccepted = quoteRows.filter((row) => row.status === 'accepted').length;

    const revenueByCustomer = new Map<string, { name: string; cents: number }>();
    for (const payment of paymentRows) {
      const customer = payment.invoice?.customer;
      if (!customer) continue;
      const existing = revenueByCustomer.get(customer.id) ?? { name: customer.name, cents: 0 };
      existing.cents += payment.amountCents;
      revenueByCustomer.set(customer.id, existing);
    }

    const outstandingCustomerIds = new Set(invoiceRows.map((row) => row.customerId));

    const valueMetrics = await new CustomerValueClassificationService(this.db).getValueMetrics(
      companyId,
    );

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      newCustomers,
      repeatCustomers,
      totalCustomers: valueMetrics.totals.qualifyingCustomers,
      rawContactRecords: valueMetrics.totals.customerRecords,
      activityCount: activityCountRow[0]?.count ?? 0,
      quoteConversionRatePercent:
        quotesSent > 0 ? Math.round((quotesAccepted / quotesSent) * 100) : null,
      quotesSent,
      quotesAccepted,
      customersWithOutstandingInvoices: outstandingCustomerIds.size,
      topCustomersByRevenue: Array.from(revenueByCustomer.entries())
        .map(([customerId, value]) => ({
          customerId,
          customerName: value.name,
          revenueCents: value.cents,
        }))
        .sort((a, b) => b.revenueCents - a.revenueCents)
        .slice(0, 10),
      trend: await this.buildCustomerTrend(companyId, range),
    };
  }

  async getFinanceAnalytics(
    companyId: string,
    query: AnalyticsDashboardQuery = {},
  ): Promise<FinanceAnalytics> {
    const range = resolveRange(query);
    const currency = (await this.financeService.getStats(companyId)).currency;

    const [paymentRows, invoiceRows, currentRevenue, previousRevenue] = await Promise.all([
      this.db.query.payments.findMany({
        where: and(
          eq(payments.companyId, companyId),
          gte(payments.paidAt, range.from),
          lte(payments.paidAt, range.to),
        ),
      }),
      this.db.query.invoices.findMany({
        where: and(
          eq(invoices.companyId, companyId),
          inArray(invoices.status, ['sent', 'partial', 'overdue', 'paid']),
        ),
        with: { customer: true },
      }),
      this.sumPayments(companyId, range.from, range.to),
      this.sumPayments(companyId, range.previousFrom, range.previousTo),
    ]);

    const invoicedInPeriod = invoiceRows.filter(
      (row) => row.createdAt >= range.from && row.createdAt <= range.to,
    );

    const outstanding = invoiceRows.filter((row) =>
      ['sent', 'partial', 'overdue'].includes(row.status),
    );

    const now = new Date();

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      currency,
      cashFlow: {
        inflowCents: paymentRows.reduce((sum, row) => sum + row.amountCents, 0),
        invoicedCents: invoicedInPeriod.reduce((sum, row) => sum + row.amountCents, 0),
        outstandingCents: outstanding.reduce(
          (sum, row) => sum + Math.max(0, row.amountCents - row.amountPaidCents),
          0,
        ),
      },
      revenueTrend: buildTrendFromAmounts(paymentRows, range, 'paidAt', 'amountCents'),
      paymentTrend: buildTrendFromAmounts(paymentRows, range, 'paidAt', 'amountCents'),
      outstandingInvoices: outstanding.slice(0, 20).map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        customerName: row.customer?.name ?? 'Unknown',
        outstandingCents: Math.max(0, row.amountCents - row.amountPaidCents),
        dueDate: row.dueDate?.toISOString() ?? null,
        daysOverdue:
          row.dueDate && row.dueDate < now
            ? Math.floor((now.getTime() - row.dueDate.getTime()) / (24 * 60 * 60 * 1000))
            : null,
      })),
      monthlyComparison: {
        currentPeriodRevenueCents: currentRevenue,
        previousPeriodRevenueCents: previousRevenue,
        changePercent:
          previousRevenue > 0
            ? Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 100)
            : null,
      },
    };
  }

  async listReportDefinitions(companyId: string): Promise<ReportDefinitionSummary[]> {
    const custom = await this.db.query.reportDefinitions.findMany({
      where: eq(reportDefinitions.companyId, companyId),
      orderBy: [desc(reportDefinitions.updatedAt)],
    });

    const builtIn = REPORT_TYPE_OPTIONS.map((option) => ({
      id: null,
      reportType: option.value,
      name: option.label,
      description: option.description,
      isBuiltIn: true,
    }));

    const customSummaries = custom.map((row) => ({
      id: row.id,
      reportType: row.reportType,
      name: row.name,
      description: row.description ?? '',
      isBuiltIn: false,
    }));

    return [...builtIn, ...customSummaries];
  }

  async listReportRuns(companyId: string): Promise<ReportRunSummary[]> {
    const rows = await this.db.query.reportRuns.findMany({
      where: eq(reportRuns.companyId, companyId),
      orderBy: [desc(reportRuns.startedAt)],
      limit: 50,
    });

    return rows.map(toReportRunSummary);
  }

  async getReportRun(companyId: string, runId: string): Promise<ReportRunDetail | null> {
    const row = await this.db.query.reportRuns.findFirst({
      where: and(eq(reportRuns.id, runId), eq(reportRuns.companyId, companyId)),
    });

    if (!row) return null;

    return {
      ...toReportRunSummary(row),
      result: row.result ?? null,
      errorMessage: row.errorMessage,
      exportReady: row.status === 'completed' && Boolean(row.result),
    };
  }

  async generateReport(scope: TenantScope, input: GenerateReportRequest): Promise<ReportRunDetail> {
    const range = resolveRange({
      period: input.period,
      from: input.from,
      to: input.to,
    });

    const [run] = await this.db
      .insert(reportRuns)
      .values({
        companyId: scope.companyId,
        reportType: input.reportType,
        status: 'running',
        parameters: {
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          period: range.period,
        },
        generatedByUserId: scope.userId,
        startedAt: new Date(),
      })
      .returning();

    try {
      const result = await this.buildReportResult(scope.companyId, input.reportType, range);
      const summary = buildReportSummary(input.reportType, result);

      const [updated] = await this.db
        .update(reportRuns)
        .set({
          status: 'completed',
          result,
          summary,
          completedAt: new Date(),
        })
        .where(eq(reportRuns.id, run!.id))
        .returning();

      await this.db.insert(analyticsSnapshots).values({
        companyId: scope.companyId,
        snapshotType: `report_${input.reportType}`,
        period: range.period,
        snapshotDate: range.to.toISOString().slice(0, 10),
        data: result,
      });

      return {
        ...toReportRunSummary(updated!),
        result,
        errorMessage: null,
        exportReady: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Report generation failed';

      await this.db
        .update(reportRuns)
        .set({ status: 'failed', errorMessage: message, completedAt: new Date() })
        .where(eq(reportRuns.id, run!.id));

      throw new AnalyticsError('REPORT_FAILED', message);
    }
  }

  async buildAuraContext(
    companyId: string,
    query: AnalyticsDashboardQuery = {},
  ): Promise<AuraAnalyticsContext> {
    const dashboard = await this.getDashboard(companyId, query);

    return {
      period: dashboard.period,
      revenueCents: dashboard.revenue.totalCents,
      jobCount: dashboard.jobVolume.total,
      newCustomers: dashboard.customerGrowth.newInPeriod,
      outstandingCents: dashboard.outstandingBalances.totalCents,
      completionRatePercent: dashboard.operationalKpis.completionRatePercent,
      summary: `Revenue ${dashboard.revenue.totalCents / 100} ${dashboard.currency}, ${dashboard.jobVolume.total} jobs, ${dashboard.customerGrowth.newInPeriod} new customers, ${dashboard.outstandingBalances.count} outstanding invoices.`,
    };
  }

  private async buildReportResult(companyId: string, reportType: ReportType, range: ResolvedRange) {
    const query = {
      period: range.period,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    };

    switch (reportType) {
      case 'revenue':
        return {
          dashboard: await this.getDashboard(companyId, query),
          trends: await this.getTrends(companyId, query),
        };
      case 'customer':
        return { customer: await this.getCustomerAnalytics(companyId, query) };
      case 'job_performance':
        return {
          dashboard: await this.getDashboard(companyId, query),
          profitability: await this.getProfitability(companyId, query),
        };
      case 'technician_performance':
        return { technicians: await this.getTechnicianPerformance(companyId, query) };
      case 'finance':
        return { finance: await this.getFinanceAnalytics(companyId, query) };
      case 'fleet':
        return {
          fleet: await this.fleetService.getStats(companyId),
          vehicles: await this.fleetService.listVehicles(companyId),
        };
      case 'inventory':
        return {
          inventory: await this.inventoryService.getStats(companyId),
          items: await this.inventoryService.listItems(companyId),
          stockLevels: await this.inventoryService.listStockLevels(companyId),
        };
      default:
        throw new AnalyticsError('UNSUPPORTED_REPORT', `Unsupported report type: ${reportType}`);
    }
  }

  private async sumPayments(companyId: string, from: Date, to: Date): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
      .from(payments)
      .where(
        and(
          eq(payments.companyId, companyId),
          gte(payments.paidAt, from),
          lte(payments.paidAt, to),
        ),
      );

    return row?.total ?? 0;
  }

  private async countJobs(companyId: string, from: Date, to: Date) {
    return this.db.query.jobs.findMany({
      where: and(eq(jobs.companyId, companyId), gte(jobs.createdAt, from), lte(jobs.createdAt, to)),
    });
  }

  private async countNewCustomers(companyId: string, from: Date, to: Date): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(
        and(
          eq(customers.companyId, companyId),
          gte(customers.createdAt, from),
          lte(customers.createdAt, to),
        ),
      );

    return row?.count ?? 0;
  }

  private async buildCustomerTrend(
    companyId: string,
    range: ResolvedRange,
  ): Promise<AnalyticsTrendPoint[]> {
    const rows = await this.db.query.customers.findMany({
      where: and(
        eq(customers.companyId, companyId),
        gte(customers.createdAt, range.from),
        lte(customers.createdAt, range.to),
      ),
    });

    return buildTrend(rows, range, 'createdAt');
  }
}

function resolveRange(query: AnalyticsDashboardQuery): ResolvedRange {
  const period = query.period ?? 'monthly';
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : defaultFrom(period, to);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new AnalyticsError('VALIDATION_ERROR', 'Invalid date range');
  }

  const durationMs = to.getTime() - from.getTime();
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - durationMs);

  return { period, from, to, previousFrom, previousTo };
}

function defaultFrom(period: AnalyticsPeriod, to: Date): Date {
  const from = new Date(to);
  if (period === 'daily') from.setDate(from.getDate() - 1);
  else if (period === 'weekly') from.setDate(from.getDate() - 7);
  else from.setMonth(from.getMonth() - 1);
  from.setHours(0, 0, 0, 0);
  return from;
}

function buildTrend<T extends { createdAt?: Date; paidAt?: Date }>(
  rows: T[],
  range: ResolvedRange,
  dateField: 'createdAt' | 'paidAt',
): AnalyticsTrendPoint[] {
  const buckets = createBuckets(range);
  for (const row of rows) {
    const date = row[dateField];
    if (!date) continue;
    const key = bucketKey(date, range.period);
    const bucket = buckets.get(key);
    if (bucket) bucket.value += 1;
  }
  return Array.from(buckets.values());
}

function buildTrendFromAmounts<T extends Record<string, unknown>>(
  rows: T[],
  range: ResolvedRange,
  dateField: keyof T,
  amountField: keyof T,
): AnalyticsTrendPoint[] {
  const buckets = createBuckets(range);
  for (const row of rows) {
    const date = row[dateField];
    if (!(date instanceof Date)) continue;
    const key = bucketKey(date, range.period);
    const bucket = buckets.get(key);
    if (bucket) bucket.value += Number(row[amountField] ?? 0);
  }
  return Array.from(buckets.values());
}

function createBuckets(range: ResolvedRange): Map<string, AnalyticsTrendPoint> {
  const buckets = new Map<string, AnalyticsTrendPoint>();
  const cursor = new Date(range.from);

  while (cursor <= range.to) {
    const key = bucketKey(cursor, range.period);
    if (!buckets.has(key)) {
      buckets.set(key, { label: key, date: cursor.toISOString(), value: 0 });
    }
    if (range.period === 'daily') cursor.setHours(cursor.getHours() + 1);
    else if (range.period === 'weekly') cursor.setDate(cursor.getDate() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }

  return buckets;
}

function bucketKey(date: Date, period: AnalyticsPeriod): string {
  if (period === 'monthly') return date.toISOString().slice(0, 10);
  if (period === 'weekly') return date.toISOString().slice(0, 10);
  return `${date.toISOString().slice(0, 13)}:00`;
}

function calculateLabourHours(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return hours > 0 ? Math.round(hours * 10) / 10 : null;
}

function toReportRunSummary(row: typeof reportRuns.$inferSelect): ReportRunSummary {
  return {
    id: row.id,
    reportType: row.reportType,
    status: row.status,
    summary: row.summary,
    parameters: row.parameters ?? {},
    generatedByUserId: row.generatedByUserId,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildReportSummary(reportType: ReportType, _result: Record<string, unknown>): string {
  switch (reportType) {
    case 'revenue':
      return 'Revenue and trend report generated from payment data.';
    case 'customer':
      return 'Customer growth and activity report generated.';
    case 'job_performance':
      return 'Job performance and profitability report generated.';
    case 'technician_performance':
      return 'Technician workload and completion report generated.';
    case 'finance':
      return 'Finance and cash flow report generated.';
    case 'fleet':
      return 'Fleet utilisation report generated.';
    case 'inventory':
      return 'Inventory and stock level report generated.';
    default:
      return 'Report generated.';
  }
}
