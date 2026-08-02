import { and, count, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type {
  CashFlowIntelligence,
  CreateFinanceBudgetLineRequest,
  CreateFinanceBudgetRequest,
  ExpenseIntelligence,
  FinanceBudgetSummary,
  FinanceBudgetVariance,
  FinanceForecast,
  FinanceForecastSnapshotSummary,
  FinanceForecastType,
  FinanceIntelligenceAuraContext,
  FinanceIntelligenceStats,
  FinanceRecommendationSummary,
  FinanceRiskSignal,
  GenerateFinanceForecastRequest,
  PayablesIntelligence,
  ProfitabilityIntelligence,
  ReceivablesIntelligence,
  UpdateFinanceBudgetRequest,
  UpdateFinanceRecommendationRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  financeBudgetLines,
  financeBudgets,
  financeForecastSnapshots,
  financeRecommendations,
  payments,
  xeroSyncLogs,
} from '@titan/db';
import type { AnalyticsService } from './analytics.service.js';
import type { FinanceService } from './finance.service.js';
import type { ProcurementService } from './procurement.service.js';

export class FinanceIntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FinanceIntelligenceError';
  }
}

type FinanceIntelligenceServiceDeps = {
  db: DatabaseClient;
  financeService: FinanceService;
  analyticsService: AnalyticsService;
  procurementService: ProcurementService;
};

export class FinanceIntelligenceService {
  constructor(private readonly deps: FinanceIntelligenceServiceDeps) {}

  async getStats(companyId: string): Promise<FinanceIntelligenceStats> {
    const [recommendations, budgets, receivables, cashFlow] = await Promise.all([
      this.listRecommendations(companyId),
      this.listBudgets(companyId),
      this.getReceivablesIntelligence(companyId),
      this.getCashFlowIntelligence(companyId),
    ]);

    return {
      pendingRecommendationCount: recommendations.filter((row) => row.status === 'pending').length,
      activeBudgetCount: budgets.filter((row) => row.status === 'active').length,
      overdueInvoiceCount: receivables.overdueCount,
      cashShortageWarning: cashFlow.cashShortageWarning,
    };
  }

  async getCashFlowIntelligence(companyId: string): Promise<CashFlowIntelligence> {
    const [monthlyFinance, weeklyFinance, invoiceRows, paymentRows, purchaseOrderRows, stats, budgets, bankTxRow] =
      await Promise.all([
        this.deps.analyticsService.getFinanceAnalytics(companyId, { period: 'monthly' }),
        this.deps.analyticsService.getFinanceAnalytics(companyId, { period: 'weekly' }),
        this.deps.financeService.listInvoices(companyId),
        this.deps.financeService.listPayments(companyId),
        this.deps.procurementService.listPurchaseOrders(companyId),
        this.deps.financeService.getStats(companyId),
        this.listBudgets(companyId),
        this.deps.db
          .select({ count: count() })
          .from(xeroSyncLogs)
          .where(
            and(
              eq(xeroSyncLogs.companyId, companyId),
              eq(xeroSyncLogs.entityType, 'bank_transaction'),
              eq(xeroSyncLogs.status, 'success'),
            ),
          ),
      ]);

    const outstandingReceivableCents = monthlyFinance.cashFlow.outstandingCents;
    const outstandingPayableCents = purchaseOrderRows
      .filter((row) => ['approved', 'ordered', 'received'].includes(row.status))
      .reduce((sum, row) => sum + row.totalCostCents, 0);

    const inflowCents = monthlyFinance.cashFlow.inflowCents;
    const invoicedRevenueCents = monthlyFinance.cashFlow.invoicedCents;
    const outflowCents = outstandingPayableCents;
    const currentPositionCents = inflowCents - outstandingReceivableCents;
    const bankTransactionSyncCount = Number(bankTxRow[0]?.count ?? 0);
    const activeBudgets = budgets.filter((row) => row.status === 'active');
    const activeBudgetTargetCents =
      activeBudgets.length > 0
        ? activeBudgets.reduce((sum, row) => sum + row.totalBudgetedCents, 0)
        : null;

    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const receivableDueWeek = invoiceRows
      .filter((row) => row.dueDate && new Date(row.dueDate) <= weekAhead)
      .reduce((sum, row) => sum + row.outstandingCents, 0);

    const receivableDueMonth = invoiceRows
      .filter((row) => row.dueDate && new Date(row.dueDate) <= monthAhead)
      .reduce((sum, row) => sum + row.outstandingCents, 0);

    const avgWeeklyInflow =
      paymentRows.length > 0
        ? Math.round(
            paymentRows
              .filter(
                (row) => new Date(row.paidAt) >= new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000),
              )
              .reduce((sum, row) => sum + row.amountCents, 0) / 4,
          )
        : weeklyFinance.cashFlow.inflowCents;

    const weeklyForecastCents =
      avgWeeklyInflow + receivableDueWeek - Math.round(outstandingPayableCents * 0.25);
    const monthlyForecastCents =
      monthlyFinance.cashFlow.inflowCents + receivableDueMonth - outstandingPayableCents;
    const cashShortageWarning = weeklyForecastCents < 0 || monthlyForecastCents < 0;

    return {
      currency: stats.currency,
      currentPositionCents,
      inflowCents,
      invoicedRevenueCents,
      outflowCents,
      outstandingReceivableCents,
      outstandingPayableCents,
      weeklyForecastCents,
      monthlyForecastCents,
      cashShortageWarning,
      bankBalanceCents: null,
      bankBalanceAvailable: false,
      bankTransactionSyncCount,
      activeBudgetTargetCents,
      payrollCommitmentsAvailable: false,
      vatEstimateAvailable: false,
      summary: `Cash received ${(inflowCents / 100).toFixed(2)} ${stats.currency}, invoiced ${(invoicedRevenueCents / 100).toFixed(2)}, receivables ${(outstandingReceivableCents / 100).toFixed(2)}, payables ${(outstandingPayableCents / 100).toFixed(2)}${cashShortageWarning ? ' — shortage warning' : ''}.`,
    };
  }

  async getPayablesIntelligence(companyId: string): Promise<PayablesIntelligence> {
    const [purchaseOrderRows, stats, bankTxRow] = await Promise.all([
      this.deps.procurementService.listPurchaseOrders(companyId),
      this.deps.financeService.getStats(companyId),
      this.deps.db
        .select({ count: count() })
        .from(xeroSyncLogs)
        .where(
          and(
            eq(xeroSyncLogs.companyId, companyId),
            eq(xeroSyncLogs.entityType, 'bank_transaction'),
            eq(xeroSyncLogs.status, 'success'),
          ),
        ),
    ]);

    const openOrders = purchaseOrderRows.filter((row) =>
      ['approved', 'ordered', 'received'].includes(row.status),
    );
    const poCashRequirementCents = openOrders.reduce((sum, row) => sum + row.totalCostCents, 0);
    const unapprovedPurchaseCount = purchaseOrderRows.filter((row) => row.status === 'draft').length;
    const unmatchedBankTransactionCount = Number(bankTxRow[0]?.count ?? 0);

    const accpayAvailable = false;
    const summary = accpayAvailable
      ? `Supplier bills outstanding from Xero ACCPAY.`
      : `Xero ACCPAY bills not imported — PO cash requirement ${(poCashRequirementCents / 100).toFixed(2)} ${stats.currency}${unmatchedBankTransactionCount > 0 ? `, ${unmatchedBankTransactionCount} bank transaction(s) in sync logs awaiting reconciliation` : ''}.`;

    return {
      currency: stats.currency,
      accpayAvailable,
      supplierBillsOutstandingCents: null,
      overdueBillsCents: null,
      dueIn7DaysCents: null,
      dueIn30DaysCents: null,
      poCashRequirementCents,
      unapprovedPurchaseCount,
      unmatchedBankTransactionCount,
      summary,
    };
  }

  async getProfitabilityIntelligence(companyId: string): Promise<ProfitabilityIntelligence> {
    const [profitability, technicians] = await Promise.all([
      this.deps.analyticsService.getProfitability(companyId, { period: 'monthly' }),
      this.deps.analyticsService.getTechnicianPerformance(companyId, { period: 'monthly' }),
    ]);

    const byCustomerMap = new Map<string, { revenueCents: number; jobCount: number }>();
    const byServiceMap = new Map<string, { revenueCents: number; jobCount: number }>();

    for (const job of profitability.jobs) {
      const customerKey = job.customerName;
      const customerEntry = byCustomerMap.get(customerKey) ?? { revenueCents: 0, jobCount: 0 };
      customerEntry.revenueCents += job.revenueCents;
      customerEntry.jobCount += 1;
      byCustomerMap.set(customerKey, customerEntry);

      const serviceKey = job.jobTitle.trim().slice(0, 60) || 'General';
      const serviceEntry = byServiceMap.get(serviceKey) ?? { revenueCents: 0, jobCount: 0 };
      serviceEntry.revenueCents += job.revenueCents;
      serviceEntry.jobCount += 1;
      byServiceMap.set(serviceKey, serviceEntry);
    }

    const techRevenue = new Map<string, number>();
    for (const job of profitability.jobs) {
      const match = technicians.technicians.find((tech) =>
        job.jobTitle.includes(tech.name.split(' ')[0] ?? ''),
      );
      if (match) {
        techRevenue.set(match.name, (techRevenue.get(match.name) ?? 0) + job.revenueCents);
      }
    }

    const grossMarginPercent = profitability.totals.averageMarginPercent;
    const netMarginPercent =
      profitability.totals.revenueCents > 0 && profitability.totals.estimatedProfitCents !== null
        ? Math.round(
            (profitability.totals.estimatedProfitCents / profitability.totals.revenueCents) * 100,
          )
        : grossMarginPercent;

    return {
      currency: profitability.currency,
      grossMarginPercent,
      netMarginPercent,
      totalRevenueCents: profitability.totals.revenueCents,
      totalProfitCents: profitability.totals.estimatedProfitCents,
      byJob: profitability.jobs.slice(0, 15).map((job) => ({
        jobId: job.jobId,
        jobTitle: job.jobTitle,
        revenueCents: job.revenueCents,
        marginPercent: job.marginPercent,
      })),
      byCustomer: [...byCustomerMap.entries()]
        .map(([customerName, data]) => ({ customerName, ...data }))
        .sort((a, b) => b.revenueCents - a.revenueCents)
        .slice(0, 10),
      byService: [...byServiceMap.entries()]
        .map(([serviceName, data]) => ({ serviceName, ...data }))
        .sort((a, b) => b.revenueCents - a.revenueCents)
        .slice(0, 10),
      byTechnician: technicians.technicians.slice(0, 10).map((tech) => ({
        technicianName: tech.name,
        revenueCents: techRevenue.get(tech.name) ?? 0,
        jobsCompleted: tech.jobsCompleted,
      })),
      summary: `Revenue ${(profitability.totals.revenueCents / 100).toFixed(2)} ${profitability.currency}${netMarginPercent !== null ? `, margin ${netMarginPercent}%` : ''} across ${profitability.jobs.length} job(s).`,
    };
  }

  async getReceivablesIntelligence(companyId: string): Promise<ReceivablesIntelligence> {
    const [financeAnalytics, invoiceRows, paymentRows] = await Promise.all([
      this.deps.analyticsService.getFinanceAnalytics(companyId, { period: 'monthly' }),
      this.deps.financeService.listInvoices(companyId),
      this.deps.financeService.listPayments(companyId),
    ]);

    const now = new Date();
    const buckets = [
      { bucket: 'Current', count: 0, amountCents: 0 },
      { bucket: '1-30 days', count: 0, amountCents: 0 },
      { bucket: '31-60 days', count: 0, amountCents: 0 },
      { bucket: '61+ days', count: 0, amountCents: 0 },
    ];

    let overdueCount = 0;
    let overdueAmountCents = 0;

    for (const invoice of invoiceRows) {
      const outstanding = invoice.outstandingCents;
      if (outstanding <= 0 || ['paid', 'cancelled', 'draft'].includes(invoice.status)) {
        continue;
      }

      const daysOverdue =
        invoice.dueDate && new Date(invoice.dueDate) < now
          ? Math.floor(
              (now.getTime() - new Date(invoice.dueDate).getTime()) / (24 * 60 * 60 * 1000),
            )
          : 0;

      if (daysOverdue > 0) {
        overdueCount += 1;
        overdueAmountCents += outstanding;
      }

      const bucket =
        daysOverdue <= 0
          ? buckets[0]!
          : daysOverdue <= 30
            ? buckets[1]!
            : daysOverdue <= 60
              ? buckets[2]!
              : buckets[3]!;
      bucket.count += 1;
      bucket.amountCents += outstanding;
    }

    const collectionPriorities = financeAnalytics.outstandingInvoices
      .map((row) => ({
        invoiceId: row.id,
        invoiceNumber: row.invoiceNumber,
        customerName: row.customerName,
        outstandingCents: row.outstandingCents,
        daysOverdue: row.daysOverdue,
        priority:
          row.daysOverdue !== null && row.daysOverdue > 30
            ? 'high'
            : row.daysOverdue !== null && row.daysOverdue > 0
              ? 'medium'
              : 'low',
      }))
      .sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0))
      .slice(0, 15);

    const paymentsByCustomer = new Map<
      string,
      { customerId: string; customerName: string; days: number[] }
    >();
    for (const payment of paymentRows) {
      const invoice = invoiceRows.find((row) => row.id === payment.invoiceId);
      if (!invoice) continue;
      const entry = paymentsByCustomer.get(invoice.customerId) ?? {
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        days: [],
      };
      if (invoice.dueDate) {
        const days = Math.max(
          0,
          Math.floor(
            (new Date(payment.paidAt).getTime() - new Date(invoice.dueDate).getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        );
        entry.days.push(days);
      }
      paymentsByCustomer.set(invoice.customerId, entry);
    }

    const customerPaymentBehaviour = [...paymentsByCustomer.values()]
      .map((entry) => {
        const averageDaysToPay =
          entry.days.length > 0
            ? Math.round(entry.days.reduce((a, b) => a + b, 0) / entry.days.length)
            : null;
        return {
          customerId: entry.customerId,
          customerName: entry.customerName,
          averageDaysToPay,
          latePaymentRisk: averageDaysToPay !== null && averageDaysToPay > 14,
        };
      })
      .slice(0, 15);

    return {
      currency: financeAnalytics.currency,
      overdueCount,
      overdueAmountCents,
      ageingBuckets: buckets,
      collectionPriorities,
      customerPaymentBehaviour,
      summary: `${overdueCount} overdue invoice(s) totalling ${(overdueAmountCents / 100).toFixed(2)} ${financeAnalytics.currency}.`,
    };
  }

  async getExpenseIntelligence(companyId: string): Promise<ExpenseIntelligence> {
    const [paymentRows, purchaseOrdersList, stats] = await Promise.all([
      this.deps.financeService.listPayments(companyId),
      this.deps.procurementService.listPurchaseOrders(companyId),
      this.deps.financeService.getStats(companyId),
    ]);

    const byCategory = new Map<string, { amountCents: number; transactionCount: number }>();
    for (const payment of paymentRows) {
      const category = payment.method;
      const entry = byCategory.get(category) ?? { amountCents: 0, transactionCount: 0 };
      entry.amountCents += payment.amountCents;
      entry.transactionCount += 1;
      byCategory.set(category, entry);
    }

    const supplierSpendingCents = purchaseOrdersList
      .filter((row) => ['ordered', 'received', 'completed'].includes(row.status))
      .reduce((sum, row) => sum + row.totalCostCents, 0);

    if (supplierSpendingCents > 0) {
      byCategory.set('supplier_procurement', {
        amountCents: supplierSpendingCents,
        transactionCount: purchaseOrdersList.filter((row) =>
          ['ordered', 'received', 'completed'].includes(row.status),
        ).length,
      });
    }

    const now = new Date();
    const monthlyTrend: Array<{ period: string; amountCents: number }> = [];
    for (let i = 5; i >= 0; i -= 1) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const amountCents = paymentRows
        .filter((row) => {
          const paidAt = new Date(row.paidAt);
          return paidAt >= start && paidAt <= end;
        })
        .reduce((sum, row) => sum + row.amountCents, 0);
      monthlyTrend.push({ period: start.toISOString().slice(0, 7), amountCents });
    }

    const totalOutflowCents =
      paymentRows.reduce((sum, row) => sum + row.amountCents, 0) + supplierSpendingCents;
    const unusualSpendingSignals: ExpenseIntelligence['unusualSpendingSignals'] = [];

    if (monthlyTrend.length >= 2) {
      const latest = monthlyTrend[monthlyTrend.length - 1]!.amountCents;
      const previous = monthlyTrend[monthlyTrend.length - 2]!.amountCents;
      if (previous > 0 && latest > previous * 1.5) {
        unusualSpendingSignals.push({
          title: 'Spending increase detected',
          description: `Latest month spending is ${Math.round(((latest - previous) / previous) * 100)}% higher than prior month.`,
          priority: 'medium',
        });
      }
    }

    return {
      currency: stats.currency,
      totalOutflowCents,
      byCategory: [...byCategory.entries()]
        .map(([category, data]) => ({ category, ...data }))
        .sort((a, b) => b.amountCents - a.amountCents),
      supplierSpendingCents,
      monthlyTrend,
      unusualSpendingSignals,
      summary: `Total outflow ${(totalOutflowCents / 100).toFixed(2)} ${stats.currency} including ${(supplierSpendingCents / 100).toFixed(2)} supplier procurement.`,
    };
  }

  async listBudgets(companyId: string): Promise<FinanceBudgetSummary[]> {
    const rows = await this.deps.db.query.financeBudgets.findMany({
      where: eq(financeBudgets.companyId, companyId),
      with: { lines: true },
      orderBy: [desc(financeBudgets.updatedAt)],
    });

    return rows.map(toBudgetSummary);
  }

  async createBudget(
    companyId: string,
    input: CreateFinanceBudgetRequest,
  ): Promise<FinanceBudgetSummary> {
    const name = input.name.trim();
    if (!name) {
      throw new FinanceIntelligenceError('VALIDATION_ERROR', 'Budget name is required');
    }

    const [created] = await this.deps.db
      .insert(financeBudgets)
      .values({
        companyId,
        name,
        periodType: input.periodType ?? 'monthly',
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        currency: input.currency ?? 'USD',
        status: input.status ?? 'draft',
        notes: input.notes?.trim() || null,
      })
      .returning();

    if (!created) {
      throw new FinanceIntelligenceError('INTERNAL_ERROR', 'Unable to create budget');
    }

    if (input.lines?.length) {
      await this.deps.db.insert(financeBudgetLines).values(
        input.lines.map((line) => ({
          companyId,
          budgetId: created.id,
          categoryKey: line.categoryKey.trim(),
          categoryName: line.categoryName.trim(),
          budgetedAmountCents: line.budgetedAmountCents,
          notes: line.notes?.trim() || null,
        })),
      );
    }

    const detail = await this.deps.db.query.financeBudgets.findFirst({
      where: eq(financeBudgets.id, created.id),
      with: { lines: true },
    });

    return toBudgetSummary(detail!);
  }

  async updateBudget(
    companyId: string,
    budgetId: string,
    input: UpdateFinanceBudgetRequest,
  ): Promise<FinanceBudgetSummary> {
    await this.ensureBudget(companyId, budgetId);

    await this.deps.db
      .update(financeBudgets)
      .set({
        name: input.name?.trim(),
        periodType: input.periodType,
        periodStart: input.periodStart ? new Date(input.periodStart) : undefined,
        periodEnd: input.periodEnd ? new Date(input.periodEnd) : undefined,
        currency: input.currency,
        status: input.status,
        notes: input.notes !== undefined ? input.notes?.trim() || null : undefined,
        updatedAt: new Date(),
      })
      .where(eq(financeBudgets.id, budgetId));

    const detail = await this.deps.db.query.financeBudgets.findFirst({
      where: eq(financeBudgets.id, budgetId),
      with: { lines: true },
    });

    return toBudgetSummary(detail!);
  }

  async addBudgetLine(
    companyId: string,
    budgetId: string,
    input: CreateFinanceBudgetLineRequest,
  ): Promise<FinanceBudgetVariance> {
    await this.ensureBudget(companyId, budgetId);

    await this.deps.db.insert(financeBudgetLines).values({
      companyId,
      budgetId,
      categoryKey: input.categoryKey.trim(),
      categoryName: input.categoryName.trim(),
      budgetedAmountCents: input.budgetedAmountCents,
      notes: input.notes?.trim() || null,
    });

    return this.getBudgetVariance(companyId, budgetId);
  }

  async getBudgetVariance(companyId: string, budgetId: string): Promise<FinanceBudgetVariance> {
    const budget = await this.deps.db.query.financeBudgets.findFirst({
      where: and(eq(financeBudgets.id, budgetId), eq(financeBudgets.companyId, companyId)),
      with: { lines: true },
    });

    if (!budget) {
      throw new FinanceIntelligenceError('NOT_FOUND', 'Budget not found');
    }

    const paymentRows = await this.deps.db.query.payments.findMany({
      where: and(
        eq(payments.companyId, companyId),
        gte(payments.paidAt, budget.periodStart),
        lte(payments.paidAt, budget.periodEnd),
      ),
    });

    const actualByMethod = new Map<string, number>();
    for (const payment of paymentRows) {
      actualByMethod.set(
        payment.method,
        (actualByMethod.get(payment.method) ?? 0) + payment.amountCents,
      );
    }

    const lines = budget.lines.map((line) => {
      const actualAmountCents = actualByMethod.get(line.categoryKey) ?? 0;
      const varianceCents = line.budgetedAmountCents - actualAmountCents;
      const variancePercent =
        line.budgetedAmountCents > 0
          ? Math.round((varianceCents / line.budgetedAmountCents) * 100)
          : null;

      return {
        id: line.id,
        budgetId: line.budgetId,
        categoryKey: line.categoryKey,
        categoryName: line.categoryName,
        budgetedAmountCents: line.budgetedAmountCents,
        actualAmountCents,
        varianceCents,
        variancePercent,
        notes: line.notes,
      };
    });

    const totalBudgetedCents = lines.reduce((sum, row) => sum + row.budgetedAmountCents, 0);
    const totalActualCents = lines.reduce((sum, row) => sum + row.actualAmountCents, 0);

    return {
      budget: toBudgetSummary(budget),
      lines,
      totalBudgetedCents,
      totalActualCents,
      totalVarianceCents: totalBudgetedCents - totalActualCents,
      summary: `Budget ${budget.name}: ${(totalActualCents / 100).toFixed(2)} actual vs ${(totalBudgetedCents / 100).toFixed(2)} budgeted.`,
    };
  }

  async getFinanceForecast(
    companyId: string,
    forecastType: FinanceForecastType = 'weekly',
  ): Promise<FinanceForecast> {
    const cashFlow = await this.getCashFlowIntelligence(companyId);
    const now = new Date();
    const horizonEnd = new Date(
      now.getTime() + (forecastType === 'weekly' ? 7 : 30) * 24 * 60 * 60 * 1000,
    );

    const receivableForecastCents =
      forecastType === 'weekly' ? cashFlow.weeklyForecastCents : cashFlow.monthlyForecastCents;
    const payableForecastCents = cashFlow.outstandingPayableCents;
    const netPositionCents = receivableForecastCents - payableForecastCents;
    const cashShortageWarning = netPositionCents < 0;

    return {
      forecastType,
      horizonStart: now.toISOString(),
      horizonEnd: horizonEnd.toISOString(),
      receivableForecastCents,
      payableForecastCents,
      netPositionCents,
      cashShortageWarning,
      summary: `${forecastType} forecast: net position ${(netPositionCents / 100).toFixed(2)} ${cashFlow.currency}${cashShortageWarning ? ' — shortage warning' : ''}.`,
    };
  }

  async generateForecastSnapshot(
    companyId: string,
    input: GenerateFinanceForecastRequest,
  ): Promise<FinanceForecastSnapshotSummary> {
    const forecast = await this.getFinanceForecast(companyId, input.forecastType);

    const [created] = await this.deps.db
      .insert(financeForecastSnapshots)
      .values({
        companyId,
        forecastType: forecast.forecastType,
        horizonStart: new Date(forecast.horizonStart),
        horizonEnd: new Date(forecast.horizonEnd),
        receivableForecastCents: forecast.receivableForecastCents,
        payableForecastCents: forecast.payableForecastCents,
        netPositionCents: forecast.netPositionCents,
        summary: forecast.summary,
        context: { cashShortageWarning: forecast.cashShortageWarning },
      })
      .returning();

    return toForecastSnapshotSummary(created!);
  }

  async getFinancialRisks(companyId: string): Promise<FinanceRiskSignal[]> {
    const [cashFlow, receivables, profitability, expenses] = await Promise.all([
      this.getCashFlowIntelligence(companyId),
      this.getReceivablesIntelligence(companyId),
      this.getProfitabilityIntelligence(companyId),
      this.getExpenseIntelligence(companyId),
    ]);

    const risks: FinanceRiskSignal[] = [];

    if (cashFlow.cashShortageWarning) {
      risks.push({
        riskType: 'cash_flow',
        title: 'Cash shortage warning',
        description: cashFlow.summary,
        priority: 'high',
        context: { weeklyForecastCents: cashFlow.weeklyForecastCents },
      });
    }

    if (receivables.overdueCount > 0) {
      risks.push({
        riskType: 'receivables',
        title: 'Overdue receivables',
        description: receivables.summary,
        priority: receivables.overdueAmountCents > 100000 ? 'high' : 'medium',
        context: { overdueCount: receivables.overdueCount },
      });
    }

    if (profitability.netMarginPercent !== null && profitability.netMarginPercent < 15) {
      risks.push({
        riskType: 'margin',
        title: 'Low margin signal',
        description: `Net margin ${profitability.netMarginPercent}% below target threshold.`,
        priority: 'medium',
        context: { netMarginPercent: profitability.netMarginPercent },
      });
    }

    for (const signal of expenses.unusualSpendingSignals) {
      risks.push({
        riskType: 'expense',
        title: signal.title,
        description: signal.description,
        priority: signal.priority,
        context: {},
      });
    }

    return risks.slice(0, 12);
  }

  async listRecommendations(companyId: string): Promise<FinanceRecommendationSummary[]> {
    const rows = await this.deps.db.query.financeRecommendations.findMany({
      where: and(
        eq(financeRecommendations.companyId, companyId),
        inArray(financeRecommendations.status, ['pending', 'accepted']),
      ),
      orderBy: [desc(financeRecommendations.updatedAt)],
      limit: 50,
    });

    return rows.map(toRecommendationSummary);
  }

  async generateRecommendations(companyId: string): Promise<FinanceRecommendationSummary[]> {
    const [cashFlow, receivables, profitability, expenses, risks] = await Promise.all([
      this.getCashFlowIntelligence(companyId),
      this.getReceivablesIntelligence(companyId),
      this.getProfitabilityIntelligence(companyId),
      this.getExpenseIntelligence(companyId),
      this.getFinancialRisks(companyId),
    ]);

    const signals: Array<{
      recommendationType: FinanceRecommendationSummary['recommendationType'];
      title: string;
      description: string;
      priority: string;
      context: Record<string, unknown>;
    }> = [];

    if (cashFlow.cashShortageWarning) {
      signals.push({
        recommendationType: 'cash_flow',
        title: 'Optimise cash flow',
        description: cashFlow.summary,
        priority: 'high',
        context: { weeklyForecastCents: cashFlow.weeklyForecastCents },
      });
    }

    if (receivables.overdueCount > 0) {
      signals.push({
        recommendationType: 'collections',
        title: 'Prioritise collections',
        description: `${receivables.overdueCount} overdue invoice(s) — review collection priorities for approval.`,
        priority: 'high',
        context: { overdueAmountCents: receivables.overdueAmountCents },
      });
    }

    if (profitability.netMarginPercent !== null && profitability.netMarginPercent < 20) {
      signals.push({
        recommendationType: 'margin',
        title: 'Review margin performance',
        description: `Average margin ${profitability.netMarginPercent}% — consider pricing or cost review.`,
        priority: 'medium',
        context: { netMarginPercent: profitability.netMarginPercent },
      });
    }

    const lowMarginJobs = profitability.byJob.filter(
      (row) => row.marginPercent !== null && row.marginPercent < 20 && row.revenueCents > 0,
    );
    if (lowMarginJobs.length > 0) {
      signals.push({
        recommendationType: 'pricing',
        title: 'Pricing improvement opportunity',
        description: `${lowMarginJobs.length} job(s) show margins below 20% — review pricing for approval.`,
        priority: 'medium',
        context: { jobIds: lowMarginJobs.slice(0, 5).map((row) => row.jobId) },
      });
    }

    for (const signal of expenses.unusualSpendingSignals) {
      signals.push({
        recommendationType: 'expense_reduction',
        title: signal.title,
        description: signal.description,
        priority: signal.priority,
        context: {},
      });
    }

    for (const risk of risks.slice(0, 5)) {
      signals.push({
        recommendationType: 'risk',
        title: risk.title,
        description: risk.description,
        priority: risk.priority,
        context: risk.context,
      });
    }

    const created: FinanceRecommendationSummary[] = [];
    for (const signal of signals.slice(0, 15)) {
      const [row] = await this.deps.db
        .insert(financeRecommendations)
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
    input: UpdateFinanceRecommendationRequest,
  ): Promise<FinanceRecommendationSummary> {
    const existing = await this.deps.db.query.financeRecommendations.findFirst({
      where: and(
        eq(financeRecommendations.id, recommendationId),
        eq(financeRecommendations.companyId, companyId),
      ),
    });

    if (!existing) {
      throw new FinanceIntelligenceError('NOT_FOUND', 'Finance recommendation not found');
    }

    await this.deps.db
      .update(financeRecommendations)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(financeRecommendations.id, recommendationId));

    const row = await this.deps.db.query.financeRecommendations.findFirst({
      where: eq(financeRecommendations.id, recommendationId),
    });

    return toRecommendationSummary(row!);
  }

  async buildAuraContext(companyId: string): Promise<FinanceIntelligenceAuraContext> {
    const [cashFlow, profitability, receivables, expenses, forecast, recommendations, risks] =
      await Promise.all([
        this.getCashFlowIntelligence(companyId),
        this.getProfitabilityIntelligence(companyId),
        this.getReceivablesIntelligence(companyId),
        this.getExpenseIntelligence(companyId),
        this.getFinanceForecast(companyId, 'monthly'),
        this.listRecommendations(companyId),
        this.getFinancialRisks(companyId),
      ]);

    return {
      cashFlow,
      profitability,
      receivables,
      expenses,
      forecast,
      pendingRecommendationCount: recommendations.filter((row) => row.status === 'pending').length,
      topRecommendations: recommendations.slice(0, 8).map((row) => ({
        title: row.title,
        recommendationType: row.recommendationType,
        priority: row.priority,
      })),
      riskSignals: risks.slice(0, 8),
      summary: `${receivables.overdueCount} overdue invoice(s), margin ${profitability.netMarginPercent ?? 'n/a'}%, ${recommendations.filter((row) => row.status === 'pending').length} pending recommendation(s).`,
    };
  }

  private async ensureBudget(companyId: string, budgetId: string): Promise<void> {
    const budget = await this.deps.db.query.financeBudgets.findFirst({
      where: and(eq(financeBudgets.id, budgetId), eq(financeBudgets.companyId, companyId)),
    });

    if (!budget) {
      throw new FinanceIntelligenceError('NOT_FOUND', 'Budget not found');
    }
  }
}

function toBudgetSummary(
  row: typeof financeBudgets.$inferSelect & {
    lines: Array<typeof financeBudgetLines.$inferSelect>;
  },
): FinanceBudgetSummary {
  return {
    id: row.id,
    name: row.name,
    periodType: row.periodType,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    currency: row.currency,
    status: row.status,
    totalBudgetedCents: row.lines.reduce((sum, line) => sum + line.budgetedAmountCents, 0),
    lineCount: row.lines.length,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRecommendationSummary(
  row: typeof financeRecommendations.$inferSelect,
): FinanceRecommendationSummary {
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

function toForecastSnapshotSummary(
  row: typeof financeForecastSnapshots.$inferSelect,
): FinanceForecastSnapshotSummary {
  return {
    id: row.id,
    forecastType: row.forecastType,
    horizonStart: row.horizonStart.toISOString(),
    horizonEnd: row.horizonEnd.toISOString(),
    receivableForecastCents: row.receivableForecastCents,
    payableForecastCents: row.payableForecastCents,
    netPositionCents: row.netPositionCents,
    cashShortageWarning: Boolean((row.context as Record<string, unknown>).cashShortageWarning),
    summary: row.summary,
    generatedAt: row.generatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
