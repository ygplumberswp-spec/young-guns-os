import { and, desc, eq, ne, or, sql } from 'drizzle-orm';
import type {
  CreatePortalCustomerRequest,
  PortalAppointmentSummary,
  PortalCustomerCommunicationsCentre,
  PortalCustomerExperienceAuraContext,
  PortalCustomerExperienceDashboard,
  PortalCustomerRequestSummary,
  PortalFinanceCentre,
  PortalJobTrackingDetail,
  PortalKnowledgeArticleSummary,
  PortalKnowledgeSearchRequest,
  PortalQuoteDetail,
} from '@titan/shared';
import type { PortalAccessPermission } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  customerSupportConversations,
  customers,
  documents,
  invoices,
  jobs,
  knowledgeArticles,
  payments,
  portalCustomerRequests,
  portalUsers,
  quotes,
  sopDocuments,
  voiceSessions,
} from '@titan/db';
import type { MobileService } from './mobile.service.js';
import type { NotificationService } from './notification.service.js';

export class PortalExperienceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PortalExperienceError';
  }
}

export type PortalCustomerScope = {
  companyId: string;
  customerId: string;
  portalUserId: string;
  permissions: PortalAccessPermission[];
};

type StaffCustomerScope = {
  companyId: string;
  customerId: string;
};

type PortalJobRows = Awaited<ReturnType<DatabaseClient['query']['jobs']['findMany']>>;
type PortalQuoteRows = Awaited<ReturnType<DatabaseClient['query']['quotes']['findMany']>>;
type PortalInvoiceRows = Awaited<ReturnType<DatabaseClient['query']['invoices']['findMany']>>;

export class PortalExperienceService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly mobileService: MobileService,
    private readonly notificationService: NotificationService,
  ) {}

  async getExperienceDashboard(scope: PortalCustomerScope): Promise<PortalCustomerExperienceDashboard> {
    const customer = await this.getCustomer(scope.companyId, scope.customerId);
    const permissionSet = new Set(scope.permissions);

    const [jobRows, quoteRows, invoiceRows, commRows, notifications] = await Promise.all([
      permissionSet.has('portal.jobs:read')
        ? this.db.query.jobs.findMany({
            where: and(eq(jobs.companyId, scope.companyId), eq(jobs.customerId, scope.customerId)),
            with: { customer: true, assignedUser: true },
            orderBy: [desc(jobs.updatedAt)],
            limit: 50,
          })
        : Promise.resolve([] as PortalJobRows),
      permissionSet.has('portal.quotes:read')
        ? this.db.query.quotes.findMany({
            where: and(
              eq(quotes.companyId, scope.companyId),
              eq(quotes.customerId, scope.customerId),
              ne(quotes.status, 'draft'),
            ),
            with: { customer: true, job: true },
            orderBy: [desc(quotes.updatedAt)],
            limit: 25,
          })
        : Promise.resolve([] as PortalQuoteRows),
      permissionSet.has('portal.invoices:read')
        ? this.db.query.invoices.findMany({
            where: and(eq(invoices.companyId, scope.companyId), eq(invoices.customerId, scope.customerId)),
            with: { customer: true, job: true },
            orderBy: [desc(invoices.updatedAt)],
            limit: 25,
          })
        : Promise.resolve([] as PortalInvoiceRows),
      permissionSet.has('portal.communications:read')
        ? this.mobileService.getCustomerCommunications(scope)
        : Promise.resolve({ communications: [] }),
      this.notificationService.listForPortal({
        companyId: scope.companyId,
        portalUserId: scope.portalUserId,
      }),
    ]);

    const activeJobs = jobRows.filter((job) => !['completed', 'cancelled'].includes(job.status));
    const completedJobs = jobRows.filter((job) => job.status === 'completed');
    const pendingQuotes = quoteRows.filter((quote) => quote.status === 'sent');
    const outstandingInvoices = invoiceRows.filter((invoice) =>
      ['sent', 'partial', 'overdue'].includes(invoice.status),
    );
    const outstandingBalanceCents = outstandingInvoices.reduce(
      (sum, invoice) => sum + (invoice.amountCents - invoice.amountPaidCents),
      0,
    );
    const currency = invoiceRows[0]?.currency ?? quoteRows[0]?.currency ?? 'USD';
    const upcomingAppointments = permissionSet.has('portal.appointments:read')
      ? await this.listAppointments(scope)
      : [];

    return {
      customerName: customer.name,
      companyName: customer.company.name,
      permissions: scope.permissions,
      activeJobCount: activeJobs.length,
      completedJobCount: completedJobs.length,
      pendingQuoteCount: pendingQuotes.length,
      outstandingInvoiceCount: outstandingInvoices.length,
      outstandingBalanceCents,
      currency,
      upcomingAppointmentCount: upcomingAppointments.length,
      unreadNotificationCount: notifications.filter((item) => !item.isRead).length,
      activeJobs: activeJobs.slice(0, 5).map(toJobSummary),
      pendingQuotes: pendingQuotes.slice(0, 5).map(toQuoteSummary),
      recentInvoices: invoiceRows.slice(0, 5).map(toInvoiceSummary),
      upcomingAppointments: upcomingAppointments.slice(0, 5),
      recentCommunications: commRows.communications.slice(0, 5),
      notifications: notifications.slice(0, 10),
    };
  }

  async getExperienceDashboardForStaff(
    scope: StaffCustomerScope,
  ): Promise<PortalCustomerExperienceDashboard> {
    const portalUser = await this.db.query.portalUsers.findFirst({
      where: and(
        eq(portalUsers.companyId, scope.companyId),
        eq(portalUsers.customerId, scope.customerId),
      ),
    });

    return this.getExperienceDashboard({
      companyId: scope.companyId,
      customerId: scope.customerId,
      portalUserId: portalUser?.id ?? scope.customerId,
      permissions: [
        'portal.dashboard:read',
        'portal.jobs:read',
        'portal.quotes:read',
        'portal.invoices:read',
        'portal.documents:read',
        'portal.communications:read',
        'portal.appointments:read',
        'portal.knowledge:read',
        'portal.notifications:read',
        'portal.payments:read',
      ],
    });
  }

  async listJobs(scope: PortalCustomerScope) {
    if (!scope.permissions.includes('portal.jobs:read')) {
      return { jobs: [] };
    }

    return this.mobileService.getCustomerJobs(scope);
  }

  async getJobTracking(scope: PortalCustomerScope, jobId: string): Promise<PortalJobTrackingDetail | null> {
    if (!scope.permissions.includes('portal.jobs:read')) {
      throw new PortalExperienceError('FORBIDDEN', 'Job access not permitted');
    }

    const job = await this.db.query.jobs.findFirst({
      where: and(
        eq(jobs.id, jobId),
        eq(jobs.companyId, scope.companyId),
        eq(jobs.customerId, scope.customerId),
      ),
      with: { customer: true, assignedUser: true },
    });

    if (!job) {
      return null;
    }

    const documentRows =
      scope.permissions.includes('portal.documents:read')
        ? await this.db.query.documents.findMany({
            where: and(
              eq(documents.companyId, scope.companyId),
              eq(documents.customerId, scope.customerId),
              eq(documents.jobId, jobId),
            ),
            with: { category: true, customer: true, job: true, uploadedBy: true },
            orderBy: [desc(documents.updatedAt)],
          })
        : [];

    const timeline = buildJobTimeline(job);
    const completedWorkSummary =
      job.status === 'completed' ? job.description?.trim() || job.title : null;

    return {
      job: {
        ...toJobSummary(job),
        description: job.description,
        etaAt: job.scheduledEndAt?.toISOString() ?? job.scheduledAt?.toISOString() ?? null,
        completedWorkSummary,
      },
      timeline,
      documents: documentRows.map(toDocumentSummary),
    };
  }

  async listQuotes(scope: PortalCustomerScope): Promise<PortalQuoteDetail[]> {
    if (!scope.permissions.includes('portal.quotes:read')) {
      return [];
    }

    const rows = await this.db.query.quotes.findMany({
      where: and(
        eq(quotes.companyId, scope.companyId),
        eq(quotes.customerId, scope.customerId),
        ne(quotes.status, 'draft'),
      ),
      with: { customer: true, job: true },
      orderBy: [desc(quotes.updatedAt)],
      limit: 50,
    });

    return rows.map((row) => ({
      ...toQuoteSummary(row),
      canRequestClarification: row.status === 'sent',
      canRequestApproval: row.status === 'sent',
    }));
  }

  async getQuote(scope: PortalCustomerScope, quoteId: string): Promise<PortalQuoteDetail | null> {
    if (!scope.permissions.includes('portal.quotes:read')) {
      return null;
    }

    const row = await this.db.query.quotes.findFirst({
      where: and(
        eq(quotes.id, quoteId),
        eq(quotes.companyId, scope.companyId),
        eq(quotes.customerId, scope.customerId),
        ne(quotes.status, 'draft'),
      ),
      with: { customer: true, job: true },
    });

    if (!row) {
      return null;
    }

    return {
      ...toQuoteSummary(row),
      canRequestClarification: row.status === 'sent',
      canRequestApproval: row.status === 'sent',
    };
  }

  async getFinanceCentre(scope: PortalCustomerScope): Promise<PortalFinanceCentre> {
    if (!scope.permissions.includes('portal.invoices:read')) {
      throw new PortalExperienceError('FORBIDDEN', 'Invoice access not permitted');
    }

    const invoiceRows = await this.db.query.invoices.findMany({
      where: and(eq(invoices.companyId, scope.companyId), eq(invoices.customerId, scope.customerId)),
      with: { customer: true, job: true },
      orderBy: [desc(invoices.updatedAt)],
      limit: 50,
    });

    const paymentRows =
      scope.permissions.includes('portal.payments:read')
        ? await this.db.query.payments.findMany({
            where: eq(payments.companyId, scope.companyId),
            with: { invoice: { with: { customer: true } } },
            orderBy: [desc(payments.paidAt)],
            limit: 50,
          })
        : [];

    const customerPayments = paymentRows.filter(
      (payment) => payment.invoice?.customerId === scope.customerId,
    );

    const outstandingInvoices = invoiceRows.filter((invoice) =>
      ['sent', 'partial', 'overdue'].includes(invoice.status),
    );

    return {
      outstandingBalanceCents: outstandingInvoices.reduce(
        (sum, invoice) => sum + (invoice.amountCents - invoice.amountPaidCents),
        0,
      ),
      currency: invoiceRows[0]?.currency ?? 'USD',
      invoices: invoiceRows.map(toInvoiceSummary),
      payments: customerPayments.map(toPaymentSummary),
    };
  }

  async listAppointments(scope: PortalCustomerScope): Promise<PortalAppointmentSummary[]> {
    if (!scope.permissions.includes('portal.appointments:read')) {
      return [];
    }

    const rows = await this.db.query.jobs.findMany({
      where: and(
        eq(jobs.companyId, scope.companyId),
        eq(jobs.customerId, scope.customerId),
        or(eq(jobs.status, 'scheduled'), sql`${jobs.scheduledAt} IS NOT NULL`),
      ),
      with: { assignedUser: true },
      orderBy: [desc(jobs.scheduledAt)],
      limit: 50,
    });

    return rows
      .filter((job) => job.scheduledAt)
      .map((job) => ({
        jobId: job.id,
        jobTitle: job.title,
        status: job.status,
        scheduledAt: job.scheduledAt?.toISOString() ?? null,
        scheduledEndAt: job.scheduledEndAt?.toISOString() ?? null,
        assignedUserName: job.assignedUser
          ? `${job.assignedUser.firstName} ${job.assignedUser.lastName}`.trim()
          : null,
      }));
  }

  async getCommunicationsCentre(
    scope: PortalCustomerScope,
  ): Promise<PortalCustomerCommunicationsCentre> {
    const communicationsResult = scope.permissions.includes('portal.communications:read')
      ? await this.mobileService.getCustomerCommunications(scope)
      : { communications: [] };

    const supportRows = await this.db.query.customerSupportConversations.findMany({
      where: and(
        eq(customerSupportConversations.companyId, scope.companyId),
        eq(customerSupportConversations.customerId, scope.customerId),
      ),
      with: { messages: true },
      orderBy: [desc(customerSupportConversations.updatedAt)],
      limit: 20,
    });

    const voiceRows = await this.db.query.voiceSessions.findMany({
      where: and(
        eq(voiceSessions.companyId, scope.companyId),
        eq(voiceSessions.customerId, scope.customerId),
        eq(voiceSessions.status, 'completed'),
      ),
      orderBy: [desc(voiceSessions.updatedAt)],
      limit: 10,
    });

    const marketingPreferences = await this.notificationService.getPortalPreferences({
      companyId: scope.companyId,
      portalUserId: scope.portalUserId,
    });

    return {
      communications: communicationsResult.communications,
      supportConversations: supportRows.map((row) => ({
        id: row.id,
        subject: row.subject,
        status: row.status,
        channel: row.channel,
        updatedAt: row.updatedAt.toISOString(),
        messageCount: row.messages.length,
      })),
      voiceCallSummaries: voiceRows
        .filter((row) => row.summary)
        .map((row) => ({
          id: row.id,
          subject: row.enquiryType.replace(/_/g, ' '),
          summary: row.summary,
          occurredAt: (row.endedAt ?? row.updatedAt).toISOString(),
        })),
      marketingPreferences,
    };
  }

  async searchKnowledge(
    scope: PortalCustomerScope,
    input: PortalKnowledgeSearchRequest,
  ): Promise<PortalKnowledgeArticleSummary[]> {
    if (!scope.permissions.includes('portal.knowledge:read')) {
      return [];
    }

    const query = input.query.trim().toLowerCase();
    if (!query) {
      return [];
    }

    const limit = Math.min(input.limit ?? 20, 50);
    const results: PortalKnowledgeArticleSummary[] = [];

    const articles = await this.db.query.knowledgeArticles.findMany({
      where: and(
        eq(knowledgeArticles.companyId, scope.companyId),
        eq(knowledgeArticles.status, 'published'),
        eq(knowledgeArticles.customerVisible, true),
      ),
      with: { category: true },
    });

    for (const row of articles) {
      if (scoreKnowledgeMatch(query, row.title, row.content, row.keywords) > 0) {
        results.push({
          id: row.id,
          resultType: 'article',
          title: row.title,
          summary: row.summary,
          articleType: row.articleType,
          categoryName: row.category?.name ?? null,
        });
      }
    }

    const sops = await this.db.query.sopDocuments.findMany({
      where: and(
        eq(sopDocuments.companyId, scope.companyId),
        eq(sopDocuments.status, 'published'),
        eq(sopDocuments.customerVisible, true),
      ),
      with: { category: true },
    });

    for (const row of sops) {
      if (scoreKnowledgeMatch(query, row.title, row.content, row.keywords) > 0) {
        results.push({
          id: row.id,
          resultType: 'sop',
          title: row.title,
          summary: row.summary,
          articleType: 'procedure',
          categoryName: row.category?.name ?? null,
        });
      }
    }

    return results.slice(0, limit);
  }

  async createCustomerRequest(
    scope: PortalCustomerScope,
    input: CreatePortalCustomerRequest,
  ): Promise<PortalCustomerRequestSummary> {
    const subject = input.subject.trim();
    const message = input.message.trim();

    if (!subject || !message) {
      throw new PortalExperienceError('VALIDATION_ERROR', 'Subject and message are required');
    }

    await this.validateRequestEntity(scope, input);

    const [created] = await this.db
      .insert(portalCustomerRequests)
      .values({
        companyId: scope.companyId,
        customerId: scope.customerId,
        portalUserId: scope.portalUserId,
        requestType: input.requestType,
        subject,
        message,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        payload: input.payload ?? {},
        status: 'pending_approval',
      })
      .returning();

    return toRequestSummary(created);
  }

  async listCustomerRequests(scope: PortalCustomerScope): Promise<PortalCustomerRequestSummary[]> {
    const rows = await this.db.query.portalCustomerRequests.findMany({
      where: and(
        eq(portalCustomerRequests.companyId, scope.companyId),
        eq(portalCustomerRequests.customerId, scope.customerId),
      ),
      orderBy: [desc(portalCustomerRequests.createdAt)],
      limit: 50,
    });

    return rows.map(toRequestSummary);
  }

  async buildPortalAuraContext(scope: PortalCustomerScope): Promise<PortalCustomerExperienceAuraContext> {
    const dashboard = await this.getExperienceDashboard(scope);
    const requests = await this.listCustomerRequests(scope);

    return {
      customerName: dashboard.customerName,
      activeJobCount: dashboard.activeJobCount,
      pendingQuoteCount: dashboard.pendingQuoteCount,
      outstandingInvoiceCount: dashboard.outstandingInvoiceCount,
      outstandingBalanceCents: dashboard.outstandingBalanceCents,
      unreadNotificationCount: dashboard.unreadNotificationCount,
      upcomingAppointmentCount: dashboard.upcomingAppointmentCount,
      recentRequests: requests.slice(0, 5).map((request) => ({
        requestType: request.requestType,
        status: request.status,
        subject: request.subject,
        createdAt: request.createdAt,
      })),
    };
  }

  async buildStaffCustomerAuraContext(
    scope: StaffCustomerScope,
  ): Promise<PortalCustomerExperienceAuraContext> {
    const portalUser = await this.db.query.portalUsers.findFirst({
      where: and(
        eq(portalUsers.companyId, scope.companyId),
        eq(portalUsers.customerId, scope.customerId),
      ),
    });

    return this.buildPortalAuraContext({
      companyId: scope.companyId,
      customerId: scope.customerId,
      portalUserId: portalUser?.id ?? scope.customerId,
      permissions: [
        'portal.dashboard:read',
        'portal.jobs:read',
        'portal.quotes:read',
        'portal.invoices:read',
        'portal.communications:read',
        'portal.appointments:read',
        'portal.notifications:read',
      ],
    });
  }

  private async getCustomer(companyId: string, customerId: string) {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
      with: { company: true },
    });

    if (!customer?.company) {
      throw new PortalExperienceError('CUSTOMER_NOT_FOUND', 'Customer not found');
    }

    return customer;
  }

  private async validateRequestEntity(scope: PortalCustomerScope, input: CreatePortalCustomerRequest) {
    if (!input.entityId || !input.entityType) {
      return;
    }

    if (input.entityType === 'job') {
      const job = await this.db.query.jobs.findFirst({
        where: and(
          eq(jobs.id, input.entityId),
          eq(jobs.companyId, scope.companyId),
          eq(jobs.customerId, scope.customerId),
        ),
      });
      if (!job) {
        throw new PortalExperienceError('NOT_FOUND', 'Job not found');
      }
    }

    if (input.entityType === 'quote') {
      const quote = await this.db.query.quotes.findFirst({
        where: and(
          eq(quotes.id, input.entityId),
          eq(quotes.companyId, scope.companyId),
          eq(quotes.customerId, scope.customerId),
        ),
      });
      if (!quote) {
        throw new PortalExperienceError('NOT_FOUND', 'Quote not found');
      }
    }
  }
}

function buildJobTimeline(job: typeof jobs.$inferSelect) {
  const timeline: PortalJobTrackingDetail['timeline'] = [
    {
      id: `${job.id}-created`,
      type: 'created',
      title: 'Job created',
      description: job.title,
      occurredAt: job.createdAt.toISOString(),
    },
  ];

  if (job.scheduledAt) {
    timeline.push({
      id: `${job.id}-scheduled`,
      type: 'scheduled',
      title: 'Appointment scheduled',
      description: null,
      occurredAt: job.scheduledAt.toISOString(),
    });
  }

  if (job.updatedAt.getTime() > job.createdAt.getTime() + 1000) {
    timeline.push({
      id: `${job.id}-status`,
      type: 'status_change',
      title: `Status: ${job.status.replace(/_/g, ' ')}`,
      description: null,
      occurredAt: job.updatedAt.toISOString(),
    });
  }

  if (job.status === 'completed') {
    timeline.push({
      id: `${job.id}-completed`,
      type: 'completed',
      title: 'Job completed',
      description: job.description,
      occurredAt: job.updatedAt.toISOString(),
    });
  }

  return timeline.sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
}

function scoreKnowledgeMatch(query: string, title: string, content: string, keywords: string[]) {
  const haystack = `${title} ${content} ${keywords.join(' ')}`.toLowerCase();
  return haystack.includes(query) ? 1 : 0;
}

function toJobSummary(row: typeof jobs.$inferSelect & {
  customer?: { name: string } | null;
  assignedUser?: { firstName: string; lastName: string } | null;
}) {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer?.name ?? 'Customer',
    title: row.title,
    status: row.status,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    scheduledEndAt: row.scheduledEndAt?.toISOString() ?? null,
    assignedUserId: row.assignedUserId,
    assignedUserName: row.assignedUser
      ? `${row.assignedUser.firstName} ${row.assignedUser.lastName}`.trim()
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toQuoteSummary(row: typeof quotes.$inferSelect & {
  customer?: { name: string } | null;
  job?: { title: string } | null;
}) {
  return {
    id: row.id,
    quoteNumber: row.quoteNumber,
    title: row.title,
    status: row.status,
    customerId: row.customerId,
    customerName: row.customer?.name ?? 'Customer',
    jobId: row.jobId,
    jobTitle: row.job?.title ?? null,
    amountCents: row.amountCents,
    currency: row.currency,
    validUntil: row.validUntil?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toInvoiceSummary(row: typeof invoices.$inferSelect & {
  customer?: { name: string } | null;
  job?: { title: string } | null;
}) {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    title: row.title,
    status: row.status,
    customerId: row.customerId,
    customerName: row.customer?.name ?? 'Customer',
    jobId: row.jobId,
    jobTitle: row.job?.title ?? null,
    amountCents: row.amountCents,
    amountPaidCents: row.amountPaidCents,
    currency: row.currency,
    dueDate: row.dueDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPaymentSummary(row: typeof payments.$inferSelect & {
  invoice?: { invoiceNumber: string; title: string; customer?: { name: string } | null } | null;
}) {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoice?.invoiceNumber ?? '',
    invoiceTitle: row.invoice?.title ?? '',
    customerName: row.invoice?.customer?.name ?? '',
    amountCents: row.amountCents,
    currency: row.currency,
    method: row.method,
    reference: row.reference,
    paidAt: row.paidAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toDocumentSummary(row: typeof documents.$inferSelect & {
  category?: { name: string } | null;
  customer?: { name: string } | null;
  job?: { title: string } | null;
  uploadedBy?: { firstName: string; lastName: string } | null;
}) {
  return {
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
  };
}

function toRequestSummary(row: typeof portalCustomerRequests.$inferSelect): PortalCustomerRequestSummary {
  return {
    id: row.id,
    requestType: row.requestType,
    status: row.status,
    subject: row.subject,
    message: row.message,
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
