/**
 * CASH-001 — Every-Rand Control service.
 *
 * Calculated read-model over BANK + JPE + invoices/payments/receipts.
 * No new persisted finance truth. No Xero provider calls. No live FNB.
 */

import { and, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  bankAccounts,
  bankTransactionAllocations,
  bankTransactions,
  customers,
  invoices,
  jobDirectCostEntries,
  payments,
  suppliers,
} from '@titan/db';
import type {
  BankTransactionAllocationType,
  CashControlIssue,
  CashControlIssuesResult,
  CashControlJobView,
  CashControlLedgerPage,
  CashControlOutstandingInvoice,
  CashControlPeriodKey,
  CashControlPeriodMetrics,
  CashControlSummary,
  CashControlBankTransactionInput,
  CashControlPaymentInput,
} from '@titan/shared';
import {
  absoluteBankTransactionAmountCents,
  buildLedgerRowFromBankTransaction,
  buildPeriodMetrics,
  canViewCashControl,
  cashControlMonthStartDate,
  cashControlTodayDate,
  deriveCashTruthCompleteness,
  deriveEveryRandControlState,
  emptyIssueTotals,
  invoiceBalanceDueCents,
  isOutstandingCustomerInvoice,
  mapJpeToCashControlJobView,
  paginateCashControlLedger,
  resolveDirectCostCashPaidCents,
  resolveDirectCostSettlementView,
} from '@titan/shared';
import type { JobProfitabilityService } from './job-profitability.service.js';

export class CashControlError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CashControlError';
  }
}

export type CashControlActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export class CashControlService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly profitabilityService: JobProfitabilityService,
  ) {}

  private assertView(actor: CashControlActor): void {
    if (!canViewCashControl(actor)) {
      throw new CashControlError(
        'FORBIDDEN',
        'Cash control requires Owner/Finance access. Technician and Client are blocked.',
      );
    }
  }

  private async loadBankTransactions(
    companyId: string,
    options: { fromDate?: string; toDate?: string } = {},
  ): Promise<CashControlBankTransactionInput[]> {
    const conditions = [eq(bankTransactions.companyId, companyId)];
    if (options.fromDate) {
      conditions.push(gte(bankTransactions.transactionDate, options.fromDate));
    }
    if (options.toDate) {
      conditions.push(lte(bankTransactions.transactionDate, options.toDate));
    }

    const rows = await this.db
      .select({
        id: bankTransactions.id,
        transactionDate: bankTransactions.transactionDate,
        direction: bankTransactions.direction,
        amountCents: bankTransactions.amountCents,
        currency: bankTransactions.currency,
        description: bankTransactions.description,
        reference: bankTransactions.reference,
        allocationStatus: bankTransactions.allocationStatus,
        receiptStatus: bankTransactions.receiptStatus,
        allocatedAmountCents: bankTransactions.allocatedAmountCents,
        merchantName: bankTransactions.merchantName,
        confirmedSupplierId: bankTransactions.confirmedSupplierId,
        confirmedSupplierName: suppliers.name,
        suggestedSupplierId: bankTransactions.suggestedSupplierId,
        provider: bankTransactions.provider,
      })
      .from(bankTransactions)
      .leftJoin(
        suppliers,
        and(
          eq(suppliers.id, bankTransactions.confirmedSupplierId),
          eq(suppliers.companyId, companyId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(bankTransactions.transactionDate), desc(bankTransactions.createdAt));

    if (rows.length === 0) return [];

    const txIds = rows.map((r) => r.id);
    const allocationRows = await this.db
      .select({
        id: bankTransactionAllocations.id,
        transactionId: bankTransactionAllocations.transactionId,
        amountCents: bankTransactionAllocations.amountCents,
        allocationType: bankTransactionAllocations.allocationType,
        category: bankTransactionAllocations.category,
        jobId: bankTransactionAllocations.jobId,
        supplierId: bankTransactionAllocations.supplierId,
        directCostId: bankTransactionAllocations.directCostId,
        isActive: bankTransactionAllocations.isActive,
      })
      .from(bankTransactionAllocations)
      .where(
        and(
          eq(bankTransactionAllocations.companyId, companyId),
          inArray(bankTransactionAllocations.transactionId, txIds),
          eq(bankTransactionAllocations.isActive, true),
        ),
      );

    const byTx = new Map<string, typeof allocationRows>();
    for (const alloc of allocationRows) {
      const list = byTx.get(alloc.transactionId) ?? [];
      list.push(alloc);
      byTx.set(alloc.transactionId, list);
    }

    return rows.map((row) => ({
      id: row.id,
      transactionDate: String(row.transactionDate).slice(0, 10),
      direction: row.direction,
      amountCents: row.amountCents,
      currency: row.currency,
      description: row.description,
      reference: row.reference,
      allocationStatus: row.allocationStatus,
      receiptStatus: row.receiptStatus,
      allocatedAmountCents: row.allocatedAmountCents,
      merchantName: row.merchantName,
      confirmedSupplierId: row.confirmedSupplierId,
      confirmedSupplierName: row.confirmedSupplierName ?? null,
      suggestedSupplierId: row.suggestedSupplierId,
      provider: row.provider,
      allocations: (byTx.get(row.id) ?? []).map((a) => ({
        id: a.id,
        transactionId: a.transactionId,
        amountCents: a.amountCents,
        allocationType: a.allocationType as BankTransactionAllocationType,
        category: a.category,
        jobId: a.jobId,
        supplierId: a.supplierId,
        directCostId: a.directCostId,
        isActive: a.isActive,
      })),
    }));
  }

  private async loadPayments(
    companyId: string,
    options: { fromDate?: string; toDate?: string } = {},
  ): Promise<CashControlPaymentInput[]> {
    const conditions = [eq(payments.companyId, companyId)];
    if (options.fromDate) {
      conditions.push(gte(payments.paidAt, new Date(`${options.fromDate}T00:00:00.000Z`)));
    }
    if (options.toDate) {
      conditions.push(lte(payments.paidAt, new Date(`${options.toDate}T23:59:59.999Z`)));
    }

    const rows = await this.db
      .select({
        id: payments.id,
        amountCents: payments.amountCents,
        paidAt: payments.paidAt,
        xeroPaymentStatus: payments.xeroPaymentStatus,
        xeroPaymentId: payments.xeroPaymentId,
        invoiceId: payments.invoiceId,
      })
      .from(payments)
      .where(and(...conditions));

    return rows.map((row) => ({
      id: row.id,
      amountCents: row.amountCents,
      paidAt: row.paidAt ? row.paidAt.toISOString() : null,
      xeroPaymentStatus: row.xeroPaymentStatus,
      xeroPaymentId: row.xeroPaymentId,
      invoiceId: row.invoiceId,
    }));
  }

  async getSummary(actor: CashControlActor): Promise<CashControlSummary> {
    this.assertView(actor);
    const today = cashControlTodayDate();
    const monthStart = cashControlMonthStartDate();

    const [accounts, transactions, paymentRows, unpaidCosts, outstandingInvoices] =
      await Promise.all([
        this.db
          .select({
            id: bankAccounts.id,
            isActive: bankAccounts.isActive,
          })
          .from(bankAccounts)
          .where(eq(bankAccounts.companyId, actor.companyId)),
        this.loadBankTransactions(actor.companyId, { fromDate: monthStart, toDate: today }),
        this.loadPayments(actor.companyId, { fromDate: monthStart, toDate: today }),
        this.db
          .select({
            id: jobDirectCostEntries.id,
            amountCents: jobDirectCostEntries.amountCents,
            amountPaidCents: jobDirectCostEntries.amountPaidCents,
            isPaid: jobDirectCostEntries.isPaid,
          })
          .from(jobDirectCostEntries)
          .where(eq(jobDirectCostEntries.companyId, actor.companyId)),
        this.db
          .select({
            id: invoices.id,
            totalCents: invoices.totalCents,
            amountCents: invoices.amountCents,
            amountPaidCents: invoices.amountPaidCents,
            status: invoices.status,
          })
          .from(invoices)
          .where(
            and(
              eq(invoices.companyId, actor.companyId),
              ne(invoices.status, 'draft'),
              ne(invoices.status, 'cancelled'),
              ne(invoices.status, 'paid'),
            ),
          ),
      ]);

    // Also load all-time bank coverage bounds (not only MTD).
    const coverageRows = await this.db
      .select({
        earliest: sql<string | null>`min(${bankTransactions.transactionDate})`,
        latest: sql<string | null>`max(${bankTransactions.transactionDate})`,
        count: sql<number>`count(*)::int`,
      })
      .from(bankTransactions)
      .where(eq(bankTransactions.companyId, actor.companyId));

    const coverage = coverageRows[0] ?? { earliest: null, latest: null, count: 0 };
    const activeAccountCount = accounts.filter((a) => a.isActive).length;
    const bankCoverageIncomplete =
      activeAccountCount === 0 || Number(coverage.count ?? 0) === 0;

    const todayMetrics = buildPeriodMetrics({
      periodKey: 'today',
      fromDate: today,
      toDate: today,
      payments: paymentRows,
      transactions,
    });
    const monthMetrics = buildPeriodMetrics({
      periodKey: 'month_to_date',
      fromDate: monthStart,
      toDate: today,
      payments: paymentRows,
      transactions,
    });

    const issueTotals = emptyIssueTotals();
    for (const t of transactions) {
      const abs = absoluteBankTransactionAmountCents(t.amountCents);
      const active = t.allocations.filter((a) => a.isActive !== false);
      const allocated = active.reduce((s, a) => s + a.amountCents, 0);
      const unallocated = Math.max(0, abs - allocated);
      if (t.allocationStatus === 'ignored') continue;

      if (t.direction === 'debit' && unallocated > 0 && allocated === 0) {
        issueTotals.unexplainedDebits.count += 1;
        issueTotals.unexplainedDebits.amountCents += unallocated;
      } else if (t.direction === 'credit' && unallocated > 0) {
        issueTotals.unexplainedCredits.count += 1;
        issueTotals.unexplainedCredits.amountCents += unallocated;
      }

      if (t.allocationStatus === 'partially_allocated' || (allocated > 0 && unallocated > 0)) {
        issueTotals.partialAllocations.count += 1;
        issueTotals.partialAllocations.amountCents += unallocated;
      }

      if (t.direction === 'debit' && t.receiptStatus === 'receipt_missing') {
        issueTotals.missingReceipts.count += 1;
        issueTotals.missingReceipts.amountCents += abs;
      }

      if (
        t.direction === 'debit' &&
        t.confirmedSupplierId == null &&
        (t.allocationStatus === 'unallocated' ||
          t.allocationStatus === 'needs_review' ||
          active.some(
            (a) =>
              (a.allocationType === 'supplier_settlement' ||
                a.allocationType === 'direct_job_cost') &&
              !a.supplierId,
          ))
      ) {
        // Only flag when supplier appears required (merchant/text present or settlement type).
        if (
          t.merchantName ||
          active.some(
            (a) =>
              a.allocationType === 'supplier_settlement' || a.allocationType === 'direct_job_cost',
          )
        ) {
          issueTotals.unknownSuppliers.count += 1;
          issueTotals.unknownSuppliers.amountCents += abs;
        }
      }
    }

    for (const cost of unpaidCosts) {
      const paid = resolveDirectCostCashPaidCents(cost);
      const unpaid = Math.max(0, cost.amountCents - paid);
      if (unpaid > 0) {
        issueTotals.unpaidJobCosts.count += 1;
        issueTotals.unpaidJobCosts.amountCents += unpaid;
      }
    }

    for (const inv of outstandingInvoices) {
      const due = invoiceBalanceDueCents({
        status: inv.status,
        totalCents: inv.totalCents,
        amountCents: inv.amountCents,
        amountPaidCents: inv.amountPaidCents,
      });
      if (due > 0) {
        issueTotals.outstandingCustomerInvoices.count += 1;
        issueTotals.outstandingCustomerInvoices.amountCents += due;
      }
    }

    const { completeness, reasons } = deriveCashTruthCompleteness({
      bankCoverageIncomplete,
      unexplainedDebitCents: issueTotals.unexplainedDebits.amountCents,
      unexplainedCreditCents: issueTotals.unexplainedCredits.amountCents,
      partialAllocationCount: issueTotals.partialAllocations.count,
      missingReceiptCount: issueTotals.missingReceipts.count,
      unknownSupplierCount: issueTotals.unknownSuppliers.count,
      unpaidJobCostCents: issueTotals.unpaidJobCosts.amountCents,
    });

    // Company cash profit snapshot: payments MTD − direct job bank out MTD
    // (JPE remains authority per job; this is the company control aggregate.)
    const knownRealisedCashProfitCents =
      monthMetrics.moneyIn.customerCashCollectedCents -
      monthMetrics.moneyOut.directJobCashOutCents;

    return {
      currency: 'ZAR',
      asOfDate: today,
      completeness,
      completenessReasons: reasons,
      bankCoverage: {
        activeAccountCount,
        transactionCount: Number(coverage.count ?? 0),
        earliestTransactionDate: coverage.earliest
          ? String(coverage.earliest).slice(0, 10)
          : null,
        latestTransactionDate: coverage.latest ? String(coverage.latest).slice(0, 10) : null,
        incomplete: bankCoverageIncomplete,
      },
      today: todayMetrics,
      monthToDate: monthMetrics,
      issues: issueTotals,
      knownRealisedCashProfitCents,
      economicGrossProfitCents: 0, // per-job via /jobs/:jobId — company economic GP is not a fake rollup
      sourceTrace: [
        'bank_transaction',
        'bank_allocation',
        'titan_payment',
        'xero_payment',
        'invoice',
        'direct_cost',
        'jpe',
      ],
    };
  }

  /**
   * Additive period snapshot for FIN-001 composition — reuses CASH-001 pure metrics.
   * Does not redesign cash-control semantics.
   */
  async getPeriodMetrics(
    actor: CashControlActor,
    input: {
      periodKey: CashControlPeriodKey;
      fromDate: string;
      toDate: string;
    },
  ): Promise<CashControlPeriodMetrics> {
    this.assertView(actor);
    const [transactions, paymentRows] = await Promise.all([
      this.loadBankTransactions(actor.companyId, {
        fromDate: input.fromDate,
        toDate: input.toDate,
      }),
      this.loadPayments(actor.companyId, {
        fromDate: input.fromDate,
        toDate: input.toDate,
      }),
    ]);
    return buildPeriodMetrics({
      periodKey: input.periodKey,
      fromDate: input.fromDate,
      toDate: input.toDate,
      payments: paymentRows,
      transactions,
    });
  }

  /** Additive read helper for FIN-003 overhead drill-down — no second ledger. */
  async getBankTransactionsForPeriod(
    actor: CashControlActor,
    input: { fromDate: string; toDate: string },
  ): Promise<CashControlBankTransactionInput[]> {
    this.assertView(actor);
    return this.loadBankTransactions(actor.companyId, {
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
  }

  async hasActiveBankAccounts(actor: CashControlActor): Promise<boolean> {
    this.assertView(actor);
    const rows = await this.db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.companyId, actor.companyId), eq(bankAccounts.isActive, true)))
      .limit(1);
    return rows.length > 0;
  }

  async getLedger(
    actor: CashControlActor,
    options: {
      page?: number;
      pageSize?: number;
      fromDate?: string;
      toDate?: string;
      q?: string;
      controlState?: string;
      direction?: 'debit' | 'credit';
    } = {},
  ): Promise<CashControlLedgerPage> {
    this.assertView(actor);
    const transactions = await this.loadBankTransactions(actor.companyId, {
      fromDate: options.fromDate,
      toDate: options.toDate,
    });

    let rows = transactions.map(buildLedgerRowFromBankTransaction);

    if (options.direction) {
      rows = rows.filter((r) => r.direction === options.direction);
    }
    if (options.controlState) {
      rows = rows.filter((r) => r.controlState === options.controlState);
    }
    if (options.q?.trim()) {
      const q = options.q.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.description ?? '').toLowerCase().includes(q) ||
          (r.reference ?? '').toLowerCase().includes(q) ||
          (r.customerOrSupplierName ?? '').toLowerCase().includes(q) ||
          (r.jobId ?? '').toLowerCase().includes(q) ||
          r.classification.toLowerCase().includes(q) ||
          r.controlState.toLowerCase().includes(q),
      );
    }

    return paginateCashControlLedger(rows, options.page ?? 1, options.pageSize ?? 50);
  }

  async getIssues(actor: CashControlActor): Promise<CashControlIssuesResult> {
    this.assertView(actor);
    const summary = await this.getSummary(actor);
    const transactions = await this.loadBankTransactions(actor.companyId);
    const issues: CashControlIssue[] = [];

    for (const t of transactions) {
      if (t.allocationStatus === 'ignored') continue;
      const abs = absoluteBankTransactionAmountCents(t.amountCents);
      const active = t.allocations.filter((a) => a.isActive !== false);
      const allocated = active.reduce((s, a) => s + a.amountCents, 0);
      const unallocated = Math.max(0, abs - allocated);
      const controlState = deriveEveryRandControlState({
        direction: t.direction,
        allocationStatus: t.allocationStatus,
        receiptStatus: t.receiptStatus,
        unallocatedAmountCents: unallocated,
        allocations: active,
        confirmedSupplierId: t.confirmedSupplierId,
      });

      if (t.direction === 'debit' && unallocated > 0 && allocated === 0) {
        issues.push({
          kind: 'unexplained_debit',
          source: 'bank_transaction',
          sourceId: t.id,
          amountCents: unallocated,
          currency: t.currency,
          label: t.description ?? t.reference ?? 'Unexplained debit',
          transactionDate: t.transactionDate,
          jobId: null,
          controlState,
          metadata: { allocationStatus: t.allocationStatus },
        });
      }

      if (t.direction === 'credit' && unallocated > 0) {
        issues.push({
          kind: 'unexplained_credit',
          source: 'bank_transaction',
          sourceId: t.id,
          amountCents: unallocated,
          currency: t.currency,
          label: t.description ?? t.reference ?? 'Unexplained credit',
          transactionDate: t.transactionDate,
          jobId: null,
          controlState,
          metadata: { allocationStatus: t.allocationStatus },
        });
      }

      if (allocated > 0 && unallocated > 0) {
        issues.push({
          kind: 'partial_allocation',
          source: 'bank_transaction',
          sourceId: t.id,
          amountCents: unallocated,
          currency: t.currency,
          label: t.description ?? 'Partial allocation',
          transactionDate: t.transactionDate,
          jobId: active.find((a) => a.jobId)?.jobId ?? null,
          controlState,
          metadata: { allocatedAmountCents: allocated },
        });
      }

      if (t.direction === 'debit' && t.receiptStatus === 'receipt_missing') {
        issues.push({
          kind: 'missing_receipt',
          source: 'bank_transaction',
          sourceId: t.id,
          amountCents: abs,
          currency: t.currency,
          label: t.description ?? 'Missing receipt',
          transactionDate: t.transactionDate,
          jobId: active.find((a) => a.jobId)?.jobId ?? null,
          controlState,
          metadata: { receiptStatus: t.receiptStatus },
        });
      }

      if (
        t.direction === 'debit' &&
        t.confirmedSupplierId == null &&
        (t.merchantName ||
          active.some(
            (a) =>
              a.allocationType === 'supplier_settlement' || a.allocationType === 'direct_job_cost',
          ))
      ) {
        issues.push({
          kind: 'unknown_supplier',
          source: 'bank_transaction',
          sourceId: t.id,
          amountCents: abs,
          currency: t.currency,
          label: t.merchantName ?? t.description ?? 'Unknown supplier',
          transactionDate: t.transactionDate,
          jobId: active.find((a) => a.jobId)?.jobId ?? null,
          controlState,
          metadata: { suggestedSupplierId: t.suggestedSupplierId },
        });
      }
    }

    const unpaidCosts = await this.db
      .select({
        id: jobDirectCostEntries.id,
        jobId: jobDirectCostEntries.jobId,
        description: jobDirectCostEntries.description,
        amountCents: jobDirectCostEntries.amountCents,
        amountPaidCents: jobDirectCostEntries.amountPaidCents,
        isPaid: jobDirectCostEntries.isPaid,
        costDate: jobDirectCostEntries.costDate,
      })
      .from(jobDirectCostEntries)
      .where(eq(jobDirectCostEntries.companyId, actor.companyId));

    for (const cost of unpaidCosts) {
      const paid = resolveDirectCostCashPaidCents(cost);
      const unpaid = Math.max(0, cost.amountCents - paid);
      if (unpaid <= 0) continue;
      issues.push({
        kind: 'unpaid_job_cost',
        source: 'direct_cost',
        sourceId: cost.id,
        amountCents: unpaid,
        currency: 'ZAR',
        label: cost.description,
        transactionDate: cost.costDate ? cost.costDate.toISOString().slice(0, 10) : null,
        jobId: cost.jobId,
        controlState: null,
        metadata: { economicCostCents: cost.amountCents, amountPaidCents: paid },
      });
    }

    const outstanding = await this.listOutstandingInvoices(actor);
    for (const inv of outstanding) {
      issues.push({
        kind: 'outstanding_customer_invoice',
        source: 'invoice',
        sourceId: inv.invoiceId,
        amountCents: inv.balanceDueCents,
        currency: 'ZAR',
        label: inv.invoiceNumber ?? inv.invoiceId,
        transactionDate: inv.dueDate,
        jobId: inv.jobId,
        controlState: null,
        metadata: {
          customerName: inv.customerName,
          status: inv.status,
          paymentSource: inv.paymentSource,
        },
      });
    }

    return { issues, totals: summary.issues };
  }

  async listOutstandingInvoices(
    actor: CashControlActor,
  ): Promise<CashControlOutstandingInvoice[]> {
    this.assertView(actor);

    const rows = await this.db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerId: invoices.customerId,
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
        and(eq(customers.id, invoices.customerId), eq(customers.companyId, actor.companyId)),
      )
      .where(
        and(
          eq(invoices.companyId, actor.companyId),
          ne(invoices.status, 'draft'),
          ne(invoices.status, 'cancelled'),
        ),
      );

    const invoiceIds = rows.map((r) => r.id);
    const paymentRows =
      invoiceIds.length === 0
        ? []
        : await this.db
            .select({
              invoiceId: payments.invoiceId,
              xeroPaymentId: payments.xeroPaymentId,
            })
            .from(payments)
            .where(
              and(
                eq(payments.companyId, actor.companyId),
                inArray(payments.invoiceId, invoiceIds),
              ),
            );

    const paymentSourceByInvoice = new Map<string, 'titan_payment' | 'xero_payment' | 'mixed' | 'none'>();
    for (const id of invoiceIds) paymentSourceByInvoice.set(id, 'none');
    for (const p of paymentRows) {
      const current = paymentSourceByInvoice.get(p.invoiceId) ?? 'none';
      const next = p.xeroPaymentId ? 'xero_payment' : 'titan_payment';
      if (current === 'none') paymentSourceByInvoice.set(p.invoiceId, next);
      else if (current !== next) paymentSourceByInvoice.set(p.invoiceId, 'mixed');
    }

    return rows
      .filter((row) =>
        isOutstandingCustomerInvoice({
          totalCents: row.totalCents,
          amountPaidCents: row.amountPaidCents,
          status: row.status,
        }),
      )
      .map((row) => ({
        invoiceId: row.id,
        invoiceNumber: row.invoiceNumber,
        customerId: row.customerId,
        customerName: row.customerName ?? null,
        jobId: row.jobId,
        totalCents: row.totalCents,
        amountPaidCents: row.amountPaidCents,
        balanceDueCents: invoiceBalanceDueCents({
          status: row.status,
          totalCents: row.totalCents,
          amountCents: row.amountCents,
          amountPaidCents: row.amountPaidCents,
        }),
        dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
        status: row.status,
        paymentSource: paymentSourceByInvoice.get(row.id) ?? 'none',
        source: 'invoice' as const,
      }));
  }

  async getJobCashControl(actor: CashControlActor, jobId: string): Promise<CashControlJobView> {
    this.assertView(actor);

    const jpe = await this.profitabilityService.getJobProfitability(actor.companyId, jobId, {
      includeSensitiveCosts: true,
    });

    const costs = await this.db
      .select({
        id: jobDirectCostEntries.id,
        jobId: jobDirectCostEntries.jobId,
        supplierId: jobDirectCostEntries.supplierId,
        supplierName: suppliers.name,
        amountCents: jobDirectCostEntries.amountCents,
        amountPaidCents: jobDirectCostEntries.amountPaidCents,
        isPaid: jobDirectCostEntries.isPaid,
        receiptDocumentId: jobDirectCostEntries.receiptDocumentId,
      })
      .from(jobDirectCostEntries)
      .leftJoin(
        suppliers,
        and(
          eq(suppliers.id, jobDirectCostEntries.supplierId),
          eq(suppliers.companyId, actor.companyId),
        ),
      )
      .where(
        and(
          eq(jobDirectCostEntries.companyId, actor.companyId),
          eq(jobDirectCostEntries.jobId, jobId),
        ),
      );

    const costIds = costs.map((c) => c.id);
    const linkedAllocations =
      costIds.length === 0
        ? []
        : await this.db
            .select({
              id: bankTransactionAllocations.id,
              directCostId: bankTransactionAllocations.directCostId,
              amountCents: bankTransactionAllocations.amountCents,
              transactionId: bankTransactionAllocations.transactionId,
              allocationType: bankTransactionAllocations.allocationType,
            })
            .from(bankTransactionAllocations)
            .where(
              and(
                eq(bankTransactionAllocations.companyId, actor.companyId),
                eq(bankTransactionAllocations.isActive, true),
                inArray(bankTransactionAllocations.directCostId, costIds),
              ),
            );

    const allocByCost = new Map<string, Array<{ id: string; amountCents: number }>>();
    for (const a of linkedAllocations) {
      if (!a.directCostId) continue;
      const list = allocByCost.get(a.directCostId) ?? [];
      list.push({ id: a.id, amountCents: a.amountCents });
      allocByCost.set(a.directCostId, list);
    }

    const settlements = costs.map((c) =>
      resolveDirectCostSettlementView({
        id: c.id,
        jobId: c.jobId,
        supplierId: c.supplierId,
        supplierName: c.supplierName ?? null,
        amountCents: c.amountCents,
        amountPaidCents: c.amountPaidCents,
        isPaid: c.isPaid,
        receiptDocumentId: c.receiptDocumentId,
        linkedAllocations: allocByCost.get(c.id) ?? [],
      }),
    );

    const jobAllocations = await this.db
      .select({
        allocationId: bankTransactionAllocations.id,
        transactionId: bankTransactionAllocations.transactionId,
        amountCents: bankTransactionAllocations.amountCents,
        allocationType: bankTransactionAllocations.allocationType,
        transactionDate: bankTransactions.transactionDate,
        description: bankTransactions.description,
      })
      .from(bankTransactionAllocations)
      .innerJoin(
        bankTransactions,
        and(
          eq(bankTransactions.id, bankTransactionAllocations.transactionId),
          eq(bankTransactions.companyId, actor.companyId),
        ),
      )
      .where(
        and(
          eq(bankTransactionAllocations.companyId, actor.companyId),
          eq(bankTransactionAllocations.jobId, jobId),
          eq(bankTransactionAllocations.isActive, true),
        ),
      );

    const jobInvoices = await this.db
      .select({
        totalCents: invoices.totalCents,
        amountCents: invoices.amountCents,
        amountPaidCents: invoices.amountPaidCents,
        status: invoices.status,
      })
      .from(invoices)
      .where(and(eq(invoices.companyId, actor.companyId), eq(invoices.jobId, jobId)));

    const customerBalanceOutstandingCents = jobInvoices.reduce(
      (sum, inv) =>
        sum +
        invoiceBalanceDueCents({
          status: inv.status,
          totalCents: inv.totalCents,
          amountCents: inv.amountCents,
          amountPaidCents: inv.amountPaidCents,
        }),
      0,
    );

    return mapJpeToCashControlJobView(jpe, {
      jobId,
      directCostSettlements: settlements,
      bankAllocations: jobAllocations.map((a) => ({
        allocationId: a.allocationId,
        transactionId: a.transactionId,
        amountCents: a.amountCents,
        allocationType: a.allocationType as BankTransactionAllocationType,
        transactionDate: String(a.transactionDate).slice(0, 10),
        description: a.description,
      })),
      customerBalanceOutstandingCents,
    });
  }
}
