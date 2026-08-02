import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { resolveCustomerVisibleJobEtaAt } from '../lib/customer-visible-job-eta.js';
import type {
  MobileAlertSummary,
  MobileApprovalSummary,
  MobileAuraCustomerContext,
  MobileAuraOwnerContext,
  MobileAuraTechnicianContext,
  MobileCustomerCommunications,
  MobileCustomerDashboard,
  MobileCustomerDocuments,
  MobileCustomerInvoices,
  MobileCustomerJobTracking,
  MobileOwnerDashboard,
  MobileOwnerJobsOverview,
  MobileRevenueSummary,
  MobileTechnicianCustomerDetails,
  MobileTechnicianDashboard,
  MobileTechnicianFleetInfo,
  MobileTechnicianSchedule,
} from '@titan/shared';
import type { PortalAccessPermission } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  agentTasks,
  communications,
  customers,
  documents,
  invoices,
  jobs,
  workflowStepResults,
} from '@titan/db';
import type { AnalyticsService } from './analytics.service.js';
import type { FleetService } from './fleet.service.js';
import type { IntelligenceService } from './intelligence.service.js';
import type { JobsService } from './jobs.service.js';
import type { NotificationService } from './notification.service.js';
import type { RecommendationsService } from './recommendations.service.js';
import type { SchedulingService } from './scheduling.service.js';
import { getJobIdsForUserIncludingCrew, userHasJobAccess } from './job-execution.service.js';

type StaffScope = {
  companyId: string;
  userId: string;
};

type PortalScope = {
  companyId: string;
  customerId: string;
  portalUserId: string;
  permissions: PortalAccessPermission[];
};

export class MobileService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly intelligenceService: IntelligenceService,
    private readonly recommendationsService: RecommendationsService,
    private readonly analyticsService: AnalyticsService,
    private readonly jobsService: JobsService,
    private readonly schedulingService: SchedulingService,
    private readonly fleetService: FleetService,
    private readonly notificationService: NotificationService,
  ) {}

  async getOwnerDashboard(scope: StaffScope): Promise<MobileOwnerDashboard> {
    const [dashboard, recommendations, notifications, alerts] = await Promise.all([
      this.intelligenceService.getDashboard(scope.companyId),
      this.recommendationsService.getRecommendations(scope.companyId),
      this.notificationService.listForStaff(scope),
      this.getOwnerAlerts(scope.companyId),
    ]);

    return {
      greeting: dashboard.greeting,
      summary: {
        todaysJobs: dashboard.todaysJobs,
        outstandingInvoices: dashboard.outstandingInvoices,
        pendingApprovals: dashboard.pendingApprovals,
        automationFailures: dashboard.automationFailures,
        fleetIssues: dashboard.fleetIssues,
        revenue: dashboard.revenue,
      },
      recommendations: recommendations.recommendations,
      alerts,
      notifications,
    };
  }

  async getOwnerJobsOverview(companyId: string): Promise<MobileOwnerJobsOverview> {
    const stats = await this.jobsService.getStats(companyId);
    const jobsList = await this.jobsService.listJobs(companyId);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const completedTodayCount = jobsList.filter(
      (job) => job.status === 'completed' && new Date(job.updatedAt) >= startOfToday,
    ).length;

    return {
      totalCount: stats.totalCount,
      activeCount: stats.activeCount,
      completedTodayCount,
      jobs: jobsList.slice(0, 25),
    };
  }

  async getOwnerRevenueSummary(companyId: string): Promise<MobileRevenueSummary> {
    const dashboard = await this.analyticsService.getDashboard(companyId, { period: 'monthly' });

    return {
      revenueMtdCents: dashboard.revenue.totalCents,
      currency: dashboard.currency,
      openQuoteCount: dashboard.invoicePerformance.created,
      invoiceCount: dashboard.invoicePerformance.sent,
      paymentCount: dashboard.paymentPerformance.count,
    };
  }

  async getOwnerApprovals(companyId: string): Promise<MobileApprovalSummary[]> {
    const [agentRows, workflowRows] = await Promise.all([
      this.db.query.agentTasks.findMany({
        where: and(eq(agentTasks.companyId, companyId), eq(agentTasks.status, 'pending_approval')),
        orderBy: [desc(agentTasks.createdAt)],
        limit: 20,
      }),
      this.db.query.workflowStepResults.findMany({
        where: and(
          eq(workflowStepResults.companyId, companyId),
          eq(workflowStepResults.status, 'awaiting_approval'),
        ),
        orderBy: [desc(workflowStepResults.createdAt)],
        limit: 20,
      }),
    ]);

    const agentApprovals: MobileApprovalSummary[] = agentRows.map((row) => ({
      id: row.id,
      source: 'agent_task',
      title: row.taskType.replace(/_/g, ' '),
      preview: row.preview,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));

    const workflowApprovals: MobileApprovalSummary[] = workflowRows.map((row) => ({
      id: row.id,
      source: 'workflow_step',
      title: 'Workflow approval',
      preview: row.preview ?? 'Workflow step awaiting approval',
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));

    return [...agentApprovals, ...workflowApprovals].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async getOwnerAlerts(companyId: string): Promise<MobileAlertSummary[]> {
    const dashboard = await this.intelligenceService.getDashboard(companyId);
    const alerts: MobileAlertSummary[] = [];

    for (const failure of dashboard.automationFailures.items) {
      alerts.push({
        id: failure.id,
        type: 'automation_failure',
        title: failure.workflowName ?? 'Automation failure',
        description: failure.errorMessage ?? 'Workflow run failed',
        entityType: 'workflow_run',
        entityId: failure.id,
        createdAt: failure.startedAt,
      });
    }

    for (const issue of dashboard.fleetIssues.items) {
      alerts.push({
        id: issue.id,
        type: 'fleet_issue',
        title: issue.name,
        description: `Vehicle ${issue.licensePlate} is ${issue.status}`,
        entityType: 'vehicle',
        entityId: issue.id,
        createdAt: new Date().toISOString(),
      });
    }

    if (dashboard.pendingApprovals.count > 0) {
      alerts.push({
        id: `approvals-${companyId}`,
        type: 'approval_request',
        title: 'Pending approvals',
        description: `${dashboard.pendingApprovals.count} item(s) need review`,
        entityType: null,
        entityId: null,
        createdAt: new Date().toISOString(),
      });
    }

    return alerts;
  }

  async getTechnicianDashboard(scope: StaffScope): Promise<MobileTechnicianDashboard> {
    const [dashboard, recommendations, assignedJobs, notifications] = await Promise.all([
      this.intelligenceService.getDashboard(scope.companyId),
      this.recommendationsService.getRecommendations(scope.companyId),
      this.listAssignedJobs(scope),
      this.notificationService.listForStaff(scope),
    ]);

    const technicianRecommendations = recommendations.recommendations.filter((item) =>
      ['scheduling', 'fleet', 'general'].includes(item.category),
    );

    return {
      greeting: dashboard.greeting,
      todaysJobs: dashboard.todaysJobs,
      upcomingSchedule: dashboard.upcomingSchedule,
      fleetIssues: dashboard.fleetIssues,
      recommendations: technicianRecommendations,
      assignedJobs,
      notifications,
    };
  }

  async listAssignedJobs(scope: StaffScope) {
    const jobIds = await getJobIdsForUserIncludingCrew(this.db, scope.companyId, scope.userId);

    if (jobIds.length === 0) {
      return [];
    }

    const rows = await this.db.query.jobs.findMany({
      where: and(eq(jobs.companyId, scope.companyId), inArray(jobs.id, jobIds)),
      with: { customer: true, assignedUser: true },
      orderBy: [desc(jobs.scheduledAt), desc(jobs.updatedAt)],
      limit: 50,
    });

    return rows.map((row) => toMobileJobSummary(row));
  }

  async getTechnicianSchedule(
    scope: StaffScope,
    dateInput?: string,
  ): Promise<MobileTechnicianSchedule> {
    const date = dateInput ? new Date(dateInput) : new Date();
    const from = new Date(date);
    from.setHours(0, 0, 0, 0);
    const to = new Date(date);
    to.setHours(23, 59, 59, 999);

    const calendar = await this.schedulingService.getCalendar(scope.companyId, from, to);
    const events = calendar.events.filter((event) => event.assignedUserId === scope.userId);

    return {
      date: from.toISOString(),
      events,
    };
  }

  async getTechnicianCustomerDetails(
    scope: StaffScope,
    jobId: string,
  ): Promise<MobileTechnicianCustomerDetails | null> {
    const job = await this.jobsService.getJob(scope.companyId, jobId);

    if (!job) {
      return null;
    }

    const hasAccess = await userHasJobAccess(this.db, scope.companyId, jobId, scope.userId);
    if (!hasAccess) {
      return null;
    }

    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, job.customerId), eq(customers.companyId, scope.companyId)),
    });

    if (!customer) return null;

    return {
      customerId: customer.id,
      customerName: job.customerName || customer.name,
      email: job.siteContact.email ?? customer.email,
      phone: job.siteContact.mobile ?? customer.phone,
      address: job.address.display,
      accessInstructions: job.accessInstructions,
      siteContact: job.siteContact,
      job,
    };
  }

  async getTechnicianFleetInfo(scope: StaffScope): Promise<MobileTechnicianFleetInfo> {
    const companyVehicles = await this.fleetService.listVehicles(scope.companyId);
    const assignedVehicle =
      companyVehicles.find((vehicle) => vehicle.assignedUserId === scope.userId) ?? null;

    return {
      assignedVehicle,
      companyVehicles: companyVehicles.slice(0, 20),
    };
  }

  async getCustomerDashboard(scope: PortalScope): Promise<MobileCustomerDashboard> {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, scope.customerId), eq(customers.companyId, scope.companyId)),
      with: { company: true },
    });

    if (!customer?.company) {
      throw new Error('Customer not found');
    }

    const [activeJobs, recentInvoices, notifications] = await Promise.all([
      this.getCustomerJobs(scope),
      this.getCustomerInvoices(scope),
      this.notificationService.listForPortal({
        companyId: scope.companyId,
        portalUserId: scope.portalUserId,
      }),
    ]);

    const greeting = await this.intelligenceService.getDashboard(scope.companyId);

    return {
      greeting: greeting.greeting,
      customerName: customer.name,
      companyName: customer.company.name,
      permissions: scope.permissions,
      activeJobs: activeJobs.jobs.filter(
        (job) => job.status !== 'completed' && job.status !== 'cancelled',
      ),
      recentInvoices: recentInvoices.invoices.slice(0, 10),
      notifications,
    };
  }

  async getCustomerJobs(scope: PortalScope): Promise<MobileCustomerJobTracking> {
    if (!scope.permissions.includes('portal.jobs:read')) {
      return { jobs: [] };
    }

    const rows = await this.db.query.jobs.findMany({
      where: and(eq(jobs.companyId, scope.companyId), eq(jobs.customerId, scope.customerId)),
      with: { customer: true, assignedUser: true },
      orderBy: [desc(jobs.updatedAt)],
      limit: 25,
    });

    return {
      jobs: rows.map((row) => toMobileJobSummary(row, customerNameFallback(scope.customerId))),
    };
  }

  async getCustomerInvoices(scope: PortalScope): Promise<MobileCustomerInvoices> {
    if (!scope.permissions.includes('portal.invoices:read')) {
      return { invoices: [] };
    }

    const rows = await this.db.query.invoices.findMany({
      where: and(
        eq(invoices.companyId, scope.companyId),
        eq(invoices.customerId, scope.customerId),
      ),
      with: { customer: true, job: true },
      orderBy: [desc(invoices.updatedAt)],
      limit: 25,
    });

    return {
      invoices: rows.map((row) => {
        const totalCents = row.totalCents ?? row.amountCents;
        const internalNumber = row.internalNumber ?? row.invoiceNumber;
        const displayInvoiceNumber = row.xeroInvoiceNumber?.trim()
          ? row.xeroInvoiceNumber.trim()
          : `Pending Xero sync (${internalNumber})`;
        return {
          id: row.id,
          invoiceNumber: row.invoiceNumber,
          internalNumber,
          displayInvoiceNumber,
          xeroInvoiceNumber: row.xeroInvoiceNumber ?? null,
          xeroReference: row.xeroReference ?? null,
          numberAuthority: (row.numberAuthority ?? 'internal_pending_xero') as
            | 'internal_pending_xero'
            | 'xero',
          title: row.title,
          status: row.status,
          stage: row.stage ?? 'standard',
          customerId: row.customerId,
          customerName: row.customer?.name ?? customerNameFallback(scope.customerId),
          jobId: row.jobId,
          jobTitle: row.job?.title ?? null,
          jobNumber: row.job?.jobNumber ?? null,
          quoteId: row.quoteId ?? null,
          quoteNumber: null,
          quoteVersionNumber: row.quoteVersionNumber ?? null,
          amountCents: row.amountCents,
          totalCents,
          amountPaidCents: row.amountPaidCents,
          outstandingCents: Math.max(0, totalCents - row.amountPaidCents),
          isOverdue: Boolean(
            row.dueDate &&
              row.dueDate < new Date() &&
              ['sent', 'partial', 'overdue'].includes(row.status),
          ),
          currency: row.currency,
          dueDate: row.dueDate?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      }),
    };
  }

  async getCustomerDocuments(scope: PortalScope): Promise<MobileCustomerDocuments> {
    if (!scope.permissions.includes('portal.documents:read')) {
      return { documents: [] };
    }

    const rows = await this.db.query.documents.findMany({
      where: and(
        eq(documents.companyId, scope.companyId),
        eq(documents.customerId, scope.customerId),
      ),
      with: { category: true, customer: true, job: true, uploadedBy: true },
      orderBy: [desc(documents.updatedAt)],
      limit: 25,
    });

    return {
      documents: rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        fileName: row.fileName,
        fileType: row.fileType,
        fileSizeBytes: row.fileSizeBytes,
        categoryId: row.categoryId,
        categoryName: row.category?.name ?? null,
        customerId: row.customerId,
        customerName: row.customer?.name ?? null,
        jobId: row.jobId,
        jobTitle: row.job?.title ?? null,
        uploadedByUserId: row.uploadedByUserId,
        uploadedByName: row.uploadedBy
          ? `${row.uploadedBy.firstName} ${row.uploadedBy.lastName}`.trim()
          : 'Unknown',
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async getCustomerCommunications(scope: PortalScope): Promise<MobileCustomerCommunications> {
    if (!scope.permissions.includes('portal.communications:read')) {
      return { communications: [] };
    }

    // UX-G: internal notes never leak to portal/client surfaces.
    const rows = await this.db.query.communications.findMany({
      where: and(
        eq(communications.companyId, scope.companyId),
        eq(communications.customerId, scope.customerId),
        ne(communications.visibility, 'internal_note'),
      ),
      with: { customer: true, author: true, template: true, job: true },
      orderBy: [desc(communications.createdAt)],
      limit: 25,
    });

    return {
      communications: rows.map((row) => ({
        id: row.id,
        customerId: row.customerId,
        customerName: row.customer?.name ?? customerNameFallback(scope.customerId),
        jobId: row.jobId,
        jobNumber: row.job?.jobNumber ?? null,
        authorUserId: row.authorUserId,
        authorName: row.author
          ? `${row.author.firstName} ${row.author.lastName}`.trim()
          : 'Unknown',
        templateId: row.templateId,
        templateName: row.template?.name ?? null,
        channel: row.channel,
        direction: row.direction,
        visibility: row.visibility,
        deliveryState: row.deliveryState,
        subject: row.subject,
        body: row.body,
        failureReason: row.failureReason,
        clientActionId: row.clientActionId,
        occurredAt: row.occurredAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async buildOwnerAuraContext(scope: StaffScope): Promise<MobileAuraOwnerContext> {
    const dashboard = await this.getOwnerDashboard(scope);

    return {
      role: 'owner',
      summary: `${dashboard.summary.todaysJobs.count} jobs today, ${dashboard.summary.outstandingInvoices.count} outstanding invoices, ${dashboard.summary.pendingApprovals.count} pending approvals.`,
      revenueMtdCents: dashboard.summary.revenue.revenueMtdCents,
      currency: dashboard.summary.revenue.currency,
      outstandingInvoiceCount: dashboard.summary.outstandingInvoices.count,
      pendingApprovalCount: dashboard.summary.pendingApprovals.count,
      alertCount: dashboard.alerts.length,
    };
  }

  async buildTechnicianAuraContext(scope: StaffScope): Promise<MobileAuraTechnicianContext> {
    const assignedJobs = await this.listAssignedJobs(scope);
    const nextJob =
      assignedJobs.find((job) => ['scheduled', 'in_progress', 'new'].includes(job.status)) ?? null;

    return {
      role: 'technician',
      summary: nextJob
        ? `Next job: ${nextJob.title} for ${nextJob.customerName}.`
        : 'No upcoming assigned jobs.',
      nextJob: nextJob
        ? {
            id: nextJob.id,
            title: nextJob.title,
            customerName: nextJob.customerName,
            status: nextJob.status,
            scheduledAt: nextJob.scheduledAt,
          }
        : null,
      assignedJobCount: assignedJobs.length,
    };
  }

  async buildCustomerAuraContext(scope: PortalScope): Promise<MobileAuraCustomerContext> {
    const [jobsData, invoicesData] = await Promise.all([
      this.getCustomerJobs(scope),
      this.getCustomerInvoices(scope),
    ]);

    const activeJob =
      jobsData.jobs.find((job) => job.status !== 'completed' && job.status !== 'cancelled') ?? null;
    const outstandingInvoiceCount = invoicesData.invoices.filter((invoice) =>
      ['sent', 'partial', 'overdue'].includes(invoice.status),
    ).length;

    return {
      role: 'customer',
      summary: activeJob
        ? `Your repair "${activeJob.title}" is currently ${activeJob.status.replace(/_/g, ' ')}.`
        : 'No active repair jobs are currently in progress.',
      activeJob: activeJob
        ? {
            id: activeJob.id,
            title: activeJob.title,
            status: activeJob.status,
            scheduledAt: activeJob.scheduledAt,
          }
        : null,
      outstandingInvoiceCount,
    };
  }
}

function customerNameFallback(customerId: string): string {
  return `Customer ${customerId.slice(0, 8)}`;
}

function toMobileJobSummary(
  row: typeof jobs.$inferSelect & {
    customer?: { name: string } | null;
    assignedUser?: { firstName: string; lastName: string } | null;
  },
  fallbackCustomerName?: string,
) {
  const addressDisplay =
    [
      row.snapshotUnit ? `Unit ${row.snapshotUnit}` : null,
      row.snapshotStreet,
      row.snapshotSuburb,
      row.snapshotCity,
      row.snapshotProvince,
      row.snapshotPostalCode,
    ]
      .filter(Boolean)
      .join(', ') || null;

  return {
    id: row.id,
    jobNumber: row.jobNumber ?? null,
    customerId: row.customerId,
    customerName:
      row.snapshotCustomerName ?? row.customer?.name ?? fallbackCustomerName ?? 'Unknown',
    propertyId: row.propertyId ?? null,
    title: row.title,
    jobType: row.jobType ?? null,
    priority: row.priority ?? 'normal',
    status: row.status,
    addressDisplay,
    latitude: row.snapshotLatitude ?? null,
    longitude: row.snapshotLongitude ?? null,
    placeId: row.snapshotPlaceId ?? null,
    siteContactMobile: row.snapshotSiteContactMobile ?? null,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    scheduledEndAt: row.scheduledEndAt?.toISOString() ?? null,
    assignedUserId: row.assignedUserId,
    assignedUserName: row.assignedUser
      ? `${row.assignedUser.firstName} ${row.assignedUser.lastName}`.trim()
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    etaAt: resolveCustomerVisibleJobEtaAt({
      assignedUserId: row.assignedUserId,
      status: row.status,
      scheduledAt: row.scheduledAt,
      scheduledEndAt: row.scheduledEndAt,
    }),
  };
}
