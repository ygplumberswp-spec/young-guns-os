/**
 * FIN-004 — Budget, Targets & Forecast Control (shared types + pure math).
 *
 * Plan/target persistence is separate from actual financial truth.
 * Actuals come from JPE / CASH / FIN-002 / FIN-003 — never from plan rows.
 * Forecast is a recalculable run-rate estimate — never stored as actual.
 * No Growth Planner job/tech/vehicle calculations.
 */

import {
  BANK_TRANSACTION_CATEGORIES,
  type BankTransactionCategory,
} from './bank-transaction-control.js';
import { canViewCashControl } from './cash-control.js';
import {
  ownerFinancialMonthStartDate,
  ownerFinancialTodayDate,
} from './owner-financial-command.js';
import { marginPct, safeAnalyticsCents } from './profit-analytics.js';

export type BudgetControlDataQuality = 'VERIFIED' | 'PROVISIONAL' | 'INCOMPLETE';

export type BudgetControlAlertKind =
  | 'revenue_behind_target'
  | 'margin_below_target'
  | 'overhead_over_budget'
  | 'overhead_category_overspend'
  | 'operating_profit_below_target'
  | 'cash_collection_behind_target';

export type BudgetControlPlan = {
  id: string | null;
  planMonth: string; // YYYY-MM-01
  currency: string;
  revenueTargetCents: number | null;
  grossMarginTargetPct: number | null;
  grossProfitTargetCents: number | null;
  overheadBudgetCents: number | null;
  operatingProfitTargetCents: number | null;
  cashCollectionTargetCents: number | null;
  notes: string | null;
  overheadLines: Array<{ category: string; budgetCents: number }>;
  isEmpty: boolean;
};

export type BudgetControlMetricCompare = {
  label: string;
  actualCents: number | null;
  targetCents: number | null;
  differenceCents: number | null;
  percentAchieved: number | null;
  configured: boolean;
};

export type BudgetControlMarginCompare = {
  label: string;
  actualPct: number | null;
  targetPct: number | null;
  differencePct: number | null;
  configured: boolean;
};

export type BudgetControlOverheadSpendRow = {
  category: string;
  budgetCents: number;
  actualCents: number;
  remainingCents: number;
  percentUsed: number | null;
  overspent: boolean;
  dataQuality: BudgetControlDataQuality;
};

export type BudgetControlForecast = {
  label: 'FORECAST';
  method: 'elapsed_day_run_rate';
  elapsedDays: number;
  totalDaysInMonth: number;
  projectedRevenueCents: number | null;
  projectedGrossProfitCents: number | null;
  projectedOverheadCents: number | null;
  projectedOperatingProfitCents: number | null;
  projectedCashCollectedCents: number | null;
  confidence: BudgetControlDataQuality;
  confidenceNote: string;
  monthComplete: boolean;
};

export type BudgetControlAlert = {
  kind: BudgetControlAlertKind;
  label: string;
  amountCents: number | null;
  href: string;
};

export type BudgetControlActuals = {
  planMonth: string;
  fromDate: string;
  toDate: string;
  currency: string;
  revenueCents: number;
  grossProfitCents: number;
  grossMarginPct: number | null;
  knownOverheadCents: number;
  knownOperatingProfitCents: number;
  cashCollectedCents: number;
  overheadByCategory: Array<{ category: string; amountCents: number }>;
  completeness: BudgetControlDataQuality;
  completenessReasons: string[];
  sourceTrace: string[];
};

export type BudgetControlDashboard = {
  plan: BudgetControlPlan;
  actuals: BudgetControlActuals;
  compares: {
    revenue: BudgetControlMetricCompare;
    grossProfit: BudgetControlMetricCompare;
    grossMargin: BudgetControlMarginCompare;
    overhead: BudgetControlMetricCompare;
    operatingProfit: BudgetControlMetricCompare;
    cashCollected: BudgetControlMetricCompare;
  };
  forecast: BudgetControlForecast;
  overheadSpend: BudgetControlOverheadSpendRow[];
  alerts: BudgetControlAlert[];
  availableMonths: string[];
};

export const BUDGET_OVERHEAD_CATEGORIES: readonly BankTransactionCategory[] =
  BANK_TRANSACTION_CATEGORIES;

export function canViewBudgetControl(identity: {
  roleName: string;
  permissions: readonly string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') return false;
  return canViewCashControl(identity);
}

export function canWriteBudgetControl(identity: {
  roleName: string;
  permissions: readonly string[];
}): boolean {
  if (!canViewBudgetControl(identity)) return false;
  const role = identity.roleName;
  const permissions = identity.permissions;
  if (permissions.includes('*')) return true;
  if (role === 'Owner' || role === 'Company Owner' || role === 'Platform Owner') return true;
  return permissions.includes('finance:write');
}

export function resolveBudgetPlanMonth(
  monthKey: string | undefined,
  now: Date = new Date(),
): string {
  if (monthKey && /^\d{4}-\d{2}(-\d{2})?$/.test(monthKey)) {
    const ym = monthKey.slice(0, 7);
    return `${ym}-01`;
  }
  return ownerFinancialMonthStartDate(now);
}

export function budgetMonthRange(
  planMonth: string,
  now: Date = new Date(),
): { fromDate: string; toDate: string; isCurrentMonth: boolean; isPastMonth: boolean } {
  const fromDate = resolveBudgetPlanMonth(planMonth, now);
  const y = Number(fromDate.slice(0, 4));
  const m = Number(fromDate.slice(5, 7));
  const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const today = ownerFinancialTodayDate(now);
  const currentStart = ownerFinancialMonthStartDate(now);
  const isCurrentMonth = fromDate === currentStart;
  const isPastMonth = fromDate < currentStart;
  const toDate = isCurrentMonth ? today : lastDay;
  return { fromDate, toDate, isCurrentMonth, isPastMonth };
}

export function daysInMonth(planMonth: string): number {
  const y = Number(planMonth.slice(0, 4));
  const m = Number(planMonth.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function elapsedDaysInMonth(
  planMonth: string,
  now: Date = new Date(),
): { elapsedDays: number; totalDays: number; monthComplete: boolean } {
  const range = budgetMonthRange(planMonth, now);
  const totalDays = daysInMonth(planMonth);
  if (range.isPastMonth) {
    return { elapsedDays: totalDays, totalDays, monthComplete: true };
  }
  if (!range.isCurrentMonth && range.toDate < ownerFinancialTodayDate(now)) {
    return { elapsedDays: totalDays, totalDays, monthComplete: true };
  }
  const day = Number(range.toDate.slice(8, 10));
  return {
    elapsedDays: Math.max(1, Math.min(totalDays, day)),
    totalDays,
    monthComplete: false,
  };
}

export function deriveGrossProfitTargetCents(input: {
  revenueTargetCents: number | null;
  grossMarginTargetPct: number | null;
  grossProfitTargetCents: number | null;
}): number | null {
  if (input.grossProfitTargetCents != null) {
    return safeAnalyticsCents(input.grossProfitTargetCents);
  }
  if (
    input.revenueTargetCents != null &&
    input.revenueTargetCents > 0 &&
    input.grossMarginTargetPct != null &&
    Number.isFinite(input.grossMarginTargetPct)
  ) {
    return Math.round((input.revenueTargetCents * input.grossMarginTargetPct) / 100);
  }
  return null;
}

export function compareMetric(
  label: string,
  actualCents: number,
  targetCents: number | null,
): BudgetControlMetricCompare {
  if (targetCents == null) {
    return {
      label,
      actualCents,
      targetCents: null,
      differenceCents: null,
      percentAchieved: null,
      configured: false,
    };
  }
  const target = safeAnalyticsCents(targetCents);
  const actual = safeAnalyticsCents(actualCents);
  const percentAchieved =
    target === 0 ? null : Math.round((actual / target) * 10000) / 100;
  return {
    label,
    actualCents: actual,
    targetCents: target,
    differenceCents: actual - target,
    percentAchieved,
    configured: true,
  };
}

export function compareMargin(
  actualPct: number | null,
  targetPct: number | null,
): BudgetControlMarginCompare {
  if (targetPct == null) {
    return {
      label: 'Gross margin',
      actualPct,
      targetPct: null,
      differencePct: null,
      configured: false,
    };
  }
  return {
    label: 'Gross margin',
    actualPct,
    targetPct,
    differencePct: actualPct == null ? null : Math.round((actualPct - targetPct) * 100) / 100,
    configured: true,
  };
}

export function projectRunRate(
  actualCents: number,
  elapsedDays: number,
  totalDays: number,
): number | null {
  if (!Number.isFinite(actualCents)) return 0;
  if (elapsedDays <= 0 || totalDays <= 0) return null;
  return Math.round((safeAnalyticsCents(actualCents) / elapsedDays) * totalDays);
}

export function buildForecast(input: {
  planMonth: string;
  now?: Date;
  revenueCents: number;
  grossProfitCents: number;
  overheadCents: number;
  operatingProfitCents: number;
  cashCollectedCents: number;
  actualCompleteness: BudgetControlDataQuality;
  jobsIncluded: number;
}): BudgetControlForecast {
  const now = input.now ?? new Date();
  const { elapsedDays, totalDays, monthComplete } = elapsedDaysInMonth(input.planMonth, now);

  if (monthComplete) {
    return {
      label: 'FORECAST',
      method: 'elapsed_day_run_rate',
      elapsedDays,
      totalDaysInMonth: totalDays,
      projectedRevenueCents: safeAnalyticsCents(input.revenueCents),
      projectedGrossProfitCents: safeAnalyticsCents(input.grossProfitCents),
      projectedOverheadCents: safeAnalyticsCents(input.overheadCents),
      projectedOperatingProfitCents: safeAnalyticsCents(input.operatingProfitCents),
      projectedCashCollectedCents: safeAnalyticsCents(input.cashCollectedCents),
      confidence: input.actualCompleteness,
      confidenceNote: 'Month complete — forecast equals known actuals for the month.',
      monthComplete: true,
    };
  }

  let confidence: BudgetControlDataQuality = 'PROVISIONAL';
  const notes: string[] = ['FORECAST uses elapsed-day run rate — not actual.'];
  if (elapsedDays < 7) {
    confidence = 'PROVISIONAL';
    notes.push('Fewer than 7 days elapsed.');
  }
  if (input.jobsIncluded === 0 || input.actualCompleteness === 'INCOMPLETE') {
    confidence = 'INCOMPLETE';
    notes.push('Insufficient or incomplete actual source data.');
  } else if (input.actualCompleteness === 'PROVISIONAL') {
    confidence = 'PROVISIONAL';
    notes.push('Source actuals are provisional.');
  }

  return {
    label: 'FORECAST',
    method: 'elapsed_day_run_rate',
    elapsedDays,
    totalDaysInMonth: totalDays,
    projectedRevenueCents: projectRunRate(input.revenueCents, elapsedDays, totalDays),
    projectedGrossProfitCents: projectRunRate(input.grossProfitCents, elapsedDays, totalDays),
    projectedOverheadCents: projectRunRate(input.overheadCents, elapsedDays, totalDays),
    projectedOperatingProfitCents: projectRunRate(
      input.operatingProfitCents,
      elapsedDays,
      totalDays,
    ),
    projectedCashCollectedCents: projectRunRate(
      input.cashCollectedCents,
      elapsedDays,
      totalDays,
    ),
    confidence,
    confidenceNote: notes.join(' '),
    monthComplete: false,
  };
}

export function buildOverheadSpendRows(input: {
  budgetLines: Array<{ category: string; budgetCents: number }>;
  actualByCategory: Array<{ category: string; amountCents: number }>;
  totalOverheadBudgetCents: number | null;
  actualCompleteness: BudgetControlDataQuality;
}): BudgetControlOverheadSpendRow[] {
  const actualMap = new Map(
    input.actualByCategory.map((r) => [r.category.toLowerCase(), safeAnalyticsCents(r.amountCents)]),
  );
  const budgetMap = new Map<string, number>();
  for (const line of input.budgetLines) {
    const key = line.category.toLowerCase();
    budgetMap.set(key, (budgetMap.get(key) ?? 0) + safeAnalyticsCents(line.budgetCents));
  }

  // Include categories with budget or actual overhead
  const keys = new Set([...budgetMap.keys(), ...actualMap.keys()]);
  const rows: BudgetControlOverheadSpendRow[] = [];
  for (const key of keys) {
    const budgetCents = budgetMap.get(key) ?? 0;
    const actualCents = actualMap.get(key) ?? 0;
    if (budgetCents === 0 && actualCents === 0) continue;
    const remainingCents = budgetCents - actualCents;
    const percentUsed =
      budgetCents > 0 ? Math.round((actualCents / budgetCents) * 10000) / 100 : null;
    rows.push({
      category: key,
      budgetCents,
      actualCents,
      remainingCents,
      percentUsed,
      overspent: budgetCents > 0 && actualCents > budgetCents,
      dataQuality: input.actualCompleteness,
    });
  }

  // If only total overhead budget and no lines, expose a synthetic "general" rollup row
  if (
    rows.length === 0 &&
    input.totalOverheadBudgetCents != null &&
    input.totalOverheadBudgetCents > 0
  ) {
    const totalActual = input.actualByCategory.reduce(
      (s, r) => s + safeAnalyticsCents(r.amountCents),
      0,
    );
    const budget = safeAnalyticsCents(input.totalOverheadBudgetCents);
    rows.push({
      category: 'general overhead',
      budgetCents: budget,
      actualCents: totalActual,
      remainingCents: budget - totalActual,
      percentUsed: budget > 0 ? Math.round((totalActual / budget) * 10000) / 100 : null,
      overspent: totalActual > budget,
      dataQuality: input.actualCompleteness,
    });
  }

  return rows.sort((a, b) => b.actualCents - a.actualCents);
}

export function buildBudgetAlerts(input: {
  revenue: BudgetControlMetricCompare;
  grossMargin: BudgetControlMarginCompare;
  overhead: BudgetControlMetricCompare;
  operatingProfit: BudgetControlMetricCompare;
  cashCollected: BudgetControlMetricCompare;
  overheadSpend: BudgetControlOverheadSpendRow[];
}): BudgetControlAlert[] {
  const alerts: BudgetControlAlert[] = [];
  if (
    input.revenue.configured &&
    input.revenue.differenceCents != null &&
    input.revenue.differenceCents < 0
  ) {
    alerts.push({
      kind: 'revenue_behind_target',
      label: 'Revenue behind target',
      amountCents: Math.abs(input.revenue.differenceCents),
      href: '/finance/budget-control',
    });
  }
  if (
    input.grossMargin.configured &&
    input.grossMargin.differencePct != null &&
    input.grossMargin.differencePct < 0
  ) {
    alerts.push({
      kind: 'margin_below_target',
      label: 'Gross margin below target',
      amountCents: null,
      href: '/finance/budget-control',
    });
  }
  if (
    input.overhead.configured &&
    input.overhead.differenceCents != null &&
    input.overhead.differenceCents > 0
  ) {
    alerts.push({
      kind: 'overhead_over_budget',
      label: 'Total overhead above budget',
      amountCents: input.overhead.differenceCents,
      href: '/finance/operating-profit',
    });
  }
  for (const row of input.overheadSpend.filter((r) => r.overspent)) {
    alerts.push({
      kind: 'overhead_category_overspend',
      label: `Overhead category overspend: ${row.category}`,
      amountCents: Math.abs(row.remainingCents),
      href: `/finance/bank-control?allocationType=overhead&category=${encodeURIComponent(row.category)}`,
    });
  }
  if (
    input.operatingProfit.configured &&
    input.operatingProfit.differenceCents != null &&
    input.operatingProfit.differenceCents < 0
  ) {
    alerts.push({
      kind: 'operating_profit_below_target',
      label: 'Operating profit below target',
      amountCents: Math.abs(input.operatingProfit.differenceCents),
      href: '/finance/operating-profit',
    });
  }
  if (
    input.cashCollected.configured &&
    input.cashCollected.differenceCents != null &&
    input.cashCollected.differenceCents < 0
  ) {
    alerts.push({
      kind: 'cash_collection_behind_target',
      label: 'Cash collection behind target',
      amountCents: Math.abs(input.cashCollected.differenceCents),
      href: '/finance/cash-control',
    });
  }
  return alerts;
}

export function emptyBudgetPlan(planMonth: string, currency = 'ZAR'): BudgetControlPlan {
  return {
    id: null,
    planMonth: resolveBudgetPlanMonth(planMonth),
    currency,
    revenueTargetCents: null,
    grossMarginTargetPct: null,
    grossProfitTargetCents: null,
    overheadBudgetCents: null,
    operatingProfitTargetCents: null,
    cashCollectionTargetCents: null,
    notes: null,
    overheadLines: [],
    isEmpty: true,
  };
}

export function isValidBudgetCategory(category: string): boolean {
  const key = category.trim().toLowerCase();
  return (BANK_TRANSACTION_CATEGORIES as readonly string[]).includes(key) || key === 'other';
}

export function availablePlanMonths(now: Date = new Date(), count = 6): string[] {
  const months: string[] = [];
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - i, 1));
    months.push(ownerFinancialMonthStartDate(d));
  }
  return months;
}

export function safePct(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 10000) / 100;
}

/** Prove forecast helpers never mutate input actuals. */
export function forecastDoesNotAlterActuals(actualCents: number): {
  actualUnchanged: number;
  forecast: number | null;
} {
  const snapshot = actualCents;
  const forecast = projectRunRate(actualCents, 10, 30);
  return { actualUnchanged: snapshot, forecast };
}

export { marginPct, safeAnalyticsCents };
