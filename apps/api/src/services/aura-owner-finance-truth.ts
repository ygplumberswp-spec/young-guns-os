/**
 * AURA-TRAIN-001 — Compact FIN/CASH/JPE/GROWTH truth for AURA context.
 * Thin composition only; no second accounting engine.
 */
import {
  canViewGrowthPlanner,
  canViewOwnerFinancialCommand,
  mapCashCompletenessToAuraTruth,
  type AuraTruthCompleteness,
} from '@titan/shared';
import type { OwnerFinancialCommandService } from './owner-financial-command.service.js';
import type { GrowthPlannerService } from './growth-planner.service.js';

export type AuraOwnerFinanceTruthActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export type AuraOwnerFinanceTruthContext = {
  authority: 'FIN-001/CASH-001/JPE/GROWTH-001';
  completeness: AuraTruthCompleteness;
  completenessReasons: string[];
  period: string;
  currency: string;
  invoicedRevenueCents: number;
  customerCashCollectedCents: number;
  knownGrossProfitCents: number | null;
  knownRealisedCashProfitCents: number;
  outstandingCustomerCashCents: number;
  moneyInCents: number;
  moneyOutCents: number;
  unexplainedDebitCents: number;
  lossJobsCount: number;
  overdueReceivableCents: number;
  growthJobsRequired: number | null;
  growthStatus: string | null;
  profitableJobsCount: number | null;
  summary: string;
  sourceTrace: string[];
  note: string;
};

export async function buildAuraOwnerFinanceTruthContext(input: {
  actor: AuraOwnerFinanceTruthActor;
  ownerFinancialCommandService: OwnerFinancialCommandService;
  growthPlannerService: GrowthPlannerService;
}): Promise<AuraOwnerFinanceTruthContext | null> {
  const { actor } = input;
  if (!canViewOwnerFinancialCommand(actor)) {
    return null;
  }

  const dashboard = await input.ownerFinancialCommandService.getDashboard(actor, 'month');
  const completeness = mapCashCompletenessToAuraTruth(dashboard.financialTruth.completeness);

  let growthJobsRequired: number | null = null;
  let growthStatus: string | null = null;
  if (canViewGrowthPlanner(actor)) {
    try {
      const monthKey = dashboard.asOfDate.slice(0, 7);
      const plan = await input.growthPlannerService.getPlan(actor, monthKey);
      growthJobsRequired = plan.requiredOutput.jobsRequired ?? null;
      growthStatus = plan.status ?? null;
    } catch {
      growthStatus = 'unavailable';
    }
  }

  const profitableJobsCount = dashboard.profitability.profitableJobsCount;

  const summary = [
    `Period ${dashboard.period}: invoiced ${(dashboard.heartbeat.invoicedRevenueCents / 100).toFixed(2)} ${dashboard.currency}`,
    `cash collected ${(dashboard.heartbeat.customerCashCollectedCents / 100).toFixed(2)}`,
    `known gross profit ${
      dashboard.heartbeat.knownGrossProfitCents == null
        ? 'unavailable'
        : (dashboard.heartbeat.knownGrossProfitCents / 100).toFixed(2)
    }`,
    `outstanding ${(dashboard.heartbeat.outstandingCustomerCashCents / 100).toFixed(2)}`,
    `truth ${completeness}`,
  ].join('; ');

  return {
    authority: 'FIN-001/CASH-001/JPE/GROWTH-001',
    completeness,
    completenessReasons: dashboard.financialTruth.reasons,
    period: dashboard.period,
    currency: dashboard.currency,
    invoicedRevenueCents: dashboard.heartbeat.invoicedRevenueCents,
    customerCashCollectedCents: dashboard.heartbeat.customerCashCollectedCents,
    knownGrossProfitCents: dashboard.heartbeat.knownGrossProfitCents,
    knownRealisedCashProfitCents: dashboard.heartbeat.knownRealisedCashProfitCents,
    outstandingCustomerCashCents: dashboard.heartbeat.outstandingCustomerCashCents,
    moneyInCents: dashboard.cash.moneyInCents,
    moneyOutCents: dashboard.cash.moneyOutCents,
    unexplainedDebitCents: dashboard.cash.unexplainedDebitCents,
    lossJobsCount: dashboard.profitability.lossJobsCount,
    overdueReceivableCents: dashboard.receivables.overdueCents,
    growthJobsRequired,
    growthStatus,
    profitableJobsCount,
    summary,
    sourceTrace: dashboard.sourceTrace,
    note: 'Use only these FIN/CASH/JPE/GROWTH figures. Incomplete/unavailable is not zero. Never invent invoices, payments, or profit.',
  };
}
