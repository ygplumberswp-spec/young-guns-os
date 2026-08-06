/**
 * DASH-001 — Owner Dashboard Business Heartbeat builders.
 * Pure functions over real tenant aggregates — never invent values.
 */
import type {
  ExecutiveCompletedJob,
  ExecutiveDashboardSummary,
  ExecutiveLiveJob,
  ExecutiveOutstandingInvoices,
  ExecutivePrioritiesSummary,
  ExecutiveSectionStatus,
  ExecutiveTodayAtAGlance,
  ExecutiveXeroFinance,
} from './dashboard-executive.js';

export type DashboardFreshnessLabel =
  | 'Live'
  | 'Updated recently'
  | 'Waiting for latest provider data'
  | 'Some earlier records are still being imported'
  | 'Based on approved financial records'
  | 'Payment confirmation pending';

export type DashboardTrendDirection = 'up' | 'down' | 'flat' | 'unknown';

export type BusinessHeartbeatMetric = {
  key: string;
  label: string;
  value: string;
  rawValue: number | null;
  href: string | null;
  comparisonLabel: string | null;
  trend: DashboardTrendDirection;
  freshness: DashboardFreshnessLabel;
  estimate: boolean;
  unavailable: boolean;
};

export type BusinessHeartbeatSummary = {
  metrics: BusinessHeartbeatMetric[];
  freshness: DashboardFreshnessLabel;
  sectionStatus: ExecutiveSectionStatus | null;
};

export type FinancialTruthLine = {
  key: string;
  label: string;
  amountCents: number;
  currency: string;
  caption: string;
  estimate: boolean;
  href: string | null;
};

export type FinancialTruthSummary = {
  currency: string;
  freshness: DashboardFreshnessLabel;
  currentMonth: FinancialTruthLine[];
  previousMonthComparison: FinancialTruthLine[];
  yearToDate: FinancialTruthLine[];
  accountingNotes: string[];
  yocoPaidSeparateFromReconciled: boolean;
  sectionStatus: ExecutiveSectionStatus | null;
};

export type AttentionPriority = 'critical' | 'attention' | 'opportunity' | 'informational';

export type AttentionItem = {
  id: string;
  priority: AttentionPriority;
  category: string;
  title: string;
  customerName: string | null;
  amountCents: number | null;
  currency: string;
  ageLabel: string | null;
  reason: string;
  recommendedAction: string;
  href: string;
  draftActionAvailable: boolean;
};

export type AttentionRequiredSummary = {
  items: AttentionItem[];
  criticalCount: number;
  attentionCount: number;
  opportunityCount: number;
};

export type TeamPerformanceMember = {
  userId: string;
  name: string;
  statusLabel: string;
  jobsAssigned: number;
  jobsCompleted: number;
  averageDurationMinutes: number | null;
  isDelayed: boolean;
  href: string;
};

export type TeamPerformanceSummary = {
  techniciansWorkingToday: number;
  jobsAssigned: number;
  jobsCompleted: number;
  averageJobDurationMinutes: number | null;
  unassignedJobs: number;
  members: TeamPerformanceMember[];
  freshness: DashboardFreshnessLabel;
};

export type SalesOpportunityItem = {
  id: string;
  type: 'lead' | 'quote' | 'maintenance' | 'follow_up';
  title: string;
  customerName: string | null;
  amountCents: number | null;
  currency: string;
  ageLabel: string | null;
  href: string;
};

export type SalesOpportunitiesSummary = {
  newLeads: number;
  uncontactedLeads: number;
  quotesAwaitingApproval: number;
  followUpsDue: number;
  items: SalesOpportunityItem[];
};

export type AuraExecutiveRecommendation = {
  id: string;
  title: string;
  reason: string;
  source: string;
  businessImpact: string;
  suggestedAction: string;
  confidence: 'high' | 'medium' | 'low';
  href: string;
  draftActionAvailable: boolean;
};

export type AuraExecutiveSummary = {
  recommendations: AuraExecutiveRecommendation[];
  freshness: DashboardFreshnessLabel;
};

export type DashboardAlert = {
  id: string;
  priority: AttentionPriority;
  title: string;
  message: string;
  href: string;
  actionLabel: string;
};

export type ExecutiveHeaderExtended = {
  greetingDate: string;
  companyName: string | null;
  businessSummary: string;
  priorityCount: number;
  urgentAlertCount: number;
};

export type Dash001DashboardExtensions = {
  headerExtended: ExecutiveHeaderExtended;
  businessHeartbeat: BusinessHeartbeatSummary;
  financialTruth: FinancialTruthSummary;
  attentionRequired: AttentionRequiredSummary;
  teamPerformance: TeamPerformanceSummary;
  salesOpportunities: SalesOpportunitiesSummary;
  auraExecutive: AuraExecutiveSummary;
  alerts: DashboardAlert[];
};

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousMonthKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return monthKey(d);
}

function resolveFinanceFreshness(xero: ExecutiveXeroFinance | null | undefined): DashboardFreshnessLabel {
  if (!xero?.connected) return 'Based on approved financial records';
  if (
    xero.importStatus === 'running' ||
    xero.importStatus === 'queued' ||
    xero.importStatus === 'pending'
  ) {
    return 'Some earlier records are still being imported';
  }
  if (!xero.lastSyncAt) return 'Waiting for latest provider data';
  return 'Updated recently';
}

/** Base executive summary before DASH-001 extensions are attached. */
export type ExecutiveDashboardSummaryBase = Omit<ExecutiveDashboardSummary, 'dash001'>;

export function buildDash001Extensions(input: {
  summary: ExecutiveDashboardSummaryBase;
  companyName?: string | null;
  unassignedJobsCount?: number;
  quotesAwaitingApproval?: number;
  quotesFollowUp?: number;
  now?: Date;
}): Dash001DashboardExtensions {
  const { summary } = input;
  const now = input.now ?? new Date();
  const currency =
    summary.outstandingInvoices.currency ??
    summary.todayAtAGlance.money.currency ??
    summary.xeroFinance.currency ??
    'ZAR';
  const glance = summary.todayAtAGlance;
  const xero = summary.xeroFinance;
  const outstanding = summary.outstandingInvoices;
  const financeFreshness = resolveFinanceFreshness(xero);

  const currentMonthKey = monthKey(now);
  const prevMonthKey = previousMonthKey(now);

  const monthRevenueCents =
    xero.monthlyTurnover.find((p) => p.month === currentMonthKey)?.amountCents ?? null;
  const prevMonthRevenueCents =
    xero.monthlyTurnover.find((p) => p.month === prevMonthKey)?.amountCents ?? null;

  const monthCashCents =
    xero.paymentTrends.find((p) => p.month === currentMonthKey)?.amountCents ?? null;

  const revenueComparison =
    monthRevenueCents != null && prevMonthRevenueCents != null && prevMonthRevenueCents > 0
      ? `${Math.round(((monthRevenueCents - prevMonthRevenueCents) / prevMonthRevenueCents) * 100)}% vs last month`
      : null;

  const grossProfitEstimate =
    monthRevenueCents != null && monthCashCents != null
      ? Math.max(monthCashCents, 0)
      : null;

  const heartbeatMetrics: BusinessHeartbeatMetric[] = [
    {
      key: 'jobs_today',
      label: 'Jobs today',
      value: String(glance.jobs.scheduled + glance.jobs.inProgress),
      rawValue: glance.jobs.scheduled + glance.jobs.inProgress,
      href: '/jobs?filter=today',
      comparisonLabel: null,
      trend: 'unknown',
      freshness: 'Live',
      estimate: false,
      unavailable: summary.sections.todayAtAGlance.state === 'unavailable',
    },
    {
      key: 'active_jobs',
      label: 'Active jobs',
      value: String(glance.jobs.inProgress),
      rawValue: glance.jobs.inProgress,
      href: '/jobs?status=in_progress',
      comparisonLabel: null,
      trend: 'unknown',
      freshness: 'Live',
      estimate: false,
      unavailable: summary.sections.activeJobs.state === 'unavailable',
    },
    {
      key: 'completed_today',
      label: 'Completed today',
      value: String(glance.jobs.completed),
      rawValue: glance.jobs.completed,
      href: '/jobs?filter=completed-today',
      comparisonLabel: null,
      trend: 'unknown',
      freshness: 'Live',
      estimate: false,
      unavailable: summary.sections.completedToday.state === 'unavailable',
    },
    {
      key: 'revenue_month',
      label: 'Revenue this month',
      value: monthRevenueCents != null ? formatCurrency(monthRevenueCents, currency) : '—',
      rawValue: monthRevenueCents,
      href: '/finance/invoices',
      comparisonLabel: revenueComparison,
      trend:
        monthRevenueCents != null && prevMonthRevenueCents != null
          ? monthRevenueCents > prevMonthRevenueCents
            ? 'up'
            : monthRevenueCents < prevMonthRevenueCents
              ? 'down'
              : 'flat'
          : 'unknown',
      freshness: financeFreshness,
      estimate: monthRevenueCents == null,
      unavailable: summary.sections.money.state === 'unavailable',
    },
    {
      key: 'cash_collected',
      label: 'Cash collected this month',
      value: monthCashCents != null ? formatCurrency(monthCashCents, currency) : '—',
      rawValue: monthCashCents,
      href: '/finance/payments',
      comparisonLabel: null,
      trend: 'unknown',
      freshness: financeFreshness,
      estimate: monthCashCents == null,
      unavailable: summary.sections.money.state === 'unavailable',
    },
    {
      key: 'gross_profit',
      label: 'Estimated gross profit',
      value:
        grossProfitEstimate != null ? formatCurrency(grossProfitEstimate, currency) : '—',
      rawValue: grossProfitEstimate,
      href: '/finance-cashflow-profit',
      comparisonLabel: null,
      trend: 'unknown',
      freshness: financeFreshness,
      estimate: true,
      unavailable: summary.sections.money.state === 'unavailable',
    },
    {
      key: 'gross_margin',
      label: 'Gross margin',
      value:
        monthRevenueCents != null && grossProfitEstimate != null && monthRevenueCents > 0
          ? `${Math.round((grossProfitEstimate / monthRevenueCents) * 100)}%`
          : '—',
      rawValue:
        monthRevenueCents != null && grossProfitEstimate != null && monthRevenueCents > 0
          ? Math.round((grossProfitEstimate / monthRevenueCents) * 100)
          : null,
      href: '/finance-cashflow-profit',
      comparisonLabel: null,
      trend: 'unknown',
      freshness: financeFreshness,
      estimate: true,
      unavailable: summary.sections.money.state === 'unavailable',
    },
    {
      key: 'outstanding',
      label: 'Outstanding invoices',
      value: formatCurrency(outstanding.outstandingCents, currency),
      rawValue: outstanding.outstandingCents,
      href: '/finance/invoices?filter=outstanding',
      comparisonLabel: null,
      trend: 'unknown',
      freshness: financeFreshness,
      estimate: false,
      unavailable: summary.sections.outstandingInvoices.state === 'unavailable',
    },
    {
      key: 'overdue',
      label: 'Overdue invoices',
      value: String(outstanding.overdueCount),
      rawValue: outstanding.overdueCount,
      href: '/finance/invoices?filter=overdue',
      comparisonLabel: outstanding.overdueCents > 0 ? formatCurrency(outstanding.overdueCents, currency) : null,
      trend: 'unknown',
      freshness: financeFreshness,
      estimate: false,
      unavailable: summary.sections.outstandingInvoices.state === 'unavailable',
    },
    {
      key: 'quotes_pipeline',
      label: 'Quotes awaiting approval',
      value: String(input.quotesAwaitingApproval ?? xero.quotePipelineCount ?? 0),
      rawValue: input.quotesAwaitingApproval ?? xero.quotePipelineCount ?? 0,
      href: '/finance/quotes',
      comparisonLabel: null,
      trend: 'unknown',
      freshness: financeFreshness,
      estimate: false,
      unavailable: false,
    },
    {
      key: 'quotes_follow_up',
      label: 'Quotes requiring follow-up',
      value: String(input.quotesFollowUp ?? 0),
      rawValue: input.quotesFollowUp ?? 0,
      href: '/finance/quotes?filter=follow-up',
      comparisonLabel: null,
      trend: 'unknown',
      freshness: financeFreshness,
      estimate: false,
      unavailable: false,
    },
    {
      key: 'leads_action',
      label: 'Leads requiring action',
      value: String(glance.customerActivity.leads),
      rawValue: glance.customerActivity.leads,
      href: '/crm/leads',
      comparisonLabel: null,
      trend: 'unknown',
      freshness: 'Live',
      estimate: false,
      unavailable: summary.sections.customerActivity.state === 'unavailable',
    },
  ];

  const financialTruth: FinancialTruthSummary = {
    currency,
    freshness: financeFreshness,
    currentMonth: [
      {
        key: 'invoiced',
        label: 'Invoiced revenue',
        amountCents: monthRevenueCents ?? 0,
        currency,
        caption: 'Invoice issued ≠ cash collected',
        estimate: monthRevenueCents == null,
        href: '/finance/invoices',
      },
      {
        key: 'collected',
        label: 'Collected cash',
        amountCents: monthCashCents ?? 0,
        currency,
        caption: 'Payments recorded in TITAN',
        estimate: monthCashCents == null,
        href: '/finance/payments',
      },
      {
        key: 'outstanding',
        label: 'Outstanding debtors',
        amountCents: outstanding.outstandingCents,
        currency,
        caption: 'Open invoice balances',
        estimate: false,
        href: '/finance/invoices?filter=outstanding',
      },
      {
        key: 'overdue',
        label: 'Overdue debtors',
        amountCents: outstanding.overdueCents,
        currency,
        caption: 'Past due date',
        estimate: false,
        href: '/finance/invoices?filter=overdue',
      },
      {
        key: 'gross_profit',
        label: 'Estimated gross position',
        amountCents: grossProfitEstimate ?? 0,
        currency,
        caption: 'Estimate — based on collected cash this month',
        estimate: true,
        href: '/finance-cashflow-profit',
      },
    ],
    previousMonthComparison: [
      {
        key: 'prev_revenue',
        label: 'Previous month revenue',
        amountCents: prevMonthRevenueCents ?? 0,
        currency,
        caption: prevMonthRevenueCents != null ? 'Comparable period' : 'Insufficient history',
        estimate: prevMonthRevenueCents == null,
        href: '/finance/invoices',
      },
    ],
    yearToDate: [],
    accountingNotes: [
      'Invoice issued does not mean cash collected.',
      'Yoco paid does not mean Xero reconciled.',
      'Manual bank import does not mean reconciled.',
    ],
    yocoPaidSeparateFromReconciled: true,
    sectionStatus: summary.sections.money,
  };

  const attentionItems = buildAttentionItems({
    outstanding,
    priorities: summary.priorities,
    completedToday: summary.completedToday,
    liveOperations: summary.liveOperations,
    currency,
    unassignedJobs: input.unassignedJobsCount ?? 0,
    quotesFollowUp: input.quotesFollowUp ?? 0,
  });

  const teamPerformance = buildTeamPerformance({
    teamToday: summary.teamToday,
    glance,
    liveOperations: summary.liveOperations,
    unassignedJobs: input.unassignedJobsCount ?? 0,
  });

  const salesOpportunities = buildSalesOpportunities({
    glance,
    xero,
    currency,
    quotesAwaitingApproval: input.quotesAwaitingApproval ?? xero.quotePipelineCount,
    quotesFollowUp: input.quotesFollowUp ?? glance.customerActivity.followUps,
  });

  const auraExecutive = buildAuraRecommendations({
    attentionItems,
    priorities: summary.priorities,
    outstanding,
    currency,
    unassignedJobs: input.unassignedJobsCount ?? 0,
  });

  const alerts = attentionItems
    .filter((item) => item.priority === 'critical' || item.priority === 'attention')
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      priority: item.priority,
      title: item.title,
      message: item.reason,
      href: item.href,
      actionLabel: item.recommendedAction,
    }));

  const priorityCount = summary.priorities.needsAttention + attentionItems.filter((i) => i.priority !== 'informational').length;
  const urgentAlertCount = alerts.filter((a) => a.priority === 'critical').length;

  const summaryParts: string[] = [];
  const jobsToday = glance.jobs.scheduled + glance.jobs.inProgress;
  if (jobsToday > 0) summaryParts.push(`${jobsToday} job${jobsToday === 1 ? '' : 's'} scheduled today`);
  if ((input.quotesAwaitingApproval ?? 0) > 0) {
    summaryParts.push(`${input.quotesAwaitingApproval} quote${input.quotesAwaitingApproval === 1 ? '' : 's'} awaiting approval`);
  }
  if (outstanding.outstandingCents > 0) {
    summaryParts.push(`${formatCurrency(outstanding.outstandingCents, currency)} outstanding`);
  }
  if (urgentAlertCount > 0) {
    summaryParts.push(`${urgentAlertCount} item${urgentAlertCount === 1 ? '' : 's'} need attention`);
  }

  return {
    headerExtended: {
      greetingDate: now.toLocaleDateString('en-ZA', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      companyName: input.companyName ?? null,
      businessSummary: summaryParts.length > 0 ? summaryParts.join(' · ') : 'All clear for today',
      priorityCount,
      urgentAlertCount,
    },
    businessHeartbeat: {
      metrics: heartbeatMetrics,
      freshness: financeFreshness,
      sectionStatus: summary.sections.todayAtAGlance,
    },
    financialTruth,
    attentionRequired: {
      items: attentionItems,
      criticalCount: attentionItems.filter((i) => i.priority === 'critical').length,
      attentionCount: attentionItems.filter((i) => i.priority === 'attention').length,
      opportunityCount: attentionItems.filter((i) => i.priority === 'opportunity').length,
    },
    teamPerformance,
    salesOpportunities,
    auraExecutive,
    alerts,
  };
}

function buildAttentionItems(input: {
  outstanding: ExecutiveOutstandingInvoices;
  priorities: ExecutivePrioritiesSummary;
  completedToday: ExecutiveCompletedJob[];
  liveOperations: ExecutiveLiveJob[];
  currency: string;
  unassignedJobs: number;
  quotesFollowUp: number;
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const invoice of input.outstanding.invoices.filter((row) => row.bucket === 'overdue').slice(0, 5)) {
    items.push({
      id: `overdue-${invoice.id}`,
      priority: invoice.outstandingCents >= 50_000_00 ? 'critical' : 'attention',
      category: 'Overdue invoice',
      title: invoice.invoiceNumber,
      customerName: invoice.customerName,
      amountCents: invoice.outstandingCents,
      currency: input.currency,
      ageLabel: invoice.daysOverdue != null ? `${invoice.daysOverdue} days overdue` : null,
      reason: 'Payment is past due',
      recommendedAction: 'Review invoice and follow up',
      href: `/finance/invoices/${invoice.id}`,
      draftActionAvailable: true,
    });
  }

  for (const job of input.completedToday.filter((j) => !j.invoiceStatus || j.invoiceStatus === 'draft').slice(0, 3)) {
    items.push({
      id: `uninvoiced-${job.id}`,
      priority: 'attention',
      category: 'Completed job',
      title: job.title,
      customerName: job.customerName,
      amountCents: null,
      currency: input.currency,
      ageLabel: null,
      reason: 'Job completed but not invoiced',
      recommendedAction: 'Create invoice',
      href: `/jobs/${job.id}`,
      draftActionAvailable: false,
    });
  }

  if (input.unassignedJobs > 0) {
    items.push({
      id: 'unassigned-jobs',
      priority: input.unassignedJobs >= 3 ? 'critical' : 'attention',
      category: 'Dispatch',
      title: `${input.unassignedJobs} unassigned job${input.unassignedJobs === 1 ? '' : 's'}`,
      customerName: null,
      amountCents: null,
      currency: input.currency,
      ageLabel: null,
      reason: 'Jobs scheduled without a technician',
      recommendedAction: 'Assign technician',
      href: '/scheduling',
      draftActionAvailable: false,
    });
  }

  for (const delayed of input.liveOperations.filter((j) => j.isDelayed).slice(0, 3)) {
    items.push({
      id: `delayed-${delayed.id}`,
      priority: 'attention',
      category: 'Delayed job',
      title: delayed.title,
      customerName: delayed.customerName,
      amountCents: null,
      currency: input.currency,
      ageLabel: 'Behind schedule',
      reason: 'Job is running behind its scheduled window',
      recommendedAction: 'Review dispatch',
      href: `/jobs/${delayed.id}`,
      draftActionAvailable: false,
    });
  }

  for (const plan of input.priorities.items.slice(0, 3)) {
    items.push({
      id: `priority-${plan.id}`,
      priority: plan.priority === 'high' ? 'attention' : 'informational',
      category: 'Today\'s Plan',
      title: plan.reason.slice(0, 80),
      customerName: null,
      amountCents: null,
      currency: input.currency,
      ageLabel: null,
      reason: plan.reason,
      recommendedAction: plan.suggestedAction,
      href: plan.href,
      draftActionAvailable: plan.approvalState === 'awaiting_owner',
    });
  }

  if (input.quotesFollowUp > 0) {
    items.push({
      id: 'quotes-follow-up',
      priority: 'opportunity',
      category: 'Quotes',
      title: `${input.quotesFollowUp} quote${input.quotesFollowUp === 1 ? '' : 's'} need follow-up`,
      customerName: null,
      amountCents: null,
      currency: input.currency,
      ageLabel: null,
      reason: 'Customer approval or response pending',
      recommendedAction: 'Review quotes',
      href: '/finance/quotes',
      draftActionAvailable: true,
    });
  }

  const priorityOrder: Record<AttentionPriority, number> = {
    critical: 0,
    attention: 1,
    opportunity: 2,
    informational: 3,
  };

  return items.sort((a, b) => {
    const p = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (p !== 0) return p;
    return (b.amountCents ?? 0) - (a.amountCents ?? 0);
  });
}

function buildTeamPerformance(input: {
  teamToday: ExecutiveDashboardSummary['teamToday'];
  glance: ExecutiveTodayAtAGlance;
  liveOperations: ExecutiveLiveJob[];
  unassignedJobs: number;
}): TeamPerformanceSummary {
  const members: TeamPerformanceMember[] = input.teamToday.slice(0, 8).map((member) => ({
    userId: member.userId,
    name: member.name,
    statusLabel:
      member.status === 'on_site'
        ? 'On site'
        : member.status === 'travelling'
          ? 'En route'
          : member.status === 'working'
            ? 'Working'
            : member.status === 'available'
              ? 'Available'
              : member.status === 'leave'
                ? 'On leave'
                : 'Off duty',
    jobsAssigned: member.currentTask ? 1 : 0,
    jobsCompleted: 0,
    averageDurationMinutes: null,
    isDelayed: member.isLate,
    href: `/team/${member.userId}`,
  }));

  return {
    techniciansWorkingToday: input.glance.team.onSite + input.glance.team.travelling + input.glance.team.available,
    jobsAssigned: input.liveOperations.length,
    jobsCompleted: input.glance.jobs.completed,
    averageJobDurationMinutes: null,
    unassignedJobs: input.unassignedJobs,
    members,
    freshness: 'Live',
  };
}

function buildSalesOpportunities(input: {
  glance: ExecutiveTodayAtAGlance;
  xero: ExecutiveXeroFinance;
  currency: string;
  quotesAwaitingApproval: number;
  quotesFollowUp: number;
}): SalesOpportunitiesSummary {
  const items: SalesOpportunityItem[] = [];

  if (input.glance.customerActivity.leads > 0) {
    items.push({
      id: 'leads-new',
      type: 'lead',
      title: `${input.glance.customerActivity.leads} active lead${input.glance.customerActivity.leads === 1 ? '' : 's'}`,
      customerName: null,
      amountCents: null,
      currency: input.currency,
      ageLabel: null,
      href: '/crm/leads',
    });
  }

  if (input.quotesAwaitingApproval > 0) {
    items.push({
      id: 'quotes-awaiting',
      type: 'quote',
      title: `${input.quotesAwaitingApproval} quote${input.quotesAwaitingApproval === 1 ? '' : 's'} in pipeline`,
      customerName: null,
      amountCents: input.xero.quotePipelineCents > 0 ? input.xero.quotePipelineCents : null,
      currency: input.currency,
      ageLabel: null,
      href: '/finance/quotes',
    });
  }

  if (input.quotesFollowUp > 0) {
    items.push({
      id: 'quotes-follow-up',
      type: 'follow_up',
      title: `${input.quotesFollowUp} follow-up${input.quotesFollowUp === 1 ? '' : 's'} due`,
      customerName: null,
      amountCents: null,
      currency: input.currency,
      ageLabel: null,
      href: '/finance/quotes',
    });
  }

  return {
    newLeads: input.glance.customerActivity.leads,
    uncontactedLeads: 0,
    quotesAwaitingApproval: input.quotesAwaitingApproval,
    followUpsDue: input.quotesFollowUp,
    items,
  };
}

function buildAuraRecommendations(input: {
  attentionItems: AttentionItem[];
  priorities: ExecutivePrioritiesSummary;
  outstanding: ExecutiveOutstandingInvoices;
  currency: string;
  unassignedJobs: number;
}): AuraExecutiveSummary {
  const recommendations: AuraExecutiveRecommendation[] = [];

  for (const item of input.attentionItems.slice(0, 5)) {
    recommendations.push({
      id: `aura-${item.id}`,
      title: item.recommendedAction,
      reason: item.reason,
      source: item.category,
      businessImpact:
        item.amountCents != null
          ? `${formatCurrency(item.amountCents, item.currency)} at stake`
          : 'Operational impact',
      suggestedAction: item.recommendedAction,
      confidence: item.priority === 'critical' ? 'high' : item.priority === 'attention' ? 'medium' : 'low',
      href: item.href,
      draftActionAvailable: item.draftActionAvailable,
    });
  }

  if (input.unassignedJobs > 0 && !recommendations.some((r) => r.source === 'Dispatch')) {
    recommendations.push({
      id: 'aura-unassigned',
      title: 'Assign unallocated jobs',
      reason: `${input.unassignedJobs} scheduled job${input.unassignedJobs === 1 ? '' : 's'} have no technician`,
      source: 'Dispatch',
      businessImpact: 'Schedule risk and customer delay',
      suggestedAction: 'Open scheduling',
      confidence: 'high',
      href: '/scheduling',
      draftActionAvailable: false,
    });
  }

  return {
    recommendations: recommendations.slice(0, 6),
    freshness: 'Updated recently',
  };
}

export const UI_THEME_001_RECORD = {
  id: 'UI-THEME-001',
  title: 'Premium Dark Mode Colour System',
  description:
    'After all major screens are complete, apply a consistent ChatGPT-style soft off-white primary text colour and refined grey secondary text across TITAN dark mode while preserving accessibility, blue accents and status colours.',
  status: 'recorded_not_implemented' as const,
};
