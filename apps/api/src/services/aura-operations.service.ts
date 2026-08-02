import { and, count, eq, gte, lt } from 'drizzle-orm';
import type {
  AuraOperationsEndOfDaySummary,
  AuraOperationsMorningSummary,
  AuraOperationsRecommendation,
  AuraOperationsSummary,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { departmentRoutineTasks, mobileTimeEntries } from '@titan/db';
import type { DashboardExecutiveService } from './dashboard-executive.service.js';
import type { DocumentsComplianceService } from './documents-compliance.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';
import type { FinanceIntelligenceService } from './finance-intelligence.service.js';
import type { RecommendationsService } from './recommendations.service.js';

type StaffScope = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

type AuraOperationsDeps = {
  db: DatabaseClient;
  dashboardExecutiveService: DashboardExecutiveService;
  financeIntelligenceService: FinanceIntelligenceService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  documentsComplianceService: DocumentsComplianceService;
  recommendationsService: RecommendationsService;
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

export class AuraOperationsService {
  constructor(private readonly deps: AuraOperationsDeps) {}

  async getOperationsSummary(scope: StaffScope): Promise<AuraOperationsSummary> {
    const { companyId } = scope;
    const now = new Date();
    const start = startOfLocalDay();
    const end = endOfLocalDay();

    const [
      executive,
      receivables,
      payables,
      missionSummary,
      missionModules,
      compliance,
      recommendationsResult,
      departmentApprovals,
      timeEntryStats,
    ] = await Promise.all([
      this.deps.dashboardExecutiveService.getExecutiveSummary(companyId),
      this.deps.financeIntelligenceService.getReceivablesIntelligence(companyId),
      this.deps.financeIntelligenceService.getPayablesIntelligence(companyId),
      this.deps.enterpriseMissionControlService.getMissionControlSummary(companyId),
      this.deps.enterpriseMissionControlService.getMissionControlModuleSnapshots(companyId),
      this.deps.documentsComplianceService.buildComplianceWorkspace(scope),
      this.deps.recommendationsService.getRecommendations(companyId),
      this.countDepartmentApprovals(companyId),
      this.summarizeTimeEntries(companyId, start, end),
    ]);

    const glance = executive.todayAtAGlance;
    const money = glance.money;
    const jobs = glance.jobs;
    const team = glance.team;

    const missingDocQueues = [
      'missing_coc',
      'missing_signature',
      'missing_photos',
      'missing_slips',
      'missing_quote_invoice_link',
      'correction_required',
    ] as const;
    const missingDocuments = compliance.queueSummaries
      .filter((queue) => (missingDocQueues as readonly string[]).includes(queue.queue))
      .reduce((sum, queue) => sum + queue.count, 0);

    const billsDueCount = payables.accpayAvailable
      ? null
      : payables.unapprovedPurchaseCount > 0
        ? payables.unapprovedPurchaseCount
        : payables.poCashRequirementCents > 0
          ? 1
          : 0;

    const billsDueAmount = payables.accpayAvailable
      ? payables.dueIn7DaysCents
      : payables.poCashRequirementCents > 0
        ? payables.poCashRequirementCents
        : null;

    const cashDueCents =
      money.dueThisWeekCount != null && money.outstandingCents != null
        ? money.outstandingCents
        : receivables.overdueAmountCents > 0
          ? receivables.overdueAmountCents
          : null;

    const totalApprovals =
      (executive.header.approvalsWaiting ?? 0) + departmentApprovals + missionSummary.pendingActionCount;

    const topOwnerActions = executive.priorities.actionQueue.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.title,
      count: item.count,
      href: item.href,
      priority: item.priority,
    }));

    const morning: AuraOperationsMorningSummary = {
      period: 'morning',
      generatedAt: now.toISOString(),
      jobsToday: executive.header.jobsToday,
      unassignedWork: jobs.unassigned,
      attendance: {
        working: team.working,
        late: team.late,
        missingCheckIn: team.missingCheckIn,
      },
      delays: jobs.delayed,
      cashDueCents,
      overdueDebtors: {
        count: receivables.overdueCount,
        amountCents: receivables.overdueAmountCents,
        currency: receivables.currency,
      },
      billsDue: {
        count: billsDueCount,
        amountCents: billsDueAmount,
        available: payables.accpayAvailable,
        currency: payables.currency,
      },
      leadFollowUps: glance.customerActivity.newLeads,
      quoteFollowUps:
        executive.priorities.actionQueue.find((item) => item.id === 'pending-quotes')?.count ?? null,
      stockBlockers:
        executive.priorities.actionQueue.find((item) => item.id === 'low-stock')?.count ?? null,
      fleetAlerts: missionSummary.criticalAlertCount + missionSummary.pendingAlertCount,
      missingDocuments: missingDocuments > 0 ? missingDocuments : null,
      approvals: totalApprovals > 0 ? totalApprovals : null,
      topOwnerActions,
    };

    const scheduledToday = jobs.scheduled + jobs.inProgress + jobs.completed;
    const jobsCarriedOver =
      scheduledToday > 0 ? Math.max(0, scheduledToday - jobs.completed) : jobs.unassigned;

    const completedMissingCloseOut = executive.completedToday.filter(
      (job) => job.docsRequired || job.cocRequired || !job.invoiceStatus,
    ).length;

    const attentionModules = missionModules.filter(
      (module) => module.status === 'attention_required' || module.status === 'critical',
    );

    const tomorrowRisks: AuraOperationsEndOfDaySummary['tomorrowRisks'] = [];

    for (const module of attentionModules.slice(0, 3)) {
      tomorrowRisks.push({
        id: `module-${module.module}`,
        title: module.module.replace(/_/g, ' '),
        description: module.summary || `Module status: ${module.status}`,
        href: '/mission-control',
      });
    }

    if (jobs.unassigned > 0) {
      tomorrowRisks.push({
        id: 'unassigned-carry',
        title: 'Unassigned work carries forward',
        description: `${jobs.unassigned} job(s) still unassigned — dispatch risk for tomorrow.`,
        href: '/scheduling',
      });
    }

    if (receivables.overdueCount > 0) {
      tomorrowRisks.push({
        id: 'overdue-receivables',
        title: 'Overdue receivables',
        description: `${receivables.overdueCount} overdue invoice(s) totalling ${receivables.overdueAmountCents} cents.`,
        href: '/finance/invoices?overdueOnly=true',
      });
    }

    const endOfDay: AuraOperationsEndOfDaySummary = {
      period: 'end-of-day',
      generatedAt: now.toISOString(),
      jobsCompleted: jobs.completed,
      jobsCarriedOver,
      invoicedRevenueCents: money.invoicedTodayCents,
      cashReceivedCents: money.paymentsTodayCents,
      currency: money.currency,
      overdueChanges: {
        currentCount: receivables.overdueCount,
        currentAmountCents: receivables.overdueAmountCents,
        countDelta: null,
        amountCentsDelta: null,
        note: 'Historical overdue delta unavailable — current receivables snapshot only.',
      },
      hoursWorked: timeEntryStats.hoursWorked,
      overtimeHours: timeEntryStats.overtimeHours,
      missingCloseOut: completedMissingCloseOut > 0 ? completedMissingCloseOut : null,
      tomorrowRisks,
    };

    const recommendations = this.buildRecommendations({
      executive,
      receivables,
      payables,
      missionSummary,
      compliance,
      recommendationsResult: recommendationsResult.recommendations,
      departmentApprovals,
    });

    return {
      generatedAt: now.toISOString(),
      morning,
      endOfDay,
      recommendations,
      dataSources: [
        'dashboard/executive-summary',
        'finance-intelligence/receivables',
        'finance-intelligence/payables',
        'mission-control/summary',
        'mission-control/modules',
        'documents/compliance-workspace',
        'intelligence/recommendations',
        'department-routine-tasks',
        'mobile-time-entries',
      ],
    };
  }

  private async countDepartmentApprovals(companyId: string): Promise<number> {
    const [row] = await this.deps.db
      .select({ count: count() })
      .from(departmentRoutineTasks)
      .where(
        and(
          eq(departmentRoutineTasks.companyId, companyId),
          eq(departmentRoutineTasks.status, 'awaiting_approval'),
        ),
      );
    return Number(row?.count ?? 0);
  }

  private async summarizeTimeEntries(companyId: string, start: Date, end: Date) {
    const rows = await this.deps.db.query.mobileTimeEntries.findMany({
      where: and(
        eq(mobileTimeEntries.companyId, companyId),
        gte(mobileTimeEntries.startedAt, start),
        lt(mobileTimeEntries.startedAt, end),
      ),
      columns: {
        userId: true,
        durationMinutes: true,
        startedAt: true,
        endedAt: true,
      },
    });

    if (rows.length === 0) {
      return { hoursWorked: null, overtimeHours: null };
    }

    const minutesByUser = new Map<string, number>();
    for (const row of rows) {
      const minutes =
        row.durationMinutes ??
        (row.endedAt
          ? Math.max(0, Math.round((row.endedAt.getTime() - row.startedAt.getTime()) / 60_000))
          : 0);
      minutesByUser.set(row.userId, (minutesByUser.get(row.userId) ?? 0) + minutes);
    }

    const totalMinutes = [...minutesByUser.values()].reduce((sum, value) => sum + value, 0);
    const overtimeMinutes = [...minutesByUser.values()].reduce(
      (sum, value) => sum + Math.max(0, value - 8 * 60),
      0,
    );

    return {
      hoursWorked: Math.round((totalMinutes / 60) * 10) / 10,
      overtimeHours: overtimeMinutes > 0 ? Math.round((overtimeMinutes / 60) * 10) / 10 : null,
    };
  }

  private buildRecommendations(input: {
    executive: Awaited<ReturnType<DashboardExecutiveService['getExecutiveSummary']>>;
    receivables: Awaited<ReturnType<FinanceIntelligenceService['getReceivablesIntelligence']>>;
    payables: Awaited<ReturnType<FinanceIntelligenceService['getPayablesIntelligence']>>;
    missionSummary: Awaited<
      ReturnType<EnterpriseMissionControlService['getMissionControlSummary']>
    >;
    compliance: Awaited<ReturnType<DocumentsComplianceService['buildComplianceWorkspace']>>;
    recommendationsResult: Awaited<
      ReturnType<RecommendationsService['getRecommendations']>
    >['recommendations'];
    departmentApprovals: number;
  }): AuraOperationsRecommendation[] {
    const items: AuraOperationsRecommendation[] = [];

    for (const action of input.executive.priorities.actionQueue.slice(0, 8)) {
      items.push({
        id: `action-${action.id}`,
        reason: action.description,
        sourceRecords: [
          {
            source: 'dashboard/executive-summary',
            count: action.count,
            href: action.href,
          },
        ],
        impact: `${action.count} item(s) in ${action.category}`,
        proposedAction: `Review ${action.title.toLowerCase()} in the owner action centre`,
        approvalRequired: action.category === 'Approvals',
        priority: action.priority,
        href: action.href,
      });
    }

    if (input.receivables.overdueCount > 0) {
      const topInvoices = input.receivables.collectionPriorities.slice(0, 3);
      items.push({
        id: 'rec-overdue-debtors',
        reason: `${input.receivables.overdueCount} invoice(s) past due from finance receivables aggregate`,
        sourceRecords: [
          {
            source: 'finance-intelligence/receivables',
            recordIds: topInvoices.map((row) => row.invoiceId),
            count: input.receivables.overdueCount,
            href: '/finance/invoices?overdueOnly=true',
          },
        ],
        impact: `R${(input.receivables.overdueAmountCents / 100).toFixed(2)} overdue`,
        proposedAction: 'Draft collection follow-up for Owner approval before sending',
        approvalRequired: true,
        priority: input.receivables.overdueAmountCents > 100_000 ? 'critical' : 'high',
        href: '/finance/invoices?overdueOnly=true',
      });
    }

    if (input.missionSummary.pendingAlertCount > 0) {
      items.push({
        id: 'mc-pending-alerts',
        reason: 'Mission control reports pending or escalated alerts',
        sourceRecords: [
          {
            source: 'mission-control/summary',
            recordIds: input.missionSummary.recentAlerts.slice(0, 5).map((alert) => alert.id),
            count: input.missionSummary.pendingAlertCount,
            href: '/mission-control',
          },
        ],
        impact: `${input.missionSummary.pendingAlertCount} alert(s) need triage`,
        proposedAction: 'Review mission control alerts and acknowledge or escalate',
        approvalRequired: true,
        priority: input.missionSummary.criticalAlertCount > 0 ? 'critical' : 'high',
        href: '/mission-control',
      });
    }

    const missingDocs = input.compliance.queueSummaries
      .filter((queue) =>
        ['missing_coc', 'missing_signature', 'missing_photos', 'missing_slips'].includes(queue.queue),
      )
      .reduce((sum, queue) => sum + queue.count, 0);
    if (missingDocs > 0) {
      items.push({
        id: 'docs-missing',
        reason: 'Documents compliance workspace flagged jobs missing required documentation',
        sourceRecords: [
          {
            source: 'documents/compliance-workspace',
            count: missingDocs,
            href: '/documents/compliance',
          },
        ],
        impact: `${missingDocs} job(s) blocked on documentation`,
        proposedAction: 'Assign technicians to upload missing job documentation',
        approvalRequired: false,
        priority: 'high',
        href: '/documents/compliance',
      });
    }

    if (input.departmentApprovals > 0) {
      items.push({
        id: 'dept-routine-approvals',
        reason: 'Department routine tasks awaiting Owner approval gate',
        sourceRecords: [
          {
            source: 'department-routine-tasks',
            count: input.departmentApprovals,
            href: '/departments',
          },
        ],
        impact: `${input.departmentApprovals} department routine(s) blocked on approval`,
        proposedAction: 'Approve or skip routine tasks in department workspaces',
        approvalRequired: true,
        priority: 'normal',
        href: '/departments',
      });
    }

    for (const rec of input.recommendationsResult.slice(0, 5)) {
      if (items.some((item) => item.id === `intel-${rec.id}`)) {
        continue;
      }
      items.push({
        id: `intel-${rec.id}`,
        reason: rec.description,
        sourceRecords: [
          {
            source: 'intelligence/recommendations',
            recordIds: rec.entityId ? [rec.entityId] : undefined,
            href: rec.entityType === 'invoice' ? `/finance/invoices/${rec.entityId}` : undefined,
          },
        ],
        impact: rec.title,
        proposedAction: rec.actionHint ?? 'Review in AURA recommendations',
        approvalRequired: rec.category === 'invoice_payment' || rec.category === 'automation',
        priority: rec.priority === 'high' ? 'high' : rec.priority === 'low' ? 'normal' : 'high',
      });
    }

    const priorityOrder = { critical: 0, high: 1, normal: 2 };
    items.sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority]);

    return items.slice(0, 12);
  }
}
