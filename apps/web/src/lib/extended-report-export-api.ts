import { requestBlob } from './api-client';

export type ExtendedReportExportKind =
  | 'inspection'
  | 'compliance_coc_support'
  | 'fleet_vehicle_activity'
  | 'fleet_operations'
  | 'compliance_coc_register';

export type ExtendedReportExportChannel = 'staff' | 'portal';

export type ExtendedReportExportTarget =
  | { scope: 'job'; jobId: string }
  | { scope: 'vehicle'; vehicleId: string }
  | { scope: 'tenant' };

export type ExtendedReportPdfPreview = {
  blob: Blob;
  filename: string;
};

function staffPath(kind: ExtendedReportExportKind, target: ExtendedReportExportTarget): string {
  switch (kind) {
    case 'inspection':
      if (target.scope !== 'job') throw new Error('Job ID is required for inspection export');
      return `/report-exports/jobs/${encodeURIComponent(target.jobId)}/inspection/pdf`;
    case 'compliance_coc_support':
      if (target.scope !== 'job') throw new Error('Job ID is required for compliance support export');
      return `/report-exports/jobs/${encodeURIComponent(target.jobId)}/compliance-support/pdf`;
    case 'fleet_vehicle_activity':
      if (target.scope !== 'vehicle') throw new Error('Vehicle ID is required for fleet vehicle activity export');
      return `/report-exports/fleet/vehicles/${encodeURIComponent(target.vehicleId)}/activity/pdf`;
    case 'fleet_operations':
      return '/report-exports/fleet/operations/pdf';
    case 'compliance_coc_register':
      return '/report-exports/compliance/coc-register/pdf';
  }
}

function portalPath(kind: ExtendedReportExportKind, target: ExtendedReportExportTarget): string | null {
  if (target.scope !== 'job') return null;
  switch (kind) {
    case 'inspection':
      return `/portal/report-exports/jobs/${encodeURIComponent(target.jobId)}/inspection/pdf`;
    case 'compliance_coc_support':
      return `/portal/report-exports/jobs/${encodeURIComponent(target.jobId)}/compliance-support/pdf`;
    default:
      return null;
  }
}

export function defaultExtendedPeriod(days = 30): { periodStart: string; periodEnd: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

export async function fetchExtendedReportPdf(
  accessToken: string,
  kind: ExtendedReportExportKind,
  target: ExtendedReportExportTarget,
  options: {
    channel?: ExtendedReportExportChannel;
    periodStart?: string;
    periodEnd?: string;
    statusFilter?: string;
  } = {},
): Promise<ExtendedReportPdfPreview> {
  const channel = options.channel ?? 'staff';
  const path =
    channel === 'portal'
      ? portalPath(kind, target)
      : staffPath(kind, target);

  if (!path) {
    throw new Error('This report is not available on the client portal');
  }

  const query = new URLSearchParams();
  if (options.periodStart && options.periodEnd) {
    query.set('periodStart', options.periodStart);
    query.set('periodEnd', options.periodEnd);
  }
  if (options.statusFilter?.trim()) {
    query.set('status', options.statusFilter.trim());
  }

  const url = query.toString() ? `${path}?${query.toString()}` : path;

  const blob = await requestBlob(url, {
    method: 'GET',
    accessToken,
    timeoutMs: 60_000,
    headers: { Accept: 'application/pdf' },
  });

  if (blob.type && blob.type !== 'application/pdf') {
    throw new Error('Report export did not return a PDF document');
  }

  const slug =
    kind === 'inspection'
      ? 'inspection'
      : kind === 'compliance_coc_support'
        ? 'compliance-coc-support'
        : kind === 'fleet_vehicle_activity'
          ? 'fleet-vehicle-activity'
          : kind === 'fleet_operations'
            ? 'fleet-operations'
            : 'compliance-coc-register';

  return { blob, filename: `${slug}-${options.periodEnd ?? 'report'}.pdf` };
}

export function extendedReportKindLabel(kind: ExtendedReportExportKind): string {
  switch (kind) {
    case 'inspection':
      return 'Inspection Report';
    case 'compliance_coc_support':
      return 'Compliance and COC Support Report';
    case 'fleet_vehicle_activity':
      return 'Fleet Vehicle Activity Report';
    case 'fleet_operations':
      return 'Fleet Operations Summary';
    case 'compliance_coc_register':
      return 'Compliance and COC Register Report';
  }
}
