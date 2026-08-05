import type { OperationalReportAudience } from '@titan/shared';
import { requestBlob } from './api-client';

export type ReportExportKind = 'job' | 'service' | 'completion' | 'maintenance';

export type ReportPdfPreview = {
  blob: Blob;
  filename: string;
};

function reportExportPath(
  kind: ReportExportKind,
  id: string,
  audience: OperationalReportAudience,
): string {
  switch (kind) {
    case 'job':
      return `/report-exports/jobs/${encodeURIComponent(id)}/pdf?audience=${audience}`;
    case 'service':
      return `/report-exports/jobs/${encodeURIComponent(id)}/service/pdf?audience=${audience}`;
    case 'completion':
      return `/report-exports/completion/${encodeURIComponent(id)}/pdf?audience=${audience}`;
    case 'maintenance':
      return `/report-exports/maintenance/runs/${encodeURIComponent(id)}/pdf`;
  }
}

export async function fetchReportExportPdf(
  accessToken: string,
  kind: ReportExportKind,
  id: string,
  audience: OperationalReportAudience = 'internal',
): Promise<ReportPdfPreview> {
  const blob = await requestBlob(reportExportPath(kind, id, audience), {
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
