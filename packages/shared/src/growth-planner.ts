/**
 * GROWTH-001 — Growth Planner (shared types + pure planning math).
 *
 * Works backwards from FIN-004 revenue targets using FIN-002 average ticket,
 * quote/lead conversion when reliable, and capacity signals when available.
 * Planning estimates only — never alters financial truth or FIN-004 plans.
 * No Growth Planner job/tech hiring automation. No AURA agent behaviour.
 */

import { canViewBudgetControl } from './budget-control.js';
import {
  countQuotesAwaitingCustomerApproval,
  countQuotesFollowUpDue,
  type DashboardQuoteMetricRow,
} from './dashboard-quote-metrics.js';
import { ownerFinancialTodayDate } from './owner-financial-command.js';
import { safeAnalyticsCents } from './profit-analytics.js';
import { SAI_DEFAULT_MIN_CONVERSION_SAMPLE } from './sales-analytics-intelligence.js';

export type GrowthPlannerDataQuality = 'VERIFIED' | 'PROVISIONAL' | 'INCOMPLETE';

export type GrowthPlannerStatus =
  | 'ON_TRACK'
  | 'AT_RISK'
  | 'OFF_TRACK'
  | 'INSUFFICIENT_DATA'
  | 'NOT_CONFIGURED';

export type GrowthCapacityState =
  | 'ON_TRACK'
  | 'CAPACITY_RISK'
  | 'CAPACITY_SHORTFALL'
  | 'UNKNOWN';

export type GrowthGapKind =
  | 'insufficient_booked_work'
  | 'insufficient_labour_capacity'
  | 'low_average_ticket'
  | 'poor_quote_conversion'
  | 'incomplete_data'
  | 'none';

export type GrowthTicketScenario = {
  averageTicketCents: number;
  jobsRequired: number | null;
  label: string;
};

export type GrowthPlannerAssumption = {
  key: string;
  statement: string;
};

export type GrowthPlannerPlan = {
  planMonth: string;
  currency: string;
  configured: boolean;
  status: GrowthPlannerStatus;
  statusDrivers: string[];
  biggestGap: GrowthGapKind;
  dataQuality: GrowthPlannerDataQuality;
  qualityNote: string;

  goal: {
    revenueTargetCents: number | null;
    actualRevenueCents: number;
    remainingCents: number | null;
    percentAchieved: number | null;
    workingDaysRemaining: number;
    workingDaysElapsed: number;
    workingDaysInMonth: number;
    calendarDaysRemaining: number;
  };

  requiredOutput: {
    averageTicketCents: number | null;
    averageTicketSampleSize: number;
    averageTicketQuality: GrowthPlannerDataQuality;
    jobsRequired: number | null;
    jobsPerDayRequired: number | null;
    jobsPerWeekRequired: number | null;
    scenarios: GrowthTicketScenario[];
  };

  pipeline: {
    quoteAcceptanceRatePercent: number | null;
    quoteSampleSize: number;
    quotesRequired: number | null;
    quotesAvailable: boolean;
    openQuotesAwaitingApproval: number;
    followUpsDue: number;
    leadConversionRatePercent: number | null;
    leadsRequired: number | null;
    leadsAvailable: boolean;
    leadsNote: string | null;
  };

  capacity: {
    state: GrowthCapacityState;
    requiredJobsPerDay: number | null;
    knownCapacityPerDay: number | null;
    gapJobsPerDay: number | null;
    activeTechnicianCount: number;
    scheduledJobCount: number;
    historicalCompletedJobs: number;
    capacityNote: string;
  };

  guardrails: {
    grossMarginActualPct: number | null;
    grossMarginTargetPct: number | null;
    marginStatus: 'ON_TARGET' | 'BELOW_TARGET' | 'NOT_CONFIGURED';
    operatingProfitActualCents: number;
    operatingProfitTargetCents: number | null;
    overheadActualCents: number;
    overheadBudgetCents: number | null;
    overheadStatus: 'ON_BUDGET' | 'OVER_BUDGET' | 'NOT_CONFIGURED';
    revenuePaceOk: boolean;
    financiallyAtRisk: boolean;
  };

  levers: Array<{ key: string; label: string; detail: string }>;
  actionPlan: string[];
  assumptions: GrowthPlannerAssumption[];
  sourceTrace: string[];

  /** Clean contract for future AURA narration — no agent behaviour here. */
  auraSummary: {
    configured: boolean;
    status: GrowthPlannerStatus;
    narrativeSeed: string;
    jobsRequired: number | null;
    averageTicketCents: number | null;
    revenueRemainingCents: number | null;
  };
};

export function canViewGrowthPlanner(identity: {
  roleName: string;
  permissions: readonly string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') return false;
  return canViewBudgetControl(identity);
}

/** Mon–Fri working days between fromDate and toDate inclusive (UTC date strings). */
export function countWeekdaysInclusive(fromDate: string, toDate: string): number {
  if (!fromDate || !toDate || fromDate > toDate) return 0;
  const start = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);
  let count = 0;
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay(); // 0 Sun … 6 Sat
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

export function workingDaysInMonth(planMonth: string): number {
  const y = Number(planMonth.slice(0, 4));
  const m = Number(planMonth.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return countWeekdaysInclusive(`${planMonth.slice(0, 7)}-01`, last);
}

export function workingDaysElapsed(planMonth: string, today: string): number {
  const monthStart = `${planMonth.slice(0, 7)}-01`;
  if (today < monthStart) return 0;
  const y = Number(planMonth.slice(0, 4));
  const m = Number(planMonth.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const end = today > last ? last : today;
  return countWeekdaysInclusive(monthStart, end);
}

export function workingDaysRemaining(planMonth: string, today: string): number {
  const y = Number(planMonth.slice(0, 4));
  const m = Number(planMonth.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  if (today >= last) return 0;
  const next = new Date(`${today}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const from = next.toISOString().slice(0, 10);
  if (from > last) return 0;
  return countWeekdaysInclusive(from, last);
}

export function calendarDaysRemaining(planMonth: string, today: string): number {
  const y = Number(planMonth.slice(0, 4));
  const m = Number(planMonth.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  if (today >= last) return 0;
  const t = new Date(`${today}T00:00:00.000Z`);
  const e = new Date(`${last}T00:00:00.000Z`);
  return Math.round((e.getTime() - t.getTime()) / 86_400_000);
}

export function computeRevenueRemaining(
  targetCents: number | null,
  actualCents: number,
): number | null {
  if (targetCents == null) return null;
  return safeAnalyticsCents(targetCents) - safeAnalyticsCents(actualCents);
}

export function percentAchieved(actualCents: number, targetCents: number | null): number | null {
  if (targetCents == null) return null;
  const t = safeAnalyticsCents(targetCents);
  if (t === 0) return null;
  return Math.round((safeAnalyticsCents(actualCents) / t) * 10000) / 100;
}

export function computeAverageTicketCents(
  jobs: ReadonlyArray<{ revenueCents: number; dataQuality: string }>,
  minSample = 5,
): {
  averageTicketCents: number | null;
  sampleSize: number;
  quality: GrowthPlannerDataQuality;
} {
  const usable = jobs.filter(
    (j) => j.dataQuality !== 'INCOMPLETE' && safeAnalyticsCents(j.revenueCents) > 0,
  );
  const verified = usable.filter((j) => j.dataQuality === 'VERIFIED');
  const pool = verified.length >= minSample ? verified : usable;
  if (pool.length === 0) {
    return { averageTicketCents: null, sampleSize: 0, quality: 'INCOMPLETE' };
  }
  const revenue = pool.reduce((s, j) => s + safeAnalyticsCents(j.revenueCents), 0);
  const averageTicketCents = Math.round(revenue / pool.length);
  let quality: GrowthPlannerDataQuality = 'PROVISIONAL';
  if (verified.length >= minSample && pool === verified) quality = 'VERIFIED';
  if (pool.length < minSample) quality = 'INCOMPLETE';
  return { averageTicketCents, sampleSize: pool.length, quality };
}

export function jobsRequiredFromTicket(
  remainingCents: number | null,
  averageTicketCents: number | null,
): number | null {
  if (remainingCents == null) return null;
  if (remainingCents <= 0) return 0;
  if (averageTicketCents == null || averageTicketCents <= 0) return null;
  return Math.ceil(remainingCents / averageTicketCents);
}

export function jobsPerDayRequired(
  jobsRequired: number | null,
  workingDaysRemainingCount: number,
): number | null {
  if (jobsRequired == null) return null;
  if (jobsRequired <= 0) return 0;
  if (workingDaysRemainingCount <= 0) return null;
  return Math.round((jobsRequired / workingDaysRemainingCount) * 100) / 100;
}

export function jobsPerWeekRequired(jobsPerDay: number | null): number | null {
  if (jobsPerDay == null) return null;
  return Math.round(jobsPerDay * 5 * 100) / 100; // Mon–Fri week
}

export function buildTicketScenarios(
  remainingCents: number | null,
  baseTicketCents: number | null,
): GrowthTicketScenario[] {
  if (remainingCents == null || remainingCents <= 0) {
    return [];
  }
  const bases =
    baseTicketCents != null && baseTicketCents > 0
      ? [
          Math.round(baseTicketCents * 0.75),
          baseTicketCents,
          Math.round(baseTicketCents * 1.25),
        ]
      : [300_000, 400_000, 500_000];
  const unique = [...new Set(bases.filter((b) => b > 0))];
  return unique.map((ticket) => ({
    averageTicketCents: ticket,
    jobsRequired: jobsRequiredFromTicket(remainingCents, ticket),
    label: `At ${ticket}c average ticket`,
  }));
}

export function quotesRequiredFromConversion(
  jobsRequired: number | null,
  acceptanceRatePercent: number | null,
): number | null {
  if (jobsRequired == null) return null;
  if (jobsRequired <= 0) return 0;
  if (acceptanceRatePercent == null || acceptanceRatePercent <= 0) return null;
  return Math.ceil(jobsRequired / (acceptanceRatePercent / 100));
}

export function leadsRequiredFromConversion(
  jobsRequired: number | null,
  leadConversionRatePercent: number | null,
): number | null {
  if (jobsRequired == null) return null;
  if (jobsRequired <= 0) return 0;
  if (leadConversionRatePercent == null || leadConversionRatePercent <= 0) return null;
  return Math.ceil(jobsRequired / (leadConversionRatePercent / 100));
}

export function quoteAcceptanceRate(
  quotesSent: number,
  quotesAccepted: number,
  minSample = SAI_DEFAULT_MIN_CONVERSION_SAMPLE,
): { ratePercent: number | null; available: boolean } {
  if (quotesSent < minSample) return { ratePercent: null, available: false };
  return {
    ratePercent: Math.round((quotesAccepted / quotesSent) * 10000) / 100,
    available: true,
  };
}

export function assessCapacity(input: {
  requiredJobsPerDay: number | null;
  knownCapacityPerDay: number | null;
}): {
  state: GrowthCapacityState;
  gapJobsPerDay: number | null;
} {
  if (input.requiredJobsPerDay == null || input.knownCapacityPerDay == null) {
    return { state: 'UNKNOWN', gapJobsPerDay: null };
  }
  const gap =
    Math.round((input.requiredJobsPerDay - input.knownCapacityPerDay) * 100) / 100;
  if (gap <= 0) return { state: 'ON_TRACK', gapJobsPerDay: gap };
  if (gap <= input.knownCapacityPerDay * 0.25 || gap <= 1) {
    return { state: 'CAPACITY_RISK', gapJobsPerDay: gap };
  }
  return { state: 'CAPACITY_SHORTFALL', gapJobsPerDay: gap };
}

export function deriveKnownCapacityPerDay(input: {
  historicalCompletedJobs: number;
  historicalWorkingDays: number;
  minSample?: number;
}): number | null {
  const min = input.minSample ?? 10;
  if (input.historicalCompletedJobs < min || input.historicalWorkingDays <= 0) return null;
  return Math.round((input.historicalCompletedJobs / input.historicalWorkingDays) * 100) / 100;
}

export function resolveGrowthStatus(input: {
  configured: boolean;
  percentAchieved: number | null;
  workingDaysElapsed: number;
  workingDaysInMonth: number;
  marginBelowTarget: boolean;
  overheadOverBudget: boolean;
  operatingProfitBehind: boolean;
  capacityState: GrowthCapacityState;
  jobsRequired: number | null;
  averageTicketAvailable: boolean;
}): { status: GrowthPlannerStatus; drivers: string[]; biggestGap: GrowthGapKind; financiallyAtRisk: boolean } {
  if (!input.configured) {
    return {
      status: 'NOT_CONFIGURED',
      drivers: ['No FIN-004 revenue target configured'],
      biggestGap: 'incomplete_data',
      financiallyAtRisk: false,
    };
  }
  if (!input.averageTicketAvailable || input.jobsRequired == null) {
    return {
      status: 'INSUFFICIENT_DATA',
      drivers: ['Average ticket or jobs-required unavailable'],
      biggestGap: 'incomplete_data',
      financiallyAtRisk: false,
    };
  }

  const drivers: string[] = [];
  let biggestGap: GrowthGapKind = 'none';
  const elapsedPct =
    input.workingDaysInMonth > 0
      ? (input.workingDaysElapsed / input.workingDaysInMonth) * 100
      : 0;
  const achieved = input.percentAchieved ?? 0;
  let revenuePaceOk = true;
  let status: GrowthPlannerStatus = 'ON_TRACK';

  if (elapsedPct > 0 && achieved < elapsedPct * 0.7) {
    status = 'OFF_TRACK';
    revenuePaceOk = false;
    drivers.push('Revenue pace well behind elapsed working days');
    biggestGap = 'insufficient_booked_work';
  } else if (elapsedPct > 0 && achieved < elapsedPct * 0.9) {
    status = 'AT_RISK';
    revenuePaceOk = false;
    drivers.push('Revenue pace slightly behind elapsed working days');
    biggestGap = 'insufficient_booked_work';
  } else {
    drivers.push('Revenue pace on track vs elapsed working days');
  }

  const financiallyAtRisk =
    input.marginBelowTarget || input.overheadOverBudget || input.operatingProfitBehind;

  if (input.marginBelowTarget) {
    drivers.push('Gross margin below FIN-004 target');
    if (status === 'ON_TRACK') status = 'AT_RISK';
    if (biggestGap === 'none') biggestGap = 'low_average_ticket';
  }
  if (input.overheadOverBudget) {
    drivers.push('Overhead above FIN-004 budget');
    if (status === 'ON_TRACK') status = 'AT_RISK';
  }
  if (input.operatingProfitBehind) {
    drivers.push('Operating profit behind target');
    if (status === 'ON_TRACK') status = 'AT_RISK';
  }

  if (input.capacityState === 'CAPACITY_SHORTFALL') {
    drivers.push('Known capacity shortfall vs required jobs/day');
    status = status === 'OFF_TRACK' ? 'OFF_TRACK' : 'AT_RISK';
    biggestGap = 'insufficient_labour_capacity';
  } else if (input.capacityState === 'CAPACITY_RISK') {
    drivers.push('Capacity risk vs required jobs/day');
    if (status === 'ON_TRACK') status = 'AT_RISK';
  } else if (input.capacityState === 'UNKNOWN') {
    drivers.push('Capacity unknown — insufficient historical completion sample');
  }

  // Revenue on track + margin miss remains financially at risk
  if (revenuePaceOk && financiallyAtRisk && status === 'ON_TRACK') {
    status = 'AT_RISK';
  }

  return { status, drivers, biggestGap, financiallyAtRisk };
}

export function buildGrowthLevers(input: {
  jobsRequired: number | null;
  jobsPerDayRequired: number | null;
  averageTicketCents: number | null;
  quoteAcceptanceRatePercent: number | null;
  followUpsDue: number;
  capacityState: GrowthCapacityState;
}): Array<{ key: string; label: string; detail: string }> {
  const levers: Array<{ key: string; label: string; detail: string }> = [];
  if (input.jobsRequired != null && input.jobsRequired > 0) {
    levers.push({
      key: 'more_jobs',
      label: 'More jobs',
      detail: `About ${input.jobsRequired} additional job(s) at current average ticket; ~${input.jobsPerDayRequired ?? '—'} per working day.`,
    });
  }
  if (input.averageTicketCents != null) {
    levers.push({
      key: 'higher_ticket',
      label: 'Higher average ticket',
      detail: `Current planning ticket ${(input.averageTicketCents / 100).toFixed(2)} — higher ticket reduces jobs required (see scenarios).`,
    });
  }
  if (input.quoteAcceptanceRatePercent != null) {
    levers.push({
      key: 'higher_conversion',
      label: 'Higher quote conversion',
      detail: `Current acceptance rate ${input.quoteAcceptanceRatePercent}% — improving conversion reduces quotes/leads needed.`,
    });
  }
  if (input.followUpsDue > 0) {
    levers.push({
      key: 'faster_follow_up',
      label: 'Faster follow-up',
      detail: `${input.followUpsDue} quote follow-up(s) currently due.`,
    });
  }
  if (
    input.capacityState === 'CAPACITY_RISK' ||
    input.capacityState === 'CAPACITY_SHORTFALL'
  ) {
    levers.push({
      key: 'additional_capacity',
      label: 'Additional capacity',
      detail: 'Known completion capacity is below required jobs/day — do not auto-hire; validate labour availability.',
    });
  }
  return levers;
}

export function buildActionPlanLines(input: {
  remainingCents: number | null;
  jobsRequired: number | null;
  workingDaysRemaining: number;
  jobsPerDayRequired: number | null;
  quotesRequired: number | null;
  leadsRequired: number | null;
  leadsNote: string | null;
  marginStatus: string;
  capacityState: GrowthCapacityState;
  currency: string;
}): string[] {
  const lines: string[] = ['This month (planning estimate — not accounting truth):'];
  if (input.remainingCents != null) {
    lines.push(`Revenue remaining: ${input.remainingCents} cents (${input.currency})`);
  }
  if (input.jobsRequired != null) lines.push(`Jobs required: ${input.jobsRequired}`);
  lines.push(`Working days remaining (Mon–Fri): ${input.workingDaysRemaining}`);
  if (input.jobsPerDayRequired != null) {
    lines.push(`Daily requirement: ${input.jobsPerDayRequired} jobs/day`);
  }
  if (input.quotesRequired != null) {
    lines.push(`Quotes required: ${input.quotesRequired}`);
  } else {
    lines.push('Quotes required: unavailable — insufficient conversion history');
  }
  if (input.leadsRequired != null) {
    lines.push(`Leads required: ${input.leadsRequired}`);
  } else {
    lines.push(
      input.leadsNote ??
        'Lead requirement unavailable — insufficient conversion history.',
    );
  }
  lines.push(`Margin status: ${input.marginStatus.toLowerCase().replace(/_/g, ' ')}`);
  lines.push(`Capacity: ${input.capacityState.toLowerCase().replace(/_/g, ' ')}`);
  return lines;
}

export function buildNotConfiguredPlan(planMonth: string, currency = 'ZAR'): GrowthPlannerPlan {
  return {
    planMonth,
    currency,
    configured: false,
    status: 'NOT_CONFIGURED',
    statusDrivers: ['Growth plan not configured — set a FIN-004 revenue target'],
    biggestGap: 'incomplete_data',
    dataQuality: 'INCOMPLETE',
    qualityNote: 'Growth plan not configured',
    goal: {
      revenueTargetCents: null,
      actualRevenueCents: 0,
      remainingCents: null,
      percentAchieved: null,
      workingDaysRemaining: 0,
      workingDaysElapsed: 0,
      workingDaysInMonth: workingDaysInMonth(planMonth),
      calendarDaysRemaining: 0,
    },
    requiredOutput: {
      averageTicketCents: null,
      averageTicketSampleSize: 0,
      averageTicketQuality: 'INCOMPLETE',
      jobsRequired: null,
      jobsPerDayRequired: null,
      jobsPerWeekRequired: null,
      scenarios: [],
    },
    pipeline: {
      quoteAcceptanceRatePercent: null,
      quoteSampleSize: 0,
      quotesRequired: null,
      quotesAvailable: false,
      openQuotesAwaitingApproval: 0,
      followUpsDue: 0,
      leadConversionRatePercent: null,
      leadsRequired: null,
      leadsAvailable: false,
      leadsNote: 'Lead requirement unavailable — growth plan not configured.',
    },
    capacity: {
      state: 'UNKNOWN',
      requiredJobsPerDay: null,
      knownCapacityPerDay: null,
      gapJobsPerDay: null,
      activeTechnicianCount: 0,
      scheduledJobCount: 0,
      historicalCompletedJobs: 0,
      capacityNote: 'Capacity not assessed — no revenue target.',
    },
    guardrails: {
      grossMarginActualPct: null,
      grossMarginTargetPct: null,
      marginStatus: 'NOT_CONFIGURED',
      operatingProfitActualCents: 0,
      operatingProfitTargetCents: null,
      overheadActualCents: 0,
      overheadBudgetCents: null,
      overheadStatus: 'NOT_CONFIGURED',
      revenuePaceOk: false,
      financiallyAtRisk: false,
    },
    levers: [],
    actionPlan: ['Growth plan not configured — set this month’s revenue target in Budget Control.'],
    assumptions: [
      {
        key: 'target_source',
        statement: 'Requires FIN-004 monthly revenue target; no invented target.',
      },
    ],
    sourceTrace: ['finance_monthly_plan'],
    auraSummary: {
      configured: false,
      status: 'NOT_CONFIGURED',
      narrativeSeed:
        'Growth plan not configured. Set a FIN-004 revenue target before planning jobs, quotes, or leads.',
      jobsRequired: null,
      averageTicketCents: null,
      revenueRemainingCents: null,
    },
  };
}

export function summarizeQuotePipeline(rows: readonly DashboardQuoteMetricRow[], now = new Date()) {
  return {
    openQuotesAwaitingApproval: countQuotesAwaitingCustomerApproval(rows, { now }),
    followUpsDue: countQuotesFollowUpDue(rows, { now }),
  };
}

export function isQuoteSentStatus(status: string, issuedAt: string | null): boolean {
  if (issuedAt) return true;
  return ['sent', 'viewed', 'accepted', 'declined', 'expired', 'converted'].includes(status);
}

export function isQuoteAcceptedStatus(status: string): boolean {
  return status === 'accepted' || status === 'converted';
}

export { SAI_DEFAULT_MIN_CONVERSION_SAMPLE };

export function buildAuraNarrativeSeed(input: {
  configured: boolean;
  status: GrowthPlannerStatus;
  jobsRequired: number | null;
  averageTicketCents: number | null;
  remainingCents: number | null;
}): string {
  if (!input.configured) {
    return 'Growth plan not configured. Set a FIN-004 revenue target before planning operational output.';
  }
  if (input.jobsRequired == null || input.averageTicketCents == null) {
    return 'Insufficient average-ticket history to estimate jobs required for the remaining revenue target.';
  }
  if (input.jobsRequired === 0) {
    return 'Revenue target already met or exceeded on known actuals — focus on margin and operating-profit guardrails.';
  }
  return `To hit this month’s target, approximately ${input.jobsRequired} additional job(s) are needed at the current average ticket of ${input.averageTicketCents} cents (revenue remaining ${input.remainingCents ?? 0} cents). Status: ${input.status}.`;
}

export function todayUtc(now: Date = new Date()): string {
  return ownerFinancialTodayDate(now);
}
