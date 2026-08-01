import { and, desc, eq, gte, inArray, isNotNull, lt, notExists, sql } from 'drizzle-orm';
import type {
  ExecutiveCompletedJob,
  ExecutiveDashboardSummary,
  ExecutiveLiveJob,
  ExecutiveOwnerActionItem,
  ExecutiveTeamMember,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  communications,
  invoices,
  jobs,
  leads,
  mobileTimeEntries,
  payments,
  quotes,
  users,
} from '@titan/db';
import type { CompanyDayPlanService } from './company-day-plan.service.js';
import type { FinanceService } from './finance.service.js';
import type { IntelligenceService } from './intelligence.service.js';
import type { JobsService } from './jobs.service.js';
import type { SchedulingService } from './scheduling.service.js';

type DashboardExecutiveDeps = {
  db: DatabaseClient;
  jobsService: JobsService;
  schedulingService: SchedulingService;
  financeService: FinanceService;
  intelligenceService: IntelligenceService;
  dayPlanService: CompanyDayPlanService;
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

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function displayName(row: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const full = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
  return full || row.email;
}

export class DashboardExecutiveService {
  constructor(private readonly deps: DashboardExecutiveDeps) {}

  async getExecutiveSummary(companyId: string): Promise<ExecutiveDashboardSummary> {
    const start = startOfLocalDay();
    const end = endOfLocalDay();
    const now = new Date();
    const dueWeekEnd = addDays(now, 7);

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
      depositsToday,
      partialPaymentsToday,
      jobsPaidInFullToday,
      pendingQuotes,
      completedNotInvoiced,
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
          and(
            eq(leads.companyId, companyId),
            inArray(leads.status, ['new', 'contacted', 'qualified', 'opportunity']),
          ),
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
      this.deps.db
        .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
        .from(payments)
        .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
        .where(
          and(
            eq(payments.companyId, companyId),
            eq(invoices.stage, 'deposit'),
            gte(payments.paidAt, start),
            lt(payments.paidAt, end),
          ),
        ),
      this.deps.db
        .select({ count: sql<number>`count(*)::int` })
        .from(payments)
        .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
        .where(
          and(
            eq(payments.companyId, companyId),
            eq(invoices.status, 'partial'),
            gte(payments.paidAt, start),
            lt(payments.paidAt, end),
          ),
        ),
      this.deps.db
        .select({ count: sql<number>`count(*)::int` })
        .from(invoices)
        .where(
          and(
            eq(invoices.companyId, companyId),
            eq(invoices.status, 'paid'),
            isNotNull(invoices.jobId),
            gte(invoices.updatedAt, start),
            lt(invoices.updatedAt, end),
          ),
        ),
      this.deps.db
        .select({ count: sql<number>`count(*)::int` })
        .from(quotes)
        .where(
          and(
            eq(quotes.companyId, companyId),
            inArray(quotes.status, ['sent', 'internal_review', 'approved_for_sending']),
          ),
        ),
      this.deps.db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobs)
        .where(
          and(
            eq(jobs.companyId, companyId),
            eq(jobs.status, 'completed'),
            gte(jobs.updatedAt, start),
            lt(jobs.updatedAt, end),
            notExists(
              this.deps.db
                .select({ id: invoices.id })
                .from(invoices)
                .where(and(eq(invoices.jobId, jobs.id), eq(invoices.companyId, companyId))),
            ),
          ),
        ),
    ]);

    const scheduledEvents = calendar.events.filter((event) => event.status === 'scheduled');
    const inProgressEvents = calendar.events.filter((event) => event.status === 'in_progress');
    const scheduledCount = scheduledEvents.length;
    const inProgressCount = inProgressEvents.length;
    const completedCount = completedJobs.length;
    const delayedCount = delayedJobs.length;
    const assignedCount = calendar.events.filter((event) => Boolean(event.assignedUserId)).length;
    const unassignedCount = calendar.events.filter(
      (event) => !event.assignedUserId && event.status === 'scheduled',
    ).length;

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

    const teamToday = this.buildTeamToday(
      teamMembers,
      jobsByAssignee,
      activeTimeEntries,
      delayedJobs,
      calendar.events,
    );
    const liveOperations = this.buildLiveOperations(todayJobs, delayedJobs, calendar.events);
    const completedToday = await this.buildCompletedToday(companyId, completedJobs);

    const outstandingItems = intelligenceDashboard.outstandingInvoices.items;
    const overdueItems = outstandingItems.filter((item) => {
      if (item.status === 'overdue') return true;
      if (!item.dueDate) return false;
      return new Date(item.dueDate).getTime() < now.getTime();
    });
    const overdueCents = overdueItems.reduce(
      (sum, item) => sum + Math.max(0, item.amountCents - item.amountPaidCents),
      0,
    );
    const dueThisWeekCount = outstandingItems.filter((item) => {
      if (!item.dueDate) return false;
      const due = new Date(item.dueDate);
      return due >= now && due <= dueWeekEnd;
    }).length;

    const travellingCount = teamToday.filter((member) => member.status === 'travelling').length;
    const onSiteCount = teamToday.filter((member) => member.status === 'on_site').length;
    const workingCount = teamToday.filter((member) => member.status === 'working').length;
    const lateCount = teamToday.filter((member) => member.isLate).length;
    const missingCheckInCount = teamToday.filter((member) => member.missingCheckIn).length;

    const actionQueue = this.buildOwnerActionQueue({
      unassignedCount,
      delayedCount,
      overdueCount: overdueItems.length,
      pendingQuotes: pendingQuotes[0]?.count ?? 0,
      completedNotInvoiced: completedNotInvoiced[0]?.count ?? 0,
      waitingApproval: intelligenceDashboard.pendingApprovals.count + waitingApproval,
      lowStockCount: intelligenceDashboard.lowStockCount,
      fleetIssueCount: intelligenceDashboard.fleetIssues.count,
      schedulingConflicts: intelligenceDashboard.schedulingConflicts,
      followUpCount: intelligenceDashboard.customerFollowUps.count,
    });

    const needsAttention = activePlans.length + actionQueue.length;
    const summaryParts: string[] = [];
    if (actionQueue.length > 0) {
      summaryParts.push(`${actionQueue.length} action${actionQueue.length === 1 ? '' : 's'} in queue`);
    }
    if (waitingApproval > 0) {
      summaryParts.push(`${waitingApproval} waiting approval`);
    }
    if (blockedCount > 0) {
      summaryParts.push(`${blockedCount} blocked`);
    }

    const criticalIssues = intelligenceDashboard.automationFailures.items
      .slice(0, 2)
      .map((item) => ({
        id: item.id,
        title: item.workflowName ?? 'Automation failure',
        description: item.errorMessage ?? 'Review failed automation run.',
        href: '/automation',
      }));

    for (const invoice of overdueItems.slice(0, 2)) {
      criticalIssues.push({
        id: invoice.id,
        title: `Overdue invoice ${invoice.invoiceNumber}`,
        description: `${invoice.customerName} — follow up for payment.`,
        href: `/finance/invoices/${invoice.id}`,
      });
    }

    return {
      generatedAt: now.toISOString(),
      header: {
        jobsToday: jobsStats.todayScheduledCount,
        prioritiesToday: actionQueue.length,
        teamWorking: workingUserIds.size,
        approvalsWaiting: intelligenceDashboard.pendingApprovals.count + waitingApproval,
      },
      todayAtAGlance: {
        jobs: {
          scheduled: scheduledCount,
          assigned: assignedCount,
          travelling: travellingCount,
          onSite: onSiteCount,
          inProgress: inProgressCount,
          completed: completedCount,
          delayed: delayedCount,
          unassigned: unassignedCount,
          href: '/jobs?filter=today',
        },
        team: {
          working: workingCount,
          available: teamToday.filter((member) => member.status === 'available').length,
          travelling: travellingCount,
          onSite: onSiteCount,
          offDuty: teamToday.filter((member) => member.status === 'off_duty').length,
          late: lateCount,
          missingCheckIn: missingCheckInCount,
        },
        money: {
          invoicedTodayCents: todayInvoices[0]?.total ?? 0,
          paymentsTodayCents: todayPayments[0]?.total ?? 0,
          outstandingCents: intelligenceDashboard.outstandingInvoices.totalOutstandingCents,
          overdueCents,
          dueThisWeekCount,
          depositsTodayCents: depositsToday[0]?.total ?? 0,
          partialPaymentsTodayCount: partialPaymentsToday[0]?.count ?? 0,
          jobsPaidInFullTodayCount: jobsPaidInFullToday[0]?.count ?? 0,
          draftCount: draftInvoices[0]?.count ?? 0,
          currency: financeStats.currency,
          syncState: 'ready',
        },
        customerActivity: {
          newLeads: leadCount[0]?.count ?? 0,
          followUpsDue: intelligenceDashboard.customerFollowUps.count,
          unreadMessages: messageCount[0]?.count ?? 0,
          returningCustomers: null,
          complaintsEscalations: null,
        },
      },
      liveOperations,
      completedToday,
      priorities: {
        needsAttention,
        waitingApproval,
        blocked: blockedCount,
        summaryLine: summaryParts.length > 0 ? summaryParts.join(' · ') : 'All clear for today',
        criticalIssues,
        actionQueue,
      },
      teamToday,
    };
  }

  private buildOwnerActionQueue(input: {
    unassignedCount: number;
    delayedCount: number;
    overdueCount: number;
    pendingQuotes: number;
    completedNotInvoiced: number;
    waitingApproval: number;
    lowStockCount: number;
    fleetIssueCount: number;
    schedulingConflicts: number;
    followUpCount: number;
  }): ExecutiveOwnerActionItem[] {
    const queue: ExecutiveOwnerActionItem[] = [];

    if (input.unassignedCount > 0) {
      queue.push({
        id: 'unassigned-jobs',
        category: 'Scheduling',
        title: 'Unassigned jobs today',
        description: 'Assign technicians before customers wait.',
        count: input.unassignedCount,
        href: '/scheduling',
        priority: 'critical',
      });
    }
    if (input.delayedCount > 0) {
      queue.push({
        id: 'delayed-jobs',
        category: 'Operations',
        title: 'Delayed jobs',
        description: 'Jobs past scheduled start — review dispatch.',
        count: input.delayedCount,
        href: '/jobs?filter=delayed',
        priority: 'critical',
      });
    }
    if (input.overdueCount > 0) {
      queue.push({
        id: 'overdue-invoices',
        category: 'Finance',
        title: 'Overdue invoices',
        description: 'Debtors needing follow-up from Xero-backed records.',
        count: input.overdueCount,
        href: '/finance/invoices?overdueOnly=true',
        priority: 'high',
      });
    }
    if (input.completedNotInvoiced > 0) {
      queue.push({
        id: 'completed-not-invoiced',
        category: 'Finance',
        title: 'Completed jobs not invoiced',
        description: 'Work finished today without an invoice link.',
        count: input.completedNotInvoiced,
        href: '/jobs?status=completed',
        priority: 'high',
      });
    }
    if (input.pendingQuotes > 0) {
      queue.push({
        id: 'quotes-awaiting',
        category: 'Sales',
        title: 'Quotes awaiting action',
        description: 'Sent or pending approval — follow up or approve.',
        count: input.pendingQuotes,
        href: '/finance/quotes',
        priority: 'normal',
      });
    }
    if (input.waitingApproval > 0) {
      queue.push({
        id: 'approvals-waiting',
        category: 'Approvals',
        title: 'Items waiting approval',
        description: 'Workflow, AURA or WhatsApp drafts need Owner decision.',
        count: input.waitingApproval,
        href: '/aura/todays-plan',
        priority: 'high',
      });
    }
    if (input.followUpCount > 0) {
      queue.push({
        id: 'customer-follow-ups',
        category: 'Customers',
        title: 'Customer follow-ups due',
        description: 'CRM follow-ups from live tenant records.',
        count: input.followUpCount,
        href: '/customers',
        priority: 'normal',
      });
    }
    if (input.lowStockCount > 0) {
      queue.push({
        id: 'stock-blockers',
        category: 'Inventory',
        title: 'Low stock items',
        description: 'Parts may block jobs — review inventory.',
        count: input.lowStockCount,
        href: '/inventory',
        priority: 'normal',
      });
    }
    if (input.fleetIssueCount > 0) {
      queue.push({
        id: 'fleet-alerts',
        category: 'Fleet',
        title: 'Fleet alerts',
        description: 'Vehicles out of service or maintenance.',
        count: input.fleetIssueCount,
        href: '/fleet/alerts',
        priority: 'normal',
      });
    }
    if (input.schedulingConflicts > 0) {
      queue.push({
        id: 'scheduling-conflicts',
        category: 'Scheduling',
        title: 'Scheduling conflicts',
        description: 'Overlaps or resource conflicts need review.',
        count: input.schedulingConflicts,
        href: '/scheduling',
        priority: 'high',
      });
    }

    return queue;
  }

  private buildLiveOperations(
    todayJobs: Awaited<ReturnType<JobsService['listTodaysScheduledJobs']>>,
    delayedJobs: Array<{
      id: string;
      scheduledEndAt: Date | null;
    }>,
    events: Array<{ id: string; title: string; scheduledAt: string | null }>,
  ): ExecutiveLiveJob[] {
    const delayedIds = new Set(delayedJobs.map((job) => job.id));
    const now = Date.now();

    return todayJobs
      .filter((job) => ['scheduled', 'in_progress'].includes(job.status))
      .slice(0, 12)
      .map((job) => {
        const next = events
          .filter((event) => event.id !== job.id && event.scheduledAt)
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

        const suburb = job.addressDisplay?.split(',').pop()?.trim() ?? null;
        let delayRisk: ExecutiveLiveJob['delayRisk'] = 'none';
        if (isDelayed) {
          delayRisk = 'high';
        } else if (job.scheduledEndAt && new Date(job.scheduledEndAt).getTime() - now < 30 * 60_000) {
          delayRisk = 'watch';
        }

        return {
          id: job.id,
          jobNumber: job.jobNumber,
          title: job.title,
          customerName: job.customerName,
          suburb,
          areaLabel: suburb,
          status: job.status,
          technicianName: job.assignedUserName,
          vehicleRegistration: null,
          scheduledAt: job.scheduledAt,
          scheduledEndAt: job.scheduledEndAt,
          expectedFinishAt: job.scheduledEndAt,
          nextJobTitle: next?.title ?? null,
          isDelayed,
          delayRisk,
          gpsTimestamp: null,
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
    const invoiceRows = await this.deps.db.query.invoices.findMany({
      where: and(eq(invoices.companyId, companyId), inArray(invoices.jobId, jobIds)),
      columns: { jobId: true, status: true },
    });
    const invoiceByJob = new Map(invoiceRows.map((row) => [row.jobId, row.status]));

    return completedJobs.map((job) => ({
      id: job.id,
      jobNumber: job.jobNumber,
      title: job.title,
      customerName: job.customer?.name ?? 'Unknown customer',
      technicianName: job.assignedUser ? displayName(job.assignedUser) : null,
      completedAt: job.updatedAt.toISOString(),
      invoiceStatus: invoiceByJob.get(job.id) ?? null,
      docsRequired: false,
      cocRequired: false,
    }));
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
    calendarEvents: Array<{ assignedUserId: string | null; status: string }>,
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
      const hasScheduledToday = calendarEvents.some(
        (event) => event.assignedUserId === member.id && event.status === 'scheduled',
      );

      let status: ExecutiveTeamMember['status'] = 'available';
      if (openEntry?.entryType === 'travel') {
        status = 'travelling';
      } else if (openEntry?.entryType === 'job_time' || inProgress) {
        status = 'on_site';
      } else if (assigned.length === 0 && !hasScheduledToday) {
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

      const missingCheckIn =
        hasScheduledToday &&
        !openEntry &&
        !inProgress &&
        assigned.some((job) => job.status === 'scheduled');

      return {
        userId: member.id,
        name: displayName(member),
        status,
        currentTask: inProgress?.title ?? null,
        nextTask: next?.title ?? null,
        isLate: Boolean(lateJob),
        missingCheckIn,
      };
    });
  }
}
