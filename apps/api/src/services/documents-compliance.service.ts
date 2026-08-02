import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import type {
  ComplianceWorkspaceItem,
  ComplianceWorkspaceQueue,
  ComplianceWorkspaceResponse,
} from '@titan/shared';
import {
  COMPLIANCE_WORKSPACE_QUEUE_OPTIONS,
  isCocLikeDocument,
  jobTypeSuggestsCocRequired,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  assetCalibrations,
  assetEquipment,
  certifications,
  documents,
  invoices,
  jobCompletionSnapshots,
  jobMaterialLines,
  jobs,
  mobileJobDocumentation,
  mobileJobInventoryUsage,
  quotes,
  securityAuditLogs,
  vehicles,
} from '@titan/db';
import {
  hasStoredPhotoEvidence,
  hasStoredSignatureEvidence,
} from './job-execution.service.js';

const ACTIVE_JOB_STATUSES = ['scheduled', 'in_progress', 'completed'] as const;

type StaffScope = {
  companyId: string;
  userId: string;
  roleName: string;
  permissions: string[];
};

type JobRow = {
  id: string;
  jobNumber: string | null;
  title: string;
  jobType: string | null;
  status: string;
  customerId: string;
  assignedUserId: string | null;
  updatedAt: Date;
  customer: { name: string } | null;
};

export class DocumentsComplianceService {
  constructor(private readonly db: DatabaseClient) {}

  async buildComplianceWorkspace(scope: StaffScope): Promise<ComplianceWorkspaceResponse> {
    const isTechnician = scope.roleName.toLowerCase().includes('technician');

    const [
      jobRows,
      documentRows,
      snapshotRows,
      mobileDocs,
      materialLineCounts,
      inventoryUsageCounts,
      invoiceJobIds,
      quoteJobIds,
      expiringCerts,
      expiringCalibrations,
      vehicleRows,
      equipmentAssets,
      auditCountRow,
    ] = await Promise.all([
      this.db.query.jobs.findMany({
        where: and(
          eq(jobs.companyId, scope.companyId),
          inArray(jobs.status, [...ACTIVE_JOB_STATUSES]),
        ),
        with: { customer: true },
        orderBy: [desc(jobs.updatedAt)],
        limit: 400,
      }),
      this.db.query.documents.findMany({
        where: eq(documents.companyId, scope.companyId),
        orderBy: [desc(documents.updatedAt)],
        limit: 500,
      }),
      this.db.query.jobCompletionSnapshots.findMany({
        where: eq(jobCompletionSnapshots.companyId, scope.companyId),
      }),
      this.db.query.mobileJobDocumentation.findMany({
        where: eq(mobileJobDocumentation.companyId, scope.companyId),
        columns: {
          id: true,
          jobId: true,
          documentationType: true,
          title: true,
          metadata: true,
          storageKey: true,
          evidencePhase: true,
          createdAt: true,
        },
      }),
      this.db
        .select({ jobId: jobMaterialLines.jobId, count: sql<number>`count(*)::int` })
        .from(jobMaterialLines)
        .where(eq(jobMaterialLines.companyId, scope.companyId))
        .groupBy(jobMaterialLines.jobId),
      this.db
        .select({ jobId: mobileJobInventoryUsage.jobId, count: sql<number>`count(*)::int` })
        .from(mobileJobInventoryUsage)
        .where(eq(mobileJobInventoryUsage.companyId, scope.companyId))
        .groupBy(mobileJobInventoryUsage.jobId),
      this.db
        .select({ jobId: invoices.jobId })
        .from(invoices)
        .where(and(eq(invoices.companyId, scope.companyId), sql`${invoices.jobId} IS NOT NULL`)),
      this.db
        .select({ jobId: quotes.jobId })
        .from(quotes)
        .where(and(eq(quotes.companyId, scope.companyId), sql`${quotes.jobId} IS NOT NULL`)),
      this.db.query.certifications.findMany({
        where: and(
          eq(certifications.companyId, scope.companyId),
          or(
            sql`${certifications.expiresAt} IS NOT NULL AND ${certifications.expiresAt} <= NOW() + INTERVAL '30 days'`,
            sql`${certifications.expiresAt} IS NOT NULL AND ${certifications.expiresAt} < NOW()`,
          ),
        ),
        with: { user: true },
        limit: 100,
      }),
      this.db.query.assetCalibrations.findMany({
        where: and(
          eq(assetCalibrations.companyId, scope.companyId),
          or(
            eq(assetCalibrations.complianceStatus, 'expiring'),
            eq(assetCalibrations.complianceStatus, 'expired'),
            sql`${assetCalibrations.expiresAt} IS NOT NULL AND ${assetCalibrations.expiresAt} <= NOW() + INTERVAL '30 days'`,
          ),
        ),
        with: { asset: true },
        limit: 100,
      }),
      this.db.query.vehicles.findMany({
        where: eq(vehicles.companyId, scope.companyId),
        orderBy: [desc(vehicles.updatedAt)],
        limit: 100,
      }),
      this.db.query.assetEquipment.findMany({
        where: and(
          eq(assetEquipment.companyId, scope.companyId),
          inArray(assetEquipment.assetType, ['machinery', 'tool', 'equipment', 'it_equipment']),
        ),
        limit: 100,
      }),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(securityAuditLogs)
        .where(
          and(
            eq(securityAuditLogs.companyId, scope.companyId),
            eq(securityAuditLogs.entityType, 'document'),
            gte(securityAuditLogs.occurredAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
          ),
        ),
    ]);

    const scopedJobs = isTechnician
      ? jobRows.filter((job) => job.assignedUserId === scope.userId)
      : jobRows;

    const snapshotByJobId = new Map(snapshotRows.map((row) => [row.jobId, row.snapshot]));
    const docsByJobId = new Map<string, typeof documentRows>();
    for (const doc of documentRows) {
      if (!doc.jobId) continue;
      const list = docsByJobId.get(doc.jobId) ?? [];
      list.push(doc);
      docsByJobId.set(doc.jobId, list);
    }

    const mobileDocsByJobId = new Map<string, typeof mobileDocs>();
    for (const doc of mobileDocs) {
      const list = mobileDocsByJobId.get(doc.jobId) ?? [];
      list.push(doc);
      mobileDocsByJobId.set(doc.jobId, list);
    }

    const materialCountByJob = new Map(materialLineCounts.map((row) => [row.jobId, row.count]));
    const inventoryCountByJob = new Map(inventoryUsageCounts.map((row) => [row.jobId, row.count]));
    const jobsWithInvoice = new Set(invoiceJobIds.map((row) => row.jobId).filter(Boolean) as string[]);
    const jobsWithQuote = new Set(quoteJobIds.map((row) => row.jobId).filter(Boolean) as string[]);

    const items: ComplianceWorkspaceItem[] = [];

    for (const job of scopedJobs as JobRow[]) {
      const jobDocs = docsByJobId.get(job.id) ?? [];
      const jobMobileDocs = mobileDocsByJobId.get(job.id) ?? [];
      const snapshot = snapshotByJobId.get(job.id) as Record<string, unknown> | undefined;
      const cocRequiredFromSnapshot =
        typeof snapshot?.cocRequired === 'string' ? snapshot.cocRequired : null;
      const cocLikelyRequired =
        cocRequiredFromSnapshot === 'required' ||
        (cocRequiredFromSnapshot !== 'not_required' && jobTypeSuggestsCocRequired(job.jobType));
      const hasCocDoc = jobDocs.some((doc) => isCocLikeDocument(doc.title, doc.fileName));
      const hasBefore = hasStoredPhotoEvidence(jobMobileDocs, 'before');
      const hasAfter = hasStoredPhotoEvidence(jobMobileDocs, 'after');
      const hasSignature = hasStoredSignatureEvidence(jobMobileDocs);
      const signatureUnavailable =
        typeof snapshot?.signatureUnavailableReason === 'string' &&
        snapshot.signatureUnavailableReason.trim().length > 0;
      const hasMaterials =
        (materialCountByJob.get(job.id) ?? 0) > 0 || (inventoryCountByJob.get(job.id) ?? 0) > 0;
      const hasFinanceLink = jobsWithInvoice.has(job.id) || jobsWithQuote.has(job.id);
      const outstandingDefects =
        typeof snapshot?.outstandingDefects === 'string' ? snapshot.outstandingDefects.trim() : '';
      const isActive = job.status === 'scheduled' || job.status === 'in_progress';

      const queues: ComplianceWorkspaceQueue[] = [];

      if (cocLikelyRequired && !hasCocDoc) {
        queues.push('missing_coc');
      }
      if (isActive && !hasSignature && !signatureUnavailable) {
        queues.push('missing_signature');
      }
      if (isActive && (!hasBefore || !hasAfter)) {
        queues.push('missing_photos');
      }
      if (isActive && !hasMaterials) {
        queues.push('missing_slips');
      }
      if ((job.status === 'completed' || job.status === 'in_progress') && !hasFinanceLink) {
        queues.push('missing_quote_invoice_link');
      }
      if (cocRequiredFromSnapshot === 'required' && job.status !== 'completed') {
        queues.push('coc_awaiting_completion');
      }
      if (outstandingDefects.length > 0) {
        queues.push('correction_required');
      }

      if (queues.length === 0) continue;

      items.push({
        id: `job:${job.id}`,
        queues,
        title: job.title,
        detail: job.jobNumber ? `Job ${job.jobNumber}` : null,
        statusLabel: job.status.replace(/_/g, ' '),
        occurredAt: job.updatedAt.toISOString(),
        sourceType: 'job',
        sourceId: job.id,
        entities: {
          jobId: job.id,
          jobNumber: job.jobNumber,
          customerId: job.customerId,
          customerName: job.customer?.name ?? null,
          documentId: null,
          documentTitle: null,
          vehicleId: null,
          vehicleName: null,
          assetId: null,
          assetName: null,
          staffUserId: job.assignedUserId,
          staffName: null,
        },
      });
    }

    if (!isTechnician) {
      for (const doc of documentRows) {
        if (!isCocLikeDocument(doc.title, doc.fileName)) continue;
        items.push({
          id: `document:${doc.id}`,
          queues: ['coc_issued'],
          title: doc.title,
          detail: doc.fileName,
          statusLabel: 'Issued / uploaded',
          occurredAt: doc.updatedAt.toISOString(),
          sourceType: 'document',
          sourceId: doc.id,
          entities: {
            jobId: doc.jobId,
            jobNumber: null,
            customerId: doc.customerId,
            customerName: null,
            documentId: doc.id,
            documentTitle: doc.title,
            vehicleId: null,
            vehicleName: null,
            assetId: null,
            assetName: null,
            staffUserId: doc.uploadedByUserId,
            staffName: null,
          },
        });
      }

      for (const cert of expiringCerts) {
        const expiresAt = cert.expiresAt?.toISOString() ?? cert.updatedAt.toISOString();
        items.push({
          id: `cert:${cert.id}`,
          queues: ['expiring_certificates'],
          title: cert.name,
          detail: cert.issuer ?? cert.certificationKey,
          statusLabel: cert.expiresAt && cert.expiresAt.getTime() < Date.now() ? 'Expired' : 'Expiring',
          occurredAt: expiresAt,
          sourceType: 'certification',
          sourceId: cert.id,
          entities: {
            jobId: null,
            jobNumber: null,
            customerId: null,
            customerName: null,
            documentId: null,
            documentTitle: null,
            vehicleId: null,
            vehicleName: null,
            assetId: null,
            assetName: null,
            staffUserId: cert.userId,
            staffName: cert.user ? `${cert.user.firstName} ${cert.user.lastName}`.trim() : null,
          },
        });
      }

      for (const vehicle of vehicleRows) {
        const hasVehicleDoc = documentRows.some((doc) => {
          const haystack = `${doc.title} ${doc.fileName} ${doc.description ?? ''}`.toLowerCase();
          return (
            haystack.includes(vehicle.licensePlate.toLowerCase()) ||
            haystack.includes(vehicle.name.toLowerCase()) ||
            haystack.includes('vehicle') ||
            haystack.includes('licence') ||
            haystack.includes('license')
          );
        });
        if (hasVehicleDoc) continue;
        items.push({
          id: `vehicle:${vehicle.id}`,
          queues: ['vehicle_documents'],
          title: vehicle.name,
          detail: vehicle.licensePlate,
          statusLabel: 'No linked document',
          occurredAt: vehicle.updatedAt.toISOString(),
          sourceType: 'vehicle',
          sourceId: vehicle.id,
          entities: {
            jobId: null,
            jobNumber: null,
            customerId: null,
            customerName: null,
            documentId: null,
            documentTitle: null,
            vehicleId: vehicle.id,
            vehicleName: vehicle.name,
            assetId: null,
            assetName: null,
            staffUserId: vehicle.assignedUserId,
            staffName: null,
          },
        });
      }

      for (const calibration of expiringCalibrations) {
        items.push({
          id: `calibration:${calibration.id}`,
          queues: ['equipment_documents'],
          title: calibration.certificationName,
          detail: calibration.asset?.name ?? null,
          statusLabel: calibration.complianceStatus.replace(/_/g, ' '),
          occurredAt: (calibration.expiresAt ?? calibration.updatedAt).toISOString(),
          sourceType: 'asset',
          sourceId: calibration.assetId,
          entities: {
            jobId: null,
            jobNumber: null,
            customerId: null,
            customerName: null,
            documentId: null,
            documentTitle: null,
            vehicleId: null,
            vehicleName: null,
            assetId: calibration.assetId,
            assetName: calibration.asset?.name ?? null,
            staffUserId: null,
            staffName: null,
          },
        });
      }

      for (const asset of equipmentAssets) {
        const hasAssetDoc = documentRows.some((doc) => {
          const haystack = `${doc.title} ${doc.fileName}`.toLowerCase();
          return haystack.includes(asset.name.toLowerCase());
        });
        const hasCalibration = expiringCalibrations.some((row) => row.assetId === asset.id);
        if (hasAssetDoc || hasCalibration) continue;
        items.push({
          id: `asset:${asset.id}`,
          queues: ['equipment_documents'],
          title: asset.name,
          detail: asset.assetType.replace(/_/g, ' '),
          statusLabel: 'No compliance document',
          occurredAt: asset.updatedAt.toISOString(),
          sourceType: 'asset',
          sourceId: asset.id,
          entities: {
            jobId: null,
            jobNumber: null,
            customerId: null,
            customerName: null,
            documentId: null,
            documentTitle: null,
            vehicleId: null,
            vehicleName: null,
            assetId: asset.id,
            assetName: asset.name,
            staffUserId: null,
            staffName: null,
          },
        });
      }
    }

    items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

    const queueSummaries = COMPLIANCE_WORKSPACE_QUEUE_OPTIONS.map((option) => ({
      queue: option.value,
      label: option.label,
      count: items.filter((item) => item.queues.includes(option.value)).length,
    }));

    const gapCount = items.filter((item) =>
      item.queues.some((queue) => queue !== 'coc_issued'),
    ).length;

    return {
      summary: isTechnician
        ? `${items.length} compliance item(s) on your assigned jobs.`
        : `${items.length} compliance item(s) — ${gapCount} open gap(s) from live tenant data.`,
      disclaimer:
        'TITAN supports authorised plumbers and document tracking. It does not issue Certificates of Compliance or replace legal/professional responsibility.',
      queueSummaries,
      items: items.slice(0, 200),
      documentAuditRecentCount: auditCountRow[0]?.count ?? 0,
    };
  }
}
