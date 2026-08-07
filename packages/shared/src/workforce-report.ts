/**
 * Canonical workforce / technician report export kinds (Phase J-6.7C).
 * Operational job reports remain in operational-report.ts.
 */

export const WORKFORCE_REPORT_KINDS = [
  'technician_activity',
  'technician_timesheet',
  'technician_productivity',
  'workforce_operations',
] as const;

export type WorkforceReportKind = (typeof WORKFORCE_REPORT_KINDS)[number];

export type WorkforceMetricState =
  | 'measured_zero'
  | 'recorded'
  | 'not_recorded'
  | 'not_applicable'
  | 'insufficient_data'
  | 'unavailable';

export type WorkforceMetricValue = {
  label: string;
  displayValue: string;
  numerator: number | null;
  denominator: number | null;
  state: WorkforceMetricState;
  inclusionRule: string;
  note: string | null;
};

export type WorkforceReportHeader = {
  reportReference: string;
  reportKind: WorkforceReportKind;
  companyName: string;
  periodStart: string;
  periodEnd: string;
  timezone: string;
  generatedAt: string;
  technicianReference: string | null;
  technicianName: string | null;
  dataLimitations: string[];
};

export type TechnicianActivityReportContext = WorkforceReportHeader & {
  reportKind: 'technician_activity';
  technicianReference: string;
  technicianName: string;
  jobsAssigned: WorkforceMetricValue;
  jobsStarted: WorkforceMetricValue;
  jobsCompleted: WorkforceMetricValue;
  jobsOpen: WorkforceMetricValue;
  jobsCancelled: WorkforceMetricValue;
  statusBreakdown: Array<{ status: string; count: number }>;
  serviceVisits: WorkforceMetricValue;
  maintenanceVisits: WorkforceMetricValue;
  completionReportsSubmitted: WorkforceMetricValue;
  photosEvidenceSubmitted: WorkforceMetricValue;
  checklistsCompleted: WorkforceMetricValue;
  materialsRecorded: WorkforceMetricValue;
  callbacks: WorkforceMetricValue;
  reworkVisits: WorkforceMetricValue;
  recordedWorkingHours: WorkforceMetricValue;
  recordedBreakHours: WorkforceMetricValue;
  scheduledJobs: Array<{ jobNumber: string | null; title: string; scheduledAt: string | null; status: string }>;
  dataQualityNotes: string[];
};

export type TimesheetDailyRow = {
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  breakMinutes: number | null;
  workingMinutes: number | null;
  regularHours: number | null;
  overtimeHours: number | null;
  saturdayHours: number | null;
  sundayHolidayHours: number | null;
  status: string | null;
  jobReference: string | null;
  flags: string[];
};

export type TechnicianTimesheetReportContext = WorkforceReportHeader & {
  reportKind: 'technician_timesheet';
  technicianReference: string;
  technicianName: string;
  dailyRows: TimesheetDailyRow[];
  totals: {
    workingHours: number | null;
    regularHours: number | null;
    overtimeHours: number | null;
    breakHours: number | null;
    missingEntries: number;
    incompleteEntries: number;
  };
  overtimePolicyNote: string;
  approvalStatusNote: string | null;
  technicianAcknowledgment: string | null;
  supervisorApproval: string | null;
};

export type TechnicianProductivityReportContext = WorkforceReportHeader & {
  reportKind: 'technician_productivity';
  technicianReference: string;
  technicianName: string;
  metrics: WorkforceMetricValue[];
  honestyNotes: string[];
};

export type WorkforceTechnicianWorkloadRow = {
  technicianReference: string;
  technicianName: string;
  jobsAssigned: number;
  jobsCompleted: number;
  openJobs: number;
  recordedHours: number | null;
  overtimeHours: number | null;
  callbacks: number;
};

export type WorkforceOperationsReportContext = WorkforceReportHeader & {
  reportKind: 'workforce_operations';
  activeTechnicians: WorkforceMetricValue;
  assignedJobs: WorkforceMetricValue;
  completedJobs: WorkforceMetricValue;
  openJobs: WorkforceMetricValue;
  cancelledJobs: WorkforceMetricValue;
  totalRecordedWorkingHours: WorkforceMetricValue;
  totalRecordedOvertimeHours: WorkforceMetricValue;
  completionReportsSubmitted: WorkforceMetricValue;
  serviceVisits: WorkforceMetricValue;
  maintenanceVisits: WorkforceMetricValue;
  explicitCallbacks: WorkforceMetricValue;
  explicitRework: WorkforceMetricValue;
  missingTimesheetEntries: WorkforceMetricValue;
  jobsLackingEvidence: WorkforceMetricValue;
  jobsLackingCompletionReports: WorkforceMetricValue;
  workloadByTechnician: WorkforceTechnicianWorkloadRow[];
  operationalWarnings: string[];
};

export type WorkforceReportContext =
  | TechnicianActivityReportContext
  | TechnicianTimesheetReportContext
  | TechnicianProductivityReportContext
  | WorkforceOperationsReportContext;

export function workforceReportKindLabel(kind: WorkforceReportKind): string {
  switch (kind) {
    case 'technician_activity':
      return 'Technician Activity Report';
    case 'technician_timesheet':
      return 'Technician Timesheet Report';
    case 'technician_productivity':
      return 'Technician Productivity Report';
    case 'workforce_operations':
      return 'Workforce Operations Summary';
  }
}

export function workforceReportFilename(kind: WorkforceReportKind, reference: string): string {
  const slug =
    kind === 'technician_activity'
      ? 'technician-activity'
      : kind === 'technician_timesheet'
        ? 'technician-timesheet'
        : kind === 'technician_productivity'
          ? 'technician-productivity'
          : 'workforce-operations';
  const safeRef = reference.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 32) || 'report';
  return `${slug}-${safeRef}.pdf`;
}

export function workforceMetric(
  label: string,
  input: {
    value: number | null;
    numerator?: number | null;
    denominator?: number | null;
    state?: WorkforceMetricState;
    unit?: string;
    inclusionRule: string;
    note?: string | null;
  },
): WorkforceMetricValue {
  let state = input.state;
  if (!state) {
    if (input.value === null) state = 'not_recorded';
    else if (input.value === 0) state = 'measured_zero';
    else state = 'recorded';
  }

  let displayValue: string;
  if (state === 'not_recorded' || state === 'unavailable' || state === 'insufficient_data') {
    displayValue =
      state === 'unavailable'
        ? 'Not available from current recorded data'
        : state === 'insufficient_data'
          ? 'Insufficient data'
          : 'Not recorded';
  } else if (state === 'not_applicable') {
    displayValue = 'Not applicable';
  } else if (input.value === null) {
    displayValue = 'Not recorded';
  } else {
    const suffix = input.unit ? ` ${input.unit}` : '';
    displayValue = `${input.value}${suffix}`;
  }

  return {
    label,
    displayValue,
    numerator: input.numerator ?? input.value,
    denominator: input.denominator ?? null,
    state,
    inclusionRule: input.inclusionRule,
    note: input.note ?? null,
  };
}

export function formatPercentMetric(
  label: string,
  numerator: number,
  denominator: number,
  inclusionRule: string,
): WorkforceMetricValue {
  if (denominator <= 0) {
    return workforceMetric(label, {
      value: null,
      state: 'insufficient_data',
      inclusionRule,
      note: 'Denominator is zero — cannot compute percentage.',
    });
  }
  const pct = Math.round((numerator / denominator) * 1000) / 10;
  return workforceMetric(label, {
    value: pct,
    numerator,
    denominator,
    state: numerator === 0 && denominator > 0 ? 'measured_zero' : 'recorded',
    unit: '%',
    inclusionRule,
  });
}

/** Public technician reference — never internal UUID. */
export function resolveTechnicianPublicReference(input: {
  employeeNumber: string | null;
  firstName: string;
  lastName: string;
}): string {
  const emp = input.employeeNumber?.trim();
  if (emp) return emp;
  const initial = input.lastName.trim().charAt(0).toUpperCase();
  const first = input.firstName.trim();
  if (first && initial) return `${first} ${initial}.`;
  return first || 'Technician';
}

/** Strip internal identifiers from workforce report models for technician-safe output. */
export function projectWorkforceContextForTechnicianSelf<T extends WorkforceReportContext>(ctx: T): T {
  return ctx;
}

/** Workforce internal summary — no HR payroll fields; operational aggregates only. */
export function projectWorkforceOperationsContext(ctx: WorkforceOperationsReportContext): WorkforceOperationsReportContext {
  return ctx;
}

export const WORKFORCE_REPORT_LIMITATIONS = [
  'Travel duration is not reported — travel event tracking is not yet connected.',
  'Arrival punctuality is not reported — arrival events are not yet recorded.',
  'No wage, payroll or labour cost values appear in workforce operational reports.',
] as const;

export const WORKFORCE_REPORT_EXPORT_STATUS: Record<
  WorkforceReportKind,
  'implemented' | 'not_yet_implemented'
> = {
  technician_activity: 'implemented',
  technician_timesheet: 'implemented',
  technician_productivity: 'implemented',
  workforce_operations: 'implemented',
};
