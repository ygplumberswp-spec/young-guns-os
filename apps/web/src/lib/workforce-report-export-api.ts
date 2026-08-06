import { requestBlob } from './api-client';

export type WorkforceReportExportKind =
  | 'technician_activity'
  | 'technician_timesheet'
  | 'technician_productivity'
  | 'workforce_operations';

export type WorkforceReportPdfPreview = {
  blob: Blob;
  filename: string;
};

export type WorkforceReportExportTarget =
  | { scope: 'me' }
  | { scope: 'technician'; userId: string }
  | { scope: 'workforce_summary' };

function workforcePath(
  kind: WorkforceReportExportKind,
  target: WorkforceReportExportTarget,
): string {
  const base =
    target.scope === 'me'
      ? kind === 'technician_activity'
        ? '/report-exports/workforce/me/activity/pdf'
        : kind === 'technician_timesheet'
          ? '/report-exports/workforce/me/timesheet/pdf'
          : '/report-exports/workforce/me/productivity/pdf'
      : target.scope === 'workforce_summary'
        ? '/report-exports/workforce/summary/pdf'
        : kind === 'technician_activity'
          ? `/report-exports/workforce/technicians/${encodeURIComponent(target.userId)}/activity/pdf`
          : kind === 'technician_timesheet'
            ? `/report-exports/workforce/technicians/${encodeURIComponent(target.userId)}/timesheet/pdf`
            : `/report-exports/workforce/technicians/${encodeURIComponent(target.userId)}/productivity/pdf`;

  return base;
}

export function defaultWorkforcePeriod(): { periodStart: string; periodEnd: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

export async function fetchWorkforceReportPdf(
  accessToken: string,
  kind: WorkforceReportExportKind,
  target: WorkforceReportExportTarget,
  period: { periodStart: string; periodEnd: string },
): Promise<WorkforceReportPdfPreview> {
  const path = workforcePath(kind, target);
  const query = new URLSearchParams({
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  });
  const blob = await requestBlob(`${path}?${query.toString()}`, {
    method: 'GET',
    accessToken,
    timeoutMs: 60_000,
    headers: { Accept: 'application/pdf' },
  });

  if (blob.type && blob.type !== 'application/pdf') {
    throw new Error('Workforce report export did not return a PDF document');
  }

  const slug =
    kind === 'technician_activity'
      ? 'technician-activity'
      : kind === 'technician_timesheet'
        ? 'technician-timesheet'
        : kind === 'technician_productivity'
          ? 'technician-productivity'
          : 'workforce-operations';

  return { blob, filename: `${slug}-${period.periodEnd}.pdf` };
}

export function workforceReportKindLabel(kind: WorkforceReportExportKind): string {
  switch (kind) {
    case 'technician_activity':
      return 'Activity Report';
    case 'technician_timesheet':
      return 'Timesheet Report';
    case 'technician_productivity':
      return 'Productivity Report';
    case 'workforce_operations':
      return 'Workforce Summary';
  }
}
