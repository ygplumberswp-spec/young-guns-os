/**
 * FIN-001 — Owner Financial Command Centre service.
 *
 * Thin composition over CASH-001, JPE cost-control, invoices/payments.
 * No second accounting engine. No Xero/FNB calls.
 */

import { and, count, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  bankTransactions,
  customers,
  invoices,
  jobProfitabilitySnapshots,
  xeroBills,
} from '@titan/db';
import type {
  CashControlPeriodKey,
  OwnerFinancialCommandDashboard,
  OwnerFinancialCommandPeriod,
  OwnerFinancialPageTruth,
  OwnerFinancialProfitabilityJob,
  OwnerFinancialReceivableRow,
} from '@titan/shared';
import {
  buildOwnerFinancialAttentionQueue,
  canViewOwnerFinancialCommand,
  deriveOwnerFinancialTruthState,
  emptyOwnerFinancialCommandDashboard,
  invoiceBalanceDueCents,
  isOutstandingCustomerInvoice,
  projectCashflowTruth,
  projectPayablesTruth,
  projectReceivablesTruth,
  resolveInvoiceDisplayNumberLabel,
  resolveOwnerFinancialPeriodRange,
  safeCents,
} from '@titan/shared';
import type { CashControlService } from './cash-control.service.js';
import type { JobCostControlService } from './job-cost-control.service.js';

export class OwnerFinancialCommandError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OwnerFinancialCommandError';
  }
}

export type OwnerFinancialCommandActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

function periodToCashKey(period: OwnerFinancialCommandPeriod): CashControlPeriodKey {
  if (period === 'today') return 'today';
  if (period === 'week') return 'custom';
  return 'month_to_date';
}

function isOverdue(dueDate: string | null, status: string, asOf: string): boolean {
  if (status === 'overdue') return true;
  if (!dueDate) return false;
  return dueDate < asOf;
}

function isDueSoon(dueDate: string | null, asOf: string): boolean {
  if (!dueDate) return false;
  if (dueDate < asOf) return false;
  const asOfDate = new Date(`${asOf}T00:00:00.000Z`);
  const due = new Date(`${dueDate}T00:00:00.000Z`);
  const diffDays = (due.getTime() - asOfDate.getTime()) / (24 * 60 * 60 * 1000);
  return diffDays >= 0 && diffDays <= 7;
}

export class OwnerFinancialCommandService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly cashControlService: CashControlService,
    private readonly jobCostControlService: JobCostControlService,
  ) {}

  private assertView(actor: OwnerFinancialCommandActor): void {
    if (!canViewOwnerFinancialCommand(actor)) {
      throw new OwnerFinancialCommandError(
        'FORBIDDEN',
        'Owner Financial Command Centre requires finance access. Technician and Client are blocked.',
      );
    }
  }

  private async sumInvoicedRevenueCents(
    companyId: string,
    fromDate: string,
    toDate: string,
  ): Promise<number> {
    const rows = await this.db
      .select({
        total: sql<number>`coalesce(sum(${invoices.totalCents}), 0)::int`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, companyId),
          ne(invoices.status, 'draft'),
          ne(invoices.status, 'cancelled'),
          gte(invoices.issuedAt, new Date(`${fromDate}T00:00:00.000Z`)),
          lte(invoices.issuedAt, new Date(`${toDate}T23:59:59.999Z`)),
        ),
      );
    return safeCents(rows[0]?.total);
  }

  private async sumKnownGrossProfitFromSnapshots(companyId: string): Promise<{
    knownGrossProfitCents: number | null;
    knownGrossMarginPct: number | null;
    profitableJobsCount: number;
  }> {
    // Bounded: latest snapshots only (unique per job).
    const rows = await this.db
      .select({
        payload: jobProfitabilitySnapshots.payload,
        completenessStatus: jobProfitabilitySnapshots.completenessStatus,
      })
      .from(jobProfitabilitySnapshots)
      .where(eq(jobProfitabilitySnapshots.companyId, companyId))
      .orderBy(desc(jobProfitabilitySnapshots.calculatedAt))
      .limit(200);

    if (rows.length === 0) {
      return {
        knownGrossProfitCents: null,
        knownGrossMarginPct: null,
        profitableJobsCount: 0,
      };
    }

    let gp = 0;
    let revenue = 0;
    let profitable = 0;
    for (const row of rows) {
      const summary = (row.payload as { summary?: Record<string, unknown> } | null)?.summary;
      const gross = Number(summary?.grossProfitCents ?? NaN);
      const rev = Number(summary?.economicRevenueCents ?? summary?.jobRevenueCents ?? NaN);
      if (Number.isFinite(gross)) {
        gp += Math.trunc(gross);
        if (gross > 0) profitable += 1;
      }
      if (Number.isFinite(rev)) revenue += Math.trunc(rev);
    }

    const margin =
      revenue > 0 ? Math.round(((gp / revenue) * 10000) / 100) : null;

    return {
      knownGrossProfitCents: gp,
      knownGrossMarginPct: margin,
      profitableJobsCount: profitable,
    };
  }

  private async loadReceivables(
    companyId: string,
    asOfDate: string,
  ): Promise<{
    rows: OwnerFinancialReceivableRow[];
    unlinkedInvoiceCount: number;
  }> {
    const invoiceRows = await this.db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        xeroInvoiceNumber: invoices.xeroInvoiceNumber,
        numberAuthority: invoices.numberAuthority,
        sourceProvider: invoices.sourceProvider,
        sourceExternalId: invoices.sourceExternalId,
        customerName: customers.name,
        jobId: invoices.jobId,
        totalCents: invoices.totalCents,
        amountCents: invoices.amountCents,
        amountPaidCents: invoices.amountPaidCents,
        dueDate: invoices.dueDate,
        status: invoices.status,
      })
      .from(invoices)
      .leftJoin(
        customers,
        and(eq(customers.id, invoices.customerId), eq(customers.companyId, companyId)),
      )
      .where(
        and(
          eq(invoices.companyId, companyId),
          ne(invoices.status, 'draft'),
          ne(invoices.status, 'cancelled'),
        ),
      )
      .orderBy(desc(invoices.updatedAt))
      .limit(300);

    const rows: OwnerFinancialReceivableRow[] = [];
    let unlinkedInvoiceCount = 0;

    for (const inv of invoiceRows) {
      if (
        !isOutstandingCustomerInvoice({
          totalCents: inv.totalCents,
          amountPaidCents: inv.amountPaidCents,
          amountCents: inv.amountCents,
          status: inv.status,
        })
      ) {
        continue;
      }
      if (!inv.jobId) unlinkedInvoiceCount += 1;
      const dueDate = inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : null;
      const balanceDueCents = invoiceBalanceDueCents({
        status: inv.status,
        totalCents: inv.totalCents,
        amountCents: inv.amountCents,
        amountPaidCents: inv.amountPaidCents,
      });
      rows.push({
        invoiceId: inv.id,
        invoiceNumber: resolveInvoiceDisplayNumberLabel({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          xeroInvoiceNumber: inv.xeroInvoiceNumber,
          numberAuthority: inv.numberAuthority,
          sourceProvider: inv.sourceProvider,
          sourceExternalId: inv.sourceExternalId,
        }),
        customerName: inv.customerName ?? null,
        jobId: inv.jobId,
        balanceDueCents,
        dueDate,
        status: inv.status,
        isOverdue: isOverdue(dueDate, inv.status, asOfDate),
        href: `/finance/invoices/${inv.id}`,
      });
    }

    rows.sort((a, b) => b.balanceDueCents - a.balanceDueCents);
    return { rows, unlinkedInvoiceCount };
  }

  private async loadPageTruthSources(companyId: string): Promise<{
    billRows: Array<{ id: string; amountDueCents: number | null; status: string }>;
    bankTransactionCount: number;
  }> {
    const [billRows, bankCountRows] = await Promise.all([
      this.db
        .select({
          id: xeroBills.id,
          amountDueCents: xeroBills.amountDueCents,
          status: xeroBills.status,
        })
        .from(xeroBills)
        .where(eq(xeroBills.companyId, companyId))
        .limit(500),
      this.db
        .select({ c: count() })
        .from(bankTransactions)
        .where(eq(bankTransactions.companyId, companyId)),
    ]);
    return {
      billRows: billRows.map((b) => ({
        id: b.id,
        amountDueCents: b.amountDueCents,
        status: b.status ?? 'UNKNOWN',
      })),
      bankTransactionCount: Number(bankCountRows[0]?.c ?? 0),
    };
  }

  private buildPageTruth(input: {
    outstanding: OwnerFinancialReceivableRow[];
    billRows: Array<{ id: string; amountDueCents: number | null; status: string }>;
    bankTransactionCount: number;
    moneyInCents: number;
    moneyOutCents: number;
    cashCompleteness: 'VERIFIED' | 'PROVISIONAL' | 'INCOMPLETE';
  }): OwnerFinancialPageTruth {
    const receivables = projectReceivablesTruth({
      xeroConnected: true,
      invoices: input.outstanding.map((r) => ({
        id: r.invoiceId,
        status: r.status,
        balanceDueCents: r.balanceDueCents,
        isOverdue: r.isOverdue,
      })),
    });
    const openBills = input.billRows.filter(
      (b) => !['VOIDED', 'DELETED', 'PAID'].includes((b.status ?? '').toUpperCase()),
    );
    const payables = projectPayablesTruth({
      bills: openBills,
      xeroBillsImportSupported: true,
      xeroConnected: true,
    });
    const cashflow = projectCashflowTruth({
      bankTransactionCount: input.bankTransactionCount,
      knownMoneyInCents: input.moneyInCents,
      knownMoneyOutCents: input.moneyOutCents,
      cashControlCompleteness: input.cashCompleteness,
      bankConnectedOrImportReady: input.bankTransactionCount > 0 || input.cashCompleteness !== 'INCOMPLETE',
    });
    return {
      receivables: {
        availability: receivables.availability,
        totalOutstanding: receivables.totalOutstanding,
        overdue: receivables.overdue,
      },
      payables: {
        availability: payables.availability,
        totalDue: payables.totalDue,
      },
      cashflow: {
        availability: cashflow.availability,
        moneyIn: cashflow.moneyIn,
        moneyOut: cashflow.moneyOut,
      },
    };
  }

  async getDashboard(
    actor: OwnerFinancialCommandActor,
    period: OwnerFinancialCommandPeriod = 'month',
  ): Promise<OwnerFinancialCommandDashboard> {
    this.assertView(actor);

    const range = resolveOwnerFinancialPeriodRange(period);
    const empty = emptyOwnerFinancialCommandDashboard(period);
    const asOfDate = empty.asOfDate;

    const actorCash = {
      companyId: actor.companyId,
      userId: actor.userId,
      roleName: actor.roleName,
      permissions: actor.permissions,
    };

    const [
      cashSummary,
      periodMetrics,
      costQueue,
      receivablesBundle,
      gpBundle,
      invoicedRevenueCents,
      pageTruthSources,
    ] = await Promise.all([
      this.cashControlService.getSummary(actorCash),
      this.cashControlService.getPeriodMetrics(actorCash, {
        periodKey: periodToCashKey(period),
        fromDate: range.fromDate,
        toDate: range.toDate,
      }),
      this.jobCostControlService.getOwnerQueue(actor.companyId, {
        fromDate: range.fromDate,
        toDate: range.toDate,
      }),
      this.loadReceivables(actor.companyId, asOfDate),
      this.sumKnownGrossProfitFromSnapshots(actor.companyId),
      this.sumInvoicedRevenueCents(actor.companyId, range.fromDate, range.toDate),
      this.loadPageTruthSources(actor.companyId),
    ]);

    const outstanding = receivablesBundle.rows;
    const overdue = outstanding.filter((r) => r.isOverdue);
    const dueSoon = outstanding.filter((r) => isDueSoon(r.dueDate, asOfDate));
    const totalOutstandingCents = outstanding.reduce((s, r) => s + r.balanceDueCents, 0);
    const overdueCents = overdue.reduce((s, r) => s + r.balanceDueCents, 0);

    const moneyInCents =
      periodMetrics.moneyIn.customerCashCollectedCents +
      periodMetrics.moneyIn.otherClassifiedMoneyInCents;
    const moneyOutCents =
      periodMetrics.moneyOut.directJobCashOutCents +
      periodMetrics.moneyOut.overheadCashOutCents +
      periodMetrics.moneyOut.otherClassifiedMoneyOutCents;

    const knownRealisedCashProfitCents =
      periodMetrics.moneyIn.customerCashCollectedCents -
      periodMetrics.moneyOut.directJobCashOutCents;

    const truth = deriveOwnerFinancialTruthState({
      cashCompleteness: cashSummary.completeness,
      cashReasons: cashSummary.completenessReasons,
      incompleteJobsCount:
        costQueue.summary.completedJobsNeedingReview +
        costQueue.summary.provisionalProfitabilityJobs,
      unlinkedInvoiceCount: receivablesBundle.unlinkedInvoiceCount,
    });

    const samples: OwnerFinancialProfitabilityJob[] = [];
    for (const row of costQueue.marginProblems.slice(0, 8)) {
      const isLoss = row.flags.some((f) => f.type === 'LOSS_JOB' || f.type === 'NEGATIVE_MARGIN');
      samples.push({
        jobId: row.jobId,
        jobReference: row.jobReference,
        title: row.title,
        kind: isLoss ? 'loss' : 'low_margin',
        href: `/jobs/${row.jobId}`,
        flagSummary: row.flags[0]?.message ?? null,
      });
    }
    for (const row of costQueue.completedJobsNeedingReview.slice(0, 5)) {
      samples.push({
        jobId: row.jobId,
        jobReference: row.jobReference,
        title: row.title,
        kind: 'needs_review',
        href: `/jobs/${row.jobId}`,
        flagSummary: row.completenessStatus,
      });
    }
    for (const row of costQueue.provisionalProfitability.slice(0, 5)) {
      samples.push({
        jobId: row.jobId,
        jobReference: row.jobReference,
        title: row.title,
        kind: 'incomplete',
        href: `/jobs/${row.jobId}`,
        flagSummary: row.flags[0]?.message ?? 'provisional',
      });
    }

    const attention = buildOwnerFinancialAttentionQueue({
      cashIssues: cashSummary.issues,
      costQueue,
      overdueCents,
      overdueCount: overdue.length,
    });

    const unexplainedIssues = await this.cashControlService.getIssues(actorCash);
    const largestUnexplained = unexplainedIssues.issues
      .filter((i) => i.kind === 'unexplained_debit' || i.kind === 'unexplained_credit')
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 5)
      .map((i) => ({
        id: i.sourceId,
        label: i.label,
        amountCents: i.amountCents,
        direction: (i.kind === 'unexplained_credit' ? 'credit' : 'debit') as 'debit' | 'credit',
        href: '/finance/cash-control',
      }));

    const pageTruth = this.buildPageTruth({
      outstanding,
      billRows: pageTruthSources.billRows,
      bankTransactionCount: pageTruthSources.bankTransactionCount,
      moneyInCents: safeCents(moneyInCents),
      moneyOutCents: safeCents(moneyOutCents),
      cashCompleteness: cashSummary.completeness,
    });

    return {
      currency: cashSummary.currency || 'ZAR',
      asOfDate,
      period,
      financialTruth: truth,
      pageTruth,
      heartbeat: {
        period,
        fromDate: range.fromDate,
        toDate: range.toDate,
        invoicedRevenueCents: safeCents(invoicedRevenueCents),
        customerCashCollectedCents: safeCents(
          periodMetrics.moneyIn.customerCashCollectedCents,
        ),
        knownGrossProfitCents: gpBundle.knownGrossProfitCents,
        knownGrossMarginPct: gpBundle.knownGrossMarginPct,
        knownRealisedCashProfitCents: safeCents(knownRealisedCashProfitCents),
        outstandingCustomerCashCents: safeCents(totalOutstandingCents),
      },
      cash: {
        moneyInCents: safeCents(moneyInCents),
        moneyOutCents: safeCents(moneyOutCents),
        directJobCashOutCents: safeCents(periodMetrics.moneyOut.directJobCashOutCents),
        overheadCashOutCents: safeCents(periodMetrics.moneyOut.overheadCashOutCents),
        knownNetCashMovementCents: safeCents(periodMetrics.knownNetCashMovementCents),
        unexplainedDebitCents: safeCents(cashSummary.issues.unexplainedDebits.amountCents),
        unexplainedCreditCents: safeCents(cashSummary.issues.unexplainedCredits.amountCents),
        completeness: cashSummary.completeness,
        completenessReasons: cashSummary.completenessReasons,
      },
      receivables: {
        totalOutstandingCents: safeCents(totalOutstandingCents),
        overdueCount: overdue.length,
        overdueCents: safeCents(overdueCents),
        dueSoonCount: dueSoon.length,
        unpaidOrPartialCount: outstanding.length,
        largest: outstanding.slice(0, 8),
      },
      profitability: {
        profitableJobsCount: gpBundle.profitableJobsCount,
        lowMarginJobsCount: costQueue.summary.lowMarginJobs,
        lossJobsCount: costQueue.summary.lossJobs,
        financiallyIncompleteCount: costQueue.summary.provisionalProfitabilityJobs,
        needingReviewCount: costQueue.summary.completedJobsNeedingReview,
        samples: samples.slice(0, 12),
      },
      costControl: {
        unpaidDirectCostsCount: cashSummary.issues.unpaidJobCosts.count,
        unpaidDirectCostsCents: safeCents(cashSummary.issues.unpaidJobCosts.amountCents),
        missingLabourCount: costQueue.summary.missingLabourJobs,
        missingMaterialCount: costQueue.missingMaterialCost.length,
        missingReceiptsCount: cashSummary.issues.missingReceipts.count,
        missingReceiptsCents: safeCents(cashSummary.issues.missingReceipts.amountCents),
        partialAllocationsCount: cashSummary.issues.partialAllocations.count,
        partialAllocationsCents: safeCents(cashSummary.issues.partialAllocations.amountCents),
        unallocatedBankDebitsCount: cashSummary.issues.unexplainedDebits.count,
        unallocatedBankDebitsCents: safeCents(cashSummary.issues.unexplainedDebits.amountCents),
        unknownSuppliersCount: cashSummary.issues.unknownSuppliers.count,
        unknownSuppliersCents: safeCents(cashSummary.issues.unknownSuppliers.amountCents),
      },
      attention,
      recentImportant: {
        largestOutstandingInvoices: outstanding.slice(0, 5),
        largestUnexplainedTransactions: largestUnexplained,
        worstMarginJobs: samples.filter((s) => s.kind === 'loss' || s.kind === 'low_margin').slice(0, 5),
      },
      drillDown: empty.drillDown,
      sourceTrace: empty.sourceTrace,
    };
  }
}
