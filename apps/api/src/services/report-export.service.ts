import { and, eq } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import {
  jobs,
  opsMaintenanceRuns,
  opsRecurringMaintenancePlans,
  users,
  customers,
  cxCustomerProperties,
} from '@titan/db';
import type {
  MaintenanceReportContext,
  OperationalJobReportContext,
  OperationalReportKind,
} from '@titan/shared';
import {
  assertReportHtmlFreeOfSensitiveFields,
  buildCompletionReportHtml,
  buildMaintenanceReportHtml,
  buildOperationalJobReportHtml,
  buildServiceReportHtml,
  operationalReportFilename,
  parseRequestedReportAudience,
  projectCompletionPayloadForAudience,
  ReportAudienceError,
  resolvePortalReportAudience,
  resolveStaffReportAudience,
  type ReportAudienceDecision,
} from '@titan/shared';
import type { CompletionReportService } from './completion-report.service.js';
import { ChromiumPdfError, renderHtmlToPdf } from './chromium-pdf.service.js';
import type { JobEvidenceStorageService } from './job-evidence-storage.service.js';
import {
  embedJobEvidencePhotos,
  embedJobSignature,
} from './report-photo-embed.service.js';
import { userHasJobAccess } from './job-execution.service.js';
import { recordAuthorizationFailure } from '../middleware/authorization-guards.js';

export class ReportExportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ReportExportError';
  }
}

export type ReportExportActor = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: readonly string[];
  sessionId?: string;
};

export type PortalReportExportActor = {
  portalUserId: string;
  companyId: string;
  customerId: string;
  permissions: readonly string[];
  sessionId?: string;
};

export type ReportPdfResult = {
  buffer: Buffer;
  filename: string;
  contentType: 'application/pdf';
};

export type ReportExportPrincipal =
  | { kind: 'staff'; actor: ReportExportActor }
  | { kind: 'portal'; actor: PortalReportExportActor };

export class ReportExportService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly completionReports: CompletionReportService,
    private readonly jobEvidenceStorage: JobEvidenceStorageService,
  ) {}

  async exportJobReportPdf(
    principal: ReportExportPrincipal,
    jobId: string,
    requestedAudience: unknown,
  ): Promise<ReportPdfResult> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, this.tenantId(principal))),
    });
    if (!job) throw new ReportExportError('NOT_FOUND', 'Job not found');

    const decision = await this.resolveAudience(principal, requestedAudience, {
      jobId,
      jobAssignedUserId: job.assignedUserId ?? null,
      jobCustomerId: job.customerId ?? null,
    });

    const ctx = await this.buildJobContext(this.tenantId(principal), jobId);
    const html = buildOperationalJobReportHtml({
      kind: 'job',
      audience: decision.effectiveAudience,
      ctx,
      generatedAt: new Date().toISOString(),
    });
    assertReportHtmlFreeOfSensitiveFields(html, decision.effectiveAudience);

    return this.render('job', ctx.reportReference, html);
  }

  async exportServiceReportPdf(
    principal: ReportExportPrincipal,
    jobId: string,
    requestedAudience: unknown,
  ): Promise<ReportPdfResult> {
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, this.tenantId(principal))),
    });
    if (!job) throw new ReportExportError('NOT_FOUND', 'Job not found');

    const decision = await this.resolveAudience(principal, requestedAudience, {
      jobId,
      jobAssignedUserId: job.assignedUserId ?? null,
      jobCustomerId: job.customerId ?? null,
    });

    const ctx = await this.buildJobContext(this.tenantId(principal), jobId);
    const html = buildServiceReportHtml({
      ctx,
      audience: decision.effectiveAudience,
      generatedAt: new Date().toISOString(),
    });
    assertReportHtmlFreeOfSensitiveFields(html, decision.effectiveAudience);

    return this.render('service', ctx.reportReference, html);
  }

  async exportCompletionReportPdf(
    principal: ReportExportPrincipal,
    reportId: string,
    requestedAudience: unknown,
  ): Promise<ReportPdfResult> {
    const report = await this.completionReports.getReport(this.tenantId(principal), reportId);
    if (!report) throw new ReportExportError('NOT_FOUND', 'Completion report not found');

    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, report.jobId), eq(jobs.companyId, this.tenantId(principal))),
    });
    if (!job) throw new ReportExportError('NOT_FOUND', 'Job not found');

    const decision = await this.resolveAudience(principal, requestedAudience, {
      jobId: report.jobId,
      jobAssignedUserId: job.assignedUserId ?? null,
      jobCustomerId: report.customerId ?? job.customerId ?? null,
    });

    const generatedAt = report.generatedAt ?? new Date().toISOString();
    let payload = report.sectionPayload;

    const photoEmbedRefs = [
      ...(payload.photosBefore ?? []).map((p) => ({ id: p.id, title: p.title, role: 'before' as const })),
      ...(payload.photosDuring ?? []).map((p) => ({ id: p.id, title: p.title, role: 'during' as const })),
      ...(payload.photosAfter ?? []).map((p) => ({ id: p.id, title: p.title, role: 'after' as const })),
    ];

    if (photoEmbedRefs.length > 0) {
      const embedded = await embedJobEvidencePhotos(
        this.db,
        this.jobEvidenceStorage,
        this.tenantId(principal),
        report.jobId,
        photoEmbedRefs,
      );
      const embedById = new Map(photoEmbedRefs.map((ref, index) => [ref.id, embedded[index]]));

      const enrichPhotos = (photos: typeof payload.photosBefore) =>
        (photos ?? []).map((p) => ({
          ...p,
          downloadPath: null,
          dataUrl: embedById.get(p.id)?.dataUrl ?? null,
        }));

      payload = {
        ...payload,
        photosBefore: enrichPhotos(payload.photosBefore),
        photosDuring: enrichPhotos(payload.photosDuring),
        photosAfter: enrichPhotos(payload.photosAfter),
      };
    }

    const signatureDataUrl = await embedJobSignature(
      this.db,
      this.jobEvidenceStorage,
      this.tenantId(principal),
      report.jobId,
      payload.customerSignature?.signatureDocId ?? null,
    );
    if (payload.customerSignature) {
      payload = {
        ...payload,
        customerSignature: {
          ...payload.customerSignature,
          signatureDocId: null,
          dataUrl: signatureDataUrl,
        },
      };
    }

    payload = projectCompletionPayloadForAudience(payload, decision.effectiveAudience);

    const html = buildCompletionReportHtml({
      title: report.title,
      reportNumber: report.reportNumber,
      includedSections: report.includedSections,
      payload,
      generatedAt,
    });
    assertReportHtmlFreeOfSensitiveFields(html, decision.effectiveAudience);

    return this.render('completion', report.reportNumber, html);
  }

  async exportMaintenanceRunPdf(
    principal: ReportExportPrincipal,
    runId: string,
    requestedAudience: unknown,
  ): Promise<ReportPdfResult> {
    if (principal.kind === 'portal') {
      throw new ReportExportError('FORBIDDEN', 'Maintenance reports are not available on the client portal');
    }

    const run = await this.db.query.opsMaintenanceRuns.findFirst({
      where: and(
        eq(opsMaintenanceRuns.id, runId),
        eq(opsMaintenanceRuns.companyId, principal.actor.companyId),
      ),
    });
    if (!run) throw new ReportExportError('NOT_FOUND', 'Maintenance run not found');

    const plan = await this.db.query.opsRecurringMaintenancePlans.findFirst({
      where: and(
        eq(opsRecurringMaintenancePlans.id, run.planId),
        eq(opsRecurringMaintenancePlans.companyId, principal.actor.companyId),
      ),
    });
    if (!plan) throw new ReportExportError('NOT_FOUND', 'Maintenance plan not found');

    const decision = await this.resolveAudience(principal, requestedAudience, {
      jobId: run.jobId ?? undefined,
      jobAssignedUserId: run.createdByUserId ?? null,
      jobCustomerId: plan.customerId ?? null,
      maintenanceRunCreatedByUserId: run.createdByUserId ?? null,
    });

    const customer = plan.customerId
      ? await this.db.query.customers.findFirst({
          where: and(eq(customers.id, plan.customerId), eq(customers.companyId, principal.actor.companyId)),
        })
      : null;
    const property = plan.propertyId
      ? await this.db.query.cxCustomerProperties.findFirst({
          where: and(
            eq(cxCustomerProperties.id, plan.propertyId),
            eq(cxCustomerProperties.companyId, principal.actor.companyId),
          ),
        })
      : null;

    let technicianName: string | null = null;
    if (run.createdByUserId) {
      const user = await this.db.query.users.findFirst({
        where: and(eq(users.id, run.createdByUserId), eq(users.companyId, principal.actor.companyId)),
      });
      if (user) {
        technicianName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
      }
    }

    const metadata = (run.metadata ?? {}) as Record<string, unknown>;
    const tasksCompleted = Array.isArray(metadata.tasksCompleted)
      ? metadata.tasksCompleted.filter((v): v is string => typeof v === 'string')
      : [];
    const tasksNotCompleted = Array.isArray(metadata.tasksNotCompleted)
      ? metadata.tasksNotCompleted.filter((v): v is string => typeof v === 'string')
      : [];
    const riskItems = Array.isArray(metadata.riskItems)
      ? metadata.riskItems.filter((v): v is string => typeof v === 'string')
      : [];

    const ctx: MaintenanceReportContext = {
      reportReference: `MR-${run.id.slice(0, 8).toUpperCase()}`,
      planName: plan.name,
      planStatus: plan.status,
      visitDate: run.completedAt?.toISOString() ?? null,
      runStatus: run.status,
      customerName: customer?.name ?? null,
      propertyAddress: property?.formattedAddress ?? null,
      technicianName,
      tasksCompleted,
      tasksNotCompleted,
      findings: typeof metadata.findings === 'string' ? metadata.findings : run.notes,
      materials: [],
      photos: [],
      riskItems,
      recommendedNext: typeof metadata.recommendedNext === 'string' ? metadata.recommendedNext : null,
      nextDueAt: plan.nextDueAt?.toISOString() ?? null,
      notes: run.notes,
      signatures: [],
    };

    if (run.jobId) {
      try {
        const jobCtx = await this.buildJobContext(principal.actor.companyId, run.jobId);
        ctx.materials = jobCtx.materials;
        ctx.photos = [...jobCtx.photosBefore, ...jobCtx.photosAfter, ...jobCtx.supportingPhotos];
        ctx.signatures = jobCtx.signatures;
      } catch {
        /* optional linked job evidence */
      }
    }

    const html = buildMaintenanceReportHtml({
      ctx,
      audience: decision.effectiveAudience,
      generatedAt: new Date().toISOString(),
    });
    assertReportHtmlFreeOfSensitiveFields(html, decision.effectiveAudience);

    return this.render('maintenance', ctx.reportReference, html);
  }

  private tenantId(principal: ReportExportPrincipal): string {
    return principal.kind === 'staff' ? principal.actor.companyId : principal.actor.companyId;
  }

  private async resolveAudience(
    principal: ReportExportPrincipal,
    requestedAudience: unknown,
    resource: {
      jobId?: string;
      jobAssignedUserId: string | null;
      jobCustomerId: string | null;
      maintenanceRunCreatedByUserId?: string | null;
    },
  ): Promise<ReportAudienceDecision> {
    const invalidAudience = requestedAudience != null && requestedAudience !== '' &&
      parseRequestedReportAudience(requestedAudience) == null;

    if (invalidAudience) {
      throw new ReportExportError('INVALID_AUDIENCE', 'Unknown report audience value');
    }

    let decision: ReportAudienceDecision;

    if (principal.kind === 'portal') {
      decision = resolvePortalReportAudience({
        companyId: principal.actor.companyId,
        customerId: principal.actor.customerId,
        permissions: principal.actor.permissions,
        resourceCustomerId: resource.jobCustomerId,
        requestedAudience,
      });
    } else {
      const isAssigned = await this.isAssignedToResource(principal.actor, resource);
      try {
        decision = resolveStaffReportAudience({
          companyId: principal.actor.companyId,
          userId: principal.actor.userId,
          roleName: principal.actor.roleName,
          permissions: principal.actor.permissions,
          requestedAudience,
          jobAssignedUserId: resource.jobAssignedUserId,
          isAssignedToJob: isAssigned,
        });
      } catch (error) {
        if (error instanceof ReportAudienceError) {
          throw new ReportExportError(error.code, error.message);
        }
        throw error;
      }
    }

    if (decision.audienceEscalationAttempt) {
      await this.auditAudienceEscalation(principal, resource.jobId, requestedAudience, decision);
    }

    return decision;
  }

  private async isAssignedToResource(
    actor: ReportExportActor,
    resource: {
      jobId?: string;
      jobAssignedUserId: string | null;
      maintenanceRunCreatedByUserId?: string | null;
    },
  ): Promise<boolean> {
    if (resource.jobAssignedUserId && resource.jobAssignedUserId === actor.userId) {
      return true;
    }
    if (
      resource.maintenanceRunCreatedByUserId &&
      resource.maintenanceRunCreatedByUserId === actor.userId
    ) {
      return true;
    }
    if (resource.jobId) {
      return userHasJobAccess(this.db, actor.companyId, resource.jobId, actor.userId);
    }
    return false;
  }

  private async auditAudienceEscalation(
    principal: ReportExportPrincipal,
    jobId: string | undefined,
    requestedAudience: unknown,
    decision: ReportAudienceDecision,
  ): Promise<void> {
    const base =
      principal.kind === 'staff'
        ? {
            companyId: principal.actor.companyId,
            userId: principal.actor.userId,
            sessionId: principal.actor.sessionId,
          }
        : {
            companyId: principal.actor.companyId,
            userId: principal.actor.portalUserId,
            sessionId: principal.actor.sessionId,
          };

    await recordAuthorizationFailure(this.db, {
      ...base,
      action: 'report_audience_escalation_clamped',
      entityType: jobId ? 'job' : undefined,
      entityId: jobId,
      metadata: {
        requestedAudience,
        effectiveAudience: decision.effectiveAudience,
        actorCategory: decision.actorCategory,
      },
    }).catch(() => {
      /* audit must not block export when clamp succeeded */
    });
  }

  private async buildJobContext(companyId: string, jobId: string): Promise<OperationalJobReportContext> {
    const assembled = await this.completionReports.getJobExportContext(companyId, jobId);
    const payload = assembled.payload;

    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)),
    });
    if (!job) throw new ReportExportError('NOT_FOUND', 'Job not found');

    const photoIds = [
      ...(payload.photosBefore ?? []).map((p) => ({ id: p.id, title: p.title, role: 'before' as const })),
      ...(payload.photosDuring ?? []).map((p) => ({ id: p.id, title: p.title, role: 'during' as const })),
      ...(payload.photosAfter ?? []).map((p) => ({ id: p.id, title: p.title, role: 'after' as const })),
    ];

    const embedded = await embedJobEvidencePhotos(
      this.db,
      this.jobEvidenceStorage,
      companyId,
      jobId,
      photoIds,
    );

    const photosBefore = embedded.filter((p) => p.role === 'before');
    const photosDuring = embedded.filter((p) => p.role === 'during');
    const photosAfter = embedded.filter((p) => p.role === 'after');

    const signatureDataUrl = await embedJobSignature(
      this.db,
      this.jobEvidenceStorage,
      companyId,
      jobId,
      payload.customerSignature?.signatureDocId ?? null,
    );

    const cocFromPayload = payload.coc?.[0];

    return {
      reportReference: job.jobNumber ?? `JOB-${jobId.slice(0, 8).toUpperCase()}`,
      jobNumber: job.jobNumber,
      jobTitle: job.title,
      jobType: job.jobType,
      jobStatus: job.status,
      priority: job.priority,
      scheduledAt: job.scheduledAt?.toISOString() ?? null,
      completedAt: payload.job?.completedAt ?? null,
      customerName: payload.customer?.name ?? 'Customer',
      customerContact: payload.customer?.contactPerson ?? null,
      customerEmail: payload.customer?.email ?? null,
      customerPhone: payload.customer?.phone ?? null,
      propertyName: payload.property?.propertyName ?? null,
      siteAddress: payload.property?.formattedAddress ?? null,
      addressLines: payload.property?.addressLines ?? [],
      mapPlaceUrl: payload.map?.placeUrl ?? null,
      mapNote: payload.map?.note ?? null,
      technicianName: payload.technician?.name ?? null,
      jobDescription: job.description,
      diagnosis: payload.diagnosis ?? null,
      workCompleted: payload.workCompleted ?? null,
      internalNotes: job.notes,
      materials: payload.materials ?? [],
      photosBefore,
      photosDuring,
      photosAfter,
      supportingPhotos: [],
      attachments: (payload.coc ?? []).concat(payload.warranty ?? []).map((d) => ({
        title: d.title,
        mimeType: null,
      })),
      signatures: [
        {
          role: 'customer',
          signedBy: payload.customerSignature?.customerRepName ?? null,
          present: Boolean(payload.customerSignature?.present),
          dataUrl: signatureDataUrl,
          unavailableReason: payload.customerSignature?.unavailableReason ?? undefined,
        },
      ],
      recommendedMaintenance: null,
      warrantyNotes: payload.warranty?.length
        ? payload.warranty.map((w) => w.title).join('; ')
        : null,
      cocState: cocFromPayload ? 'attached' : 'not_attached',
      cocReference: cocFromPayload?.title ?? null,
      completionStatus: job.status === 'completed' ? 'Completed' : `Status: ${job.status}`,
      quoteLabel: payload.quote?.label ?? null,
      invoiceLabel: payload.invoice?.label ?? null,
    };
  }

  private async render(
    kind: OperationalReportKind,
    reference: string,
    html: string,
  ): Promise<ReportPdfResult> {
    try {
      const buffer = await renderHtmlToPdf(html);
      return {
        buffer,
        filename: operationalReportFilename(kind, reference),
        contentType: 'application/pdf',
      };
    } catch (error) {
      if (error instanceof ChromiumPdfError && error.code === 'CHROMIUM_UNAVAILABLE') {
        throw new ReportExportError('CHROMIUM_UNAVAILABLE', error.message);
      }
      throw error;
    }
  }
}
