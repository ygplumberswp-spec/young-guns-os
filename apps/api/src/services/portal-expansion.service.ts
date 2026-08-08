import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import type {
  CreatePortalExpansionBookingRequest,
  CreatePortalExpansionDocumentShareRequest,
  PortalExpansionDocumentShareSummary,
  PortalExpansionHub,
  PortalSafeAppointment,
  PortalSafeBooking,
  PortalSafeDocument,
  PortalSafeFinance,
  PortalSafeInvoice,
  PortalSafeJobDetail,
  PortalSafeJobStatus,
  PortalSafePayment,
  PortalSafeQuote,
  PortalSafeTimelineEntry,
} from '@titan/shared';
import {
  buildPortalSafeInvoiceDisplayNumber,
  canStaffManagePortalDocumentShares,
  canStaffReadPortalDocumentShares,
  derivePortalSafePaymentStatus,
  isPortalSafeCommunicationVisibility,
  summarizePortalSafePaymentStatuses,
  toPortalSafeQuoteLine,
  projectCustomerSafeScenarioContext,
} from '@titan/shared';
import type { PortalAccessPermission } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  communications,
  cpeDocumentShares,
  customers,
  cxAppointmentBookings,
  cxCustomerDocuments,
  documents,
  invoiceLineItems,
  invoices,
  jobs,
  payments,
  portalCustomerRequests,
  quoteLineItems,
  quotes,
  securityAuditLogs,
  voiceSessions,
} from '@titan/db';
import { resolveCustomerVisibleJobEtaAt } from '../lib/customer-visible-job-eta.js';
import {
  buildCustomerTrackingProgress,
  getActiveEnRouteTracking,
} from '../lib/tracking-privacy.js';

export class PortalExpansionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PortalExpansionError';
  }
}

export type PortalExpansionCustomerScope = {
  companyId: string;
  customerId: string;
  portalUserId: string;
  permissions: PortalAccessPermission[];
};

export type PortalExpansionStaffActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

export class PortalExpansionService {
  constructor(private readonly db: DatabaseClient) {}

  async getHub(scope: PortalExpansionCustomerScope): Promise<PortalExpansionHub> {
    const customer = await this.requireCustomer(scope.companyId, scope.customerId);
    const permissionSet = new Set(scope.permissions);

    const [jobRows, quoteDetails, finance, appointments, documentsList, timeline, bookings] =
      await Promise.all([
        permissionSet.has('portal.jobs:read') ? this.loadJobRows(scope) : Promise.resolve([]),
        permissionSet.has('portal.quotes:read') ? this.listQuotes(scope) : Promise.resolve([]),
        permissionSet.has('portal.invoices:read')
          ? this.getFinance(scope)
          : Promise.resolve(emptyFinance()),
        permissionSet.has('portal.appointments:read')
          ? this.listAppointments(scope)
          : Promise.resolve([]),
        permissionSet.has('portal.documents:read')
          ? this.listDocuments(scope)
          : Promise.resolve([]),
        permissionSet.has('portal.communications:read')
          ? this.getTimeline(scope)
          : Promise.resolve([]),
        permissionSet.has('portal.appointments:read')
          ? this.listBookings(scope)
          : Promise.resolve([]),
      ]);

    const activeJobs = jobRows
      .filter((job) => !['completed', 'cancelled'].includes(job.status))
      .map((job) => this.toSafeJobStatus(job));
    const pendingQuotes = quoteDetails.filter((quote) =>
      ['sent', 'viewed'].includes(quote.status),
    );
    const outstandingInvoices = finance.invoices.filter((invoice) =>
      ['sent', 'partial', 'overdue'].includes(invoice.status),
    );

    return {
      customerName: customer.name,
      companyName: customer.company?.name ?? 'Company',
      permissions: scope.permissions,
      activeJobCount: activeJobs.length,
      pendingQuoteCount: pendingQuotes.length,
      outstandingInvoiceCount: outstandingInvoices.length,
      outstandingBalanceCents: finance.outstandingBalanceCents,
      currency: finance.currency,
      upcomingAppointmentCount: appointments.length,
      sharedDocumentCount: documentsList.length,
      timelineEntryCount: timeline.length,
      paymentStatusSummary: finance.paymentStatusSummary,
      activeJobs: activeJobs.slice(0, 5),
      pendingQuotes: pendingQuotes.slice(0, 5),
      recentInvoices: finance.invoices.slice(0, 5),
      upcomingAppointments: appointments.slice(0, 5),
      recentTimeline: timeline.slice(0, 8),
      honestEmpty: {
        jobs: activeJobs.length === 0 && jobRows.length === 0,
        quotes: quoteDetails.length === 0,
        invoices: finance.invoices.length === 0,
        payments: finance.payments.length === 0,
        documents: documentsList.length === 0,
        timeline: timeline.length === 0,
        bookings: bookings.length === 0,
      },
    };
  }

  async listJobs(scope: PortalExpansionCustomerScope): Promise<PortalSafeJobStatus[]> {
    this.requirePermission(scope, 'portal.jobs:read');
    const rows = await this.loadJobRows(scope);
    return rows.map((row) => this.toSafeJobStatus(row));
  }

  async getJobDetail(
    scope: PortalExpansionCustomerScope,
    jobId: string,
  ): Promise<PortalSafeJobDetail | null> {
    this.requirePermission(scope, 'portal.jobs:read');

    const job = await this.db.query.jobs.findFirst({
      where: and(
        eq(jobs.id, jobId),
        eq(jobs.companyId, scope.companyId),
        eq(jobs.customerId, scope.customerId),
      ),
      with: { assignedUser: true },
    });
    if (!job) return null;

    const docs = scope.permissions.includes('portal.documents:read')
      ? (await this.listDocuments(scope)).filter((doc) => doc.jobId === jobId)
      : [];

    const timeline = buildSafeJobTimeline(job);
    const customerEtaAt = resolveCustomerVisibleJobEtaAt({
      assignedUserId: job.assignedUserId,
      status: job.status,
      scheduledAt: job.scheduledAt,
      scheduledEndAt: job.scheduledEndAt,
    });

    let liveTracking: PortalSafeJobDetail['liveTracking'] = null;
    if (customerEtaAt) {
      const activeTracking = await getActiveEnRouteTracking(this.db, scope.companyId, jobId);
      if (activeTracking && job.assignedUser) {
        const scheduledEta =
          job.scheduledEndAt?.toISOString() ?? job.scheduledAt?.toISOString() ?? null;
        liveTracking = {
          technicianDisplayName: `${job.assignedUser.firstName} ${job.assignedUser.lastName}`.trim(),
          status: 'en_route',
          etaAt: scheduledEta,
          progressPercent: buildCustomerTrackingProgress(activeTracking.startedAt, scheduledEta),
          startedAt: activeTracking.startedAt.toISOString(),
        };
      }
    }

    const completedWorkSummary =
      job.status === 'completed' ? job.customerVisibleNotes?.trim() || job.title : null;

    return {
      job: {
        ...this.toSafeJobStatus(job),
        etaAt: liveTracking?.etaAt ?? customerEtaAt,
        completedWorkSummary,
      },
      timeline,
      documents: docs,
      liveTracking,
    };
  }

  async listQuotes(scope: PortalExpansionCustomerScope): Promise<PortalSafeQuote[]> {
    this.requirePermission(scope, 'portal.quotes:read');
    const rows = await this.db.query.quotes.findMany({
      where: and(
        eq(quotes.companyId, scope.companyId),
        eq(quotes.customerId, scope.customerId),
        ne(quotes.status, 'draft'),
      ),
      with: { job: true, lineItems: true },
      orderBy: [desc(quotes.updatedAt)],
      limit: 50,
    });
    return rows.map((row) => this.toSafeQuote(row));
  }

  async getQuote(
    scope: PortalExpansionCustomerScope,
    quoteId: string,
  ): Promise<PortalSafeQuote | null> {
    this.requirePermission(scope, 'portal.quotes:read');
    const row = await this.db.query.quotes.findFirst({
      where: and(
        eq(quotes.id, quoteId),
        eq(quotes.companyId, scope.companyId),
        eq(quotes.customerId, scope.customerId),
        ne(quotes.status, 'draft'),
      ),
      with: { job: true, lineItems: true },
    });
    if (!row) return null;
    return this.toSafeQuote(row);
  }

  async getFinance(scope: PortalExpansionCustomerScope): Promise<PortalSafeFinance> {
    this.requirePermission(scope, 'portal.invoices:read');

    const invoiceRows = await this.db.query.invoices.findMany({
      where: and(
        eq(invoices.companyId, scope.companyId),
        eq(invoices.customerId, scope.customerId),
      ),
      with: { job: true, lineItems: true },
      orderBy: [desc(invoices.updatedAt)],
      limit: 50,
    });

    const invoiceIds = invoiceRows.map((row) => row.id);
    const paymentRows =
      scope.permissions.includes('portal.payments:read') && invoiceIds.length > 0
        ? await this.db.query.payments.findMany({
            where: and(
              eq(payments.companyId, scope.companyId),
              inArray(payments.invoiceId, invoiceIds),
            ),
            orderBy: [desc(payments.paidAt)],
            limit: 50,
          })
        : [];

    const safeInvoices = invoiceRows.map((row) => this.toSafeInvoice(row));
    const outstandingInvoices = safeInvoices.filter((invoice) =>
      ['unpaid', 'partial', 'overdue'].includes(invoice.paymentStatus),
    );
    const invoiceNumberById = new Map(
      safeInvoices.map((invoice) => [invoice.id, invoice.displayNumber]),
    );

    return {
      availability: safeInvoices.length > 0 || paymentRows.length > 0 ? 'available' : 'unavailable',
      outstandingBalanceCents: outstandingInvoices.reduce(
        (sum, invoice) => sum + invoice.outstandingCents,
        0,
      ),
      currency: invoiceRows[0]?.currency ?? 'ZAR',
      invoices: safeInvoices,
      payments: paymentRows.map((row) => this.toSafePayment(row, invoiceNumberById)),
      paymentStatusSummary: summarizePortalSafePaymentStatuses(safeInvoices),
      onlinePayAvailable: false,
    };
  }

  async getInvoice(
    scope: PortalExpansionCustomerScope,
    invoiceId: string,
  ): Promise<PortalSafeInvoice | null> {
    this.requirePermission(scope, 'portal.invoices:read');
    const row = await this.db.query.invoices.findFirst({
      where: and(
        eq(invoices.id, invoiceId),
        eq(invoices.companyId, scope.companyId),
        eq(invoices.customerId, scope.customerId),
      ),
      with: { job: true, lineItems: true },
    });
    if (!row) return null;
    return this.toSafeInvoice(row);
  }

  async listDocuments(scope: PortalExpansionCustomerScope): Promise<PortalSafeDocument[]> {
    this.requirePermission(scope, 'portal.documents:read');

    const shares = await this.db
      .select({
        shareId: cpeDocumentShares.id,
        sharedAt: cpeDocumentShares.sharedAt,
        documentId: documents.id,
        title: documents.title,
        description: documents.description,
        fileName: documents.fileName,
        fileType: documents.fileType,
        fileSizeBytes: documents.fileSizeBytes,
        jobId: documents.jobId,
        jobTitle: jobs.title,
      })
      .from(cpeDocumentShares)
      .innerJoin(documents, eq(documents.id, cpeDocumentShares.documentId))
      .leftJoin(jobs, eq(jobs.id, documents.jobId))
      .where(
        and(
          eq(cpeDocumentShares.companyId, scope.companyId),
          eq(cpeDocumentShares.customerId, scope.customerId),
          eq(cpeDocumentShares.isActive, true),
          eq(documents.companyId, scope.companyId),
          or(eq(documents.customerId, scope.customerId), sql`${documents.customerId} IS NULL`),
        ),
      )
      .orderBy(desc(cpeDocumentShares.sharedAt))
      .limit(100);

    const cxDocs = await this.db.query.cxCustomerDocuments.findMany({
      where: and(
        eq(cxCustomerDocuments.companyId, scope.companyId),
        eq(cxCustomerDocuments.customerId, scope.customerId),
      ),
      orderBy: [desc(cxCustomerDocuments.createdAt)],
      limit: 100,
    });

    const byId = new Map<string, PortalSafeDocument>();
    for (const row of shares) {
      byId.set(row.documentId, {
        id: row.documentId,
        title: row.title,
        description: row.description,
        fileName: row.fileName,
        fileType: row.fileType,
        fileSizeBytes: row.fileSizeBytes,
        jobId: row.jobId,
        jobTitle: row.jobTitle ?? null,
        sharedAt: row.sharedAt.toISOString(),
        source: 'portal_share',
      });
    }

    for (const row of cxDocs) {
      if (!row.documentId || byId.has(row.documentId)) continue;
      if (
        !['certificate', 'compliance_report', 'warranty', 'quotation', 'invoice'].includes(
          row.accessType,
        )
      ) {
        continue;
      }
      byId.set(row.documentId, {
        id: row.documentId,
        title: row.title,
        description: null,
        fileName: row.fileName ?? row.title,
        fileType: null,
        fileSizeBytes: null,
        jobId: null,
        jobTitle: null,
        sharedAt: row.createdAt.toISOString(),
        source: 'cx_document',
      });
    }

    return [...byId.values()].sort(
      (a, b) => new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime(),
    );
  }

  async getTimeline(scope: PortalExpansionCustomerScope): Promise<PortalSafeTimelineEntry[]> {
    this.requirePermission(scope, 'portal.communications:read');

    const [commRows, voiceRows, requestRows, bookingRows] = await Promise.all([
      this.db.query.communications.findMany({
        where: and(
          eq(communications.companyId, scope.companyId),
          eq(communications.customerId, scope.customerId),
          eq(communications.visibility, 'customer_visible'),
        ),
        orderBy: [desc(communications.occurredAt)],
        limit: 50,
      }),
      this.db.query.voiceSessions.findMany({
        where: and(
          eq(voiceSessions.companyId, scope.companyId),
          eq(voiceSessions.customerId, scope.customerId),
          eq(voiceSessions.status, 'completed'),
        ),
        orderBy: [desc(voiceSessions.updatedAt)],
        limit: 20,
      }),
      this.db.query.portalCustomerRequests.findMany({
        where: and(
          eq(portalCustomerRequests.companyId, scope.companyId),
          eq(portalCustomerRequests.customerId, scope.customerId),
        ),
        orderBy: [desc(portalCustomerRequests.createdAt)],
        limit: 30,
      }),
      this.db.query.cxAppointmentBookings.findMany({
        where: and(
          eq(cxAppointmentBookings.companyId, scope.companyId),
          eq(cxAppointmentBookings.customerId, scope.customerId),
        ),
        orderBy: [desc(cxAppointmentBookings.updatedAt)],
        limit: 20,
      }),
    ]);

    const entries: PortalSafeTimelineEntry[] = [];
    for (const row of commRows) {
      if (!isPortalSafeCommunicationVisibility(row.visibility)) continue;
      entries.push({
        id: `comm-${row.id}`,
        kind: 'message',
        title: row.subject?.trim() || `${row.channel} message`,
        body: row.body,
        channel: row.channel,
        occurredAt: row.occurredAt.toISOString(),
        relatedJobId: row.jobId,
        relatedQuoteId: null,
        relatedInvoiceId: null,
      });
    }
    for (const row of voiceRows) {
      if (!row.summary?.trim()) continue;
      entries.push({
        id: `voice-${row.id}`,
        kind: 'voice',
        title: 'Call summary',
        body: row.summary,
        channel: 'voice',
        occurredAt: (row.endedAt ?? row.updatedAt).toISOString(),
        relatedJobId: null,
        relatedQuoteId: null,
        relatedInvoiceId: null,
      });
    }
    for (const row of requestRows) {
      entries.push({
        id: `request-${row.id}`,
        kind: 'request',
        title: row.subject,
        body: row.message,
        channel: 'portal_request',
        occurredAt: row.createdAt.toISOString(),
        relatedJobId: row.entityType === 'job' ? row.entityId : null,
        relatedQuoteId: row.entityType === 'quote' ? row.entityId : null,
        relatedInvoiceId: row.entityType === 'invoice' ? row.entityId : null,
      });
    }
    for (const row of bookingRows) {
      entries.push({
        id: `booking-${row.id}`,
        kind: 'booking',
        title: `Booking: ${row.subject}`,
        body: `Status: ${row.status.replace(/_/g, ' ')}`,
        channel: 'booking',
        occurredAt: row.updatedAt.toISOString(),
        relatedJobId: null,
        relatedQuoteId: null,
        relatedInvoiceId: null,
      });
    }

    return entries
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 80);
  }

  async listAppointments(scope: PortalExpansionCustomerScope): Promise<PortalSafeAppointment[]> {
    this.requirePermission(scope, 'portal.appointments:read');
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

  async listBookings(scope: PortalExpansionCustomerScope): Promise<PortalSafeBooking[]> {
    this.requirePermission(scope, 'portal.appointments:read');
    const rows = await this.db.query.cxAppointmentBookings.findMany({
      where: and(
        eq(cxAppointmentBookings.companyId, scope.companyId),
        eq(cxAppointmentBookings.customerId, scope.customerId),
      ),
      orderBy: [desc(cxAppointmentBookings.createdAt)],
      limit: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      status: row.status,
      preferredDate: row.preferredDate ?? null,
      preferredTimeWindow: row.preferredTimeWindow ?? null,
      jobNotes: row.jobNotes ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createBooking(
    scope: PortalExpansionCustomerScope,
    input: CreatePortalExpansionBookingRequest,
  ): Promise<PortalSafeBooking> {
    this.requirePermission(scope, 'portal.appointments:read');
    const subject = input.subject.trim();
    if (!subject) {
      throw new PortalExpansionError('VALIDATION_ERROR', 'Booking subject is required');
    }

    const [created] = await this.db
      .insert(cxAppointmentBookings)
      .values({
        companyId: scope.companyId,
        customerId: scope.customerId,
        portalUserId: scope.portalUserId,
        propertyId: input.propertyId ?? null,
        bookingType: 'standard',
        status: 'pending_approval',
        subject,
        preferredDate: input.preferredDate?.trim() || null,
        preferredTimeWindow: input.preferredTimeWindow?.trim() || null,
        jobNotes: input.jobNotes?.trim() || null,
        photoUrls: [],
        payload: { source: 'portal_expansion' },
      })
      .returning();

    await this.db.insert(securityAuditLogs).values({
      companyId: scope.companyId,
      category: 'crm',
      action: 'cpe_booking_created',
      entityType: 'portal_expansion',
      entityId: created!.id,
      userId: null,
      metadata: {
        customerId: scope.customerId,
        portalUserId: scope.portalUserId,
        invented: false,
      },
    });

    return {
      id: created!.id,
      subject: created!.subject,
      status: created!.status,
      preferredDate: created!.preferredDate ?? null,
      preferredTimeWindow: created!.preferredTimeWindow ?? null,
      jobNotes: created!.jobNotes ?? null,
      createdAt: created!.createdAt.toISOString(),
      updatedAt: created!.updatedAt.toISOString(),
    };
  }

  async listDocumentShares(
    actor: PortalExpansionStaffActor,
    customerId?: string,
  ): Promise<PortalExpansionDocumentShareSummary[]> {
    if (!canStaffReadPortalDocumentShares(actor)) {
      throw new PortalExpansionError('FORBIDDEN', 'Document share access denied');
    }
    const rows = await this.db
      .select({
        id: cpeDocumentShares.id,
        documentId: cpeDocumentShares.documentId,
        customerId: cpeDocumentShares.customerId,
        customerName: customers.name,
        title: documents.title,
        fileName: documents.fileName,
        sharedAt: cpeDocumentShares.sharedAt,
        sharedByUserId: cpeDocumentShares.sharedByUserId,
        isActive: cpeDocumentShares.isActive,
      })
      .from(cpeDocumentShares)
      .innerJoin(documents, eq(documents.id, cpeDocumentShares.documentId))
      .innerJoin(customers, eq(customers.id, cpeDocumentShares.customerId))
      .where(
        and(
          eq(cpeDocumentShares.companyId, actor.companyId),
          customerId ? eq(cpeDocumentShares.customerId, customerId) : undefined,
        ),
      )
      .orderBy(desc(cpeDocumentShares.sharedAt))
      .limit(200);

    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      customerId: row.customerId,
      customerName: row.customerName,
      title: row.title,
      fileName: row.fileName,
      sharedAt: row.sharedAt.toISOString(),
      sharedByUserId: row.sharedByUserId,
      isActive: row.isActive,
    }));
  }

  async shareDocument(
    actor: PortalExpansionStaffActor,
    input: CreatePortalExpansionDocumentShareRequest,
  ): Promise<PortalExpansionDocumentShareSummary> {
    if (!canStaffManagePortalDocumentShares(actor)) {
      throw new PortalExpansionError('FORBIDDEN', 'Document share write denied');
    }
    const customer = await this.requireCustomer(actor.companyId, input.customerId);
    const document = await this.db.query.documents.findFirst({
      where: and(eq(documents.id, input.documentId), eq(documents.companyId, actor.companyId)),
    });
    if (!document) throw new PortalExpansionError('NOT_FOUND', 'Document not found');
    if (document.customerId && document.customerId !== input.customerId) {
      throw new PortalExpansionError('FORBIDDEN', 'Document is linked to a different customer');
    }

    const existing = await this.db.query.cpeDocumentShares.findFirst({
      where: and(
        eq(cpeDocumentShares.companyId, actor.companyId),
        eq(cpeDocumentShares.customerId, input.customerId),
        eq(cpeDocumentShares.documentId, input.documentId),
      ),
    });

    const now = new Date();
    let shareId: string;
    if (existing) {
      const [updated] = await this.db
        .update(cpeDocumentShares)
        .set({
          isActive: true,
          revokedAt: null,
          sharedByUserId: actor.userId,
          sharedAt: now,
          updatedAt: now,
        })
        .where(eq(cpeDocumentShares.id, existing.id))
        .returning();
      shareId = updated!.id;
    } else {
      const [created] = await this.db
        .insert(cpeDocumentShares)
        .values({
          companyId: actor.companyId,
          customerId: input.customerId,
          documentId: input.documentId,
          sharedByUserId: actor.userId,
          isActive: true,
          sharedAt: now,
        })
        .returning();
      shareId = created!.id;
    }

    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'crm',
      action: 'cpe_document_shared',
      entityType: 'portal_expansion',
      entityId: shareId,
      userId: actor.userId,
      metadata: {
        customerId: input.customerId,
        documentId: input.documentId,
        invented: false,
      },
    });

    return {
      id: shareId,
      documentId: input.documentId,
      customerId: input.customerId,
      customerName: customer.name,
      title: document.title,
      fileName: document.fileName,
      sharedAt: now.toISOString(),
      sharedByUserId: actor.userId,
      isActive: true,
    };
  }

  async revokeDocumentShare(
    actor: PortalExpansionStaffActor,
    shareId: string,
  ): Promise<PortalExpansionDocumentShareSummary> {
    if (!canStaffManagePortalDocumentShares(actor)) {
      throw new PortalExpansionError('FORBIDDEN', 'Document share write denied');
    }
    const existing = await this.db.query.cpeDocumentShares.findFirst({
      where: and(
        eq(cpeDocumentShares.id, shareId),
        eq(cpeDocumentShares.companyId, actor.companyId),
      ),
    });
    if (!existing) throw new PortalExpansionError('NOT_FOUND', 'Document share not found');

    const now = new Date();
    await this.db
      .update(cpeDocumentShares)
      .set({ isActive: false, revokedAt: now, updatedAt: now })
      .where(eq(cpeDocumentShares.id, shareId));

    const document = await this.db.query.documents.findFirst({
      where: eq(documents.id, existing.documentId),
    });
    const customer = await this.requireCustomer(actor.companyId, existing.customerId);

    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'crm',
      action: 'cpe_document_share_revoked',
      entityType: 'portal_expansion',
      entityId: shareId,
      userId: actor.userId,
      metadata: {
        customerId: existing.customerId,
        documentId: existing.documentId,
      },
    });

    return {
      id: shareId,
      documentId: existing.documentId,
      customerId: existing.customerId,
      customerName: customer.name,
      title: document?.title ?? 'Document',
      fileName: document?.fileName ?? '',
      sharedAt: existing.sharedAt.toISOString(),
      sharedByUserId: existing.sharedByUserId,
      isActive: false,
    };
  }

  private requirePermission(
    scope: PortalExpansionCustomerScope,
    permission: PortalAccessPermission,
  ): void {
    if (!scope.permissions.includes(permission)) {
      throw new PortalExpansionError('FORBIDDEN', `Missing permission: ${permission}`);
    }
  }

  private async requireCustomer(companyId: string, customerId: string) {
    const customer = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.companyId, companyId)),
      with: { company: true },
    });
    if (!customer) throw new PortalExpansionError('NOT_FOUND', 'Customer not found');
    return customer;
  }

  private async loadJobRows(scope: PortalExpansionCustomerScope) {
    return this.db.query.jobs.findMany({
      where: and(eq(jobs.companyId, scope.companyId), eq(jobs.customerId, scope.customerId)),
      with: { assignedUser: true },
      orderBy: [desc(jobs.updatedAt)],
      limit: 50,
    });
  }

  private toSafeJobStatus(
    row: typeof jobs.$inferSelect & {
      assignedUser?: { firstName: string; lastName: string } | null;
    },
  ): PortalSafeJobStatus {
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
      title: row.title,
      status: row.status,
      executionPhase: row.executionPhase ?? null,
      addressDisplay,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      scheduledEndAt: row.scheduledEndAt?.toISOString() ?? null,
      assignedUserName: row.assignedUser
        ? `${row.assignedUser.firstName} ${row.assignedUser.lastName}`.trim()
        : null,
      etaAt: resolveCustomerVisibleJobEtaAt({
        assignedUserId: row.assignedUserId,
        status: row.status,
        scheduledAt: row.scheduledAt,
        scheduledEndAt: row.scheduledEndAt,
      }),
      customerVisibleNotes: row.customerVisibleNotes?.trim() || null,
      completedWorkSummary: null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toSafeQuote(
    row: typeof quotes.$inferSelect & {
      job?: { title: string } | null;
      lineItems?: Array<typeof quoteLineItems.$inferSelect>;
    },
  ): PortalSafeQuote {
    const actionable = canRespondToQuote(row);
    // Row 90 — portal sees customer-facing lines only (absorbed labour/call-out hidden).
    const pricingMode =
      (row as { pricingPresentationMode?: string | null }).pricingPresentationMode ===
      'FLAT_RATE_INCLUDED'
        ? 'FLAT_RATE_INCLUDED'
        : 'ITEMISED';
    const labourIncluded = Boolean((row as { labourIncluded?: boolean | null }).labourIncluded);
    const calloutIncluded = Boolean((row as { calloutIncluded?: boolean | null }).calloutIncluded);
    const lines = [...(row.lineItems ?? [])]
      .sort((a, b) => a.position - b.position)
      .filter((line) => {
        const visible = (line as { customerVisible?: boolean | null }).customerVisible !== false;
        if (!visible) return false;
        if (pricingMode !== 'FLAT_RATE_INCLUDED') return true;
        if (labourIncluded && line.category === 'labour') return false;
        if (calloutIncluded && line.category === 'travel') return false;
        return true;
      })
      .map((line) =>
        toPortalSafeQuoteLine({
          id: line.id,
          position: line.position,
          category: line.category,
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          lineSubtotalCents: line.lineSubtotalCents,
          lineVatCents: line.lineVatCents,
          lineTotalCents: line.lineTotalCents,
          isOptional: line.isOptional,
        }),
      );

    return {
      id: row.id,
      quoteNumber: row.quoteNumber,
      title: row.title,
      status: row.status,
      versionNumber: row.versionNumber ?? 1,
      jobId: row.jobId,
      jobTitle: row.job?.title ?? null,
      subtotalCents: row.subtotalCents ?? row.amountCents,
      vatCents: row.vatCents ?? 0,
      totalCents: row.totalCents ?? row.amountCents,
      currency: row.currency,
      validUntil: row.validUntil?.toISOString() ?? null,
      issuedAt: row.issuedAt?.toISOString() ?? null,
      scopeOfWork: row.scopeOfWork ?? null,
      exclusions: row.exclusions ?? null,
      assumptions: row.assumptions ?? null,
      customerNotes: row.customerNotes ?? null,
      customerReference: row.customerNotes ?? null,
      customerPoNumber: row.customerNotes?.match(/^PO[-_\s]?\d+/i)?.[0] ?? null,
      paymentTerms: row.paymentTerms ?? null,
      customerFacingNotes: row.notes ?? null,
      customerFacingScenarioLabel: projectCustomerSafeScenarioContext({
        scenario: (row as { scenario?: string | null }).scenario,
        metadata: ((row as { scenarioMetadata?: Record<string, unknown> | null }).scenarioMetadata ??
          {}) as import('@titan/shared').QuoteScenarioMetadata,
      }).customerFacingLabel,
      depositPercent: row.depositPercent ?? null,
      lineItems: lines,
      canRequestClarification: ['sent', 'viewed'].includes(row.status),
      canAccept: actionable,
      canDecline: actionable,
    };
  }

  private toSafeInvoice(
    row: typeof invoices.$inferSelect & {
      job?: { title: string } | null;
      lineItems?: Array<typeof invoiceLineItems.$inferSelect>;
    },
  ): PortalSafeInvoice {
    const totalCents = row.totalCents ?? row.amountCents;
    const outstandingCents = Math.max(0, totalCents - row.amountPaidCents);
    const isOverdue = Boolean(
      row.dueDate &&
        row.dueDate < new Date() &&
        ['sent', 'partial', 'overdue'].includes(row.status),
    );
    const lines = [...(row.lineItems ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((line) => ({
        id: line.id,
        position: line.position,
        category: line.category,
        description: line.description,
        quantity: String(line.quantity),
        unitPriceCents: line.unitPriceCents,
        lineSubtotalCents: line.lineSubtotalCents,
        lineVatCents: line.lineVatCents,
        lineTotalCents: line.lineTotalCents,
      }));

    return {
      id: row.id,
      displayNumber: buildPortalSafeInvoiceDisplayNumber({
        invoiceNumber: row.invoiceNumber,
        title: row.title,
        xeroInvoiceNumber: row.xeroInvoiceNumber,
        numberAuthority: row.numberAuthority,
        sourceProvider: row.sourceProvider,
        sourceExternalId: row.sourceExternalId,
        id: row.id,
      }),
      title: row.title,
      status: row.status,
      paymentStatus: derivePortalSafePaymentStatus({
        status: row.status,
        outstandingCents,
        amountPaidCents: row.amountPaidCents,
        isOverdue,
      }),
      jobId: row.jobId,
      jobTitle: row.job?.title ?? null,
      totalCents,
      amountPaidCents: row.amountPaidCents,
      outstandingCents,
      isOverdue,
      currency: row.currency,
      dueDate: row.dueDate?.toISOString() ?? null,
      paymentTerms: row.paymentTerms ?? null,
      customerReference: (row as { customerPoNumber?: string | null }).customerPoNumber ?? null,
      customerPoNumber: (row as { customerPoNumber?: string | null }).customerPoNumber ?? null,
      customerFacingNotes: row.notes ?? null,
      lineItems: lines,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toSafePayment(
    row: typeof payments.$inferSelect,
    invoiceNumberById: Map<string, string>,
  ): PortalSafePayment {
    return {
      id: row.id,
      invoiceId: row.invoiceId,
      invoiceDisplayNumber: invoiceNumberById.get(row.invoiceId) ?? 'Invoice',
      amountCents: row.amountCents,
      currency: row.currency,
      method: row.method,
      reference: row.reference ?? null,
      paidAt: row.paidAt.toISOString(),
    };
  }
}

function emptyFinance(): PortalSafeFinance {
  return {
    availability: 'unavailable',
    outstandingBalanceCents: 0,
    currency: 'ZAR',
    invoices: [],
    payments: [],
    paymentStatusSummary: {
      unpaidCount: 0,
      partialCount: 0,
      paidCount: 0,
      overdueCount: 0,
    },
    onlinePayAvailable: false,
  };
}

function canRespondToQuote(row: typeof quotes.$inferSelect) {
  if (!['sent', 'viewed'].includes(row.status)) return false;
  if (row.validUntil && row.validUntil.getTime() < Date.now()) return false;
  if (row.isImmutable === false && row.issuedAt == null) return false;
  return true;
}

function buildSafeJobTimeline(job: typeof jobs.$inferSelect): PortalSafeJobDetail['timeline'] {
  const timeline: PortalSafeJobDetail['timeline'] = [
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
      description: job.customerVisibleNotes?.trim() || null,
      occurredAt: job.updatedAt.toISOString(),
    });
  }
  return timeline.sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
}
