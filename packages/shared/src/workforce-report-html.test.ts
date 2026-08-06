import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWorkforceReportHtmlSafe } from './workforce-report-access.js';
import {
  buildTechnicianActivityReportHtml,
  buildTechnicianProductivityReportHtml,
  buildTechnicianTimesheetReportHtml,
  buildWorkforceOperationsReportHtml,
} from './workforce-report-html.js';
import { workforceMetric } from './workforce-report.js';

const baseHeader = {
  reportReference: 'TAR-20260801',
  companyName: 'Young Guns Plumbing',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-07',
  timezone: 'Africa/Johannesburg',
  generatedAt: '2026-08-05T12:00:00.000Z',
  dataLimitations: ['Travel event tracking is not yet connected.'],
};

test('activity report HTML includes Young Guns branding and no payroll leakage', () => {
  const html = buildTechnicianActivityReportHtml({
    ...baseHeader,
    reportKind: 'technician_activity',
    technicianReference: 'EMP-42',
    technicianName: 'Sam Technician',
    jobsAssigned: workforceMetric('Jobs assigned', {
      value: 3,
      inclusionRule: 'test',
      state: 'recorded',
    }),
    jobsStarted: workforceMetric('Jobs started', {
      value: 2,
      inclusionRule: 'test',
      state: 'recorded',
    }),
    jobsCompleted: workforceMetric('Jobs completed', {
      value: 1,
      inclusionRule: 'test',
      state: 'recorded',
    }),
    jobsOpen: workforceMetric('Open', { value: 1, inclusionRule: 'test', state: 'recorded' }),
    jobsCancelled: workforceMetric('Cancelled', {
      value: 0,
      inclusionRule: 'test',
      state: 'measured_zero',
    }),
    statusBreakdown: [{ status: 'completed', count: 1 }],
    serviceVisits: workforceMetric('Service', { value: 1, inclusionRule: 'test', state: 'recorded' }),
    maintenanceVisits: workforceMetric('Maint', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
    completionReportsSubmitted: workforceMetric('CR', { value: 1, inclusionRule: 'test', state: 'recorded' }),
    photosEvidenceSubmitted: workforceMetric('Photos', { value: 2, inclusionRule: 'test', state: 'recorded' }),
    checklistsCompleted: workforceMetric('Checklists', {
      value: null,
      state: 'unavailable',
      inclusionRule: 'test',
    }),
    materialsRecorded: workforceMetric('Materials', { value: 1, inclusionRule: 'test', state: 'recorded' }),
    callbacks: workforceMetric('Callbacks', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
    reworkVisits: workforceMetric('Rework', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
    recordedWorkingHours: workforceMetric('Hours', {
      value: 8,
      unit: 'h',
      inclusionRule: 'test',
      state: 'recorded',
    }),
    recordedBreakHours: workforceMetric('Break', {
      value: 0.5,
      unit: 'h',
      inclusionRule: 'test',
      state: 'recorded',
    }),
    scheduledJobs: [],
    dataQualityNotes: [],
  });

  assert.match(html, /Young Guns/i);
  assert.match(html, /Sam Technician/);
  assert.doesNotMatch(html, /\bpayroll\b/i);
  assert.doesNotMatch(html, /\bwage\b/i);
  assertWorkforceReportHtmlSafe(html);
});

test('timesheet report HTML renders daily rows table', () => {
  const html = buildTechnicianTimesheetReportHtml({
    ...baseHeader,
    reportKind: 'technician_timesheet',
    reportReference: 'TTS-20260801',
    technicianReference: 'EMP-42',
    technicianName: 'Sam Technician',
    dailyRows: [
      {
        date: '2026-08-01',
        clockIn: '07:00',
        clockOut: '17:00',
        breakMinutes: 30,
        workingMinutes: 570,
        regularHours: 8,
        overtimeHours: 0,
        saturdayHours: null,
        sundayHolidayHours: null,
        status: 'approved',
        jobReference: 'YG-1001',
        flags: [],
      },
    ],
    totals: {
      workingHours: 9.5,
      regularHours: 8,
      overtimeHours: 0,
      breakHours: 0.5,
      missingEntries: 6,
      incompleteEntries: 0,
    },
    overtimePolicyNote: 'Overtime rules are not configured — recorded hours only.',
    approvalStatusNote: '1 approved',
    technicianAcknowledgment: null,
    supervisorApproval: null,
  });
  assert.match(html, /Daily rows/);
  assert.match(html, /2026-08-01/);
  assertWorkforceReportHtmlSafe(html);
});

test('productivity report HTML states transparent metrics', () => {
  const html = buildTechnicianProductivityReportHtml({
    ...baseHeader,
    reportKind: 'technician_productivity',
    reportReference: 'TPR-20260801',
    technicianReference: 'EMP-42',
    technicianName: 'Sam Technician',
    metrics: [
      workforceMetric('Jobs completed', { value: 2, inclusionRule: 'test', state: 'recorded' }),
    ],
    honestyNotes: ['No weighted scores included.'],
  });
  assert.match(html, /Transparent productivity metrics/);
  assert.match(html, /No weighted scores/);
  assertWorkforceReportHtmlSafe(html);
});

test('workforce operations summary HTML renders workload table', () => {
  const html = buildWorkforceOperationsReportHtml({
    ...baseHeader,
    reportKind: 'workforce_operations',
    reportReference: 'WOS-20260801',
    technicianReference: null,
    technicianName: null,
    activeTechnicians: workforceMetric('Active technicians', {
      value: 2,
      inclusionRule: 'test',
      state: 'recorded',
    }),
    assignedJobs: workforceMetric('Assigned', { value: 5, inclusionRule: 'test', state: 'recorded' }),
    completedJobs: workforceMetric('Completed', { value: 3, inclusionRule: 'test', state: 'recorded' }),
    openJobs: workforceMetric('Open', { value: 2, inclusionRule: 'test', state: 'recorded' }),
    cancelledJobs: workforceMetric('Cancelled', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
    totalRecordedWorkingHours: workforceMetric('Hours', {
      value: 16,
      unit: 'h',
      inclusionRule: 'test',
      state: 'recorded',
    }),
    totalRecordedOvertimeHours: workforceMetric('OT', {
      value: null,
      state: 'not_recorded',
      inclusionRule: 'test',
    }),
    completionReportsSubmitted: workforceMetric('CR', { value: 2, inclusionRule: 'test', state: 'recorded' }),
    serviceVisits: workforceMetric('Service', { value: 1, inclusionRule: 'test', state: 'recorded' }),
    maintenanceVisits: workforceMetric('Maint', { value: 1, inclusionRule: 'test', state: 'recorded' }),
    explicitCallbacks: workforceMetric('Callbacks', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
    explicitRework: workforceMetric('Rework', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
    missingTimesheetEntries: workforceMetric('Missing', { value: 3, inclusionRule: 'test', state: 'recorded' }),
    jobsLackingEvidence: workforceMetric('Evidence gap', { value: 1, inclusionRule: 'test', state: 'recorded' }),
    jobsLackingCompletionReports: workforceMetric('CR gap', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
    workloadByTechnician: [
      {
        technicianReference: 'Sam T.',
        technicianName: 'Sam Technician',
        jobsAssigned: 3,
        jobsCompleted: 2,
        openJobs: 1,
        recordedHours: 8,
        overtimeHours: null,
        callbacks: 0,
      },
    ],
    operationalWarnings: ['No wi_timesheets rows company-wide in period.'],
  });
  assert.match(html, /Workload by technician/);
  assertWorkforceReportHtmlSafe(html);
});
