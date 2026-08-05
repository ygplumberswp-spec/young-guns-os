/**
 * Canonical operational report export kinds — job, completion, service, maintenance.
 * Distinct from Titan Document Engine report kinds (service/inspection/maintenance sections).
 */

export const OPERATIONAL_REPORT_KINDS = ['job', 'completion', 'service', 'maintenance'] as const;

export type OperationalReportKind = (typeof OPERATIONAL_REPORT_KINDS)[number];

export type OperationalReportAudience = 'internal' | 'client' | 'technician';

export type OperationalReportPhoto = {
  title: string;
  caption?: string | null;
  /** Embedded data URL for PDF — never a storage path. */
  dataUrl?: string | null;
  role?: 'before' | 'after' | 'during' | 'supporting' | null;
};

export type OperationalReportAttachmentRef = {
  title: string;
  mimeType: string | null;
};

export type OperationalReportSignature = {
  role: 'customer' | 'technician';
  signedBy: string | null;
  dataUrl?: string | null;
  present: boolean;
  unavailableReason?: string | null;
};

export type OperationalReportMaterialLine = {
  description: string;
  quantity: string;
  unit: string;
  status: string;
};

/** Shared job-derived context for job, service and completion exports. */
export type OperationalJobReportContext = {
  reportReference: string;
  jobNumber: string | null;
  jobTitle: string;
  jobType: string | null;
  jobStatus: string;
  priority: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  customerName: string;
  customerContact: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  propertyName: string | null;
  siteAddress: string | null;
  addressLines: string[];
  mapPlaceUrl: string | null;
  mapNote: string | null;
  technicianName: string | null;
  jobDescription: string | null;
  diagnosis: string | null;
  workCompleted: string | null;
  internalNotes: string | null;
  materials: OperationalReportMaterialLine[];
  photosBefore: OperationalReportPhoto[];
  photosDuring: OperationalReportPhoto[];
  photosAfter: OperationalReportPhoto[];
  supportingPhotos: OperationalReportPhoto[];
  attachments: OperationalReportAttachmentRef[];
  signatures: OperationalReportSignature[];
  recommendedMaintenance: string | null;
  warrantyNotes: string | null;
  cocState: 'attached' | 'not_attached';
  cocReference: string | null;
  completionStatus: string;
  quoteLabel: string | null;
  invoiceLabel: string | null;
};

export type MaintenanceReportContext = {
  reportReference: string;
  planName: string;
  planStatus: string;
  visitDate: string | null;
  runStatus: string;
  customerName: string | null;
  propertyAddress: string | null;
  technicianName: string | null;
  tasksCompleted: string[];
  tasksNotCompleted: string[];
  findings: string | null;
  materials: OperationalReportMaterialLine[];
  photos: OperationalReportPhoto[];
  riskItems: string[];
  recommendedNext: string | null;
  nextDueAt: string | null;
  notes: string | null;
  signatures: OperationalReportSignature[];
};

export function operationalReportKindLabel(kind: OperationalReportKind): string {
  switch (kind) {
    case 'job':
      return 'Job Report';
    case 'completion':
      return 'Completion Report';
    case 'service':
      return 'Service Report';
    case 'maintenance':
      return 'Maintenance Report';
    default:
      return 'Report';
  }
}

export function operationalReportFilename(kind: OperationalReportKind, reference: string): string {
  const safe = reference.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').slice(0, 80);
  return `${kind}-report-${safe || 'export'}.pdf`;
}

export function isOperationalReportKind(value: string): value is OperationalReportKind {
  return (OPERATIONAL_REPORT_KINDS as readonly string[]).includes(value);
}

/** Strip internal-only fields for client-safe exports. */
export function toClientSafeJobContext(ctx: OperationalJobReportContext): OperationalJobReportContext {
  return {
    ...ctx,
    internalNotes: null,
    materials: ctx.materials.map((m) => ({ ...m, status: m.status })),
  };
}

/** Technician view excludes costs/profit paths — materials list kept descriptive only. */
export function toTechnicianSafeJobContext(ctx: OperationalJobReportContext): OperationalJobReportContext {
  return {
    ...toClientSafeJobContext(ctx),
    invoiceLabel: null,
    quoteLabel: null,
  };
}

export function resolveJobContextForAudience(
  ctx: OperationalJobReportContext,
  audience: OperationalReportAudience,
): OperationalJobReportContext {
  if (audience === 'client') return toClientSafeJobContext(ctx);
  if (audience === 'technician') return toTechnicianSafeJobContext(ctx);
  return ctx;
}
