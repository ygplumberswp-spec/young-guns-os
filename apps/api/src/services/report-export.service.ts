import { and, eq } from 'drizzle-orm';
import type { DatabaseClient } from '@titan/db';
import { jobs, opsMaintenanceRuns, opsRecurringMaintenancePlans, users, customers, cxCustomerProperties } from '@titan/db';
import type {
  OperationalJobReportContext,
  OperationalReportAudience,
  OperationalReportKind,
  MaintenanceReportContext,
} from '@titan/shared';
import {
  buildCompletionReportHtml,
  buildMaintenanceReportHtml,
  buildOperationalJobReportHtml,
  buildServiceReportHtml,
  operationalReportFilename,
} from '@titan/shared';
import { hasAnyPermission } from '@titan/auth';
import type { CompletionReportService } from './completion-report.service.js';
import { ChromiumPdfError, renderHtmlToPdf } from './chromium-pdf.service.js';
import type { JobEvidenceStorageService } from './job-evidence-storage.service.js';
import {
  embedJobEvidencePhotos,
  embedJobSignature,
} from './report-photo-embed.service.js';

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
};

export type ReportPdfResult = {
  buffer: Buffer;
  filename: string;
  contentType: 'application/pdf';
};

export class ReportExportService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly completionReports: CompletionReportService,
    private readonly jobEvidenceStorage: JobEvidenceStorageService,
  ) {}

  assertAudienceAccess(
    actor: ReportExportActor,
    audience: OperationalReportAudience,
    jobAssignedUserId: string | null,
  ): void {
    const isAssigned = Boolean(jobAssignedUserId && jobAssignedUserId === actor.userId);

    if (audience === 'internal') {
      if (hasAnyPermission([...actor.permissions], ['documents:read', 'jobs:read', 'jobs:write', '*'])) {
        return;
      }
      throw new ReportExportError('FORBIDDEN', 'You do not have permission to export internal reports');
    }

    if (audience === 'technician') {
      if (isAssigned) {
        return;
      }
      if (hasAnyPermission([...actor.permissions], ['documents:read', 'jobs:write', '*'])) {
        return;
      }
      throw new ReportExportError('FORBIDDEN', 'Technicians may only export reports for assigned jobs');
    }

    if (audience === 'client') {
      if (hasAnyPermission([...actor.permissions], ['documents:read', 'jobs:read', '*'])) {
        return;
      }
      throw new ReportExportError('FORBIDDEN', 'You do not have permission to export client reports');
    }
  }

  async exportJobReportPdf(
    actor: ReportExportActor,
    jobId: string,
    audience: OperationalReportAudience,
  ): Promise<ReportPdfResult> {
    const ctx = await this.buildJobContext(actor.companyId, jobId);
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, actor.companyId)),
    });
    if (!job) throw new ReportExportError('NOT_FOUND', 'Job not found');

    this.assertAudienceAccess(actor, audience, job.assignedUserId ?? null);

    const html = buildOperationalJobReportHtml({
      kind: 'job',
      audience,
      ctx,
      generatedAt: new Date().toISOString(),
    });

    return this.render('job', ctx.reportReference, html);
  }

  async exportServiceReportPdf(
    actor: ReportExportActor,
    jobId: string,
    audience: OperationalReportAudience,
  ): Promise<ReportPdfResult> {
    const ctx = await this.buildJobContext(actor.companyId, jobId);
    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, actor.companyId)),
    });
    if (!job) throw new ReportExportError('NOT_FOUND', 'Job not found');

    this.assertAudienceAccess(actor, audience, job.assignedUserId ?? null);

    const html = buildServiceReportHtml({
      ctx,
      audience,
      generatedAt: new Date().toISOString(),
    });

    return this.render('service', ctx.reportReference, html);
  }

  async exportCompletionReportPdf(
    actor: ReportExportActor,
    reportId: string,
    audience: OperationalReportAudience,
  ): Promise<ReportPdfResult> {
    const report = await this.completionReports.getReport(actor.companyId, reportId);
    if (!report) throw new ReportExportError('NOT_FOUND', 'Completion report not found');

    const job = await this.db.query.jobs.findFirst({
      where: and(eq(jobs.id, report.jobId), eq(jobs.companyId, actor.companyId)),
    });
    if (!job) throw new ReportExportError('NOT_FOUND', 'Job not found');

    this.assertAudienceAccess(actor, audience, job.assignedUserId ?? null);

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
        actor.companyId,
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
      actor.companyId,
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

    const html = buildCompletionReportHtml({
      title: report.title,
      reportNumber: report.reportNumber,
      includedSections: report.includedSections,
      payload,
      generatedAt,
    });

    return this.render('completion', report.reportNumber, html);
  }

  async exportMaintenanceRunPdf(
    actor: ReportExportActor,
    runId: string,
  ): Promise<ReportPdfResult> {
    if (
      !hasAnyPermission([...actor.permissions], [
        'documents:read',
        'jobs:read',
        'asset_equipment:read',
        'ops:read',
        '*',
      ])
    ) {
      throw new ReportExportError('FORBIDDEN', 'You do not have permission to export maintenance reports');
    }

    const run = await this.db.query.opsMaintenanceRuns.findFirst({
      where: and(eq(opsMaintenanceRuns.id, runId), eq(opsMaintenanceRuns.companyId, actor.companyId)),
    });
    if (!run) throw new ReportExportError('NOT_FOUND', 'Maintenance run not found');

    const plan = await this.db.query.opsRecurringMaintenancePlans.findFirst({
      where: and(
        eq(opsRecurringMaintenancePlans.id, run.planId),
        eq(opsRecurringMaintenancePlans.companyId, actor.companyId),
      ),
    });
    if (!plan) throw new ReportExportError('NOT_FOUND', 'Maintenance plan not found');

    const customer = plan.customerId
      ? await this.db.query.customers.findFirst({
          where: and(eq(customers.id, plan.customerId), eq(customers.companyId, actor.companyId)),
        })
      : null;
    const property = plan.propertyId
      ? await this.db.query.cxCustomerProperties.findFirst({
          where: and(
            eq(cxCustomerProperties.id, plan.propertyId),
            eq(cxCustomerProperties.companyId, actor.companyId),
          ),
        })
      : null;

    let technicianName: string | null = null;
    if (run.createdByUserId) {
      const user = await this.db.query.users.findFirst({
        where: and(eq(users.id, run.createdByUserId), eq(users.companyId, actor.companyId)),
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
        const jobCtx = await this.buildJobContext(actor.companyId, run.jobId);
        ctx.materials = jobCtx.materials;
        ctx.photos = [
          ...jobCtx.photosBefore,
          ...jobCtx.photosAfter,
          ...jobCtx.supportingPhotos,
        ];
        ctx.signatures = jobCtx.signatures;
      } catch {
        // Job context optional for maintenance run
      }
    }

    const html = buildMaintenanceReportHtml({
      ctx,
      generatedAt: new Date().toISOString(),
    });

    return this.render('maintenance', ctx.reportReference, html);
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
      completionStatus:
        job.status === 'completed' ? 'Completed' : `Status: ${job.status}`,
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
