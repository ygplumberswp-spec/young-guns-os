import { and, desc, eq, gte, inArray, isNotNull, lte, or, sql } from 'drizzle-orm';
import type { IntelligenceDashboard, IntelligenceGreeting } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  agentTasks,
  customerActivities,
  customers,
  invoices,
  jobs,
  vehicles,
  whatsappMessages,
  workflowRuns,
} from '@titan/db';
import type { AutomationService } from './automation.service.js';
import type { FinanceService } from './finance.service.js';
import type { InventoryService } from './inventory.service.js';
import type { SchedulingService } from './scheduling.service.js';

export type AuraIntelligenceContext = {
  greeting: IntelligenceGreeting;
  todaysJobCount: number;
  upcomingScheduleCount: number;
  outstandingInvoiceCount: number;
  customerFollowUpCount: number;
  pendingApprovalCount: number;
  automationFailureCount: number;
  fleetIssueCount: number;
  lowStockCount: number;
  revenueMtdCents: number;
  currency: string;
};

/** Days without customer contact before the dashboard flags a follow-up. */
const FOLLOW_UP_STALE_DAYS = 14;

type IntelligenceDeps = {
  db: DatabaseClient;
  financeService: FinanceService;
  schedulingService: SchedulingService;
  inventoryService: InventoryService;
  automationService: AutomationService;
};

export class IntelligenceService {
  constructor(private readonly deps: IntelligenceDeps) {}

  async getDashboard(companyId: string): Promise<IntelligenceDashboard> {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      financeStats,
      inventoryStats,
      todaysJobRows,
      upcomingCalendar,
      outstandingInvoiceRows,
      followUpRows,
      followUpCount,
      agentTaskCount,
      workflowStepCount,
      whatsappDraftCount,
      failedRuns,
      fleetIssueRows,
      schedulingConflicts,
    ] = await Promise.all([
      this.deps.financeService.getStats(companyId),
      this.deps.inventoryService.getStats(companyId),
      this.deps.db.query.jobs.findMany({
        where: and(
          eq(jobs.companyId, companyId),
          or(
            and(gte(jobs.scheduledAt, startOfToday), lte(jobs.scheduledAt, endOfToday)),
            inArray(jobs.status, ['new', 'scheduled', 'in_progress']),
          ),
        ),
        with: { customer: true },
        orderBy: [desc(jobs.scheduledAt)],
        limit: 20,
      }),
      this.deps.schedulingService.getCalendar(companyId, now, horizon),
      this.deps.db.query.invoices.findMany({
        where: and(
          eq(invoices.companyId, companyId),
          inArray(invoices.status, ['sent', 'partial', 'overdue']),
        ),
        with: { customer: true },
        orderBy: [desc(invoices.dueDate)],
        limit: 20,
      }),
      this.findFollowUpCustomers(companyId),
      this.countFollowUpCustomers(companyId),
      this.countPendingAgentTasks(companyId),
      this.countPendingWorkflowSteps(companyId),
      this.countWhatsappDrafts(companyId),
      this.deps.db.query.workflowRuns.findMany({
        where: and(eq(workflowRuns.companyId, companyId), eq(workflowRuns.status, 'failed')),
        with: { workflow: true },
        orderBy: [desc(workflowRuns.startedAt)],
        limit: 10,
      }),
      this.deps.db.query.vehicles.findMany({
        where: and(
          eq(vehicles.companyId, companyId),
          inArray(vehicles.status, ['maintenance', 'out_of_service']),
        ),
        orderBy: [desc(vehicles.updatedAt)],
        limit: 10,
      }),
      this.countSchedulingConflicts(companyId),
    ]);

    const outstandingTotalCents = outstandingInvoiceRows.reduce(
      (sum, invoice) => sum + Math.max(0, invoice.amountCents - invoice.amountPaidCents),
      0,
    );

    const pendingApprovalCount = agentTaskCount + workflowStepCount + whatsappDraftCount;

    const dashboard: IntelligenceDashboard = {
      greeting: this.buildGreeting({
        todaysJobs: todaysJobRows.length,
        unpaidInvoices: outstandingInvoiceRows.length,
        pendingApprovals: pendingApprovalCount,
        fleetIssues: fleetIssueRows.length,
      }),
      todaysJobs: {
        count: todaysJobRows.length,
        items: todaysJobRows.map((job) => ({
          id: job.id,
          title: job.title,
          status: job.status,
          customerName: job.customer?.name ?? 'Unknown',
          scheduledAt: job.scheduledAt?.toISOString() ?? null,
        })),
      },
      upcomingSchedule: {
        count: upcomingCalendar.events.length,
        items: upcomingCalendar.events.slice(0, 10),
      },
      revenue: {
        revenueMtdCents: financeStats.revenueMtdCents,
        currency: financeStats.currency,
        openQuoteCount: financeStats.openQuoteCount,
        invoiceCount: financeStats.invoiceCount,
        paymentCount: financeStats.paymentCount,
      },
      outstandingInvoices: {
        count: outstandingInvoiceRows.length,
        totalOutstandingCents: outstandingTotalCents,
        currency: financeStats.currency,
        items: outstandingInvoiceRows.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customer?.name ?? 'Unknown',
          status: invoice.status,
          amountCents: invoice.amountCents,
          amountPaidCents: invoice.amountPaidCents,
          dueDate: invoice.dueDate?.toISOString() ?? null,
        })),
      },
      customerFollowUps: {
        count: followUpCount,
        items: followUpRows,
      },
      pendingApprovals: {
        count: pendingApprovalCount,
        agentTaskCount,
        workflowStepCount,
        whatsappDraftCount,
      },
      automationFailures: {
        count: failedRuns.length,
        items: failedRuns.map((run) => ({
          id: run.id,
          workflowName: run.workflow?.name ?? null,
          triggerEvent: run.triggerEvent,
          errorMessage: run.errorMessage,
          startedAt: run.startedAt.toISOString(),
        })),
      },
      fleetIssues: {
        count: fleetIssueRows.length,
        items: fleetIssueRows.map((vehicle) => ({
          id: vehicle.id,
          name: vehicle.name,
          status: vehicle.status,
          licensePlate: vehicle.licensePlate,
        })),
      },
      lowStockCount: inventoryStats.lowStockCount,
      schedulingConflicts,
    };

    return dashboard;
  }

  async buildAuraContext(companyId: string): Promise<AuraIntelligenceContext> {
    const dashboard = await this.getDashboard(companyId);

    return {
      greeting: dashboard.greeting,
      todaysJobCount: dashboard.todaysJobs.count,
      upcomingScheduleCount: dashboard.upcomingSchedule.count,
      outstandingInvoiceCount: dashboard.outstandingInvoices.count,
      customerFollowUpCount: dashboard.customerFollowUps.count,
      pendingApprovalCount: dashboard.pendingApprovals.count,
      automationFailureCount: dashboard.automationFailures.count,
      fleetIssueCount: dashboard.fleetIssues.count,
      lowStockCount: dashboard.lowStockCount,
      revenueMtdCents: dashboard.revenue.revenueMtdCents,
      currency: dashboard.revenue.currency,
    };
  }

  private buildGreeting(params: {
    todaysJobs: number;
    unpaidInvoices: number;
    pendingApprovals: number;
    fleetIssues: number;
  }): IntelligenceGreeting {
    const hour = new Date().getHours();
    const salutation = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const parts: string[] = [];

    if (params.todaysJobs > 0) {
      parts.push(`${params.todaysJobs} job${params.todaysJobs === 1 ? '' : 's'} today`);
    }

    if (params.unpaidInvoices > 0) {
      parts.push(
        `${params.unpaidInvoices} unpaid invoice${params.unpaidInvoices === 1 ? '' : 's'}`,
      );
    }

    if (params.pendingApprovals > 0) {
      parts.push(
        `${params.pendingApprovals} approval${params.pendingApprovals === 1 ? '' : 's'} waiting`,
      );
    }

    if (params.fleetIssues > 0) {
      parts.push(
        `${params.fleetIssues} vehicle${params.fleetIssues === 1 ? '' : 's'} requiring attention`,
      );
    }

    const message =
      parts.length > 0
        ? `${salutation}. You have ${parts.join(', ')}.`
        : `${salutation}. Your business overview is clear — no urgent items right now.`;

    return {
      message,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Every active customer overdue for contact, counted in SQL.
   * `findFollowUpCustomers` only returns a preview page, so the count cannot be derived from it.
   */
  private async countFollowUpCustomers(companyId: string): Promise<number> {
    const cutoff = new Date(Date.now() - FOLLOW_UP_STALE_DAYS * 24 * 60 * 60 * 1000);

    const [row] = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(
        and(
          eq(customers.companyId, companyId),
          eq(customers.status, 'active'),
          sql`coalesce(
            (select max(${customerActivities.createdAt})
               from ${customerActivities}
              where ${customerActivities.customerId} = ${customers.id}),
            ${cutoff}::timestamptz
          ) <= ${cutoff}::timestamptz`,
        ),
      );

    return row?.count ?? 0;
  }

  private async findFollowUpCustomers(companyId: string) {
    const cutoff = new Date(Date.now() - FOLLOW_UP_STALE_DAYS * 24 * 60 * 60 * 1000);

    const customerRows = await this.deps.db.query.customers.findMany({
      where: and(eq(customers.companyId, companyId), eq(customers.status, 'active')),
      with: {
        activities: {
          orderBy: [desc(customerActivities.createdAt)],
          limit: 1,
        },
      },
      orderBy: [desc(customers.updatedAt)],
      limit: 50,
    });

    const items = customerRows
      .map((customer) => {
        const lastActivity = customer.activities[0]?.createdAt ?? null;
        const referenceDate = lastActivity ?? customer.updatedAt;
        const daysSinceContact = Math.floor(
          (Date.now() - referenceDate.getTime()) / (24 * 60 * 60 * 1000),
        );

        return {
          id: customer.id,
          name: customer.name,
          lastActivityAt: lastActivity?.toISOString() ?? null,
          daysSinceContact,
        };
      })
      .filter((item) => {
        const reference = item.lastActivityAt ? new Date(item.lastActivityAt) : cutoff;
        return reference <= cutoff;
      })
      .sort((a, b) => b.daysSinceContact - a.daysSinceContact)
      .slice(0, 10);

    return items;
  }

  private async countPendingAgentTasks(companyId: string): Promise<number> {
    const [row] = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentTasks)
      .where(and(eq(agentTasks.companyId, companyId), eq(agentTasks.status, 'pending_approval')));

    return row?.count ?? 0;
  }

  private async countPendingWorkflowSteps(companyId: string): Promise<number> {
    const stats = await this.deps.automationService.getStats(companyId);
    return stats.pendingApprovalCount;
  }

  private async countWhatsappDrafts(companyId: string): Promise<number> {
    const [row] = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(whatsappMessages)
      .where(and(eq(whatsappMessages.companyId, companyId), eq(whatsappMessages.isDraft, true)));

    return row?.count ?? 0;
  }

  private async countSchedulingConflicts(companyId: string): Promise<number> {
    const scheduledJobs = await this.deps.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, companyId),
        isNotNull(jobs.scheduledAt),
        isNotNull(jobs.assignedUserId),
        inArray(jobs.status, ['scheduled', 'in_progress']),
      ),
      orderBy: [desc(jobs.scheduledAt)],
    });

    let conflicts = 0;

    for (let index = 0; index < scheduledJobs.length; index += 1) {
      const current = scheduledJobs[index]!;

      for (let otherIndex = index + 1; otherIndex < scheduledJobs.length; otherIndex += 1) {
        const other = scheduledJobs[otherIndex]!;

        if (current.assignedUserId !== other.assignedUserId) {
          continue;
        }

        if (!current.scheduledAt || !other.scheduledAt) {
          continue;
        }

        const currentEnd =
          current.scheduledEndAt ?? new Date(current.scheduledAt.getTime() + 60 * 60 * 1000);
        const otherEnd =
          other.scheduledEndAt ?? new Date(other.scheduledAt.getTime() + 60 * 60 * 1000);

        if (current.scheduledAt < otherEnd && other.scheduledAt < currentEnd) {
          conflicts += 1;
        }
      }
    }

    return conflicts;
  }
}
