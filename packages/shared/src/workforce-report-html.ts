import { buildYoungGunsReportShellHtml } from './young-guns-report-shell.js';
import type {
  TechnicianActivityReportContext,
  TechnicianProductivityReportContext,
  TechnicianTimesheetReportContext,
  WorkforceMetricValue,
  WorkforceOperationsReportContext,
  WorkforceReportKind,
} from './workforce-report.js';
import { workforceReportKindLabel } from './workforce-report.js';
import { formatWorkforcePeriodLabel } from './workforce-report-period.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function section(title: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function renderMetricTable(metrics: WorkforceMetricValue[]): string {
  if (!metrics.length) return '<p class="muted">No metrics recorded.</p>';
  const rows = metrics
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.label)}</td><td>${escapeHtml(m.displayValue)}</td><td class="muted">${escapeHtml(m.inclusionRule)}</td><td class="muted">${escapeHtml(m.note ?? '')}</td></tr>`,
    )
    .join('');
  return `<table class="wf-table"><thead><tr><th>Metric</th><th>Value</th><th>Rule</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function shell(
  kind: WorkforceReportKind,
  ctx: {
    reportReference: string;
    technicianName?: string | null;
    periodStart: string;
    periodEnd: string;
    timezone: string;
    generatedAt: string;
    dataLimitations: string[];
  },
  body: string,
): string {
  const title =
    ctx.technicianName != null
      ? `${workforceReportKindLabel(kind)} — ${ctx.technicianName}`
      : workforceReportKindLabel(kind);

  const limitations =
    ctx.dataLimitations.length > 0
      ? section('Data limitations', `<ul>${ctx.dataLimitations.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`)
      : '';

  return buildYoungGunsReportShellHtml({
    workforceKind: kind,
    reportTitle: title,
    periodLabel: formatWorkforcePeriodLabel(ctx),
    generatedAt: ctx.generatedAt,
    filterSummary: `Reference: ${ctx.reportReference}`,
    bodyHtml: `${body}${limitations}`,
  });
}

export function buildTechnicianActivityReportHtml(ctx: TechnicianActivityReportContext): string {
  const metrics = [
    ctx.jobsAssigned,
    ctx.jobsStarted,
    ctx.jobsCompleted,
    ctx.jobsOpen,
    ctx.jobsCancelled,
    ctx.serviceVisits,
    ctx.maintenanceVisits,
    ctx.completionReportsSubmitted,
    ctx.photosEvidenceSubmitted,
    ctx.checklistsCompleted,
    ctx.materialsRecorded,
    ctx.callbacks,
    ctx.reworkVisits,
    ctx.recordedWorkingHours,
    ctx.recordedBreakHours,
  ];

  const statusRows = ctx.statusBreakdown
    .map((s) => `<tr><td>${escapeHtml(s.status)}</td><td>${s.count}</td></tr>`)
    .join('');

  const scheduledRows = ctx.scheduledJobs
    .map(
      (j) =>
        `<tr><td>${escapeHtml(j.jobNumber ?? '—')}</td><td>${escapeHtml(j.title)}</td><td>${escapeHtml(j.status)}</td><td>${escapeHtml(j.scheduledAt ?? '—')}</td></tr>`,
    )
    .join('');

  const body = [
    section(
      'Technician',
      `<p><strong>Name:</strong> ${escapeHtml(ctx.technicianName)}</p><p><strong>Reference:</strong> ${escapeHtml(ctx.technicianReference)}</p>`,
    ),
    section('Activity metrics', renderMetricTable(metrics)),
    section(
      'Job status breakdown',
      statusRows
        ? `<table class="wf-table"><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>${statusRows}</tbody></table>`
        : '<p class="muted">No jobs in period.</p>',
    ),
    section(
      'Scheduled / open jobs',
      scheduledRows
        ? `<table class="wf-table"><thead><tr><th>Job #</th><th>Title</th><th>Status</th><th>Scheduled</th></tr></thead><tbody>${scheduledRows}</tbody></table>`
        : '<p class="muted">No scheduled jobs in period.</p>',
    ),
    ctx.dataQualityNotes.length
      ? section(
          'Data quality notes',
          `<ul>${ctx.dataQualityNotes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`,
        )
      : '',
  ].join('');

  return shell('technician_activity', ctx, body);
}

export function buildTechnicianTimesheetReportHtml(ctx: TechnicianTimesheetReportContext): string {
  const dailyRows = ctx.dailyRows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.clockIn ?? '—')}</td><td>${escapeHtml(r.clockOut ?? '—')}</td><td>${r.breakMinutes ?? '—'}</td><td>${r.workingMinutes ?? '—'}</td><td>${r.regularHours ?? '—'}</td><td>${r.overtimeHours ?? '—'}</td><td>${escapeHtml(r.status ?? '—')}</td><td>${escapeHtml(r.flags.join('; ') || '—')}</td></tr>`,
    )
    .join('');

  const body = [
    section(
      'Technician',
      `<p><strong>Name:</strong> ${escapeHtml(ctx.technicianName)}</p><p><strong>Reference:</strong> ${escapeHtml(ctx.technicianReference)}</p>`,
    ),
    section('Overtime policy', `<p class="muted">${escapeHtml(ctx.overtimePolicyNote)}</p>`),
    section(
      'Daily rows',
      dailyRows
        ? `<table class="wf-table wf-table--dense"><thead><tr><th>Date</th><th>Clock in</th><th>Clock out</th><th>Break (min)</th><th>Working (min)</th><th>Regular (h)</th><th>OT (h)</th><th>Status</th><th>Flags</th></tr></thead><tbody>${dailyRows}</tbody></table>`
        : '<p class="muted">No valid time entries recorded for this period.</p>',
    ),
    section(
      'Totals',
      `<p><strong>Working hours:</strong> ${ctx.totals.workingHours ?? 'Not recorded'}</p>
       <p><strong>Regular hours:</strong> ${ctx.totals.regularHours ?? 'Not recorded'}</p>
       <p><strong>Overtime hours:</strong> ${ctx.totals.overtimeHours ?? 'Not recorded'}</p>
       <p><strong>Break hours:</strong> ${ctx.totals.breakHours ?? 'Not recorded'}</p>
       <p><strong>Days without entries:</strong> ${ctx.totals.missingEntries}</p>
       <p><strong>Incomplete entries:</strong> ${ctx.totals.incompleteEntries}</p>`,
    ),
    ctx.approvalStatusNote
      ? section('Approval status', `<p class="muted">${escapeHtml(ctx.approvalStatusNote)}</p>`)
      : '',
  ].join('');

  return shell('technician_timesheet', ctx, body);
}

export function buildTechnicianProductivityReportHtml(ctx: TechnicianProductivityReportContext): string {
  const body = [
    section(
      'Technician',
      `<p><strong>Name:</strong> ${escapeHtml(ctx.technicianName)}</p><p><strong>Reference:</strong> ${escapeHtml(ctx.technicianReference)}</p>`,
    ),
    section(
      'Transparent productivity metrics',
      `<p class="muted">Each metric shows numerator/denominator where applicable. No weighted scores or rankings.</p>${renderMetricTable(ctx.metrics)}`,
    ),
    ctx.honestyNotes.length
      ? section(
          'Metric definitions and exclusions',
          `<ul>${ctx.honestyNotes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`,
        )
      : '',
  ].join('');

  return shell('technician_productivity', ctx, body);
}

export function buildWorkforceOperationsReportHtml(ctx: WorkforceOperationsReportContext): string {
  const summaryMetrics = [
    ctx.activeTechnicians,
    ctx.assignedJobs,
    ctx.completedJobs,
    ctx.openJobs,
    ctx.cancelledJobs,
    ctx.totalRecordedWorkingHours,
    ctx.totalRecordedOvertimeHours,
    ctx.completionReportsSubmitted,
    ctx.serviceVisits,
    ctx.maintenanceVisits,
    ctx.explicitCallbacks,
    ctx.explicitRework,
    ctx.missingTimesheetEntries,
    ctx.jobsLackingEvidence,
    ctx.jobsLackingCompletionReports,
  ];

  const workloadRows = ctx.workloadByTechnician
    .map(
      (w) =>
        `<tr><td>${escapeHtml(w.technicianName)}</td><td>${escapeHtml(w.technicianReference)}</td><td>${w.jobsAssigned}</td><td>${w.jobsCompleted}</td><td>${w.openJobs}</td><td>${w.recordedHours ?? '—'}</td><td>${w.overtimeHours ?? '—'}</td><td>${w.callbacks}</td></tr>`,
    )
    .join('');

  const body = [
    section('Workforce summary', renderMetricTable(summaryMetrics)),
    section(
      'Workload by technician',
      workloadRows
        ? `<table class="wf-table"><thead><tr><th>Name</th><th>Ref</th><th>Assigned</th><th>Completed</th><th>Open</th><th>Hours</th><th>OT</th><th>Callbacks</th></tr></thead><tbody>${workloadRows}</tbody></table>`
        : '<p class="muted">No technician workload recorded in period.</p>',
    ),
    ctx.operationalWarnings.length
      ? section(
          'Operational data-quality warnings',
          `<ul>${ctx.operationalWarnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`,
        )
      : '',
  ].join('');

  return shell('workforce_operations', ctx, body);
}

export function workforceReportShellExtraCss(): string {
  return `
    .wf-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .wf-table th, .wf-table td { border: 1px solid rgba(255,255,255,0.12); padding: 4px 6px; text-align: left; vertical-align: top; }
    .wf-table thead th { background: rgba(255,255,255,0.04); }
    .wf-table--dense td, .wf-table--dense th { font-size: 8pt; }
  `;
}
