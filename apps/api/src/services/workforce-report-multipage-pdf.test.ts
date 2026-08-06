import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTechnicianActivityReportHtml,
  buildTechnicianProductivityReportHtml,
  buildTechnicianTimesheetReportHtml,
  buildWorkforceOperationsReportHtml,
  countPdfPages,
  isValidPdfBuffer,
  workforceMetric,
} from '@titan/shared';
import { probeChromiumPdfAvailability, renderHtmlToPdf } from './chromium-pdf.service.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const artifactDir = join(repoRoot, 'test-results', 'j67c');

function activityCtx(long = false) {
  const materials = long
    ? Array.from({ length: 40 }, (_, i) =>
        workforceMetric(`Material line ${i}`, { value: 1, inclusionRule: 'test', state: 'recorded' }),
      )
    : [];
  return {
    reportReference: long ? 'TAR-LONG' : 'TAR-MIN',
    reportKind: 'technician_activity' as const,
    companyName: 'Young Guns Plumbing',
    periodStart: '2026-08-01',
    periodEnd: long ? '2026-08-31' : '2026-08-07',
    timezone: 'Africa/Johannesburg',
    generatedAt: '2026-08-05T12:00:00.000Z',
    technicianReference: 'EMP-42',
    technicianName: 'Sam Technician',
    dataLimitations: ['Travel event tracking is not yet connected.'],
    jobsAssigned: workforceMetric('Jobs assigned', { value: long ? 50 : 3, inclusionRule: 'test', state: 'recorded' }),
    jobsStarted: workforceMetric('Jobs started', { value: 2, inclusionRule: 'test', state: 'recorded' }),
    jobsCompleted: workforceMetric('Jobs completed', { value: 1, inclusionRule: 'test', state: 'recorded' }),
    jobsOpen: workforceMetric('Open', { value: 1, inclusionRule: 'test', state: 'recorded' }),
    jobsCancelled: workforceMetric('Cancelled', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
    statusBreakdown: [{ status: 'completed', count: 1 }],
    serviceVisits: workforceMetric('Service', { value: 1, inclusionRule: 'test', state: 'recorded' }),
    maintenanceVisits: workforceMetric('Maint', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
    completionReportsSubmitted: workforceMetric('CR', { value: 1, inclusionRule: 'test', state: 'recorded' }),
    photosEvidenceSubmitted: workforceMetric('Photos', { value: 2, inclusionRule: 'test', state: 'recorded' }),
    checklistsCompleted: workforceMetric('Checklists', { value: null, state: 'unavailable', inclusionRule: 'test' }),
    materialsRecorded: workforceMetric('Materials', { value: long ? 40 : 1, inclusionRule: 'test', state: 'recorded' }),
    callbacks: workforceMetric('Callbacks', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
    reworkVisits: workforceMetric('Rework', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
    recordedWorkingHours: workforceMetric('Hours', { value: 8, unit: 'h', inclusionRule: 'test', state: 'recorded' }),
    recordedBreakHours: workforceMetric('Break', { value: 0.5, unit: 'h', inclusionRule: 'test', state: 'recorded' }),
    scheduledJobs: long
      ? Array.from({ length: 60 }, (_, i) => ({
          jobNumber: `YG-${1000 + i}`,
          title: `Long job title ${i}`,
          scheduledAt: '2026-08-01T08:00:00.000Z',
          status: 'scheduled',
        }))
      : [],
    dataQualityNotes: materials.length ? ['Extended fixture for pagination.'] : [],
  };
}

function timesheetRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    date: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
    clockIn: '07:00',
    clockOut: '17:00',
    breakMinutes: 30,
    workingMinutes: 570,
    regularHours: 8,
    overtimeHours: i % 5 === 0 ? 1 : 0,
    saturdayHours: null,
    sundayHolidayHours: null,
    status: 'approved',
    jobReference: `YG-${1000 + i}`,
    flags: i % 7 === 0 ? ['Missing clock-out'] : [],
  }));
}

test('genuine Puppeteer PDF renders multi-page workforce reports when Chromium is available', async (t) => {
  const probe = await probeChromiumPdfAvailability();
  if (!probe.available) {
    t.skip(`Chromium unavailable (${probe.source})`);
    return;
  }

  mkdirSync(artifactDir, { recursive: true });

  const scenarios = [
    {
      name: 'activity-minimal',
      html: buildTechnicianActivityReportHtml(activityCtx(false)),
      minPages: 1,
    },
    {
      name: 'activity-long',
      html: buildTechnicianActivityReportHtml(activityCtx(true)),
      minPages: 2,
    },
    {
      name: 'timesheet-31-days',
      html: buildTechnicianTimesheetReportHtml({
        ...activityCtx(false),
        reportKind: 'technician_timesheet',
        reportReference: 'TTS-31',
        dailyRows: timesheetRows(31),
        totals: {
          workingHours: 240,
          regularHours: 220,
          overtimeHours: 20,
          breakHours: 15,
          missingEntries: 0,
          incompleteEntries: 4,
        },
        overtimePolicyNote: 'Configured tenant rules.',
        approvalStatusNote: 'Approved rows in period.',
        technicianAcknowledgment: null,
        supervisorApproval: 'Supervisor approved.',
      }),
      minPages: 2,
    },
    {
      name: 'timesheet-100-rows',
      html: buildTechnicianTimesheetReportHtml({
        ...activityCtx(true),
        reportKind: 'technician_timesheet',
        reportReference: 'TTS-100',
        dailyRows: timesheetRows(100),
        totals: {
          workingHours: 800,
          regularHours: 720,
          overtimeHours: 80,
          breakHours: 50,
          missingEntries: 0,
          incompleteEntries: 14,
        },
        overtimePolicyNote: 'Configured tenant rules.',
        approvalStatusNote: null,
        technicianAcknowledgment: null,
        supervisorApproval: null,
      }),
      minPages: 3,
    },
    {
      name: 'productivity-complete',
      html: buildTechnicianProductivityReportHtml({
        ...activityCtx(false),
        reportKind: 'technician_productivity',
        reportReference: 'TPR-COMPLETE',
        metrics: [
          workforceMetric('Jobs completed', { value: 5, inclusionRule: 'test', state: 'recorded' }),
          workforceMetric('Completion %', { value: 80, unit: '%', inclusionRule: 'test', state: 'recorded' }),
        ],
        honestyNotes: ['Transparent metrics only.'],
      }),
      minPages: 1,
    },
    {
      name: 'productivity-insufficient',
      html: buildTechnicianProductivityReportHtml({
        ...activityCtx(false),
        reportKind: 'technician_productivity',
        reportReference: 'TPR-INSUFFICIENT',
        metrics: [
          workforceMetric('Average duration', {
            value: null,
            state: 'insufficient_data',
            inclusionRule: 'test',
            note: 'Not enough workflow events.',
          }),
        ],
        honestyNotes: ['Insufficient data for duration average.'],
      }),
      minPages: 1,
    },
    {
      name: 'workforce-summary-multi-tech',
      html: buildWorkforceOperationsReportHtml({
        reportReference: 'WOS-MULTI',
        reportKind: 'workforce_operations',
        companyName: 'Young Guns Plumbing',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-07',
        timezone: 'Africa/Johannesburg',
        generatedAt: '2026-08-05T12:00:00.000Z',
        technicianReference: null,
        technicianName: null,
        dataLimitations: [],
        activeTechnicians: workforceMetric('Active', { value: 5, inclusionRule: 'test', state: 'recorded' }),
        assignedJobs: workforceMetric('Assigned', { value: 20, inclusionRule: 'test', state: 'recorded' }),
        completedJobs: workforceMetric('Completed', { value: 12, inclusionRule: 'test', state: 'recorded' }),
        openJobs: workforceMetric('Open', { value: 8, inclusionRule: 'test', state: 'recorded' }),
        cancelledJobs: workforceMetric('Cancelled', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
        totalRecordedWorkingHours: workforceMetric('Hours', { value: 120, unit: 'h', inclusionRule: 'test', state: 'recorded' }),
        totalRecordedOvertimeHours: workforceMetric('OT', { value: 10, unit: 'h', inclusionRule: 'test', state: 'recorded' }),
        completionReportsSubmitted: workforceMetric('CR', { value: 10, inclusionRule: 'test', state: 'recorded' }),
        serviceVisits: workforceMetric('Service', { value: 8, inclusionRule: 'test', state: 'recorded' }),
        maintenanceVisits: workforceMetric('Maint', { value: 4, inclusionRule: 'test', state: 'recorded' }),
        explicitCallbacks: workforceMetric('Callbacks', { value: 1, inclusionRule: 'test', state: 'recorded' }),
        explicitRework: workforceMetric('Rework', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
        missingTimesheetEntries: workforceMetric('Missing', { value: 5, inclusionRule: 'test', state: 'recorded' }),
        jobsLackingEvidence: workforceMetric('Evidence', { value: 2, inclusionRule: 'test', state: 'recorded' }),
        jobsLackingCompletionReports: workforceMetric('CR gap', { value: 1, inclusionRule: 'test', state: 'recorded' }),
        workloadByTechnician: Array.from({ length: 25 }, (_, i) => ({
          technicianReference: `T${i}`,
          technicianName: `Technician ${i}`,
          jobsAssigned: 3 + i,
          jobsCompleted: 2 + i,
          openJobs: 1,
          recordedHours: 8 + i,
          overtimeHours: i % 2,
          callbacks: 0,
        })),
        operationalWarnings: Array.from({ length: 15 }, (_, i) => `Workload note ${i + 1} for technician distribution review.`),
      }),
      minPages: 2,
    },
    {
      name: 'workforce-summary-long-warnings',
      html: buildWorkforceOperationsReportHtml({
        reportReference: 'WOS-WARN',
        reportKind: 'workforce_operations',
        companyName: 'Young Guns Plumbing',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        timezone: 'Africa/Johannesburg',
        generatedAt: '2026-08-05T12:00:00.000Z',
        technicianReference: null,
        technicianName: null,
        dataLimitations: [],
        activeTechnicians: workforceMetric('Active', { value: 2, inclusionRule: 'test', state: 'recorded' }),
        assignedJobs: workforceMetric('Assigned', { value: 5, inclusionRule: 'test', state: 'recorded' }),
        completedJobs: workforceMetric('Completed', { value: 3, inclusionRule: 'test', state: 'recorded' }),
        openJobs: workforceMetric('Open', { value: 2, inclusionRule: 'test', state: 'recorded' }),
        cancelledJobs: workforceMetric('Cancelled', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
        totalRecordedWorkingHours: workforceMetric('Hours', { value: null, state: 'not_recorded', inclusionRule: 'test' }),
        totalRecordedOvertimeHours: workforceMetric('OT', { value: null, state: 'not_recorded', inclusionRule: 'test' }),
        completionReportsSubmitted: workforceMetric('CR', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
        serviceVisits: workforceMetric('Service', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
        maintenanceVisits: workforceMetric('Maint', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
        explicitCallbacks: workforceMetric('Callbacks', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
        explicitRework: workforceMetric('Rework', { value: 0, inclusionRule: 'test', state: 'measured_zero' }),
        missingTimesheetEntries: workforceMetric('Missing', { value: 31, inclusionRule: 'test', state: 'recorded' }),
        jobsLackingEvidence: workforceMetric('Evidence', { value: 10, inclusionRule: 'test', state: 'recorded' }),
        jobsLackingCompletionReports: workforceMetric('CR gap', { value: 10, inclusionRule: 'test', state: 'recorded' }),
        workloadByTechnician: [],
        operationalWarnings: Array.from({ length: 40 }, (_, i) => `Operational warning ${i + 1}: missing data in period.`),
      }),
      minPages: 2,
    },
  ] as const;

  for (const scenario of scenarios) {
    const pdf = await renderHtmlToPdf(scenario.html);
    assert.ok(isValidPdfBuffer(pdf), `${scenario.name}: valid %PDF signature`);
    const pages = countPdfPages(pdf);
    assert.ok(
      pages >= scenario.minPages,
      `${scenario.name}: expected >= ${scenario.minPages} pages, got ${pages}`,
    );
    writeFileSync(join(artifactDir, `${scenario.name}.pdf`), pdf);
  }
});
