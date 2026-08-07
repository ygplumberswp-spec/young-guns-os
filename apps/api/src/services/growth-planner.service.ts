/**
 * GROWTH-001 — Growth Planner service.
 *
 * Composes FIN-004 targets + FIN-002 tickets + quotes/leads/capacity signals.
 * Planning estimates only — never mutates FIN-004 plans or financial truth.
 */

import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import { jobs, quotes } from '@titan/db';
import type { GrowthPlannerPlan } from '@titan/shared';
import {
  assessCapacity,
  buildActionPlanLines,
  buildAuraNarrativeSeed,
  buildGrowthLevers,
  buildNotConfiguredPlan,
  buildTicketScenarios,
  canViewGrowthPlanner,
  computeAverageTicketCents,
  computeRevenueRemaining,
  deriveKnownCapacityPerDay,
  isQuoteAcceptedStatus,
  isQuoteSentStatus,
  jobsPerDayRequired,
  jobsPerWeekRequired,
  jobsRequiredFromTicket,
  leadsRequiredFromConversion,
  percentAchieved,
  quoteAcceptanceRate,
  quotesRequiredFromConversion,
  resolveGrowthStatus,
  summarizeQuotePipeline,
  todayUtc,
  workingDaysElapsed,
  workingDaysInMonth,
  workingDaysRemaining,
  calendarDaysRemaining,
  countWeekdaysInclusive,
  SAI_DEFAULT_MIN_CONVERSION_SAMPLE,
} from '@titan/shared';
import type { BudgetControlService } from './budget-control.service.js';
import type { ProfitAnalyticsService } from './profit-analytics.service.js';
import type { LeadsService } from './leads.service.js';
import type { SchedulingService } from './scheduling.service.js';

export class GrowthPlannerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GrowthPlannerError';
  }
}

export type GrowthPlannerActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export class GrowthPlannerService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly budgetControlService: BudgetControlService,
    private readonly profitAnalyticsService: ProfitAnalyticsService,
    private readonly leadsService: LeadsService,
    private readonly schedulingService: SchedulingService,
  ) {}

  private assertView(actor: GrowthPlannerActor): void {
    if (!canViewGrowthPlanner(actor)) {
      throw new GrowthPlannerError(
        'FORBIDDEN',
        'Growth planner requires finance access. Technician and Client are blocked.',
      );
    }
  }

  async getPlan(
    actor: GrowthPlannerActor,
    monthKey?: string,
  ): Promise<GrowthPlannerPlan> {
    this.assertView(actor);
    const budgetActor = {
      companyId: actor.companyId,
      userId: actor.userId,
      roleName: actor.roleName,
      permissions: actor.permissions,
    };

    const dashboard = await this.budgetControlService.getDashboard(budgetActor, monthKey);
    const planMonth = dashboard.plan.planMonth;
    const currency = dashboard.actuals.currency;
    const today = todayUtc();

    if (!dashboard.plan.revenueTargetCents || dashboard.plan.revenueTargetCents <= 0) {
      return buildNotConfiguredPlan(planMonth, currency);
    }

    // Average ticket: look back last_month + current (FIN-002 JPE jobs)
    const [currentJobs, lastMonthJobs] = await Promise.all([
      this.profitAnalyticsService.getDashboard(budgetActor, { period: 'month' }),
      this.profitAnalyticsService.getDashboard(budgetActor, { period: 'last_month' }),
    ]);

    const ticketJobs = [
      ...currentJobs.jobs.topGrossProfit,
      ...currentJobs.jobs.lowestMargin,
      ...currentJobs.jobs.lossJobs,
      ...currentJobs.jobs.incompleteJobs,
      ...lastMonthJobs.jobs.topGrossProfit,
      ...lastMonthJobs.jobs.lowestMargin,
      ...lastMonthJobs.jobs.lossJobs,
    ];
    // Prefer loading full job list via jobs page for better sample
    const [currentAll, lastAll] = await Promise.all([
      this.profitAnalyticsService.getJobsPage(budgetActor, {
        period: 'month',
        page: 1,
        pageSize: 200,
        list: 'all',
      }),
      this.profitAnalyticsService.getJobsPage(budgetActor, {
        period: 'last_month',
        page: 1,
        pageSize: 200,
        list: 'all',
      }),
    ]);
    const allJobRows = [...currentAll.rows, ...lastAll.rows];
    // Dedupe by jobId
    const byId = new Map(allJobRows.map((j) => [j.jobId, j]));
    for (const j of ticketJobs) byId.set(j.jobId, j);

    const average = computeAverageTicketCents(
      [...byId.values()].map((j) => ({
        revenueCents: j.revenueCents,
        dataQuality: j.dataQuality,
      })),
    );

    const remainingCents = computeRevenueRemaining(
      dashboard.plan.revenueTargetCents,
      dashboard.actuals.revenueCents,
    );
    const achieved = percentAchieved(
      dashboard.actuals.revenueCents,
      dashboard.plan.revenueTargetCents,
    );
    const wdRemaining = workingDaysRemaining(planMonth, today);
    const wdElapsed = workingDaysElapsed(planMonth, today);
    const wdMonth = workingDaysInMonth(planMonth);
    const jobsRequired = jobsRequiredFromTicket(remainingCents, average.averageTicketCents);
    const perDay = jobsPerDayRequired(jobsRequired, wdRemaining);
    const perWeek = jobsPerWeekRequired(perDay);

    // Quotes
    const quoteRows = await this.db
      .select({
        status: quotes.status,
        issuedAt: quotes.issuedAt,
        validUntil: quotes.validUntil,
      })
      .from(quotes)
      .where(eq(quotes.companyId, actor.companyId))
      .orderBy(desc(quotes.updatedAt))
      .limit(2000);

    const metricRows = quoteRows.map((q) => ({
      status: q.status,
      issuedAt: q.issuedAt ? q.issuedAt.toISOString() : null,
      validUntil: q.validUntil ? q.validUntil.toISOString() : null,
    }));
    const quotesSent = quoteRows.filter((q) =>
      isQuoteSentStatus(q.status, q.issuedAt ? q.issuedAt.toISOString() : null),
    ).length;
    const quotesAccepted = quoteRows.filter((q) => isQuoteAcceptedStatus(q.status)).length;
    const acceptance = quoteAcceptanceRate(
      quotesSent,
      quotesAccepted,
      SAI_DEFAULT_MIN_CONVERSION_SAMPLE,
    );
    const quotesRequired = quotesRequiredFromConversion(
      jobsRequired,
      acceptance.ratePercent,
    );
    const pipelineCounts = summarizeQuotePipeline(metricRows);

    // Leads
    let leadConversionRatePercent: number | null = null;
    let leadsAvailable = false;
    let leadsNote: string | null =
      'Lead requirement unavailable — insufficient conversion history.';
    try {
      const pipeline = await this.leadsService.getPipelineMetrics(actor.companyId);
      if (
        pipeline.conversionRatePercent != null &&
        Number.isFinite(pipeline.conversionRatePercent) &&
        (pipeline.convertedCount ?? 0) + (pipeline.lostCount ?? 0) >=
          SAI_DEFAULT_MIN_CONVERSION_SAMPLE
      ) {
        leadConversionRatePercent = pipeline.conversionRatePercent;
        leadsAvailable = true;
        leadsNote = null;
      }
    } catch {
      leadsNote = 'Lead requirement unavailable — lead pipeline not readable.';
    }
    const leadsRequired = leadsRequiredFromConversion(jobsRequired, leadConversionRatePercent);

    // Capacity signals
    const assignees = await this.schedulingService.listAssignees(actor.companyId);
    const technicians = assignees.filter((a) => a.roleName === 'Technician');
    const schedStats = await this.schedulingService.getStats(actor.companyId);

    const lookbackFrom = new Date();
    lookbackFrom.setUTCDate(lookbackFrom.getUTCDate() - 60);
    const [completedRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(
        and(
          eq(jobs.companyId, actor.companyId),
          eq(jobs.status, 'completed'),
          gte(jobs.updatedAt, lookbackFrom),
        ),
      );
    const historicalCompletedJobs = completedRow?.count ?? 0;
    const histFrom = lookbackFrom.toISOString().slice(0, 10);
    const histDays = countWeekdaysInclusive(histFrom, today);
    const knownCapacityPerDay = deriveKnownCapacityPerDay({
      historicalCompletedJobs,
      historicalWorkingDays: histDays,
    });
    const capacity = assessCapacity({
      requiredJobsPerDay: perDay,
      knownCapacityPerDay,
    });

    const marginBelow =
      dashboard.plan.grossMarginTargetPct != null &&
      dashboard.actuals.grossMarginPct != null &&
      dashboard.actuals.grossMarginPct < dashboard.plan.grossMarginTargetPct;
    const overheadOver =
      dashboard.plan.overheadBudgetCents != null &&
      dashboard.actuals.knownOverheadCents > dashboard.plan.overheadBudgetCents;
    const opBehind =
      dashboard.plan.operatingProfitTargetCents != null &&
      dashboard.actuals.knownOperatingProfitCents <
        dashboard.plan.operatingProfitTargetCents *
          Math.max(0.01, wdElapsed / Math.max(1, wdMonth));

    const status = resolveGrowthStatus({
      configured: true,
      percentAchieved: achieved,
      workingDaysElapsed: wdElapsed,
      workingDaysInMonth: wdMonth,
      marginBelowTarget: marginBelow,
      overheadOverBudget: overheadOver,
      operatingProfitBehind: opBehind,
      capacityState: capacity.state,
      jobsRequired,
      averageTicketAvailable: average.averageTicketCents != null,
    });

    let dataQuality: 'VERIFIED' | 'PROVISIONAL' | 'INCOMPLETE' = average.quality;
    if (!acceptance.available || !leadsAvailable || capacity.state === 'UNKNOWN') {
      dataQuality = dataQuality === 'INCOMPLETE' ? 'INCOMPLETE' : 'PROVISIONAL';
    }

    const assumptions = [
      {
        key: 'revenue_target',
        statement: `FIN-004 revenue target ${dashboard.plan.revenueTargetCents} cents for ${planMonth}.`,
      },
      {
        key: 'actual_revenue',
        statement: `Actual economic revenue ${dashboard.actuals.revenueCents} cents from FIN-003/JPE.`,
      },
      {
        key: 'average_ticket',
        statement:
          average.averageTicketCents == null
            ? 'Average ticket unavailable — insufficient financially usable jobs.'
            : `Average ticket ${average.averageTicketCents} cents from ${average.sampleSize} financially usable JPE jobs (incomplete excluded from confident pool).`,
      },
      {
        key: 'working_days',
        statement: `Working days are Mon–Fri calendar weekdays (no holiday calendar). Remaining ${wdRemaining} of ${wdMonth}.`,
      },
      {
        key: 'quote_conversion',
        statement: acceptance.available
          ? `Quote acceptance ${acceptance.ratePercent}% from ${quotesSent} sent / ${quotesAccepted} accepted (min sample ${SAI_DEFAULT_MIN_CONVERSION_SAMPLE}).`
          : `Quote conversion unavailable — sent sample ${quotesSent} < ${SAI_DEFAULT_MIN_CONVERSION_SAMPLE}.`,
      },
      {
        key: 'capacity',
        statement:
          knownCapacityPerDay == null
            ? `Capacity UNKNOWN — completed jobs in 60d lookback ${historicalCompletedJobs} below minimum sample.`
            : `Known capacity ~${knownCapacityPerDay} completed jobs/working day from ${historicalCompletedJobs} completions over ${histDays} weekdays.`,
      },
    ];

    const levers = buildGrowthLevers({
      jobsRequired,
      jobsPerDayRequired: perDay,
      averageTicketCents: average.averageTicketCents,
      quoteAcceptanceRatePercent: acceptance.ratePercent,
      followUpsDue: pipelineCounts.followUpsDue,
      capacityState: capacity.state,
    });

    const actionPlan = buildActionPlanLines({
      remainingCents,
      jobsRequired,
      workingDaysRemaining: wdRemaining,
      jobsPerDayRequired: perDay,
      quotesRequired,
      leadsRequired,
      leadsNote,
      marginStatus: marginBelow
        ? 'BELOW_TARGET'
        : dashboard.plan.grossMarginTargetPct == null
          ? 'NOT_CONFIGURED'
          : 'ON_TARGET',
      capacityState: capacity.state,
      currency,
    });

    const narrativeSeed = buildAuraNarrativeSeed({
      configured: true,
      status: status.status,
      jobsRequired,
      averageTicketCents: average.averageTicketCents,
      remainingCents,
    });

    return {
      planMonth,
      currency,
      configured: true,
      status: status.status,
      statusDrivers: status.drivers,
      biggestGap: status.biggestGap,
      dataQuality,
      qualityNote: `Growth planning ${dataQuality}: ${status.drivers.join('; ')}`,
      goal: {
        revenueTargetCents: dashboard.plan.revenueTargetCents,
        actualRevenueCents: dashboard.actuals.revenueCents,
        remainingCents,
        percentAchieved: achieved,
        workingDaysRemaining: wdRemaining,
        workingDaysElapsed: wdElapsed,
        workingDaysInMonth: wdMonth,
        calendarDaysRemaining: calendarDaysRemaining(planMonth, today),
      },
      requiredOutput: {
        averageTicketCents: average.averageTicketCents,
        averageTicketSampleSize: average.sampleSize,
        averageTicketQuality: average.quality,
        jobsRequired,
        jobsPerDayRequired: perDay,
        jobsPerWeekRequired: perWeek,
        scenarios: buildTicketScenarios(remainingCents, average.averageTicketCents),
      },
      pipeline: {
        quoteAcceptanceRatePercent: acceptance.ratePercent,
        quoteSampleSize: quotesSent,
        quotesRequired,
        quotesAvailable: acceptance.available,
        openQuotesAwaitingApproval: pipelineCounts.openQuotesAwaitingApproval,
        followUpsDue: pipelineCounts.followUpsDue,
        leadConversionRatePercent,
        leadsRequired,
        leadsAvailable,
        leadsNote,
      },
      capacity: {
        state: capacity.state,
        requiredJobsPerDay: perDay,
        knownCapacityPerDay,
        gapJobsPerDay: capacity.gapJobsPerDay,
        activeTechnicianCount: technicians.length,
        scheduledJobCount: schedStats.scheduledCount,
        historicalCompletedJobs,
        capacityNote:
          knownCapacityPerDay == null
            ? 'No invented productivity — capacity remains UNKNOWN until enough completed-job history exists.'
            : `Historical completion pace used as known capacity (not a hiring recommendation).`,
      },
      guardrails: {
        grossMarginActualPct: dashboard.actuals.grossMarginPct,
        grossMarginTargetPct: dashboard.plan.grossMarginTargetPct,
        marginStatus: dashboard.plan.grossMarginTargetPct == null
          ? 'NOT_CONFIGURED'
          : marginBelow
            ? 'BELOW_TARGET'
            : 'ON_TARGET',
        operatingProfitActualCents: dashboard.actuals.knownOperatingProfitCents,
        operatingProfitTargetCents: dashboard.plan.operatingProfitTargetCents,
        overheadActualCents: dashboard.actuals.knownOverheadCents,
        overheadBudgetCents: dashboard.plan.overheadBudgetCents,
        overheadStatus:
          dashboard.plan.overheadBudgetCents == null
            ? 'NOT_CONFIGURED'
            : overheadOver
              ? 'OVER_BUDGET'
              : 'ON_BUDGET',
        revenuePaceOk: !status.drivers.some((d) => d.toLowerCase().includes('behind')),
        financiallyAtRisk: status.financiallyAtRisk,
      },
      levers,
      actionPlan,
      assumptions,
      sourceTrace: [
        'finance_monthly_plan',
        'operating_profit',
        'jpe_snapshot',
        'quotes',
        'leads_pipeline',
        'scheduling_stats',
      ],
      auraSummary: {
        configured: true,
        status: status.status,
        narrativeSeed,
        jobsRequired,
        averageTicketCents: average.averageTicketCents,
        revenueRemainingCents: remainingCents,
      },
    };
  }

  async getScenarios(
    actor: GrowthPlannerActor,
    monthKey?: string,
  ): Promise<{
    scenarios: GrowthPlannerPlan['requiredOutput']['scenarios'];
    assumptions: GrowthPlannerPlan['assumptions'];
  }> {
    const plan = await this.getPlan(actor, monthKey);
    return { scenarios: plan.requiredOutput.scenarios, assumptions: plan.assumptions };
  }
}
