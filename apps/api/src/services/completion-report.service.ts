import { and, desc, eq, sql } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  boqDocuments,
  completionReports,
  documents,
  invoices,
  jobCompletionSnapshots,
  jobMaterialLines,
  jobs,
  mobileJobDocumentation,
  paymentReceipts,
  payments,
  quotes,
  securityAuditLogs,
  users,
} from '@titan/db';
import type {
  CompletionReportDetail,
  CompletionReportPreview,
  CompletionReportSectionAvailability,
  CompletionReportSectionId,
  CompletionReportSectionPayload,
  CompletionReportSummary,
  CreateCompletionReportRequest,
  PrepareCompletionReportEmailRequest,
  CompletionReportEmailDraftResult,
  UpdateCompletionReportRequest,
} from '@titan/shared';
import {
  COMPLETION_REPORT_SECTION_OPTIONS,
  buildCompletionReportHtml,
  canEditCompletionReport,
  completionReportDeliveryNote,
  defaultIncludedSections,
  normalizeIncludedSections,
  resolveCompletionReportMapAvailability,
} from '@titan/shared';
import {
  EmailCentreError,
  type EmailCentreService,
} from './email-centre.service.js';
import {
  CommunicationsPlatformError,
  type CommPlatformActor,
} from './communications-platform.service.js';

export class CompletionReportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CompletionReportError';
  }
}

type ReportActor = CommPlatformActor;

type AssembledJobContext = {
  preview: CompletionReportPreview;
  payload: CompletionReportSectionPayload;
  customerEmail: string | null;
};

export class CompletionReportService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly emailCentreService?: EmailCentreService,
  ) {}

  async previewForJob(companyId: string, jobId: string): Promise<CompletionReportPreview> {
    const ctx = await this.assembleJobContext(companyId, jobId);
    return ctx.preview;
  }

  /** Tenant-scoped job assembly for operational report PDF exports. */
  async getJobExportContext(companyId: string, jobId: string): Promise<AssembledJobContext> {
    return this.assembleJobContext(companyId, jobId);
  }

  async listReports(
    companyId: string,
    query: { jobId?: string } = {},
  ): Promise<CompletionReportSummary[]> {
    const rows = await this.db.query.completionReports.findMany({
      where: and(
        eq(completionReports.companyId, companyId),
        query.jobId ? eq(completionReports.jobId, query.jobId) : undefined,
      ),
      with: { job: true, customer: true },
      orderBy: [desc(completionReports.updatedAt)],
    });
    return rows.map((row) => toSummary(row));
  }

  async getReport(companyId: string, reportId: string): Promise<CompletionReportDetail | null> {
    const row = await this.db.query.completionReports.findFirst({
      where: and(eq(completionReports.id, reportId), eq(completionReports.companyId, companyId)),
      with: { job: true, customer: true },
    });
    if (!row) return null;
    return toDetail(row);
  }

  async createReport(
    actor: ReportActor,
    input: CreateCompletionReportRequest,
  ): Promise<CompletionReportDetail> {
    const ctx = await this.assembleJobContext(actor.companyId, input.jobId);

    if (input.clientActionId) {
      const existing = await this.db.query.completionReports.findFirst({
        where: and(
          eq(completionReports.companyId, actor.companyId),
          eq(completionReports.clientActionId, input.clientActionId),
        ),
        columns: { id: true },
      });
      if (existing) {
        const report = await this.getReport(actor.companyId, existing.id);
        if (!report) throw new CompletionReportError('NOT_FOUND', 'Completion report not found');
        return report;
      }
    }

    const included =
      input.includedSections && input.includedSections.length
        ? normalizeIncludedSections(input.includedSections)
        : defaultIncludedSections(ctx.preview.sections);

    if (!included.length) {
      throw new CompletionReportError(
        'VALIDATION_ERROR',
        'Select at least one available section for the completion report',
      );
    }

    const unavailable = included.filter(
      (id) => !ctx.preview.sections.find((s) => s.sectionId === id)?.available,
    );
    if (unavailable.length) {
      throw new CompletionReportError(
        'VALIDATION_ERROR',
        `Cannot include unavailable sections: ${unavailable.join(', ')}`,
      );
    }

    const [created] = await this.db
      .insert(completionReports)
      .values({
        companyId: actor.companyId,
        jobId: input.jobId,
        customerId: ctx.preview.customerId,
        propertyId: ctx.preview.propertyId,
        invoiceId: ctx.preview.invoiceId,
        quoteId: ctx.preview.quoteId,
        boqDocumentId: ctx.preview.boqDocumentId,
        reportNumber: await this.nextReportNumber(actor.companyId),
        title: (input.title?.trim() || ctx.preview.suggestedTitle).slice(0, 200),
        notes: input.notes?.trim() || null,
        includedSections: included,
        sectionPayload: ctx.payload as Record<string, unknown>,
        mapAvailability: ctx.preview.mapAvailability,
        mapPlaceUrl: ctx.preview.mapPlaceUrl,
        createdByUserId: actor.userId,
        clientActionId: input.clientActionId?.trim() || null,
      })
      .returning();

    if (!created) {
      throw new CompletionReportError('CREATE_FAILED', 'Unable to create completion report');
    }

    await this.recordAudit(actor, 'completion_report_created', created.id, {
      jobId: input.jobId,
      includedSections: included,
    });

    const report = await this.getReport(actor.companyId, created.id);
    if (!report) throw new CompletionReportError('CREATE_FAILED', 'Unable to load created report');
    return report;
  }

  async updateReport(
    actor: ReportActor,
    reportId: string,
    input: UpdateCompletionReportRequest,
  ): Promise<CompletionReportDetail> {
    const existing = await this.getReport(actor.companyId, reportId);
    if (!existing) throw new CompletionReportError('NOT_FOUND', 'Completion report not found');
    if (!canEditCompletionReport(existing)) {
      throw new CompletionReportError('INVALID_STATE', 'Sent or cancelled reports cannot be edited');
    }

    let included = existing.includedSections;
    if (input.includedSections) {
      included = normalizeIncludedSections(input.includedSections);
      if (!included.length) {
        throw new CompletionReportError('VALIDATION_ERROR', 'At least one section is required');
      }
      const ctx = await this.assembleJobContext(actor.companyId, existing.jobId);
      const unavailable = included.filter(
        (id) => !ctx.preview.sections.find((s) => s.sectionId === id)?.available,
      );
      if (unavailable.length) {
        throw new CompletionReportError(
          'VALIDATION_ERROR',
          `Cannot include unavailable sections: ${unavailable.join(', ')}`,
        );
      }
      await this.db
        .update(completionReports)
        .set({
          title: input.title?.trim() ?? existing.title,
          notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
          includedSections: included,
          sectionPayload: ctx.payload as Record<string, unknown>,
          mapAvailability: ctx.preview.mapAvailability,
          mapPlaceUrl: ctx.preview.mapPlaceUrl,
          propertyId: ctx.preview.propertyId,
          invoiceId: ctx.preview.invoiceId,
          quoteId: ctx.preview.quoteId,
          boqDocumentId: ctx.preview.boqDocumentId,
          // Editing sections invalidates generated HTML until regenerated.
          status: 'draft',
          htmlBody: null,
          generatedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(completionReports.id, reportId), eq(completionReports.companyId, actor.companyId)),
        );
    } else {
      await this.db
        .update(completionReports)
        .set({
          title: input.title?.trim() ?? existing.title,
          notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
          updatedAt: new Date(),
        })
        .where(
          and(eq(completionReports.id, reportId), eq(completionReports.companyId, actor.companyId)),
        );
    }

    await this.recordAudit(actor, 'completion_report_updated', reportId, {
      includedSections: included,
    });

    const report = await this.getReport(actor.companyId, reportId);
    if (!report) throw new CompletionReportError('NOT_FOUND', 'Completion report not found');
    return report;
  }

  async generateReport(actor: ReportActor, reportId: string): Promise<CompletionReportDetail> {
    const existing = await this.getReport(actor.companyId, reportId);
    if (!existing) throw new CompletionReportError('NOT_FOUND', 'Completion report not found');
    if (!canEditCompletionReport(existing) && existing.status !== 'draft') {
      // allow regenerate for generated / ready_to_send via canEdit
    }
    if (existing.status === 'sent' || existing.status === 'cancelled') {
      throw new CompletionReportError('INVALID_STATE', 'Cannot regenerate a sent or cancelled report');
    }

    const ctx = await this.assembleJobContext(actor.companyId, existing.jobId);
    const included = normalizeIncludedSections(existing.includedSections);
    if (!included.length) {
      throw new CompletionReportError('VALIDATION_ERROR', 'At least one section is required');
    }

    const generatedAt = new Date();
    const htmlBody = buildCompletionReportHtml({
      title: existing.title,
      reportNumber: existing.reportNumber,
      includedSections: included,
      payload: ctx.payload,
      generatedAt: generatedAt.toISOString(),
    });

    const fileName = `${existing.reportNumber.toLowerCase()}.html`;
    let documentId = existing.documentId;

    if (documentId) {
      await this.db
        .update(documents)
        .set({
          title: existing.title,
          description: `Client completion report ${existing.reportNumber}`,
          fileName,
          fileType: 'text/html',
          fileSizeBytes: Buffer.byteLength(htmlBody, 'utf8'),
          customerId: existing.customerId,
          jobId: existing.jobId,
          updatedAt: generatedAt,
        })
        .where(and(eq(documents.id, documentId), eq(documents.companyId, actor.companyId)));
    } else {
      const [doc] = await this.db
        .insert(documents)
        .values({
          companyId: actor.companyId,
          customerId: existing.customerId,
          jobId: existing.jobId,
          uploadedByUserId: actor.userId,
          title: existing.title,
          description: `Client completion report ${existing.reportNumber}`,
          fileName,
          fileType: 'text/html',
          fileSizeBytes: Buffer.byteLength(htmlBody, 'utf8'),
        })
        .returning();
      if (!doc) throw new CompletionReportError('CREATE_FAILED', 'Unable to create documents record');
      documentId = doc.id;
    }

    await this.db
      .update(completionReports)
      .set({
        status: 'generated',
        documentId,
        htmlBody,
        sectionPayload: ctx.payload as Record<string, unknown>,
        mapAvailability: ctx.preview.mapAvailability,
        mapPlaceUrl: ctx.preview.mapPlaceUrl,
        propertyId: ctx.preview.propertyId,
        invoiceId: ctx.preview.invoiceId,
        quoteId: ctx.preview.quoteId,
        boqDocumentId: ctx.preview.boqDocumentId,
        generatedAt,
        updatedAt: generatedAt,
      })
      .where(
        and(eq(completionReports.id, reportId), eq(completionReports.companyId, actor.companyId)),
      );

    await this.recordAudit(actor, 'completion_report_generated', reportId, {
      documentId,
      includedSections: included,
      mapAvailability: ctx.preview.mapAvailability,
    });

    const report = await this.getReport(actor.companyId, reportId);
    if (!report) throw new CompletionReportError('NOT_FOUND', 'Completion report not found');
    return report;
  }

  async markReadyToSend(actor: ReportActor, reportId: string): Promise<CompletionReportDetail> {
    const existing = await this.getReport(actor.companyId, reportId);
    if (!existing) throw new CompletionReportError('NOT_FOUND', 'Completion report not found');
    if (existing.status !== 'generated') {
      throw new CompletionReportError(
        'INVALID_STATE',
        'Generate the report before marking ready to send',
      );
    }
    if (!existing.documentId) {
      throw new CompletionReportError('INVALID_STATE', 'Report document is missing');
    }

    await this.db
      .update(completionReports)
      .set({ status: 'ready_to_send', updatedAt: new Date() })
      .where(
        and(eq(completionReports.id, reportId), eq(completionReports.companyId, actor.companyId)),
      );

    await this.recordAudit(actor, 'completion_report_ready_to_send', reportId, {
      documentId: existing.documentId,
    });

    const report = await this.getReport(actor.companyId, reportId);
    if (!report) throw new CompletionReportError('NOT_FOUND', 'Completion report not found');
    return report;
  }

  async prepareEmailDraft(
    actor: ReportActor,
    reportId: string,
    input: PrepareCompletionReportEmailRequest = {},
  ): Promise<CompletionReportEmailDraftResult> {
    if (!this.emailCentreService) {
      throw new CompletionReportError(
        'NOT_CONFIGURED',
        'Email Centre is not wired for completion report send',
      );
    }

    const existing = await this.getReport(actor.companyId, reportId);
    if (!existing) throw new CompletionReportError('NOT_FOUND', 'Completion report not found');
    if (!existing.documentId || !existing.htmlBody) {
      throw new CompletionReportError(
        'INVALID_STATE',
        'Generate the report before preparing an Email Centre draft',
      );
    }

    const ctx = await this.assembleJobContext(actor.companyId, existing.jobId);
    const to = input.to?.length
      ? input.to
      : ctx.customerEmail
        ? [ctx.customerEmail]
        : [];
    if (!to.length) {
      throw new CompletionReportError(
        'VALIDATION_ERROR',
        'Customer email is missing — provide a to address for the Email Centre draft',
      );
    }

    try {
      const draft = await this.emailCentreService.createReplyOrForwardDraft(actor, {
        to,
        subject: input.subject?.trim() || `Completion report — ${existing.title}`,
        bodyText:
          input.bodyText?.trim() ||
          `Please find the completion report ${existing.reportNumber} attached as a TITAN document reference.\n\nSend uses Email Centre: draft → approve → execute (Gmail). Resend remains transactional-only.`,
        attachmentLinks: [
          {
            attachmentKind: 'report',
            entityType: 'document',
            entityId: existing.documentId,
            documentId: existing.documentId,
            customerId: existing.customerId,
            jobId: existing.jobId,
            label: existing.title,
            fileName: `${existing.reportNumber.toLowerCase()}.html`,
            mimeType: 'text/html',
            metadata: {
              completionReportId: existing.id,
              storage: 'entity_reference',
            },
          },
        ],
      });

      await this.db
        .update(completionReports)
        .set({
          emailDraftId: draft.id,
          status: existing.status === 'draft' ? 'generated' : existing.status,
          updatedAt: new Date(),
        })
        .where(
          and(eq(completionReports.id, reportId), eq(completionReports.companyId, actor.companyId)),
        );

      await this.emailCentreService.createTimelineNote(actor, {
        body: `Completion report ${existing.reportNumber} prepared for email (draft ${draft.id}). Approve and execute in Email Centre.`,
        customerId: existing.customerId,
        jobId: existing.jobId,
        statusUpdate: 'completion_report_email_draft',
        metadata: { completionReportId: existing.id, emailDraftId: draft.id },
        attachmentLinks: [
          {
            attachmentKind: 'report',
            entityType: 'document',
            entityId: existing.documentId,
            documentId: existing.documentId,
            customerId: existing.customerId,
            jobId: existing.jobId,
            label: existing.title,
            fileName: `${existing.reportNumber.toLowerCase()}.html`,
            mimeType: 'text/html',
          },
        ],
      });

      await this.recordAudit(actor, 'completion_report_email_draft_prepared', reportId, {
        emailDraftId: draft.id,
        documentId: existing.documentId,
        autoSend: false,
      });

      const report = await this.getReport(actor.companyId, reportId);
      if (!report) throw new CompletionReportError('NOT_FOUND', 'Completion report not found');

      return {
        report,
        draftId: draft.id,
        sendProvider: 'gmail_api',
        composePath: 'gmail_draft_approve_execute',
        note: 'Email Centre draft created with report attachment link. Approve then execute in Email Centre. Not auto-sent.',
        emailCentrePath: '/email-centre',
      };
    } catch (error) {
      if (error instanceof EmailCentreError || error instanceof CommunicationsPlatformError) {
        throw new CompletionReportError(
          error.code === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : error.code,
          error.code === 'NOT_CONFIGURED'
            ? 'Business Gmail is not configured — Email Centre draft cannot be created. Report document remains available for portal/job pack or later send.'
            : error.message,
        );
      }
      throw error;
    }
  }

  async addTimelineNote(actor: ReportActor, reportId: string): Promise<CompletionReportDetail> {
    if (!this.emailCentreService) {
      throw new CompletionReportError(
        'NOT_CONFIGURED',
        'Communication Timeline is not wired for completion report notes',
      );
    }

    const existing = await this.getReport(actor.companyId, reportId);
    if (!existing) throw new CompletionReportError('NOT_FOUND', 'Completion report not found');
    if (!existing.documentId) {
      throw new CompletionReportError(
        'INVALID_STATE',
        'Generate the report before posting a timeline note',
      );
    }

    await this.emailCentreService.createTimelineNote(actor, {
      body: `Completion report ${existing.reportNumber} linked (${existing.title}).`,
      customerId: existing.customerId,
      jobId: existing.jobId,
      statusUpdate: 'completion_report_linked',
      metadata: { completionReportId: existing.id, documentId: existing.documentId },
      attachmentLinks: [
        {
          attachmentKind: 'report',
          entityType: 'document',
          entityId: existing.documentId,
          documentId: existing.documentId,
          customerId: existing.customerId,
          jobId: existing.jobId,
          label: existing.title,
          fileName: `${existing.reportNumber.toLowerCase()}.html`,
          mimeType: 'text/html',
        },
      ],
    });

    await this.recordAudit(actor, 'completion_report_timeline_note', reportId, {
      documentId: existing.documentId,
    });

    return existing;
  }

  async cancelReport(actor: ReportActor, reportId: string): Promise<CompletionReportDetail> {
    const existing = await this.getReport(actor.companyId, reportId);
    if (!existing) throw new CompletionReportError('NOT_FOUND', 'Completion report not found');
    if (existing.status === 'sent') {
      throw new CompletionReportError('INVALID_STATE', 'Sent reports cannot be cancelled');
    }

    await this.db
      .update(completionReports)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(eq(completionReports.id, reportId), eq(completionReports.companyId, actor.companyId)),
      );

    await this.recordAudit(actor, 'completion_report_cancelled', reportId, {});

    const report = await this.getReport(actor.companyId, reportId);
    if (!report) throw new CompletionReportError('NOT_FOUND', 'Completion report not found');
    return report;
  }

  private async nextReportNumber(companyId: string): Promise<string> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(completionReports)
      .where(eq(completionReports.companyId, companyId));
    const next = (row?.count ?? 0) + 1;
    return `CR-${String(next).padStart(4, '0')}`;
  }

  private async assembleJobContext(
    companyId: string,
    jobId: string,
  ): Promise<AssembledJobContext> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
      with: {
        customer: true,
        property: true,
        assignedUser: true,
      },
    });
    if (!job?.customerId || !job.customer) {
      throw new CompletionReportError('NOT_FOUND', 'Job not found or missing customer');
    }

    const [snapshot] = await this.db
      .select()
      .from(jobCompletionSnapshots)
      .where(
        and(eq(jobCompletionSnapshots.companyId, companyId), eq(jobCompletionSnapshots.jobId, jobId)),
      )
      .orderBy(desc(jobCompletionSnapshots.createdAt))
      .limit(1);

    const materials = await this.db
      .select()
      .from(jobMaterialLines)
      .where(and(eq(jobMaterialLines.companyId, companyId), eq(jobMaterialLines.jobId, jobId)))
      .orderBy(desc(jobMaterialLines.createdAt));

    const evidence = await this.db
      .select()
      .from(mobileJobDocumentation)
      .where(
        and(eq(mobileJobDocumentation.companyId, companyId), eq(mobileJobDocumentation.jobId, jobId)),
      )
      .orderBy(desc(mobileJobDocumentation.createdAt));

    const jobDocs = await this.db
      .select()
      .from(documents)
      .where(and(eq(documents.companyId, companyId), eq(documents.jobId, jobId)));

    const jobQuotes = await this.db
      .select()
      .from(quotes)
      .where(and(eq(quotes.companyId, companyId), eq(quotes.jobId, jobId)))
      .orderBy(desc(quotes.updatedAt));

    const jobBoqs = await this.db
      .select()
      .from(boqDocuments)
      .where(and(eq(boqDocuments.companyId, companyId), eq(boqDocuments.jobId, jobId)))
      .orderBy(desc(boqDocuments.updatedAt));

    const jobInvoices = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), eq(invoices.jobId, jobId)))
      .orderBy(desc(invoices.updatedAt));

    const primaryInvoice = jobInvoices[0] ?? null;
    let primaryReceipt: { id: string; receiptNumber: string } | null = null;
    if (primaryInvoice) {
      const [receipt] = await this.db
        .select({
          id: paymentReceipts.id,
          receiptNumber: paymentReceipts.receiptNumber,
        })
        .from(paymentReceipts)
        .innerJoin(payments, eq(payments.id, paymentReceipts.paymentId))
        .where(
          and(
            eq(paymentReceipts.companyId, companyId),
            eq(paymentReceipts.invoiceId, primaryInvoice.id),
          ),
        )
        .orderBy(desc(paymentReceipts.issuedAt))
        .limit(1);
      primaryReceipt = receipt ?? null;
    }

    const snap = (snapshot?.snapshot ?? {}) as Record<string, unknown>;
    const diagnosis =
      typeof snap.diagnosis === 'string'
        ? snap.diagnosis
        : typeof snap.recommendation === 'string'
          ? snap.recommendation
          : null;
    const workCompleted =
      typeof snap.workPerformedSummary === 'string' ? snap.workPerformedSummary : null;
    const customerRepName =
      typeof snap.customerRepName === 'string' ? snap.customerRepName : null;
    const signatureDocId =
      typeof snap.signatureDocId === 'string' ? snap.signatureDocId : null;
    const signatureUnavailableReason =
      typeof snap.signatureUnavailableReason === 'string'
        ? snap.signatureUnavailableReason
        : null;

    let technicianName: string | null = job.assignedUser
      ? [job.assignedUser.firstName, job.assignedUser.lastName].filter(Boolean).join(' ') ||
        job.assignedUser.email
      : null;
    if (snapshot?.completedByUserId) {
      const completer = await this.db.query.users.findFirst({
        where: and(eq(users.id, snapshot.completedByUserId), eq(users.companyId, companyId)),
        columns: { firstName: true, lastName: true, email: true },
      });
      if (completer) {
        technicianName =
          [completer.firstName, completer.lastName].filter(Boolean).join(' ') || completer.email;
      }
    }

    const property = job.property;
    const lat = job.snapshotLatitude ?? property?.latitude ?? null;
    const lng = job.snapshotLongitude ?? property?.longitude ?? null;
    const placeId = job.snapshotPlaceId ?? property?.placeId ?? null;
    const formattedAddress =
      job.snapshotFormattedAddress ?? property?.formattedAddress ?? null;
    const addressLines = [
      property?.addressLine1,
      property?.addressLine2,
      [property?.suburb, property?.city].filter(Boolean).join(', ') || null,
      [property?.province, property?.postalCode].filter(Boolean).join(' ') || null,
    ].filter((v): v is string => Boolean(v?.trim()));

    const map = resolveCompletionReportMapAvailability({
      propertyId: job.propertyId ?? property?.id ?? null,
      latitude: lat,
      longitude: lng,
      placeId,
      address: formattedAddress,
    });

    const photosBefore = evidence
      .filter((d) => d.documentationType === 'photo' && d.evidencePhase === 'before')
      .map((d) => ({
        id: d.id,
        title: d.title,
        evidencePhase: d.evidencePhase,
        downloadPath: d.storageKey ? `/api/v1/jobs/${jobId}/evidence/${d.id}/content` : null,
      }));
    const photosDuring = evidence
      .filter((d) => d.documentationType === 'photo' && d.evidencePhase === 'during')
      .map((d) => ({
        id: d.id,
        title: d.title,
        evidencePhase: d.evidencePhase,
        downloadPath: d.storageKey ? `/api/v1/jobs/${jobId}/evidence/${d.id}/content` : null,
      }));
    const photosAfter = evidence
      .filter((d) => d.documentationType === 'photo' && d.evidencePhase === 'after')
      .map((d) => ({
        id: d.id,
        title: d.title,
        evidencePhase: d.evidencePhase,
        downloadPath: d.storageKey ? `/api/v1/jobs/${jobId}/evidence/${d.id}/content` : null,
      }));

    const cocDocs = [
      ...jobDocs
        .filter((d) => /coc|compliance|certificate/.test(`${d.title} ${d.fileName}`.toLowerCase()))
        .map((d) => ({ id: d.id, title: d.title, source: 'document' as const })),
      ...evidence
        .filter((d) => /coc|compliance|certificate/.test(d.documentationType.toLowerCase()))
        .map((d) => ({ id: d.id, title: d.title, source: 'evidence' as const })),
    ];
    const warrantyDocs = [
      ...jobDocs
        .filter((d) => /warranty/.test(`${d.title} ${d.fileName}`.toLowerCase()))
        .map((d) => ({ id: d.id, title: d.title, source: 'document' as const })),
      ...evidence
        .filter((d) => /warranty/.test(d.documentationType.toLowerCase()))
        .map((d) => ({ id: d.id, title: d.title, source: 'evidence' as const })),
    ];

    const signatureEvidence = evidence.find(
      (d) => d.documentationType === 'customer_signature' || d.id === signatureDocId,
    );
    const hasSignature = Boolean(signatureDocId || signatureEvidence?.storageKey);

    const primaryQuote = jobQuotes[0] ?? null;
    const primaryBoq = jobBoqs[0] ?? null;

    const payload: CompletionReportSectionPayload = {
      customer: {
        name: job.customer.name,
        email: job.customer.email,
        phone: job.customer.phone,
        contactPerson: job.customer.contactPerson,
      },
      property: {
        propertyName: property?.propertyName ?? null,
        formattedAddress,
        addressLines,
      },
      map: {
        availability: map.availability,
        placeUrl: map.placeUrl,
        note: map.note,
        latitude: lat,
        longitude: lng,
      },
      job: {
        jobNumber: job.jobNumber,
        title: job.title,
        jobType: job.jobType,
        status: job.status,
        completedAt: snapshot?.createdAt.toISOString() ?? null,
      },
      diagnosis,
      workCompleted,
      materials: materials.map((m) => ({
        description: m.description,
        quantity: String(m.quantity),
        unit: m.unit,
        status: m.status,
      })),
      technician: {
        name: technicianName,
        completedByUserId: snapshot?.completedByUserId ?? null,
      },
      photosBefore,
      photosDuring,
      photosAfter,
      quote: primaryQuote
        ? { id: primaryQuote.id, label: `${primaryQuote.quoteNumber} — ${primaryQuote.title}` }
        : null,
      boq: primaryBoq
        ? { id: primaryBoq.id, label: `${primaryBoq.boqNumber} — ${primaryBoq.title}` }
        : null,
      invoice: primaryInvoice
        ? { id: primaryInvoice.id, label: primaryInvoice.invoiceNumber }
        : null,
      paymentReceipt: primaryReceipt
        ? { id: primaryReceipt.id, label: primaryReceipt.receiptNumber }
        : null,
      coc: cocDocs,
      warranty: warrantyDocs,
      customerSignature: {
        present: hasSignature,
        signatureDocId: signatureDocId ?? signatureEvidence?.id ?? null,
        customerRepName,
        unavailableReason: hasSignature
          ? null
          : signatureUnavailableReason ?? 'Customer signature not captured on this job.',
      },
    };

    const sections = buildSectionAvailability({
      hasCustomer: true,
      hasProperty: Boolean(job.propertyId || formattedAddress || addressLines.length),
      mapAvailable: map.availability === 'place_url',
      mapReason: map.availability === 'place_url' ? null : map.note,
      hasJob: true,
      hasDiagnosis: Boolean(diagnosis?.trim()),
      hasWorkCompleted: Boolean(workCompleted?.trim()),
      hasMaterials: materials.length > 0,
      hasTechnician: Boolean(technicianName),
      hasPhotosBefore: photosBefore.length > 0,
      hasPhotosDuring: photosDuring.length > 0,
      hasPhotosAfter: photosAfter.length > 0,
      hasQuote: Boolean(primaryQuote),
      hasBoq: Boolean(primaryBoq),
      hasInvoice: Boolean(primaryInvoice),
      hasReceipt: Boolean(primaryReceipt),
      hasCoc: cocDocs.length > 0,
      hasWarranty: warrantyDocs.length > 0,
      hasSignature,
      signatureReason: hasSignature
        ? null
        : signatureUnavailableReason ?? 'Customer signature not captured on this job.',
    });

    return {
      preview: {
        jobId,
        customerId: job.customerId,
        propertyId: job.propertyId ?? null,
        invoiceId: primaryInvoice?.id ?? null,
        quoteId: primaryQuote?.id ?? null,
        boqDocumentId: primaryBoq?.id ?? null,
        suggestedTitle: `Completion report — ${job.jobNumber ?? job.title}`,
        sections,
        mapAvailability: map.availability,
        mapPlaceUrl: map.placeUrl,
      },
      payload,
      customerEmail: job.customer.email,
    };
  }

  private async recordAudit(
    actor: ReportActor,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(securityAuditLogs).values({
      companyId: actor.companyId,
      category: 'reports',
      action,
      entityType: 'completion_report',
      entityId,
      userId: actor.userId,
      metadata,
    });
  }
}

function buildSectionAvailability(flags: {
  hasCustomer: boolean;
  hasProperty: boolean;
  mapAvailable: boolean;
  mapReason: string | null;
  hasJob: boolean;
  hasDiagnosis: boolean;
  hasWorkCompleted: boolean;
  hasMaterials: boolean;
  hasTechnician: boolean;
  hasPhotosBefore: boolean;
  hasPhotosDuring: boolean;
  hasPhotosAfter: boolean;
  hasQuote: boolean;
  hasBoq: boolean;
  hasInvoice: boolean;
  hasReceipt: boolean;
  hasCoc: boolean;
  hasWarranty: boolean;
  hasSignature: boolean;
  signatureReason: string | null;
}): CompletionReportSectionAvailability[] {
  const map: Record<
    CompletionReportSectionId,
    { available: boolean; reason: string | null; defaultIncluded: boolean }
  > = {
    customer_details: { available: flags.hasCustomer, reason: null, defaultIncluded: true },
    property_details: {
      available: flags.hasProperty,
      reason: flags.hasProperty ? null : 'No property or address linked to this job.',
      defaultIncluded: flags.hasProperty,
    },
    property_map: {
      available: flags.mapAvailable,
      reason: flags.mapReason,
      defaultIncluded: flags.mapAvailable,
    },
    job_details: { available: flags.hasJob, reason: null, defaultIncluded: true },
    diagnosis: {
      available: flags.hasDiagnosis,
      reason: flags.hasDiagnosis ? null : 'No diagnosis on completion snapshot.',
      defaultIncluded: flags.hasDiagnosis,
    },
    work_completed: {
      available: flags.hasWorkCompleted,
      reason: flags.hasWorkCompleted ? null : 'No work-completed summary on completion snapshot.',
      defaultIncluded: flags.hasWorkCompleted,
    },
    materials_used: {
      available: flags.hasMaterials,
      reason: flags.hasMaterials ? null : 'No material lines recorded.',
      defaultIncluded: flags.hasMaterials,
    },
    technician_details: {
      available: flags.hasTechnician,
      reason: flags.hasTechnician ? null : 'Technician not identified.',
      defaultIncluded: flags.hasTechnician,
    },
    photos_before: {
      available: flags.hasPhotosBefore,
      reason: flags.hasPhotosBefore ? null : 'No before photos.',
      defaultIncluded: flags.hasPhotosBefore,
    },
    photos_during: {
      available: flags.hasPhotosDuring,
      reason: flags.hasPhotosDuring ? null : 'No during photos.',
      defaultIncluded: false,
    },
    photos_after: {
      available: flags.hasPhotosAfter,
      reason: flags.hasPhotosAfter ? null : 'No after photos.',
      defaultIncluded: flags.hasPhotosAfter,
    },
    quote: {
      available: flags.hasQuote,
      reason: flags.hasQuote ? null : 'No quote linked to this job.',
      defaultIncluded: flags.hasQuote,
    },
    boq: {
      available: flags.hasBoq,
      reason: flags.hasBoq ? null : 'No BOQ linked to this job.',
      defaultIncluded: false,
    },
    invoice: {
      available: flags.hasInvoice,
      reason: flags.hasInvoice ? null : 'No invoice linked to this job.',
      defaultIncluded: flags.hasInvoice,
    },
    payment_receipt: {
      available: flags.hasReceipt,
      reason: flags.hasReceipt ? null : 'No payment receipt for the job invoice.',
      defaultIncluded: flags.hasReceipt,
    },
    coc: {
      available: flags.hasCoc,
      reason: flags.hasCoc ? null : 'No COC/compliance document or evidence.',
      defaultIncluded: flags.hasCoc,
    },
    warranty: {
      available: flags.hasWarranty,
      reason: flags.hasWarranty ? null : 'No warranty document or evidence.',
      defaultIncluded: flags.hasWarranty,
    },
    customer_signature: {
      available: flags.hasSignature,
      reason: flags.signatureReason,
      defaultIncluded: flags.hasSignature,
    },
  };

  return COMPLETION_REPORT_SECTION_OPTIONS.map((option) => ({
    sectionId: option.value,
    label: option.label,
    available: map[option.value].available,
    reason: map[option.value].reason,
    defaultIncluded: map[option.value].defaultIncluded,
  }));
}

function toSummary(row: {
  id: string;
  reportNumber: string;
  title: string;
  status: CompletionReportSummary['status'];
  jobId: string;
  customerId: string;
  propertyId: string | null;
  invoiceId: string | null;
  documentId: string | null;
  includedSections: string[];
  mapAvailability: string;
  mapPlaceUrl: string | null;
  emailDraftId: string | null;
  createdAt: Date;
  updatedAt: Date;
  generatedAt: Date | null;
  sentAt: Date | null;
  job: { title: string } | null;
  customer: { name: string } | null;
}): CompletionReportSummary {
  return {
    id: row.id,
    reportNumber: row.reportNumber,
    title: row.title,
    status: row.status,
    jobId: row.jobId,
    jobTitle: row.job?.title ?? null,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    propertyId: row.propertyId,
    invoiceId: row.invoiceId,
    documentId: row.documentId,
    includedSections: normalizeIncludedSections(row.includedSections),
    mapAvailability: row.mapAvailability as CompletionReportSummary['mapAvailability'],
    mapPlaceUrl: row.mapPlaceUrl,
    emailDraftId: row.emailDraftId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    generatedAt: row.generatedAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
  };
}

function toDetail(row: {
  id: string;
  reportNumber: string;
  title: string;
  status: CompletionReportSummary['status'];
  jobId: string;
  customerId: string;
  propertyId: string | null;
  invoiceId: string | null;
  quoteId: string | null;
  boqDocumentId: string | null;
  documentId: string | null;
  includedSections: string[];
  sectionPayload: Record<string, unknown>;
  htmlBody: string | null;
  mapAvailability: string;
  mapPlaceUrl: string | null;
  notes: string | null;
  emailDraftId: string | null;
  createdAt: Date;
  updatedAt: Date;
  generatedAt: Date | null;
  sentAt: Date | null;
  job: { title: string } | null;
  customer: { name: string } | null;
}): CompletionReportDetail {
  const summary = toSummary(row);
  return {
    ...summary,
    notes: row.notes,
    quoteId: row.quoteId,
    boqDocumentId: row.boqDocumentId,
    sectionPayload: row.sectionPayload as CompletionReportSectionPayload,
    htmlBody: row.htmlBody,
    deliveryNote: completionReportDeliveryNote({
      status: summary.status,
      documentId: summary.documentId,
      emailDraftId: summary.emailDraftId,
    }),
  };
}
