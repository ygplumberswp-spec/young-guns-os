import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type {
  ExecutiveCompletedJob,
  ExecutiveDashboardSummary,
  ExecutiveLiveJob,
  ExecutiveOutstandingInvoiceRef,
  ExecutiveTeamMember,
  ExecutiveXeroFinance,
  XeroSyncStatusResponse,
} from '@titan/shared';
import { buildFinanceDashboardSnapshot } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
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
};

function startOfLocalDay(): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfLocalDay(): Date {
  const end = startOfLocalDay();
  end.setDate(end.getDate() + 1);
  return end;
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

type OutstandingSnapshot = {
  outstandingCents: number;
  invoiceCount: number;
  oldestOverdue: ExecutiveOutstandingInvoiceRef | null;
  largestOutstanding: ExecutiveOutstandingInvoiceRef | null;
};

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
    ] = await Promise.all([
      this.deps.jobsService.getStats(companyId),
      this.deps.financeService.getStats(companyId),
      this.deps.intelligenceService.getDashboard(companyId),
      this.deps.dayPlanService.getTodayPlan(companyId),
      this.deps.jobsService.listTodaysScheduledJobs(companyId, 50),
      this.deps.schedulingService.getCalendar(companyId, start, end),
      this.deps.db.query.jobs.findMany({
        where: and(
          eq(jobs.companyId, companyId),
          isNotNull(jobs.scheduledAt),
          lt(jobs.scheduledAt, now),
          inArray(jobs.status, ['scheduled', 'in_progress']),
        ),
        with: { customer: true, assignedUser: true },
        orderBy: [jobs.scheduledAt],
        limit: 20,
      }),
      this.deps.db.query.jobs.findMany({
        where: and(
          eq(jobs.companyId, companyId),
          eq(jobs.status, 'completed'),
          gte(jobs.updatedAt, start),
          lt(jobs.updatedAt, end),
        ),
        with: { customer: true, assignedUser: true },
        orderBy: [desc(jobs.updatedAt)],
        limit: 20,
      }),
      this.deps.db.query.users.findMany({
        where: and(eq(users.companyId, companyId), eq(users.isActive, true)),
        with: { role: true },
        orderBy: [users.firstName, users.lastName],
      }),
      this.deps.db.query.mobileTimeEntries.findMany({
        where: and(
          eq(mobileTimeEntries.companyId, companyId),
          gte(mobileTimeEntries.startedAt, start),
          lt(mobileTimeEntries.startedAt, end),
        ),
        orderBy: [desc(mobileTimeEntries.startedAt)],
        limit: 200,
      }),
      this.deps.db
        .select({ total: sql<number>`coalesce(sum(${invoices.amountCents}), 0)::int` })
        .from(invoices)
        .where(
          and(
            eq(invoices.companyId, companyId),
            gte(invoices.issuedAt, start),
            lt(invoices.issuedAt, end),
            inArray(invoices.status, ['sent', 'partial', 'paid', 'overdue']),
          ),
        ),
      this.deps.db
        .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
        .from(payments)
        .where(
          and(eq(payments.companyId, companyId), gte(payments.paidAt, start), lt(payments.paidAt, end)),
        ),
      this.deps.db
        .select({ count: sql<number>`count(*)::int` })
        .from(invoices)
        .where(and(eq(invoices.companyId, companyId), eq(invoices.status, 'draft'))),
      this.deps.db
        .select({ count: sql<number>`count(*)::int` })
        .from(leads)
        .where(
          and(eq(leads.companyId, companyId), inArray(leads.status, ['new', 'contacted', 'qualified', 'opportunity'])),
        ),
      this.deps.db
        .select({ count: sql<number>`count(*)::int` })
        .from(communications)
        .where(
          and(
            eq(communications.companyId, companyId),
            gte(communications.createdAt, start),
            lt(communications.createdAt, end),
          ),
        ),
      this.countReturningCustomers(companyId, start, end),
      this.loadOutstandingSnapshot(companyId),
      this.loadXeroFinance(companyId),
    ]);

    const scheduledCount = calendar.events.filter((event) => event.status === 'scheduled').length;
    const inProgressCount = calendar.events.filter((event) => event.status === 'in_progress').length;
    const completedCount = completedJobs.length;
    const delayedCount = delayedJobs.length;

    const activePlans = todayPlan.sections.top_priorities.filter((plan) => plan.status === 'active');
    const waitingApproval = activePlans.filter((plan) => plan.approvalRequired).length;
    const blockedCount = todayPlan.summary.deadlineRisks;

    const jobsByAssignee = new Map<string, typeof calendar.events>();
    for (const event of calendar.events) {
      if (!event.assignedUserId) continue;
      const list = jobsByAssignee.get(event.assignedUserId) ?? [];
      list.push(event);
      jobsByAssignee.set(event.assignedUserId, list);
    }

    const workingUserIds = new Set<string>();
    for (const event of calendar.events) {
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
      calendar.events,
      activeTimeEntries,
      liveJobCoords,
    );
    const completedToday = await this.buildCompletedToday(companyId, completedJobs);

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

    const criticalIssues = intelligenceDashboard.automationFailures.items
      .slice(0, 2)
      .map((item) => ({
        id: item.id,
        title: item.workflowName ?? 'Automation failure',
        description: item.errorMessage ?? 'Review failed automation run.',
        href: '/automation',
      }));

    for (const invoice of intelligenceDashboard.outstandingInvoices.items.slice(0, 1)) {
      if (invoice.status === 'overdue') {
        criticalIssues.push({
          id: invoice.id,
          title: `Overdue invoice ${invoice.invoiceNumber}`,
          description: `${invoice.customerName} — follow up for payment.`,
          href: `/finance/invoices/${invoice.id}`,
        });
      }
    }

    return {
      generatedAt: now.toISOString(),
      header: {
        jobsToday: jobsStats.todayScheduledCount,
        prioritiesToday: activePlans.length,
        teamWorking: workingUserIds.size,
        approvalsWaiting: intelligenceDashboard.pendingApprovals.count + waitingApproval,
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
          outstandingCents: outstanding.outstandingCents,
          draftCount: draftInvoices[0]?.count ?? 0,
          currency: financeStats.currency,
        },
        customerActivity: {
          leads: leadCount[0]?.count ?? 0,
          followUps: intelligenceDashboard.customerFollowUps.count,
          messages: messageCount[0]?.count ?? 0,
          returning: returningCustomerCount,
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
        outstandingCents: outstanding.outstandingCents,
        invoiceCount: outstanding.invoiceCount,
        currency: intelligenceDashboard.outstandingInvoices.currency,
        oldestOverdue: outstanding.oldestOverdue,
        largestOutstanding: outstanding.largestOutstanding,
      },
      xeroFinance: xeroStatus,
      teamToday,
    };
  }

  /**
   * Open AR across every unpaid invoice in the tenant.
   * Aggregated in SQL so the dashboard total is not capped by any preview row limit.
   */
  private async loadOutstandingSnapshot(companyId: string): Promise<OutstandingSnapshot> {
    const balance = sql`${invoices.amountCents} - ${invoices.amountPaidCents}`;
    const isOpen = and(
      eq(invoices.companyId, companyId),
      inArray(invoices.status, [...OPEN_INVOICE_STATUSES]),
      sql`${balance} > 0`,
    );
    const refColumns = {
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      customerName: customers.name,
      dueDate: invoices.dueDate,
      outstandingCents: sql<number>`(${balance})::int`,
    };

    const [totals, oldestRows, largestRows] = await Promise.all([
      this.deps.db
        .select({
          count: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${balance}), 0)::text`,
        })
        .from(invoices)
        .where(isOpen),
      this.deps.db
        .select(refColumns)
        .from(invoices)
        .leftJoin(customers, eq(customers.id, invoices.customerId))
        .where(
          and(
            isOpen,
            or(
              lt(invoices.dueDate, new Date()),
              and(isNull(invoices.dueDate), eq(invoices.status, 'overdue')),
            ),
          ),
        )
        .orderBy(sql`${invoices.dueDate} asc nulls last`)
        .limit(1),
      this.deps.db
        .select(refColumns)
        .from(invoices)
        .leftJoin(customers, eq(customers.id, invoices.customerId))
        .where(isOpen)
        .orderBy(sql`${balance} desc`)
        .limit(1),
    ]);

    const toRef = (
      row: (typeof oldestRows)[number] | undefined,
    ): ExecutiveOutstandingInvoiceRef | null =>
      row
        ? {
            id: row.id,
            invoiceNumber: row.invoiceNumber,
            customerName: row.customerName ?? 'Unknown customer',
            dueDate: row.dueDate ? row.dueDate.toISOString() : null,
            outstandingCents: Number(row.outstandingCents ?? 0),
          }
        : null;

    return {
      outstandingCents: Number(totals[0]?.total ?? 0),
      invoiceCount: totals[0]?.count ?? 0,
      oldestOverdue: toRef(oldestRows[0]),
      largestOutstanding: toRef(largestRows[0]),
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
          sql`exists (
            select 1 from ${jobs} prior
            where prior.company_id = ${companyId}::uuid
              and prior.customer_id = ${jobs.customerId}
              and prior.created_at < ${start}::timestamptz
          )`,
        ),
      );

    return row?.count ?? 0;
  }

  private async loadXeroFinance(companyId: string): Promise<ExecutiveXeroFinance> {
    const empty: ExecutiveXeroFinance = {
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
      currency: 'USD',
    };

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

  private async buildCompletedToday(
    companyId: string,
    completedJobs: Array<{
      id: string;
      jobNumber: string | null;
      title: string;
      updatedAt: Date;
      customer: { name: string } | null;
      assignedUser: { firstName: string | null; lastName: string | null; email: string } | null;
    }>,
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
        completedAt: job.updatedAt.toISOString(),
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
