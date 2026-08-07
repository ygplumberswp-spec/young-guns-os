/**
 * FIN-002 — Job / Service Profit Analytics service.
 *
 * Aggregates JPE snapshots + job dimensions. No second accounting engine.
 */

import { and, desc, eq, gte, isNotNull, lte, ne } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  customers,
  invoices,
  jobDirectCostEntries,
  jobProfitabilitySnapshots,
  jobs,
  suppliers,
  users,
} from '@titan/db';
import type {
  ProfitAnalyticsAggregateRow,
  ProfitAnalyticsDashboard,
  ProfitAnalyticsJobRow,
  ProfitAnalyticsPeriod,
  ProfitAnalyticsSupplierRow,
} from '@titan/shared';
import {
  aggregateByKey,
  aggregateByTechnician,
  buildLabourSummary,
  buildMaterialSummary,
  buildOverviewFromJobs,
  canViewProfitAnalytics,
  deriveJobAnalyticsDataQuality,
  invoiceBalanceDueCents,
  paginateRows,
  rankHighestMargin,
  rankLargestMarginMisses,
  rankLossJobs,
  rankLowestMargin,
  rankTopGrossProfit,
  resolveProfitAnalyticsPeriodRange,
  safeAnalyticsCents,
  SERVICE_TAXONOMY_NOTE,
  SUBURB_TAXONOMY_NOTE,
  TECHNICIAN_ANALYTICS_CAVEAT,
} from '@titan/shared';

export class ProfitAnalyticsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProfitAnalyticsError';
  }
}

export type ProfitAnalyticsActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function numOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export class ProfitAnalyticsService {
  constructor(private readonly db: DatabaseClient) {}

  private assertView(actor: ProfitAnalyticsActor): void {
    if (!canViewProfitAnalytics(actor)) {
      throw new ProfitAnalyticsError(
        'FORBIDDEN',
        'Profit analytics requires finance access. Technician and Client are blocked.',
      );
    }
  }

  private extractJobRow(input: {
    jobId: string;
    jobNumber: string | null;
    title: string;
    status: string;
    jobType: string | null;
    customerId: string | null;
    customerName: string | null;
    suburb: string | null;
    assignedUserId: string | null;
    assignedUserName: string | null;
    calculatedAt: Date | string;
    completenessStatus: string;
    payload: Record<string, unknown> | null;
  }): ProfitAnalyticsJobRow | null {
    const payload = input.payload ?? {};
    const summary = (payload.summary ?? {}) as Record<string, unknown>;
    const cash = (payload.cash ?? {}) as Record<string, unknown>;
    const expected = (payload.expected ?? {}) as Record<string, unknown>;
    const variance = (payload.variance ?? {}) as Record<string, unknown>;
    const confidence = (payload.profitabilityConfidence ?? {}) as Record<string, unknown>;

    const revenueCents = num(summary.economicRevenueCents ?? summary.jobRevenueCents);
    const economicCostCents = num(summary.totalDirectCostCents);
    const grossProfitCents = num(summary.grossProfitCents);
    const completeness = String(input.completenessStatus || payload.completeness || 'incomplete_multiple');
    const confidenceStatus = String(confidence.status ?? '');
    const profitStatus = String(summary.status ?? 'unknown');
    const dataQuality = deriveJobAnalyticsDataQuality({
      completeness,
      confidenceStatus,
      profitStatus,
    });

    const calculatedAt =
      typeof input.calculatedAt === 'string'
        ? input.calculatedAt
        : input.calculatedAt.toISOString();

    return {
      jobId: input.jobId,
      jobReference: input.jobNumber,
      title: input.title,
      status: input.status,
      jobType: input.jobType,
      customerId: input.customerId,
      customerName: input.customerName,
      suburb: input.suburb,
      assignedUserId: input.assignedUserId,
      assignedUserName: input.assignedUserName,
      calculatedAt,
      completeness,
      confidenceStatus,
      dataQuality,
      currency: String(summary.currency ?? 'ZAR'),
      revenueCents,
      economicCostCents,
      grossProfitCents,
      grossMarginPct: numOrNull(summary.grossMarginPct),
      cashCollectedCents: num(cash.cashCollectedCents),
      cashSpentCents: num(cash.cashSpentCents),
      knownRealisedCashProfitCents: num(
        cash.knownRealisedCashProfitCents ?? cash.realisedCashProfitCents,
      ),
      expectedGrossMarginPct: numOrNull(expected.expectedGrossMarginPct),
      actualGrossMarginPct: numOrNull(expected.actualGrossMarginPct),
      marginVariancePct: numOrNull(variance.marginVariancePct),
      expectedLabourCostCents: num(expected.expectedLabourCostCents),
      actualLabourCostCents: num(expected.actualLabourCostCents),
      labourVarianceCents: num(variance.labourCostVarianceCents),
      expectedMaterialCostCents: num(expected.expectedMaterialCostCents),
      actualMaterialCostCents: num(expected.actualMaterialCostCents),
      materialVarianceCents: num(variance.materialCostVarianceCents),
      labourMinutes: num(payload.labourMinutes),
      profitStatus,
      href: `/jobs/${input.jobId}`,
    };
  }

  private async loadJobRows(
    companyId: string,
    fromDate: string,
    toDate: string,
  ): Promise<ProfitAnalyticsJobRow[]> {
    const from = new Date(`${fromDate}T00:00:00.000Z`);
    const to = new Date(`${toDate}T23:59:59.999Z`);

    const rows = await this.db
      .select({
        jobId: jobs.id,
        jobNumber: jobs.jobNumber,
        title: jobs.title,
        status: jobs.status,
        jobType: jobs.jobType,
        customerId: jobs.customerId,
        customerName: customers.name,
        suburb: jobs.snapshotSuburb,
        assignedUserId: jobs.assignedUserId,
        assignedFirstName: users.firstName,
        assignedLastName: users.lastName,
        calculatedAt: jobProfitabilitySnapshots.calculatedAt,
        completenessStatus: jobProfitabilitySnapshots.completenessStatus,
        payload: jobProfitabilitySnapshots.payload,
      })
      .from(jobProfitabilitySnapshots)
      .innerJoin(
        jobs,
        and(eq(jobs.id, jobProfitabilitySnapshots.jobId), eq(jobs.companyId, companyId)),
      )
      .leftJoin(
        customers,
        and(eq(customers.id, jobs.customerId), eq(customers.companyId, companyId)),
      )
      .leftJoin(users, and(eq(users.id, jobs.assignedUserId), eq(users.companyId, companyId)))
      .where(
        and(
          eq(jobProfitabilitySnapshots.companyId, companyId),
          ne(jobs.status, 'cancelled'),
          gte(jobProfitabilitySnapshots.calculatedAt, from),
          lte(jobProfitabilitySnapshots.calculatedAt, to),
        ),
      )
      .orderBy(desc(jobProfitabilitySnapshots.calculatedAt))
      .limit(1000);

    const result: ProfitAnalyticsJobRow[] = [];
    for (const row of rows) {
      const assignedUserName =
        row.assignedFirstName || row.assignedLastName
          ? `${row.assignedFirstName ?? ''} ${row.assignedLastName ?? ''}`.trim()
          : null;
      const extracted = this.extractJobRow({
        jobId: row.jobId,
        jobNumber: row.jobNumber,
        title: row.title,
        status: row.status,
        jobType: row.jobType,
        customerId: row.customerId,
        customerName: row.customerName,
        suburb: row.suburb,
        assignedUserId: row.assignedUserId,
        assignedUserName,
        calculatedAt: row.calculatedAt,
        completenessStatus: row.completenessStatus,
        payload: (row.payload ?? {}) as Record<string, unknown>,
      });
      if (extracted) result.push(extracted);
    }
    return result;
  }

  private async loadCustomerOutstandingMap(
    companyId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        customerId: invoices.customerId,
        status: invoices.status,
        totalCents: invoices.totalCents,
        amountCents: invoices.amountCents,
        amountPaidCents: invoices.amountPaidCents,
      })
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), ne(invoices.status, 'cancelled')))
      .limit(5000);

    const map = new Map<string, number>();
    for (const row of rows) {
      if (!row.customerId) continue;
      const due = invoiceBalanceDueCents({
        status: row.status,
        totalCents: num(row.totalCents),
        amountCents: num(row.amountCents),
        amountPaidCents: num(row.amountPaidCents),
      });
      if (due <= 0) continue;
      map.set(row.customerId, (map.get(row.customerId) ?? 0) + due);
    }
    return map;
  }

  private async loadSupplierRows(
    companyId: string,
    fromDate: string,
    toDate: string,
  ): Promise<ProfitAnalyticsSupplierRow[]> {
    const from = new Date(`${fromDate}T00:00:00.000Z`);
    const to = new Date(`${toDate}T23:59:59.999Z`);

    const rows = await this.db
      .select({
        supplierId: jobDirectCostEntries.supplierId,
        supplierName: suppliers.name,
        amountCents: jobDirectCostEntries.amountCents,
        jobId: jobDirectCostEntries.jobId,
        receiptDocumentId: jobDirectCostEntries.receiptDocumentId,
      })
      .from(jobDirectCostEntries)
      .innerJoin(
        suppliers,
        and(
          eq(suppliers.id, jobDirectCostEntries.supplierId),
          eq(suppliers.companyId, companyId),
        ),
      )
      .where(
        and(
          eq(jobDirectCostEntries.companyId, companyId),
          isNotNull(jobDirectCostEntries.supplierId),
          gte(jobDirectCostEntries.createdAt, from),
          lte(jobDirectCostEntries.createdAt, to),
        ),
      )
      .limit(2000);

    const map = new Map<
      string,
      {
        supplierName: string;
        spendCents: number;
        jobAttributedSpendCents: number;
        costEntryCount: number;
        receiptCompleteCount: number;
        receiptMissingCount: number;
      }
    >();

    for (const row of rows) {
      if (!row.supplierId) continue;
      const bucket = map.get(row.supplierId) ?? {
        supplierName: row.supplierName ?? 'Supplier',
        spendCents: 0,
        jobAttributedSpendCents: 0,
        costEntryCount: 0,
        receiptCompleteCount: 0,
        receiptMissingCount: 0,
      };
      const amount = safeAnalyticsCents(row.amountCents);
      bucket.spendCents += amount;
      bucket.costEntryCount += 1;
      if (row.jobId) bucket.jobAttributedSpendCents += amount;
      if (row.receiptDocumentId) bucket.receiptCompleteCount += 1;
      else bucket.receiptMissingCount += 1;
      map.set(row.supplierId, bucket);
    }

    return [...map.entries()]
      .map(([supplierId, b]) => ({
        supplierId,
        supplierName: b.supplierName,
        costEntryCount: b.costEntryCount,
        spendCents: b.spendCents,
        jobAttributedSpendCents: b.jobAttributedSpendCents,
        receiptCompleteCount: b.receiptCompleteCount,
        receiptMissingCount: b.receiptMissingCount,
        href: null,
      }))
      .sort((a, b) => b.spendCents - a.spendCents);
  }

  async getDashboard(
    actor: ProfitAnalyticsActor,
    options: {
      period?: ProfitAnalyticsPeriod;
      fromDate?: string;
      toDate?: string;
    } = {},
  ): Promise<ProfitAnalyticsDashboard> {
    this.assertView(actor);
    const period = options.period ?? 'month';
    const range = resolveProfitAnalyticsPeriodRange(period, new Date(), {
      fromDate: options.fromDate ?? '',
      toDate: options.toDate ?? '',
    });

    const [jobRows, supplierRows, customerOutstanding] = await Promise.all([
      this.loadJobRows(actor.companyId, range.fromDate, range.toDate),
      this.loadSupplierRows(actor.companyId, range.fromDate, range.toDate),
      this.loadCustomerOutstandingMap(actor.companyId),
    ]);

    const overview = buildOverviewFromJobs(jobRows, {
      period,
      fromDate: range.fromDate,
      toDate: range.toDate,
    });

    const incompleteJobs = jobRows
      .filter((r) => r.dataQuality === 'INCOMPLETE')
      .slice(0, 25);

    const customerRows: ProfitAnalyticsAggregateRow[] = aggregateByKey(jobRows, (r) => ({
      key: r.customerId ?? 'unknown',
      label: r.customerName ?? 'Unknown customer',
      href: r.customerId ? `/crm/${r.customerId}` : null,
    }))
      .map((row) => ({
        ...row,
        outstandingCustomerCashCents:
          row.key === 'unknown' ? 0 : (customerOutstanding.get(row.key) ?? 0),
      }))
      .slice(0, 50);

    return {
      overview,
      jobs: {
        topGrossProfit: rankTopGrossProfit(jobRows, 10),
        highestMargin: rankHighestMargin(jobRows, 10),
        lowestMargin: rankLowestMargin(jobRows, 10),
        lossJobs: rankLossJobs(jobRows, 20),
        largestMarginMisses: rankLargestMarginMisses(jobRows, 10),
        incompleteJobs,
      },
      services: {
        taxonomySupported: false,
        taxonomyNote: SERVICE_TAXONOMY_NOTE,
        rows: aggregateByKey(jobRows, (r) => {
          const label = (r.jobType ?? '').trim() || 'Uncategorised';
          return { key: label.toLowerCase(), label };
        }).slice(0, 50),
      },
      customers: {
        rows: customerRows,
      },
      technicians: {
        caveat: TECHNICIAN_ANALYTICS_CAVEAT,
        rows: aggregateByTechnician(jobRows).slice(0, 50),
      },
      labour: buildLabourSummary(jobRows),
      materials: buildMaterialSummary(jobRows),
      suppliers: {
        rows: supplierRows.slice(0, 50),
        note: 'Supplier spend from job_direct_cost_entries with supplier_id only. Material lines without supplier FK are excluded.',
      },
      suburbs: {
        taxonomySupported: false,
        taxonomyNote: SUBURB_TAXONOMY_NOTE,
        rows: aggregateByKey(jobRows, (r) => {
          const label = (r.suburb ?? '').trim() || 'Suburb unknown';
          return { key: label.toLowerCase(), label };
        }).slice(0, 50),
      },
    };
  }

  async getJobsPage(
    actor: ProfitAnalyticsActor,
    options: {
      period?: ProfitAnalyticsPeriod;
      fromDate?: string;
      toDate?: string;
      page?: number;
      pageSize?: number;
      list?:
        | 'all'
        | 'top_profit'
        | 'lowest_margin'
        | 'loss'
        | 'margin_misses'
        | 'incomplete';
    } = {},
  ) {
    this.assertView(actor);
    const dashboard = await this.getDashboard(actor, options);
    const list = options.list ?? 'all';
    let rows: ProfitAnalyticsJobRow[] = [];
    if (list === 'top_profit') rows = dashboard.jobs.topGrossProfit;
    else if (list === 'lowest_margin') rows = dashboard.jobs.lowestMargin;
    else if (list === 'loss') rows = dashboard.jobs.lossJobs;
    else if (list === 'margin_misses') rows = dashboard.jobs.largestMarginMisses;
    else if (list === 'incomplete') rows = dashboard.jobs.incompleteJobs;
    else {
      const period = options.period ?? 'month';
      const range = resolveProfitAnalyticsPeriodRange(period, new Date(), {
        fromDate: options.fromDate ?? '',
        toDate: options.toDate ?? '',
      });
      rows = await this.loadJobRows(actor.companyId, range.fromDate, range.toDate);
    }
    return {
      ...paginateRows(rows, options.page ?? 1, options.pageSize ?? 25),
      coverage: dashboard.overview.coverage,
      sourceTrace: dashboard.overview.sourceTrace,
    };
  }
}
