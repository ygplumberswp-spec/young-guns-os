import type { OperationalReportAudience } from '@titan/shared';
import { requestBlob } from './api-client';

export type ReportExportKind = 'job' | 'service' | 'completion' | 'maintenance';

export type ReportPdfPreview = {
  blob: Blob;
  filename: string;
};

export type ReportExportChannel = 'staff' | 'portal';

function staffReportExportPath(
  kind: ReportExportKind,
  id: string,
  audience?: OperationalReportAudience,
): string {
  const base =
    kind === 'job'
      ? `/report-exports/jobs/${encodeURIComponent(id)}/pdf`
      : kind === 'service'
        ? `/report-exports/jobs/${encodeURIComponent(id)}/service/pdf`
        : kind === 'completion'
          ? `/report-exports/completion/${encodeURIComponent(id)}/pdf`
          : `/report-exports/maintenance/runs/${encodeURIComponent(id)}/pdf`;

  if (!audience) return base;
  return `${base}?audience=${encodeURIComponent(audience)}`;
}

function portalReportExportPath(kind: ReportExportKind, id: string): string | null {
  switch (kind) {
    case 'job':
      return `/portal/report-exports/jobs/${encodeURIComponent(id)}/pdf`;
    case 'service':
      return `/portal/report-exports/jobs/${encodeURIComponent(id)}/service/pdf`;
    case 'completion':
      return `/portal/report-exports/completion/${encodeURIComponent(id)}/pdf`;
    case 'maintenance':
      return null;
  }
}

export async function fetchReportExportPdf(
  accessToken: string,
  kind: ReportExportKind,
  id: string,
  options: {
    channel?: ReportExportChannel;
    audience?: OperationalReportAudience;
  } = {},
): Promise<ReportPdfPreview> {
  const channel = options.channel ?? 'staff';
  const path =
    channel === 'portal'
      ? portalReportExportPath(kind, id)
      : staffReportExportPath(kind, id, options.audience);

  if (!path) {
    throw new Error('This report type is not available in the client portal');
  }

  const blob = await requestBlob(path, {
    method: 'GET',
    accessToken,
    timeoutMs: 60_000,
    headers: { Accept: 'application/pdf' },
  });

  if (blob.type && blob.type !== 'application/pdf') {
    throw new Error('Report export did not return a PDF document');
  }

  const prefix =
    kind === 'job'
      ? 'job-report'
      : kind === 'service'
        ? 'service-report'
        : kind === 'completion'
          ? 'completion-report'
          : 'maintenance-report';

  return { blob, filename: `${prefix}-${id.slice(0, 8)}.pdf` };
}
