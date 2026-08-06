import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import type {
  ExecutiveCompletedJob,
  ExecutiveDashboardSummary,
  ExecutiveLiveJob,
  ExecutiveOutstandingBucket,
  ExecutiveOutstandingInvoiceRow,
  ExecutiveOutstandingInvoices,
  ExecutiveSectionKey,
  ExecutiveSectionState,
  ExecutiveSectionStatus,
  ExecutiveTeamMember,
  ExecutiveXeroFinance,
  XeroSyncStatusResponse,
} from '@titan/shared';
import { buildFinanceDashboardSnapshot, buildDash001Extensions } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  companies,
  communications,
  customers,
  invoices,
  jobCompletionSnapshots,
  jobs,
  leads,
  mobileTimeEntries,
  payments,
  quotes,
  users,
  xeroInvoiceMappings,
  xeroPaymentMappings,
  xeroQuoteMappings,
} from '@titan/db';
import type { CompanyDayPlanService } from './company-day-plan.service.js';
import type { FinanceService } from './finance.service.js';
import type { IntelligenceService } from './intelligence.service.js';
import type { JobsService } from './jobs.service.js';
import type { SchedulingService } from './scheduling.service.js';
import {
  buildTenantCacheKey,
  cachedTenantRead,
  CACHE_TTLS,
} from './api-read-cache.js';

type XeroFinanceStatusSource = {
  getSyncStatus(companyId: string): Promise<XeroSyncStatusResponse>;
};

type DashboardExecutiveDeps = {
  db: DatabaseClient;
  jobsService: JobsService;
  schedulingService: SchedulingService;
  financeService: FinanceService;
  intelligenceService: IntelligenceService;
  dayPlanService: CompanyDayPlanService;
  xeroSyncService?: XeroFinanceStatusSource;
  logger?: { error: (context: unknown, message: string) => void };
};

/** Operating timezone for "today" boundaries. Cape Town / SAST. */
const COMPANY_TIME_ZONE = 'Africa/Johannesburg';
const DEFAULT_CURRENCY = 'ZAR';

/**
 * Start of the current day in the operating timezone, expressed as a UTC instant.
 * Using the server's local day would file early-morning SAST work under the previous day.
 */
function startOfLocalDay(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COMPANY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const elapsedMs =
    (get('hour') % 24) * 3_600_000 + get('minute') * 60_000 + get('second') * 1_000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsedMs);
}

function endOfLocalDay(): Date {
  const end = startOfLocalDay();
  end.setUTCDate(end.getUTCDate() + 1);
  return end;
}

/** Sources feeding the summary; each maps onto one or more independently reported sections. */
type SummarySourceKey =
  | 'jobsStats'
  | 'financeStats'
  | 'intelligence'
  | 'todayPlan'
  | 'todayJobs'
  | 'calendar'
  | 'delayedJobs'
  | 'completedJobs'
  | 'team'
  | 'money'
  | 'customerActivity'
  | 'outstanding'
  | 'xero';

/** Honest empty finance feed — used when Xero is absent or its status read fails. */
function emptyXeroFinance(): ExecutiveXeroFinance {
  return {
    connected: false,
    organisationName: null,
    lastSyncAt: null,
    lastError: null,
    importStatus: null,
    importMessage: null,
    syncedCustomerCount: 0,
    syncedInvoiceCount: 0,
    syncedPaymentCount: 0,
    syncedQuoteCount: 0,
    syncedBankTransactionCount: 0,
    failedRecordCount: 0,
    revenueCents: 0,
    outstandingCents: 0,
    paidCents: 0,
    overdueCents: 0,
    unpaidInvoiceCount: 0,
    paidInvoiceCount: 0,
    overdueInvoiceCount: 0,
    quotePipelineCents: 0,
    quotePipelineCount: 0,
    monthlyTurnover: [],
    paymentTrends: [],
    currency: DEFAULT_CURRENCY,
  };
}

/** Short, non-sensitive failure reason safe to surface in the dashboard. */
function describeSourceFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0]!.slice(0, 160);
}

const SECTION_SOURCES: Record<ExecutiveSectionKey, readonly SummarySourceKey[]> = {
  todayAtAGlance: ['jobsStats', 'calendar', 'delayedJobs', 'completedJobs'],
  money: ['money', 'financeStats', 'outstanding'],
  customerActivity: ['customerActivity', 'intelligence'],
  priorities: ['todayPlan'],
  activeJobs: ['todayJobs', 'calendar'],
  completedToday: ['completedJobs'],
  outstandingInvoices: ['outstanding'],
  team: ['team', 'calendar'],
  businessHeartbeat: ['jobsStats', 'money', 'outstanding', 'customerActivity'],
  financialTruth: ['money', 'outstanding', 'xero'],
  teamPerformance: ['team', 'calendar', 'todayJobs'],
  salesOpportunities: ['customerActivity', 'xero'],
};

const SECTION_SOURCE_LABELS: Record<ExecutiveSectionKey, string> = {
  todayAtAGlance: 'TITAN jobs & scheduling',
  money: 'TITAN invoices & payments',
  customerActivity: 'TITAN CRM',
  priorities: 'TITAN Today’s Plan',
  activeJobs: 'TITAN jobs',
  completedToday: 'TITAN job completions',
  outstandingInvoices: 'TITAN invoices',
  team: 'TITAN team & time entries',
  businessHeartbeat: 'TITAN jobs, finance & CRM',
  financialTruth: 'TITAN finance & Xero',
  teamPerformance: 'TITAN team & jobs',
  salesOpportunities: 'TITAN CRM & quotes',
};

function buildSectionStatuses(
  failures: Map<SummarySourceKey, string>,
  generatedAt: Date,
  outstanding: OutstandingSnapshot | null,
): Record<ExecutiveSectionKey, ExecutiveSectionStatus> {
  const iso = generatedAt.toISOString();
  const entries = (Object.keys(SECTION_SOURCES) as ExecutiveSectionKey[]).map((key) => {
    const sources = SECTION_SOURCES[key];
    const broken = sources.filter((source) => failures.has(source));
    const allBroken = broken.length === sources.length;

    let state: ExecutiveSectionState = 'live';
    if (broken.length > 0) state = allBroken ? 'unavailable' : 'partial';

    let coverage: string | null = null;
    if (key === 'outstandingInvoices' && outstanding && broken.length === 0) {
      coverage =
        outstanding.excludedInvoiceCount > 0
          ? `All open invoices except ${outstanding.excludedInvoiceCount} with unusable amounts`
          : 'All open invoices';
      if (outstanding.undatedInvoiceCount > 0) {
        coverage += ` · ${outstanding.undatedInvoiceCount} without a due date`;
      }
      if (outstanding.invoices.length < outstanding.invoiceCount) {
        coverage += ` · totals cover all ${outstanding.invoiceCount}, list shows the first ${outstanding.invoices.length}`;
      }
      if (outstanding.excludedInvoiceCount > 0) state = 'partial';
    }

    return [
      key,
      {
        state,
        source: SECTION_SOURCE_LABELS[key],
        updatedAt: state === 'unavailable' ? null : iso,
        coverage,
        reason: broken.length > 0 ? (failures.get(broken[0]!) ?? null) : null,
      } satisfies ExecutiveSectionStatus,
    ] as const;
  });

  return Object.fromEntries(entries) as Record<ExecutiveSectionKey, ExecutiveSectionStatus>;
}

function displayName(row: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const full = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
  return full || row.email;
}

/** Invoice statuses that still carry an open balance. */
const OPEN_INVOICE_STATUSES = ['sent', 'partial', 'overdue'] as const;

/**
 * Upper bound on invoice rows carried in the summary payload. Totals are aggregated
 * separately in SQL, so a tenant beyond this cap still sees a correct open-AR total and
 * the card says how many rows it is showing.
 */
const OUTSTANDING_INVOICE_ROW_LIMIT = 200;

/** A due date within this window counts as "due soon" rather than "current". */
const DUE_SOON_WINDOW_DAYS = 7;

type CompletedJobRow = {
  id: string;
  jobNumber: string | null;
  title: string;
  /** Real completion instant, not a generic row-update timestamp. */
  completedAt: Date;
  customer: { name: string } | null;
  assignedUser: { firstName: string | null; lastName: string | null; email: string } | null;
};

type OutstandingSnapshot = ExecutiveOutstandingInvoices;

export class DashboardExecutiveService {
  constructor(private readonly deps: DashboardExecutiveDeps) {}

  async getExecutiveSummary(companyId: string): Promise<ExecutiveDashboardSummary> {
    return cachedTenantRead(
      buildTenantCacheKey(companyId, 'dashboard/executive-summary'),
      () => this.loadExecutiveSummary(companyId),
      CACHE_TTLS.dashboard,
    );
  }

  private async loadExecutiveSummary(companyId: string): Promise<ExecutiveDashboardSummary> {
    const start = startOfLocalDay();
    const end = endOfLocalDay();
    const now = new Date();

    // Every source is settled independently: a single failing provider must degrade only the
    // sections it feeds, never the whole summary. See resolveSectionStatuses below.
    const failures = new Map<SummarySourceKey, string>();
    const settle = <T>(key: SummarySourceKey, fallback: T, run: () => Promise<T>): Promise<T> =>
      run().catch((error: unknown) => {
        failures.set(key, describeSourceFailure(error));
        this.deps.logger?.error(
          { err: error, companyId, source: key },
          'Executive summary source failed',
        );
        return fallback;
      });

    const [
      jobsStats,
      financeStats,
      intelligenceDashboard,
      todayPlan,
      todayJobs,
      calendar,
      delayedJobs,
      completedJobs,
      teamMembers,
      activeTimeEntries,
      todayInvoices,
      todayPayments,
      draftInvoices,
      leadCount,
      messageCount,
      returningCustomerCount,
      outstanding,
      xeroStatus,
      unassignedJobs,
      quotesCounts,
      companyName,
    ] = await Promise.all([
      settle('jobsStats', null, () => this.deps.jobsService.getStats(companyId)),
      settle('financeStats', null, () => this.deps.financeService.getStats(companyId)),
      settle('intelligence', null, () => this.deps.intelligenceService.getDashboard(companyId)),
      settle('todayPlan', null, () => this.deps.dayPlanService.getTodayPlan(companyId)),
      settle('todayJobs', [], () => this.deps.jobsService.listTodaysScheduledJobs(companyId, 50)),
      settle('calendar', null, () => this.deps.schedulingService.getCalendar(companyId, start, end)),
      settle('delayedJobs', [], () => this.deps.db.query.jobs.findMany({
        where: and(
          eq(jobs.companyId, companyId),
          isNotNull(jobs.scheduledAt),
          lt(jobs.scheduledAt, now),
          inArray(jobs.status, ['scheduled', 'in_progress']),
        ),
        with: { customer: true, assignedUser: true },
        orderBy: [jobs.scheduledAt],
        limit: 20,
      })),
      settle('completedJobs', [], () => this.loadCompletedToday(companyId, start, end)),
      settle('team', [], () => this.deps.db.query.users.findMany({
        where: and(eq(users.companyId, companyId), eq(users.isActive, true)),
        with: { role: true },
        orderBy: [users.firstName, users.lastName],
      })),
      settle('team', [], () => this.deps.db.query.mobileTimeEntries.findMany({
        where: and(
          eq(mobileTimeEntries.companyId, companyId),
          gte(mobileTimeEntries.startedAt, start),
          lt(mobileTimeEntries.startedAt, end),
        ),
        orderBy: [desc(mobileTimeEntries.startedAt)],
        limit: 200,
      })),
      settle('money', [], () => this.deps.db
        .select({ total: sql<number>`coalesce(sum(${invoices.amountCents}), 0)::int` })
        .from(invoices)
        .where(
          and(
            eq(invoices.companyId, companyId),
            gte(invoices.issuedAt, start),
            lt(invoices.issuedAt, end),
            inArray(invoices.status, ['sent', 'partial', 'paid', 'overdue']),
          ),
        )),
      settle('money', [], () => this.deps.db
        .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
        .from(payments)
        .where(
          and(eq(payments.companyId, companyId), gte(payments.paidAt, start), lt(payments.paidAt, end)),
        )),
      settle('money', [], () => this.deps.db
        .select({ count: sql<number>`count(*)::int` })
        .from(invoices)
        .where(and(eq(invoices.companyId, companyId), eq(invoices.status, 'draft')))),
      settle('customerActivity', [], () => this.deps.db
        .select({ count: sql<number>`count(*)::int` })
        .from(leads)
        .where(
          and(eq(leads.companyId, companyId), inArray(leads.status, ['new', 'contacted', 'qualified', 'opportunity'])),
        )),
      settle('customerActivity', [], () => this.deps.db
        .select({ count: sql<number>`count(*)::int` })
        .from(communications)
        .where(
          and(
            eq(communications.companyId, companyId),
            gte(communications.createdAt, start),
            lt(communications.createdAt, end),
          ),
        )),
      settle('customerActivity', null, () =>
        this.countReturningCustomers(companyId, start, end),
      ),
      settle('outstanding', null, () => this.loadOutstandingSnapshot(companyId)),
      settle('xero', null, () => this.loadXeroFinance(companyId)),
      settle('todayJobs', { count: 0 }, async () => {
        const rows = await this.deps.db
          .select({ count: sql<number>`count(*)::int` })
          .from(jobs)
          .where(
            and(
              eq(jobs.companyId, companyId),
              gte(jobs.scheduledAt, start),
              lt(jobs.scheduledAt, end),
              inArray(jobs.status, ['scheduled', 'in_progress']),
              sql`${jobs.assignedUserId} is null`,
            ),
          );
        return { count: rows[0]?.count ?? 0 };
      }),
      settle('customerActivity', { awaiting: 0, followUp: 0 }, async () => {
        const [awaiting, followUp] = await Promise.all([
          this.deps.db
            .select({ count: sql<number>`count(*)::int` })
            .from(quotes)
            .where(
              and(
                eq(quotes.companyId, companyId),
                inArray(quotes.status, ['sent', 'viewed', 'internal_review', 'approved_for_sending']),
              ),
            ),
          this.deps.db
            .select({ count: sql<number>`count(*)::int` })
            .from(quotes)
            .where(
              and(eq(quotes.companyId, companyId), inArray(quotes.status, ['sent', 'viewed'])),
            ),
        ]);
        return { awaiting: awaiting[0]?.count ?? 0, followUp: followUp[0]?.count ?? 0 };
      }),
      settle('jobsStats', null, async () => {
        const row = await this.deps.db.query.companies.findFirst({
          where: eq(companies.id, companyId),
          columns: { name: true },
        });
        return row?.name ?? null;
      }),
    ]);

    const calendarEvents = calendar?.events ?? [];
    const scheduledCount = calendarEvents.filter((event) => event.status === 'scheduled').length;
    const inProgressCount = calendarEvents.filter((event) => event.status === 'in_progress').length;
    const completedCount = completedJobs.length;
    const delayedCount = delayedJobs.length;

    const activePlans = (todayPlan?.sections.top_priorities ?? []).filter(
      (plan) => plan.status === 'active',
    );
    const waitingApproval = activePlans.filter((plan) => plan.approvalRequired).length;
    const blockedCount = todayPlan?.summary.deadlineRisks ?? 0;

    const jobsByAssignee = new Map<string, typeof calendarEvents>();
    for (const event of calendarEvents) {
      if (!event.assignedUserId) continue;
      const list = jobsByAssignee.get(event.assignedUserId) ?? [];
      list.push(event);
      jobsByAssignee.set(event.assignedUserId, list);
    }

    const workingUserIds = new Set<string>();
    for (const event of calendarEvents) {
      if (event.assignedUserId && event.status === 'in_progress') {
        workingUserIds.add(event.assignedUserId);
      }
    }

    const teamToday = this.buildTeamToday(teamMembers, jobsByAssignee, activeTimeEntries, delayedJobs);
    const liveJobIds = todayJobs
      .filter((job) => ['scheduled', 'in_progress'].includes(job.status))
      .slice(0, 12)
      .map((job) => job.id);
    const liveJobCoords =
      liveJobIds.length === 0
        ? []
        : await this.deps.db.query.jobs.findMany({
            where: and(eq(jobs.companyId, companyId), inArray(jobs.id, liveJobIds)),
            columns: {
              id: true,
              snapshotLatitude: true,
              snapshotLongitude: true,
            },
          });
    const liveOperations = this.buildLiveOperations(
      todayJobs,
      delayedJobs,
      calendarEvents,
      activeTimeEntries,
      liveJobCoords,
    );
    const completedToday = await settle('completedJobs', [], () =>
      this.buildCompletedToday(companyId, completedJobs),
    );

    const needsAttention = activePlans.length;
    const summaryParts: string[] = [];
    if (needsAttention > 0) {
      summaryParts.push(
        `${needsAttention} priorit${needsAttention === 1 ? 'y' : 'ies'} need attention`,
      );
    }
    if (waitingApproval > 0) {
      summaryParts.push(`${waitingApproval} waiting approval`);
    }
    if (blockedCount > 0) {
      summaryParts.push(`${blockedCount} blocked`);
    }

    const priorityItems = activePlans.slice(0, 8).map((plan) => {
      const reason = (plan.content || plan.task || '').trim() || 'Priority from Today’s Plan';
      const suggestedAction = (plan.task || plan.content || '').trim() || reason;
      return {
        id: plan.id,
        priority: plan.priority,
        reason,
        suggestedAction,
        approvalState: plan.approvalRequired
          ? ('awaiting_owner' as const)
          : ('not_required' as const),
        href: '/aura/todays-plan',
      };
    });

    const criticalIssues = (intelligenceDashboard?.automationFailures.items ?? [])
      .slice(0, 2)
      .map((item) => ({
        id: item.id,
        title: item.workflowName ?? 'Automation failure',
        description: item.errorMessage ?? 'Review failed automation run.',
        href: '/automation',
      }));

    // Overdue-invoice escalation is additive: when finance is down the operational
    // priorities above still stand on their own.
    for (const invoice of (intelligenceDashboard?.outstandingInvoices.items ?? []).slice(0, 1)) {
      if (invoice.status === 'overdue') {
        criticalIssues.push({
          id: invoice.id,
          title: `Overdue invoice ${invoice.invoiceNumber}`,
          description: `${invoice.customerName} — follow up for payment.`,
          href: `/finance/invoices/${invoice.id}`,
        });
      }
    }

    const sections = buildSectionStatuses(failures, now, outstanding);
    const baseSummary = {
      generatedAt: now.toISOString(),
      sections,
      header: {
        jobsToday: jobsStats?.todayScheduledCount ?? scheduledCount,
        prioritiesToday: activePlans.length,
        teamWorking: workingUserIds.size,
        approvalsWaiting: (intelligenceDashboard?.pendingApprovals.count ?? 0) + waitingApproval,
      },
      todayAtAGlance: {
        jobs: {
          scheduled: scheduledCount,
          inProgress: inProgressCount,
          completed: completedCount,
          delayed: delayedCount,
          href: '/jobs?filter=today',
        },
        team: {
          available: teamToday.filter((member) => member.status === 'available').length,
          travelling: teamToday.filter((member) => member.status === 'travelling').length,
          onSite: teamToday.filter((member) => member.status === 'on_site').length,
          offDuty: teamToday.filter((member) => member.status === 'off_duty').length,
        },
        money: {
          invoicedTodayCents: todayInvoices[0]?.total ?? 0,
          paymentsTodayCents: todayPayments[0]?.total ?? 0,
          outstandingCents: outstanding?.outstandingCents ?? 0,
          draftCount: draftInvoices[0]?.count ?? 0,
          currency: financeStats?.currency ?? outstanding?.currency ?? DEFAULT_CURRENCY,
        },
        customerActivity: {
          leads: leadCount[0]?.count ?? 0,
          followUps: intelligenceDashboard?.customerFollowUps.count ?? 0,
          messages: messageCount[0]?.count ?? 0,
          returning: returningCustomerCount ?? 0,
        },
      },
      liveOperations,
      completedToday,
      priorities: {
        needsAttention,
        waitingApproval,
        blocked: blockedCount,
        summaryLine: summaryParts.length > 0 ? summaryParts.join(' · ') : 'All clear for today',
        items: priorityItems,
        criticalIssues,
      },
      outstandingInvoices: {
        outstandingCents: outstanding?.outstandingCents ?? 0,
        invoiceCount: outstanding?.invoiceCount ?? 0,
        currency:
          outstanding?.currency ??
          intelligenceDashboard?.outstandingInvoices.currency ??
          DEFAULT_CURRENCY,
        overdueCents: outstanding?.overdueCents ?? 0,
        overdueCount: outstanding?.overdueCount ?? 0,
        dueSoonCents: outstanding?.dueSoonCents ?? 0,
        dueTodayCount: outstanding?.dueTodayCount ?? 0,
        dueSoonCount: outstanding?.dueSoonCount ?? 0,
        currentCents: outstanding?.currentCents ?? 0,
        currentCount: outstanding?.currentCount ?? 0,
        excludedInvoiceCount: outstanding?.excludedInvoiceCount ?? 0,
        undatedInvoiceCount: outstanding?.undatedInvoiceCount ?? 0,
        invoices: outstanding?.invoices ?? [],
        listLimit: outstanding?.listLimit ?? OUTSTANDING_INVOICE_ROW_LIMIT,
      },
      xeroFinance: xeroStatus ?? emptyXeroFinance(),
      teamToday,
    };

    const dash001 = buildDash001Extensions({
      summary: baseSummary,
      companyName,
      unassignedJobsCount: unassignedJobs?.count ?? 0,
      quotesAwaitingApproval: quotesCounts?.awaiting ?? 0,
      quotesFollowUp: quotesCounts?.followUp ?? 0,
      now,
    });

    return {
      ...baseSummary,
      header: {
        ...baseSummary.header,
        businessSummary: dash001.headerExtended.businessSummary,
        priorityCount: dash001.headerExtended.priorityCount,
        urgentAlertCount: dash001.headerExtended.urgentAlertCount,
      },
      dash001,
    };
  }

  /**
   * Open AR across every unpaid invoice in the tenant: the complete list plus totals.
   * Totals are aggregated in SQL over the whole open-AR set, so they stay correct even
   * when the row list is capped at {@link OUTSTANDING_INVOICE_ROW_LIMIT}.
   */
  private async loadOutstandingSnapshot(companyId: string): Promise<OutstandingSnapshot> {
    const balance = sql`${invoices.amountCents} - ${invoices.amountPaidCents}`;
    // Records whose amounts cannot produce a trustworthy balance are excluded from the
    // total and reported separately as reduced coverage rather than silently summed.
    const isUsable = sql`${invoices.amountCents} is not null
      and ${invoices.amountPaidCents} is not null
      and ${invoices.amountPaidCents} <= ${invoices.amountCents}`;
    const isOpenRecord = and(
      eq(invoices.companyId, companyId),
      inArray(invoices.status, [...OPEN_INVOICE_STATUSES]),
    );
    const isOpen = and(isOpenRecord, isUsable, sql`${balance} > 0`);

    // Ageing is measured against the start of the operating day so an invoice due today is
    // never reported as a day overdue. postgres-js cannot encode a Date inside a raw sql
    // template, so the boundaries are bound as ISO text and cast.
    const dayStart = startOfLocalDay();
    const nextDayStart = endOfLocalDay();
    const dueSoonEnd = new Date(
      dayStart.getTime() + DUE_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const today = sql`${dayStart.toISOString()}::timestamptz`;
    const tomorrow = sql`${nextDayStart.toISOString()}::timestamptz`;
    const soonEnd = sql`${dueSoonEnd.toISOString()}::timestamptz`;

    const isOverdue = sql`${invoices.dueDate} is not null and ${invoices.dueDate} < ${today}`;
    const isDueToday = sql`${invoices.dueDate} >= ${today} and ${invoices.dueDate} < ${tomorrow}`;
    const isDueSoon = sql`${invoices.dueDate} >= ${tomorrow} and ${invoices.dueDate} < ${soonEnd}`;
    const isCurrent = sql`${invoices.dueDate} >= ${soonEnd}`;
    // Rank drives the required order: most overdue, then due today, due soon, current,
    // and finally invoices the source never gave a due date for.
    const bucketRank = sql<number>`case
      when ${invoices.dueDate} is null then 4
      when ${isOverdue} then 0
      when ${isDueToday} then 1
      when ${isDueSoon} then 2
      else 3
    end`;

    const [totals, coverage, rows] = await Promise.all([
      this.deps.db
        .select({
          count: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${balance}), 0)::text`,
          overdueCount: sql<number>`count(*) filter (where ${isOverdue})::int`,
          overdueTotal: sql<string>`coalesce(sum(${balance}) filter (where ${isOverdue}), 0)::text`,
          dueTodayCount: sql<number>`count(*) filter (where ${isDueToday})::int`,
          dueSoonCount: sql<number>`count(*) filter (where ${isDueSoon})::int`,
          dueSoonTotal: sql<string>`coalesce(sum(${balance}) filter (where ${isDueToday} or ${isDueSoon}), 0)::text`,
          currentCount: sql<number>`count(*) filter (where ${isCurrent})::int`,
          // Undated balances are owed but cannot be aged, so they sit with current rather
          // than inflating either the overdue or the due-soon figure.
          currentTotal: sql<string>`coalesce(sum(${balance}) filter (where ${isCurrent} or ${invoices.dueDate} is null), 0)::text`,
          undated: sql<number>`count(*) filter (where ${invoices.dueDate} is null)::int`,
          currency: sql<string | null>`max(${invoices.currency})`,
        })
        .from(invoices)
        .where(isOpen),
      this.deps.db
        .select({ excluded: sql<number>`count(*) filter (where not (${isUsable}))::int` })
        .from(invoices)
        .where(isOpenRecord),
      this.deps.db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          customerId: invoices.customerId,
          customerName: customers.name,
          issuedAt: invoices.issuedAt,
          dueDate: invoices.dueDate,
          originalTotalCents: invoices.amountCents,
          amountPaidCents: invoices.amountPaidCents,
          outstandingCents: sql<number>`(${balance})::int`,
          status: invoices.status,
          bucketRank,
          // Counted date to date in the operating timezone: an invoice dated the 5th is
          // 30 days overdue on the 4th of the next month, whatever time of day it carries.
          daysOverdue: sql<number | null>`case when ${isOverdue}
            then ((${today} at time zone ${COMPANY_TIME_ZONE})::date
                  - (${invoices.dueDate} at time zone ${COMPANY_TIME_ZONE})::date)::int
            else null end`,
        })
        .from(invoices)
        .leftJoin(customers, eq(customers.id, invoices.customerId))
        .where(isOpen)
        .orderBy(sql`${bucketRank} asc`, sql`${invoices.dueDate} asc nulls last`, sql`${balance} desc`)
        .limit(OUTSTANDING_INVOICE_ROW_LIMIT),
    ]);

    const BUCKETS: readonly ExecutiveOutstandingBucket[] = [
      'overdue',
      'due_today',
      'due_soon',
      'current',
      'undated',
    ];

    const invoiceRows: ExecutiveOutstandingInvoiceRow[] = rows.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      customerId: row.customerId ?? null,
      customerName: row.customerName ?? 'Unknown customer',
      issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
      dueDate: row.dueDate ? row.dueDate.toISOString() : null,
      originalTotalCents: Number(row.originalTotalCents ?? 0),
      amountPaidCents: Number(row.amountPaidCents ?? 0),
      outstandingCents: Number(row.outstandingCents ?? 0),
      status: row.status as ExecutiveOutstandingInvoiceRow['status'],
      bucket: BUCKETS[Number(row.bucketRank)] ?? 'current',
      daysOverdue: row.daysOverdue == null ? null : Number(row.daysOverdue),
    }));

    return {
      outstandingCents: Number(totals[0]?.total ?? 0),
      invoiceCount: totals[0]?.count ?? 0,
      currency: totals[0]?.currency ?? DEFAULT_CURRENCY,
      overdueCents: Number(totals[0]?.overdueTotal ?? 0),
      overdueCount: totals[0]?.overdueCount ?? 0,
      dueSoonCents: Number(totals[0]?.dueSoonTotal ?? 0),
      dueTodayCount: totals[0]?.dueTodayCount ?? 0,
      dueSoonCount: totals[0]?.dueSoonCount ?? 0,
      currentCents: Number(totals[0]?.currentTotal ?? 0),
      currentCount: totals[0]?.currentCount ?? 0,
      excludedInvoiceCount: coverage[0]?.excluded ?? 0,
      undatedInvoiceCount: totals[0]?.undated ?? 0,
      invoices: invoiceRows,
      listLimit: OUTSTANDING_INVOICE_ROW_LIMIT,
    };
  }

  /**
   * Customers who booked work today and had already booked with us before today.
   * Counted from real job records — no estimate when there is no repeat history.
   */
  private async countReturningCustomers(
    companyId: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    const [row] = await this.deps.db
      .select({ count: sql<number>`count(distinct ${jobs.customerId})::int` })
      .from(jobs)
      .where(
        and(
          eq(jobs.companyId, companyId),
          isNotNull(jobs.customerId),
          gte(jobs.createdAt, start),
          lt(jobs.createdAt, end),
          // postgres-js has no encoder for a Date inside a raw sql template — bind ISO text.
          sql`exists (
            select 1 from ${jobs} prior
            where prior.company_id = ${companyId}::uuid
              and prior.customer_id = ${jobs.customerId}
              and prior.created_at < ${start.toISOString()}::timestamptz
          )`,
        ),
      );

    return row?.count ?? 0;
  }

  private async loadXeroFinance(companyId: string): Promise<ExecutiveXeroFinance> {
    const empty = emptyXeroFinance();

    if (!this.deps.xeroSyncService) {
      return empty;
    }

    try {
      const status = await this.deps.xeroSyncService.getSyncStatus(companyId);
      const snapshot = await this.loadSyncedFinanceSnapshot(companyId);
      const failedRecordCount =
        status.customers.failedCount +
        status.quotes.failedCount +
        status.invoices.failedCount +
        status.payments.failedCount +
        (status.bankTransactions?.failedCount ?? 0) +
        (status.financePipeline?.failedCount ?? 0);

      return {
        connected: status.connected,
        organisationName: status.organisationName,
        lastSyncAt: status.lastSyncAt,
        lastError: status.lastError,
        importStatus: status.importJob?.status ?? null,
        importMessage: status.importJob?.message ?? null,
        syncedCustomerCount: status.customers.syncedCount,
        syncedInvoiceCount: status.invoices.syncedCount,
        syncedPaymentCount: status.payments.syncedCount,
        syncedQuoteCount: status.quotes.syncedCount,
        syncedBankTransactionCount: status.bankTransactions?.syncedCount ?? 0,
        failedRecordCount,
        revenueCents: snapshot.revenueCents,
        outstandingCents: snapshot.outstandingCents,
        paidCents: snapshot.paidCents,
        overdueCents: snapshot.overdueCents,
        unpaidInvoiceCount: snapshot.unpaidInvoiceCount,
        paidInvoiceCount: snapshot.paidInvoiceCount,
        overdueInvoiceCount: snapshot.overdueInvoiceCount,
        quotePipelineCents: snapshot.quotePipelineCents,
        quotePipelineCount: snapshot.quotePipelineCount,
        monthlyTurnover: snapshot.monthlyTurnover,
        paymentTrends: snapshot.paymentTrends,
        currency: status.currency,
      };
    } catch {
      return empty;
    }
  }

  /** Real synced TITAN rows only (Xero-mapped) — never invents values. */
  private async loadSyncedFinanceSnapshot(companyId: string) {
    const [invoiceRows, paymentRows, quoteRows] = await Promise.all([
      this.deps.db
        .select({
          status: invoices.status,
          totalCents: invoices.totalCents,
          amountCents: invoices.amountCents,
          amountPaidCents: invoices.amountPaidCents,
          dueDate: invoices.dueDate,
          issuedAt: invoices.issuedAt,
        })
        .from(invoices)
        .innerJoin(
          xeroInvoiceMappings,
          and(
            eq(xeroInvoiceMappings.invoiceId, invoices.id),
            eq(xeroInvoiceMappings.companyId, companyId),
            eq(xeroInvoiceMappings.syncStatus, 'synced'),
          ),
        )
        .where(eq(invoices.companyId, companyId)),
      this.deps.db
        .select({
          amountCents: payments.amountCents,
          paidAt: payments.paidAt,
        })
        .from(payments)
        .innerJoin(
          xeroPaymentMappings,
          and(
            eq(xeroPaymentMappings.paymentId, payments.id),
            eq(xeroPaymentMappings.companyId, companyId),
            eq(xeroPaymentMappings.syncStatus, 'synced'),
          ),
        )
        .where(eq(payments.companyId, companyId)),
      this.deps.db
        .select({
          status: quotes.status,
          totalCents: quotes.totalCents,
          amountCents: quotes.amountCents,
        })
        .from(quotes)
        .innerJoin(
          xeroQuoteMappings,
          and(
            eq(xeroQuoteMappings.quoteId, quotes.id),
            eq(xeroQuoteMappings.companyId, companyId),
            eq(xeroQuoteMappings.syncStatus, 'synced'),
          ),
        )
        .where(eq(quotes.companyId, companyId)),
    ]);

    return buildFinanceDashboardSnapshot({
      invoices: invoiceRows,
      payments: paymentRows,
      quotes: quoteRows,
    });
  }

  private buildLiveOperations(
    todayJobs: Awaited<ReturnType<JobsService['listTodaysScheduledJobs']>>,
    delayedJobs: Array<{
      id: string;
      scheduledEndAt: Date | null;
    }>,
    events: Array<{
      id: string;
      title: string;
      scheduledAt: string | null;
      assignedUserId?: string | null;
    }>,
    timeEntries: Array<{
      userId: string;
      jobId: string | null;
      entryType: string;
      startedAt: Date;
      endedAt: Date | null;
    }>,
    coords: Array<{
      id: string;
      snapshotLatitude: number | null;
      snapshotLongitude: number | null;
    }>,
  ): ExecutiveLiveJob[] {
    const delayedIds = new Set(delayedJobs.map((job) => job.id));
    const coordsById = new Map(coords.map((row) => [row.id, row]));
    const now = Date.now();

    return todayJobs
      .filter((job) => ['scheduled', 'in_progress'].includes(job.status))
      .slice(0, 12)
      .map((job) => {
        const next = events
          .filter((event) => {
            if (event.id === job.id || !event.scheduledAt) return false;
            if (job.assignedUserId && event.assignedUserId) {
              return event.assignedUserId === job.assignedUserId;
            }
            return true;
          })
          .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))
          .find((event) => {
            if (!job.scheduledEndAt) return true;
            return new Date(event.scheduledAt!).getTime() >= new Date(job.scheduledEndAt).getTime();
          });

        const isDelayed =
          delayedIds.has(job.id) ||
          (job.scheduledAt
            ? new Date(job.scheduledAt).getTime() < now && job.status === 'scheduled'
            : false);

        const onSiteEntry = timeEntries.find(
          (entry) =>
            entry.jobId === job.id &&
            entry.entryType === 'job_time' &&
            entry.endedAt == null,
        );

        const geo = coordsById.get(job.id);
        const latitude =
          geo?.snapshotLatitude != null && Number.isFinite(geo.snapshotLatitude)
            ? geo.snapshotLatitude
            : null;
        const longitude =
          geo?.snapshotLongitude != null && Number.isFinite(geo.snapshotLongitude)
            ? geo.snapshotLongitude
            : null;

        return {
          id: job.id,
          jobNumber: job.jobNumber,
          title: job.title,
          customerName: job.customerName,
          suburb: job.addressDisplay?.split(',').pop()?.trim() ?? null,
          status: job.status,
          technicianName: job.assignedUserName,
          assignedUserId: job.assignedUserId,
          scheduledAt: job.scheduledAt,
          scheduledEndAt: job.scheduledEndAt,
          etaAt: job.etaAt,
          timeOnSiteStartedAt: onSiteEntry?.startedAt.toISOString() ?? null,
          nextJobTitle: next?.title ?? null,
          isDelayed,
          latitude,
          longitude,
        };
      });
  }

  /**
   * Jobs completed during today in the operating timezone, keyed off a real completion
   * timestamp rather than `updatedAt` (which unrelated writes such as invoice linkage move).
   */
  private async loadCompletedToday(
    companyId: string,
    start: Date,
    end: Date,
  ): Promise<CompletedJobRow[]> {
    const completedAt = sql<Date>`coalesce(
      (select max(snap.created_at)
         from ${jobCompletionSnapshots} snap
        where snap.job_id = ${jobs.id}
          and snap.company_id = ${companyId}::uuid),
      ${jobs.executionPhaseUpdatedAt},
      ${jobs.updatedAt}
    )`;

    const rows = await this.deps.db
      .select({ id: jobs.id, completedAt })
      .from(jobs)
      .where(
        and(
          eq(jobs.companyId, companyId),
          eq(jobs.status, 'completed'),
          sql`${completedAt} >= ${start.toISOString()}::timestamptz`,
          sql`${completedAt} < ${end.toISOString()}::timestamptz`,
        ),
      )
      .orderBy(sql`${completedAt} desc`)
      .limit(20);

    if (rows.length === 0) return [];

    const completedAtById = new Map(rows.map((row) => [row.id, new Date(row.completedAt)]));
    const detailed = await this.deps.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        inArray(
          jobs.id,
          rows.map((row) => row.id),
        ),
      ),
      with: { customer: true, assignedUser: true },
    });

    return detailed
      .map((job) => ({
        id: job.id,
        jobNumber: job.jobNumber,
        title: job.title,
        completedAt: completedAtById.get(job.id) ?? job.updatedAt,
        customer: job.customer,
        assignedUser: job.assignedUser,
      }))
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  }

  private async buildCompletedToday(
    companyId: string,
    completedJobs: CompletedJobRow[],
  ): Promise<ExecutiveCompletedJob[]> {
    if (completedJobs.length === 0) return [];

    const jobIds = completedJobs.map((job) => job.id);
    const [invoiceRows, snapshotRows] = await Promise.all([
      this.deps.db.query.invoices.findMany({
        where: and(eq(invoices.companyId, companyId), inArray(invoices.jobId, jobIds)),
        columns: { jobId: true, status: true },
      }),
      this.deps.db.query.jobCompletionSnapshots.findMany({
        where: and(
          eq(jobCompletionSnapshots.companyId, companyId),
          inArray(jobCompletionSnapshots.jobId, jobIds),
        ),
        columns: { jobId: true, snapshot: true },
      }),
    ]);
    const invoiceByJob = new Map(invoiceRows.map((row) => [row.jobId, row.status]));
    const snapshotByJob = new Map(snapshotRows.map((row) => [row.jobId, row.snapshot]));

    return completedJobs.map((job) => {
      const snapshot = snapshotByJob.get(job.id);
      return {
        id: job.id,
        jobNumber: job.jobNumber,
        title: job.title,
        customerName: job.customer?.name ?? 'Unknown customer',
        technicianName: job.assignedUser ? displayName(job.assignedUser) : null,
        completedAt: job.completedAt.toISOString(),
        invoiceStatus: invoiceByJob.get(job.id) ?? null,
        // No completion snapshot means the technician never captured the closeout pack.
        docsRequired: !snapshot,
        cocRequired: snapshot?.cocRequired === 'required',
      };
    });
  }

  private buildTeamToday(
    teamMembers: Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      role?: { name: string } | null;
    }>,
    jobsByAssignee: Map<
      string,
      Array<{ title: string; status: string; scheduledAt: string | null }>
    >,
    timeEntries: Array<{ userId: string; entryType: string; endedAt: Date | null }>,
    delayedJobs: Array<{ assignedUserId: string | null; scheduledAt: Date | null }>,
  ): ExecutiveTeamMember[] {
    const technicians = teamMembers.filter((member) => {
      const role = member.role?.name?.toLowerCase() ?? '';
      return role.includes('technician') || role.includes('installer') || role.includes('field');
    });

    const roster = technicians.length > 0 ? technicians : teamMembers.slice(0, 12);
    const now = Date.now();

    return roster.map((member) => {
      const assigned = jobsByAssignee.get(member.id) ?? [];
      const inProgress = assigned.find((job) => job.status === 'in_progress');
      const next = assigned.find((job) => job.status === 'scheduled');
      const openEntry = timeEntries.find((entry) => entry.userId === member.id && !entry.endedAt);

      let status: ExecutiveTeamMember['status'] = 'available';
      if (openEntry?.entryType === 'travel') {
        status = 'travelling';
      } else if (openEntry?.entryType === 'job_time' || inProgress) {
        status = 'on_site';
      } else if (assigned.length === 0) {
        status = 'off_duty';
      } else if (inProgress || assigned.length > 0) {
        status = 'working';
      }

      const lateJob = delayedJobs.find(
        (job) =>
          job.assignedUserId === member.id &&
          job.scheduledAt &&
          job.scheduledAt.getTime() < now,
      );

      return {
        userId: member.id,
        name: displayName(member),
        status,
        currentTask: inProgress?.title ?? null,
        nextTask: next?.title ?? null,
        isLate: Boolean(lateJob),
      };
    });
  }
}
