import { and, eq, sql } from 'drizzle-orm';
import type { JobCostingSummary } from '@titan/shared';
import {
  buildMaterialSourceBreakdown,
  computeJobGrossProfitCents,
  computeMaterialsVarianceCents,
  sumMaterialLinesCents,
  sumQuoteCategoryCents,
  sumReturnedMaterialCents,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  companyFinanceSettings,
  inventoryStockMovements,
  invoices,
  jobMaterialLines,
  jobs,
  mobileTimeEntries,
  payments,
  purchaseOrders,
  quotes,
} from '@titan/db';
import { JobsError } from './jobs.service.js';

const ACTIVE_PO_STATUSES = [
  'pending_approval',
  'approved',
  'ordered',
  'received',
  'completed',
] as const;

export class JobCostingService {
  constructor(private readonly db: DatabaseClient) {}

  async getJobCostingSummary(
    companyId: string,
    jobId: string,
    options: { includeProfit?: boolean } = {},
  ): Promise<JobCostingSummary> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.companyId, companyId), eq(jobs.id, jobId)),
      columns: { id: true },
    });

    if (!job) {
      throw new JobsError('NOT_FOUND', 'Job not found');
    }

    const [
      settingsRow,
      quoteRows,
      materialRows,
      poRows,
      invoiceRows,
      paymentRows,
      movementCountRow,
      labourRows,
    ] = await Promise.all([
      this.db.query.companyFinanceSettings.findFirst({
        where: eq(companyFinanceSettings.companyId, companyId),
      }),
      this.db.query.quotes.findMany({
        where: and(eq(quotes.companyId, companyId), eq(quotes.jobId, jobId)),
        with: { lineItems: true },
        orderBy: (table, { desc }) => [desc(table.updatedAt)],
      }),
      this.db.query.jobMaterialLines.findMany({
        where: and(eq(jobMaterialLines.companyId, companyId), eq(jobMaterialLines.jobId, jobId)),
      }),
      this.db.query.purchaseOrders.findMany({
        where: and(eq(purchaseOrders.companyId, companyId), eq(purchaseOrders.jobId, jobId)),
      }),
      this.db.query.invoices.findMany({
        where: and(eq(invoices.companyId, companyId), eq(invoices.jobId, jobId)),
      }),
      this.db.query.payments.findMany({
        where: and(
          eq(payments.companyId, companyId),
          sql`exists (select 1 from invoices where invoices.id = ${payments.invoiceId} and invoices.job_id = ${jobId})`,
        ),
      }),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(inventoryStockMovements)
        .where(
          and(
            eq(inventoryStockMovements.companyId, companyId),
            eq(inventoryStockMovements.jobId, jobId),
          ),
        ),
      this.db.query.mobileTimeEntries.findMany({
        where: and(eq(mobileTimeEntries.companyId, companyId), eq(mobileTimeEntries.jobId, jobId)),
        columns: { durationMinutes: true },
      }),
    ]);

    const currency = settingsRow?.currency ?? quoteRows[0]?.currency ?? 'ZAR';
    const primaryQuote =
      quoteRows.find((row) => row.status === 'accepted') ??
      quoteRows.find((row) => !['cancelled', 'superseded'].includes(row.status)) ??
      null;

    const quoteLines =
      primaryQuote?.lineItems.map((line) => ({
        category: line.category,
        lineCostCents: line.lineCostCents,
        lineSubtotalCents: line.lineSubtotalCents,
        isOptional: line.isOptional,
      })) ?? [];

    const quotedMaterialsCents = sumQuoteCategoryCents(quoteLines, 'materials');
    const quotedLabourCents = sumQuoteCategoryCents(quoteLines, 'labour');
    const quotedTotalCents = primaryQuote?.totalCents ?? 0;

    const materialLines = materialRows.map((row) => ({
      status: row.status ?? 'used',
      quantity: String(row.quantity),
      fulfilledQuantity: row.fulfilledQuantity ? String(row.fulfilledQuantity) : null,
      unitCostCents: row.unitCostCents ?? 0,
      materialSource: row.materialSource,
    }));

    const materialsUsedCents = sumMaterialLinesCents(materialLines);
    const materialsReturnedCents = sumReturnedMaterialCents(materialLines);
    const materialsPurchasedCents = poRows
      .filter((row) =>
        ACTIVE_PO_STATUSES.includes(row.status as (typeof ACTIVE_PO_STATUSES)[number]),
      )
      .reduce((sum, row) => sum + row.totalCostCents, 0);

    const invoicedCents = invoiceRows.reduce((sum, row) => sum + row.totalCents, 0);
    const paidCents = paymentRows.reduce((sum, row) => sum + row.amountCents, 0);
    const actualCostCents = materialsUsedCents + materialsPurchasedCents;
    const labourMinutes = labourRows.reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);

    return {
      jobId,
      currency,
      primaryQuoteId: primaryQuote?.id ?? null,
      quotedMaterialsCents,
      quotedLabourCents,
      quotedTotalCents,
      materialsUsedCents,
      materialsPurchasedCents,
      materialsReturnedCents,
      labourMinutes,
      invoicedCents,
      paidCents,
      actualCostCents,
      grossProfitCents: computeJobGrossProfitCents({
        paidCents,
        invoicedCents,
        actualCostCents,
        includeProfit: options.includeProfit ?? false,
      }),
      varianceMaterialsCents: computeMaterialsVarianceCents(
        quotedMaterialsCents,
        materialsUsedCents,
      ),
      materialLineCount: materialRows.length,
      purchaseOrderCount: poRows.length,
      stockMovementCount: movementCountRow[0]?.count ?? 0,
      byMaterialSource: buildMaterialSourceBreakdown(materialLines),
    };
  }
}
