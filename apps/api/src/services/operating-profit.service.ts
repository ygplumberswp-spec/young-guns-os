/**
 * FIN-003 — Overhead & True Operating Profit service.
 *
 * Composes JPE company GP (FIN-002 pattern) + BANK overhead (CASH-001).
 * No second accounting ledger. No FIN-004 budgets/forecasts.
 */

import type {
  CashControlPeriodKey,
  OperatingProfitDashboard,
  OperatingProfitPeriod,
} from '@titan/shared';
import {
  absoluteBankTransactionAmountCents,
  buildOperatingProfitIssues,
  buildOperatingProfitSummary,
  buildOverheadCategories,
  canViewOperatingProfit,
  extractOverheadAllocations,
  resolveOperatingProfitPeriodRange,
  resolveOverheadAuthorityOnce,
  sumOverheadAllocationCents,
} from '@titan/shared';
import type { CashControlService } from './cash-control.service.js';
import type { ProfitAnalyticsService } from './profit-analytics.service.js';

export class OperatingProfitError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OperatingProfitError';
  }
}

export type OperatingProfitActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

function toCashPeriodKey(period: OperatingProfitPeriod): CashControlPeriodKey {
  if (period === 'today') return 'today';
  if (period === 'custom') return 'custom';
  return 'month_to_date';
}

export class OperatingProfitService {
  constructor(
    private readonly cashControlService: CashControlService,
    private readonly profitAnalyticsService: ProfitAnalyticsService,
  ) {}

  private assertView(actor: OperatingProfitActor): void {
    if (!canViewOperatingProfit(actor)) {
      throw new OperatingProfitError(
        'FORBIDDEN',
        'Operating profit requires finance access. Technician and Client are blocked.',
      );
    }
  }

  async getDashboard(
    actor: OperatingProfitActor,
    options: {
      period?: OperatingProfitPeriod;
      fromDate?: string;
      toDate?: string;
    } = {},
  ): Promise<OperatingProfitDashboard> {
    this.assertView(actor);
    const period = options.period ?? 'month';
    const range = resolveOperatingProfitPeriodRange(period, new Date(), {
      fromDate: options.fromDate ?? '',
      toDate: options.toDate ?? '',
    });

    const cashActor = {
      companyId: actor.companyId,
      userId: actor.userId,
      roleName: actor.roleName,
      permissions: actor.permissions,
    };

    const [analytics, cashMetrics, transactions, hasBankAccounts] = await Promise.all([
      this.profitAnalyticsService.getDashboard(cashActor, {
        period:
          period === 'today'
            ? 'custom'
            : period === 'last_month'
              ? 'last_month'
              : period === 'week'
                ? 'week'
                : period === 'custom'
                  ? 'custom'
                  : 'month',
        fromDate: range.fromDate,
        toDate: range.toDate,
      }),
      this.cashControlService.getPeriodMetrics(cashActor, {
        periodKey: toCashPeriodKey(period),
        fromDate: range.fromDate,
        toDate: range.toDate,
      }),
      this.cashControlService.getBankTransactionsForPeriod(cashActor, range),
      this.cashControlService.hasActiveBankAccounts(cashActor),
    ]);

    const overheadLines = extractOverheadAllocations(
      transactions,
      range.fromDate,
      range.toDate,
    );
    const bankOverheadCents = sumOverheadAllocationCents(overheadLines);
    // Authority once — ignore any parallel Xero representation (not loaded).
    const overheadAuthority = resolveOverheadAuthorityOnce({
      bankOverheadAllocationCents: bankOverheadCents,
      xeroBillExpenseCents: 0,
      xeroBankMirrorCents: 0,
    });

    // Align cash overhead with extracted overhead (same bank authority).
    const knownOverheadCents = overheadAuthority.knownOverheadCents;

    let unallocatedDebitCount = 0;
    for (const tx of transactions) {
      if (tx.direction !== 'debit' || tx.allocationStatus === 'ignored') continue;
      const abs = absoluteBankTransactionAmountCents(tx.amountCents);
      const allocated = tx.allocations
        .filter((a) => a.isActive !== false)
        .reduce((s, a) => s + a.amountCents, 0);
      if (abs - allocated > 0) unallocatedDebitCount += 1;
    }

    const categories = buildOverheadCategories(overheadLines);
    const unresolved = categories.filter((c) => c.category.toLowerCase() === 'other');
    const unresolvedOverheadCategoryCents = unresolved.reduce((s, c) => s + c.amountCents, 0);
    const unresolvedOverheadCount = unresolved.reduce((s, c) => s + c.allocationCount, 0);
    const missingReceiptCount = categories.reduce((s, c) => s + c.missingReceiptCount, 0);

    const summary = buildOperatingProfitSummary({
      period,
      fromDate: range.fromDate,
      toDate: range.toDate,
      currency: analytics.overview.currency,
      economicRevenueCents: analytics.overview.revenueCents,
      directEconomicCostCents: analytics.overview.economicCostCents,
      companyGrossProfitCents: analytics.overview.grossProfitCents,
      knownOverheadCents,
      customerCashCollectedCents: cashMetrics.moneyIn.customerCashCollectedCents,
      directCashOutCents: cashMetrics.moneyOut.directJobCashOutCents,
      overheadCashOutCents: knownOverheadCents,
      excludedTransferOutCents: cashMetrics.moneyOut.internalTransferOutCents,
      excludedNonOperatingOutCents: cashMetrics.moneyOut.authorisedNonOperatingOutCents,
      unexplainedDebitCents: cashMetrics.moneyOut.unexplainedMoneyOutCents,
      jobsIncluded: analytics.overview.coverage.jobsIncluded,
      incompleteJobs: analytics.overview.coverage.incompleteJobs,
      unallocatedDebitCount,
      missingReceiptCount,
      unresolvedOverheadCategoryCents,
      hasBankAccounts,
    });

    const issues = buildOperatingProfitIssues({
      unexplainedDebitCents: cashMetrics.moneyOut.unexplainedMoneyOutCents,
      unallocatedDebitCount,
      missingReceiptCount,
      unresolvedOverheadCategoryCents,
      unresolvedOverheadCount,
    });

    // MTD known overhead only when viewing month — not a forecast.
    const knownOverheadMtdCents = period === 'month' ? knownOverheadCents : null;

    // Strip nested line payloads from category list for summary size; keep counts.
    // Full lines available via /overhead endpoint.
    return {
      summary,
      overhead: {
        knownOverheadCents,
        categories: categories.map((c) => ({
          ...c,
          lines: c.lines.slice(0, 25),
        })),
        knownOverheadMtdCents,
        note: 'Overhead authority is BANK allocationType=overhead only. Direct job costs, transfers, tax, and owner draws are excluded. Xero bills/mirrors are not dual-summed.',
      },
      issues,
    };
  }

  async getOverhead(
    actor: OperatingProfitActor,
    options: {
      period?: OperatingProfitPeriod;
      fromDate?: string;
      toDate?: string;
    } = {},
  ) {
    const dashboard = await this.getDashboard(actor, options);
    return dashboard.overhead;
  }

  async getIssues(
    actor: OperatingProfitActor,
    options: {
      period?: OperatingProfitPeriod;
      fromDate?: string;
      toDate?: string;
    } = {},
  ) {
    const dashboard = await this.getDashboard(actor, options);
    return {
      completeness: dashboard.summary.completeness,
      completenessReasons: dashboard.summary.completenessReasons,
      qualityNote: dashboard.summary.qualityNote,
      issues: dashboard.issues,
    };
  }
}
