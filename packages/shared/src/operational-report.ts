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
    reportReference: ctx.reportReference,
    jobNumber: ctx.jobNumber,
    jobTitle: ctx.jobTitle,
    jobType: ctx.jobType,
    jobStatus: ctx.jobStatus,
    priority: ctx.priority,
    scheduledAt: ctx.scheduledAt,
    completedAt: ctx.completedAt,
    customerName: ctx.customerName,
    customerContact: ctx.customerContact,
    customerEmail: ctx.customerEmail,
    customerPhone: ctx.customerPhone,
    propertyName: ctx.propertyName,
    siteAddress: ctx.siteAddress,
    addressLines: ctx.addressLines,
    mapPlaceUrl: ctx.mapPlaceUrl,
    mapNote: ctx.mapNote,
    technicianName: ctx.technicianName,
    jobDescription: ctx.jobDescription,
    diagnosis: ctx.diagnosis,
    workCompleted: ctx.workCompleted,
    internalNotes: null,
    materials: ctx.materials.map((m) => ({
      description: m.description,
      quantity: m.quantity,
      unit: m.unit,
      status: m.status,
    })),
    photosBefore: ctx.photosBefore,
    photosDuring: ctx.photosDuring,
    photosAfter: ctx.photosAfter,
    supportingPhotos: ctx.supportingPhotos,
    attachments: ctx.attachments.map((a) => ({ title: a.title, mimeType: a.mimeType })),
    signatures: ctx.signatures,
    recommendedMaintenance: ctx.recommendedMaintenance,
    warrantyNotes: ctx.warrantyNotes,
    cocState: ctx.cocState,
    cocReference: ctx.cocReference,
    completionStatus: ctx.completionStatus,
    quoteLabel: ctx.quoteLabel,
    invoiceLabel: ctx.invoiceLabel,
  };
}

/** Technician view excludes costs/profit paths — materials list kept descriptive only. */
export function toTechnicianSafeJobContext(ctx: OperationalJobReportContext): OperationalJobReportContext {
  const clientSafe = toClientSafeJobContext(ctx);
  return {
    ...clientSafe,
    invoiceLabel: null,
    quoteLabel: null,
    materials: clientSafe.materials.map((m) => ({
      description: m.description,
      quantity: m.quantity,
      unit: m.unit,
      status: m.status,
    })),
  };
}

export function toClientSafeMaintenanceContext(ctx: MaintenanceReportContext): MaintenanceReportContext {
  return {
    reportReference: ctx.reportReference,
    planName: ctx.planName,
    planStatus: ctx.planStatus,
    visitDate: ctx.visitDate,
    runStatus: ctx.runStatus,
    customerName: ctx.customerName,
    propertyAddress: ctx.propertyAddress,
    technicianName: ctx.technicianName,
    tasksCompleted: ctx.tasksCompleted,
    tasksNotCompleted: ctx.tasksNotCompleted,
    findings: ctx.findings,
    materials: ctx.materials.map((m) => ({
      description: m.description,
      quantity: m.quantity,
      unit: m.unit,
      status: m.status,
    })),
    photos: ctx.photos,
    riskItems: ctx.riskItems,
    recommendedNext: ctx.recommendedNext,
    nextDueAt: ctx.nextDueAt,
    notes: null,
    signatures: ctx.signatures,
  };
}

export function toTechnicianSafeMaintenanceContext(ctx: MaintenanceReportContext): MaintenanceReportContext {
  return toClientSafeMaintenanceContext(ctx);
}

export function resolveJobContextForAudience(
  ctx: OperationalJobReportContext,
  audience: OperationalReportAudience,
): OperationalJobReportContext {
  if (audience === 'client') return toClientSafeJobContext(ctx);
  if (audience === 'technician') return toTechnicianSafeJobContext(ctx);
  return ctx;
}

export function resolveMaintenanceContextForAudience(
  ctx: MaintenanceReportContext,
  audience: OperationalReportAudience,
): MaintenanceReportContext {
  if (audience === 'client') return toClientSafeMaintenanceContext(ctx);
  if (audience === 'technician') return toTechnicianSafeMaintenanceContext(ctx);
  return ctx;
}
