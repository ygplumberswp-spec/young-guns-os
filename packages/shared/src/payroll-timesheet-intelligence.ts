/**
 * Payroll & Timesheet Intelligence Foundation (Department 6.2)
 *
 * Extends existing wi_* timesheets, mobile time entries, payroll prep, and jobs —
 * does not rebuild Workforce Intelligence or invent wages.
 *
 * Invariants:
 * - No invented wages or fake payroll; labour cost unavailable without stored rate
 * - No automatic payroll mutation from this layer
 * - Sensitive payroll Owner/Admin only; technicians get own timesheet self-view only
 * - Insight drafts require Owner approval; never auto-approve timesheets
 */

export const PAYROLL_TIMESHEET_INTELLIGENCE_KEY = 'payroll-timesheet-intelligence' as const;

export type PtiAvailability = 'available' | 'partial' | 'unavailable';

export type PtiInsightKind =
  | 'overtime'
  | 'attendance'
  | 'approval_backlog'
  | 'job_time'
  | 'labour_cost'
  | 'cost_forecast'
  | 'payroll_summary';

export type PtiInsightStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'acknowledged';

export type PtiAuraInsightTarget =
  | 'command_centre'
  | 'executive_dashboard'
  | 'hr_employee_intelligence'
  | 'workforce_intelligence'
  | 'technician_intelligence'
  | 'scheduling'
  | 'jobs'
  | 'payroll'
  | 'timesheets';

export type PtiAuraInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type PtiAuraWorkforceInsightKind =
  | 'overtime_trend'
  | 'labour_cost_risk'
  | 'productivity_pattern'
  | 'scheduling_opportunity'
  | 'capacity_issue';

export type PtiHoursSnapshot = {
  availability: PtiAvailability;
  timesheetCount: number;
  mobileEntryCount: number;
  totalStandardHours: number;
  totalOvertimeHours: number;
  totalTravelHours: number;
  pendingApprovalCount: number;
  rationale: string;
};

export type PtiLabourCostSnapshot = {
  availability: PtiAvailability;
  labourMinutes: number;
  /** Always null — TITAN does not store hourly wage rates for invention. */
  hourlyRateCents: null;
  /** Null when hourlyRateCents is null — never invented. */
  labourCostCents: number | null;
  rationale: string;
};

export type PtiPayrollSummarySnapshot = {
  availability: PtiAvailability;
  periodCount: number;
  batchCount: number;
  exportedBatchCount: number;
  earningsTotalCents: number | null;
  rationale: string;
};

export type PtiCostForecastSnapshot = {
  availability: PtiAvailability;
  recentWeekHours: number;
  priorWeekHours: number;
  hoursTrendPercent: number | null;
  /** Null without stored wage rate — hours-only forecast otherwise. */
  forecastLabourCostCents: number | null;
  rationale: string;
};

export type PtiEmployeeHoursRow = {
  userId: string;
  userName: string | null;
  standardHours: number;
  overtimeHours: number;
  travelHours: number;
  submittedCount: number;
  approvedCount: number;
};

export type PtiTimesheetRow = {
  id: string;
  userId: string;
  userName: string | null;
  jobId: string | null;
  periodStart: string;
  periodEnd: string;
  status: string;
  standardHours: number;
  overtimeHours: number;
  travelHours: number;
  clockInAt: string | null;
  clockOutAt: string | null;
  createdAt: string;
};

export type PtiJobTimeRow = {
  jobId: string;
  totalMinutes: number;
  timesheetMinutes: number;
  mobileEntryMinutes: number;
};

export type PtiAttendanceRow = {
  userId: string;
  userName: string | null;
  clockInCount: number;
  clockOutCount: number;
  incompleteClockPairs: number;
  rationale: string;
};

export type PtiInsightDraftSummary = {
  id: string;
  kind: PtiInsightKind;
  status: PtiInsightStatus;
  title: string;
  body: string;
  subjectUserId: string | null;
  jobId: string | null;
  /** Invariant: always false. */
  inventedWages: false;
  /** Invariant: always false. */
  autoPayrollMutation: false;
  createdAt: string;
  decidedAt: string | null;
};

export type PtiAuraInsightSummary = {
  id: string;
  target: PtiAuraInsightTarget;
  status: PtiAuraInsightStatus;
  title: string;
  insight: string;
  href: string | null;
  sourceInsightDraftId: string | null;
  createdAt: string;
};

export type PtiConnection = {
  target: PtiAuraInsightTarget | 'hr_employee_intelligence' | 'workforce_intelligence';
  label: string;
  href: string;
  status: 'available_link' | 'unavailable' | 'registry_stub';
  availability: PtiAvailability;
  note: string;
};

export type PtiSettings = {
  id: string;
  insightsEnabled: boolean;
  selfTimesheetViewEnabled: boolean;
  standardWeeklyHours: number;
  overtimeDailyThresholdHours: number;
  /** Invariant: always false. */
  inventWagesEnabled: false;
  /** Invariant: always false. */
  autoPayrollMutationEnabled: false;
  notes: string | null;
  updatedAt: string;
};

export type PtiOwnerDashboard = {
  summary: string;
  productClarification: {
    workforceIntelligence: string;
    hrEmployeeIntelligence: string;
    thisLayer: string;
  };
  policy: {
    inventWages: false;
    autoPayrollMutation: false;
    fakePayroll: false;
    sensitivePayrollOwnerAdminOnly: true;
    timesheetAutoApproved: false;
    ownerControlled: true;
  };
  hours: PtiHoursSnapshot;
  labourCost: PtiLabourCostSnapshot;
  payrollSummary: PtiPayrollSummarySnapshot;
  costForecast: PtiCostForecastSnapshot;
  employeeHours: PtiEmployeeHoursRow[];
  timesheets: PtiTimesheetRow[];
  jobTime: PtiJobTimeRow[];
  attendance: PtiAttendanceRow[];
  insightDrafts: PtiInsightDraftSummary[];
  auraInsights: PtiAuraInsightSummary[];
  connections: PtiConnection[];
  settings: PtiSettings;
  pendingApprovals: number;
};

export type PtiSelfTimesheetRow = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  standardHours: number;
  overtimeHours: number;
  travelHours: number;
  jobId: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
};

/** Technician self view — own hours only; never peer payroll or wages. */
export type PtiSelfTimesheetView = {
  userId: string;
  firstName: string;
  lastName: string;
  roleName: string;
  summary: string;
  timesheets: PtiSelfTimesheetRow[];
  /** Explicit privacy boundary — never included on self view. */
  payrollHidden: true;
  peerTimesheetsHidden: true;
  labourCostHidden: true;
  settings: Pick<PtiSettings, 'selfTimesheetViewEnabled'>;
};

export type RefreshPtiInsightsRequest = {
  submitForApproval?: boolean;
};

export type DecidePtiInsightRequest = {
  decision: 'approve' | 'reject' | 'acknowledge';
  notes?: string;
};

export type UpdatePtiSettingsRequest = {
  insightsEnabled?: boolean;
  selfTimesheetViewEnabled?: boolean;
  standardWeeklyHours?: number;
  overtimeDailyThresholdHours?: number;
  notes?: string | null;
};

export type CreatePtiAuraInsightRequest = {
  target: PtiAuraInsightTarget;
  title: string;
  insight: string;
  href?: string;
  sourceInsightDraftId?: string;
};

export type AcknowledgePtiInsightRequest = {
  status: 'acknowledged' | 'dismissed';
};

// ─── Access ───────────────────────────────────────────────────────────────────

function isOwnerOrAdminRole(roleName: string | null | undefined): boolean {
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  );
}

/**
 * Sensitive payroll & timesheet intelligence — Owner / Admin only.
 * Technician, Client, and Manager (even with workforce perms) are denied.
 */
export function canAccessPayrollTimesheetIntelligence(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Technician' || role === 'Client' || role === 'Manager') return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  return isOwnerOrAdminRole(role);
}

export function canWritePayrollTimesheetIntelligence(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessPayrollTimesheetIntelligence(identity);
}

export function canApprovePtiInsightDrafts(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessPayrollTimesheetIntelligence(identity);
}

export function canManagePtiSettings(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessPayrollTimesheetIntelligence(identity);
}

/**
 * Self timesheet view — technicians may read own hours when enabled.
 * Clients always denied; never grants peer or payroll visibility.
 */
export function canAccessPtiSelfTimesheetView(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Client') return false;
  return true;
}

// ─── Copy & builders ──────────────────────────────────────────────────────────

export const PTI_PRODUCT_COPY = {
  workforceIntelligence:
    'Operational timesheets, leave, and payroll prep remain under /workforce-intelligence — approve/correct stays there.',
  hrEmployeeIntelligence:
    'Employee registry and HR profiles remain under /hr-employee-intelligence — this layer links real users, not invented HR.',
  thisLayer:
    'Payroll & Timesheet Intelligence surfaces real hours, overtime, attendance, approval backlog, and honest labour-cost availability. No invented wages. No auto payroll mutation. Owner/Admin only for sensitive payroll.',
} as const;

export function parseHours(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function buildPtiHoursSnapshot(input: {
  timesheetCount: number;
  mobileEntryCount: number;
  totalStandardHours: number;
  totalOvertimeHours: number;
  totalTravelHours: number;
  pendingApprovalCount: number;
}): PtiHoursSnapshot {
  if (input.timesheetCount <= 0 && input.mobileEntryCount <= 0) {
    return {
      availability: 'unavailable',
      timesheetCount: 0,
      mobileEntryCount: 0,
      totalStandardHours: 0,
      totalOvertimeHours: 0,
      totalTravelHours: 0,
      pendingApprovalCount: input.pendingApprovalCount,
      rationale:
        'No real timesheet or mobile time entry rows yet — hours intelligence unavailable (not invented). Record timesheets under Workforce Intelligence first.',
    };
  }
  return {
    availability: 'available',
    timesheetCount: input.timesheetCount,
    mobileEntryCount: input.mobileEntryCount,
    totalStandardHours: input.totalStandardHours,
    totalOvertimeHours: input.totalOvertimeHours,
    totalTravelHours: input.totalTravelHours,
    pendingApprovalCount: input.pendingApprovalCount,
    rationale: `Derived from ${input.timesheetCount} timesheet(s) and ${input.mobileEntryCount} mobile time entry(ies). Overtime totals use recorded standard/overtime/travel hours only — never invented.`,
  };
}

export function buildPtiLabourCostSnapshot(input: {
  labourMinutes: number;
  hourlyRateCents: null;
}): PtiLabourCostSnapshot {
  if (input.labourMinutes <= 0) {
    return {
      availability: 'unavailable',
      labourMinutes: 0,
      hourlyRateCents: null,
      labourCostCents: null,
      rationale:
        'No recorded labour minutes yet — labour cost unavailable (not invented). Hours must exist before any cost signal.',
    };
  }
  return {
    availability: 'partial',
    labourMinutes: input.labourMinutes,
    hourlyRateCents: null,
    labourCostCents: null,
    rationale:
      'Real labour minutes recorded but no stored hourly wage rate in TITAN — labour cost stays unavailable (not invented). Connect payroll provider or record rates externally.',
  };
}

export function buildPtiPayrollSummarySnapshot(input: {
  periodCount: number;
  batchCount: number;
  exportedBatchCount: number;
  earningsTotalCents: number;
}): PtiPayrollSummarySnapshot {
  if (input.periodCount <= 0 && input.batchCount <= 0) {
    return {
      availability: 'unavailable',
      periodCount: 0,
      batchCount: 0,
      exportedBatchCount: 0,
      earningsTotalCents: null,
      rationale:
        'No payroll prep periods or batches yet — payroll summary unavailable (not invented). Use Workforce Intelligence payroll prep when ready.',
    };
  }
  return {
    availability: 'available',
    periodCount: input.periodCount,
    batchCount: input.batchCount,
    exportedBatchCount: input.exportedBatchCount,
    earningsTotalCents: input.earningsTotalCents > 0 ? input.earningsTotalCents : null,
    rationale: `Payroll prep signals from ${input.periodCount} period(s) and ${input.batchCount} batch(es). Exported batches: ${input.exportedBatchCount}. Not a live pay-run — prep/export only.`,
  };
}

export function buildPtiCostForecastSnapshot(input: {
  recentWeekHours: number;
  priorWeekHours: number;
  hourlyRateCents: null;
}): PtiCostForecastSnapshot {
  if (input.recentWeekHours <= 0 && input.priorWeekHours <= 0) {
    return {
      availability: 'unavailable',
      recentWeekHours: 0,
      priorWeekHours: 0,
      hoursTrendPercent: null,
      forecastLabourCostCents: null,
      rationale:
        'Insufficient recent hours for forecasting — trend unavailable (not invented). Record timesheets across pay weeks first.',
    };
  }

  let hoursTrendPercent: number | null = null;
  if (input.priorWeekHours > 0) {
    hoursTrendPercent =
      Math.round(((input.recentWeekHours - input.priorWeekHours) / input.priorWeekHours) * 1000) /
      10;
  }

  return {
    availability: input.hourlyRateCents === null ? 'partial' : 'available',
    recentWeekHours: input.recentWeekHours,
    priorWeekHours: input.priorWeekHours,
    hoursTrendPercent,
    forecastLabourCostCents: null,
    rationale:
      input.hourlyRateCents === null
        ? `Hours trend from real timesheets (recent ${input.recentWeekHours}h vs prior ${input.priorWeekHours}h). Labour cost forecast unavailable without stored wage rate — not invented.`
        : 'Forecast derived from real recorded hours.',
  };
}

export function buildOvertimeInsightDraft(input: {
  userName: string;
  overtimeHours: number;
  thresholdHours: number;
  subjectUserId?: string;
}): { kind: PtiInsightKind; title: string; body: string } {
  return {
    kind: 'overtime',
    title: `Overtime signal — ${input.userName}`.slice(0, 200),
    body: [
      `${input.userName}: recorded overtime ${input.overtimeHours}h exceeds policy threshold ${input.thresholdHours}h/day aggregate.`,
      '',
      'Insight draft only — not an automatic payroll adjustment. Not invented wages.',
      'Owner approval required before any payroll follow-up.',
    ].join('\n'),
  };
}

export function buildApprovalBacklogInsightDraft(input: {
  pendingCount: number;
}): { kind: PtiInsightKind; title: string; body: string } {
  return {
    kind: 'approval_backlog',
    title: `Timesheet approval backlog — ${input.pendingCount} pending`.slice(0, 200),
    body: [
      `${input.pendingCount} timesheet(s) submitted and awaiting approval under Workforce Intelligence.`,
      '',
      'Draft insight only — timesheets are never auto-approved from this layer.',
      'Owner should review/approve under Workforce Intelligence workflows.',
    ].join('\n'),
  };
}

export function buildLabourCostGapInsightDraft(input: {
  labourMinutes: number;
}): { kind: PtiInsightKind; title: string; body: string } {
  return {
    kind: 'labour_cost',
    title: 'Labour cost gap — hours without wage rate'.slice(0, 200),
    body: [
      `${input.labourMinutes} labour minute(s) recorded across timesheets/mobile entries.`,
      'No stored hourly wage rate in TITAN — labour cost remains unavailable (not invented).',
      '',
      'Insight draft only. Connect payroll provider or record compensation externally.',
      'This layer never invents wages or mutates payroll automatically.',
    ].join('\n'),
  };
}

function auraWorkforceTargetForKind(
  kind: PtiAuraWorkforceInsightKind,
): 'command_centre' | 'scheduling' | 'payroll' | 'timesheets' {
  switch (kind) {
    case 'overtime_trend':
      return 'scheduling';
    case 'labour_cost_risk':
      return 'payroll';
    case 'productivity_pattern':
      return 'timesheets';
    case 'scheduling_opportunity':
      return 'scheduling';
    case 'capacity_issue':
      return 'scheduling';
  }
}

/** Draft AURA workforce recommendation — handoff only; never mutates payroll or timesheets. */
export function buildAuraWorkforceInsightDraft(input: {
  kind: PtiAuraWorkforceInsightKind;
  title: string;
  supportingSignals: string[];
  recommendation: string;
}): { target: 'command_centre' | 'scheduling' | 'payroll' | 'timesheets'; title: string; insight: string } {
  const target = auraWorkforceTargetForKind(input.kind);

  const signals =
    input.supportingSignals.length > 0
      ? input.supportingSignals.map((s) => `• ${s}`).join('\n')
      : '• No supporting signals supplied.';

  return {
    target,
    title: input.title.slice(0, 200),
    insight: [
      `AURA workforce insight (${input.kind.replace(/_/g, ' ')}) — draft recommendation only.`,
      '',
      'Supporting signals:',
      signals,
      '',
      `Recommendation: ${input.recommendation}`,
      '',
      'Not invented wages. No automatic payroll mutation. Owner review required.',
    ].join('\n'),
  };
}

export function buildProductivityInsightDraft(input: {
  userName: string;
  jobLinkedHours: number;
  totalHours: number;
}): { kind: 'job_time'; title: string; body: string } {
  const jobPct =
    input.totalHours > 0
      ? Math.round((input.jobLinkedHours / input.totalHours) * 1000) / 10
      : 0;

  return {
    kind: 'job_time',
    title: `Job time pattern — ${input.userName}`.slice(0, 200),
    body: [
      `${input.userName}: ${input.jobLinkedHours}h job-linked of ${input.totalHours}h total (${jobPct}% job-linked).`,
      '',
      'Draft insight from real timesheet job links — not invented hours.',
      'Owner approval required before any scheduling or payroll follow-up.',
    ].join('\n'),
  };
}

/** Draft capacity pressure signal from real overtime / approval backlog — recommendations only. */
export function buildCapacityIssueDraft(input: {
  pendingApprovalCount: number;
  overtimeHours: number;
  activeTechnicianCount: number;
}): { title: string; body: string; recommendation: string } {
  const title =
    input.overtimeHours >= 8
      ? `Capacity pressure — ${Math.round(input.overtimeHours * 10) / 10}h overtime`
      : `Capacity pressure — ${input.pendingApprovalCount} pending approvals`;

  return {
    title: title.slice(0, 200),
    body: [
      'Real timesheet signals suggest workforce capacity strain.',
      input.overtimeHours > 0
        ? `Overtime hours: ${Math.round(input.overtimeHours * 100) / 100}h.`
        : null,
      input.pendingApprovalCount > 0
        ? `Pending approvals: ${input.pendingApprovalCount}.`
        : null,
      input.activeTechnicianCount > 0
        ? `Technicians with hours in window: ${input.activeTechnicianCount}.`
        : null,
      '',
      'Draft recommendation only — does not auto-reschedule or change payroll.',
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
    recommendation:
      'Review roster capacity and approval backlog before adding dispatch load. Owner approval required for any follow-up.',
  };
}

export function buildSchedulingOpportunityDraft(input: {
  pendingApprovalCount: number;
  overtimeHours: number;
}): { kind: 'approval_backlog' | 'overtime'; title: string; body: string } {
  if (input.pendingApprovalCount > 0) {
    return {
      kind: 'approval_backlog',
      title: `Scheduling opportunity — ${input.pendingApprovalCount} pending approvals`.slice(0, 200),
      body: [
        `${input.pendingApprovalCount} timesheet(s) awaiting approval may block accurate scheduling.`,
        input.overtimeHours > 0
          ? `${input.overtimeHours}h overtime recorded — review capacity before dispatch.`
          : null,
        '',
        'Draft recommendation only — timesheets are never auto-approved from this layer.',
        'Owner should clear backlog under Workforce Intelligence before schedule changes.',
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
    };
  }

  return {
    kind: 'overtime',
    title: `Scheduling opportunity — ${input.overtimeHours}h overtime`.slice(0, 200),
    body: [
      `${input.overtimeHours}h overtime recorded across real timesheets.`,
      '',
      'Draft recommendation only — not an automatic schedule or payroll adjustment.',
      'Review roster and dispatch under Scheduling; Owner approval required.',
    ].join('\n'),
  };
}

export function listPtiConnections(input?: {
  timesheetsAvailable?: boolean;
  payrollAvailable?: boolean;
  hrFoundationPresent?: boolean;
}): PtiConnection[] {
  const timesheetsAvailable = input?.timesheetsAvailable ?? false;
  const payrollAvailable = input?.payrollAvailable ?? false;
  const hrFoundationPresent = input?.hrFoundationPresent ?? true;

  return [
    {
      target: 'workforce_intelligence',
      label: 'Workforce Intelligence',
      href: '/workforce-intelligence',
      status: 'available_link',
      availability: 'available',
      note: 'Operational timesheets, leave, payroll prep, and approve/correct workflows.',
    },
    {
      target: 'hr_employee_intelligence',
      label: 'Employee Intelligence',
      href: '/hr-employee-intelligence',
      status: hrFoundationPresent ? 'available_link' : 'registry_stub',
      availability: hrFoundationPresent ? 'available' : 'unavailable',
      note: hrFoundationPresent
        ? 'Real employee registry and HR profiles — links technicians to timesheets.'
        : 'HR Employee Intelligence foundation link.',
    },
    {
      target: 'timesheets',
      label: 'Timesheets',
      href: '/workforce-intelligence',
      status: timesheetsAvailable ? 'available_link' : 'unavailable',
      availability: timesheetsAvailable ? 'available' : 'unavailable',
      note: timesheetsAvailable
        ? 'Real wi_timesheets rows available.'
        : 'No timesheet rows yet — connection shown as unavailable.',
    },
    {
      target: 'payroll',
      label: 'Payroll prep',
      href: '/workforce-intelligence',
      status: payrollAvailable ? 'available_link' : 'unavailable',
      availability: payrollAvailable ? 'available' : 'unavailable',
      note: payrollAvailable
        ? 'Payroll prep periods/batches present (not live pay-run).'
        : 'Payroll prep unavailable until real periods or batches exist.',
    },
    {
      target: 'technician_intelligence',
      label: 'Technician Intelligence',
      href: '/technician-intelligence',
      status: 'available_link',
      availability: 'available',
      note: 'Technician performance signals — does not invent hours.',
    },
    {
      target: 'jobs',
      label: 'Jobs',
      href: '/jobs',
      status: 'available_link',
      availability: 'available',
      note: 'Job-linked time from real timesheets and mobile entries.',
    },
    {
      target: 'scheduling',
      label: 'Scheduling',
      href: '/scheduling',
      status: 'registry_stub',
      availability: 'available',
      note: 'Scheduling handoff — no invented dispatch labour cost.',
    },
    {
      target: 'command_centre',
      label: 'AURA Command Centre',
      href: '/aura/command-centre',
      status: 'available_link',
      availability: 'available',
      note: 'Insight handoffs for Owner review.',
    },
    {
      target: 'executive_dashboard',
      label: 'Executive dashboard',
      href: '/',
      status: 'registry_stub',
      availability: 'available',
      note: 'Executive surface link; payroll insights stay draft until acknowledged.',
    },
  ];
}

export function defaultPtiSettings(partial?: {
  id?: string;
  insightsEnabled?: boolean;
  selfTimesheetViewEnabled?: boolean;
  standardWeeklyHours?: number;
  overtimeDailyThresholdHours?: number;
  notes?: string | null;
  updatedAt?: string;
}): PtiSettings {
  return {
    id: partial?.id ?? 'pending',
    insightsEnabled: partial?.insightsEnabled ?? true,
    selfTimesheetViewEnabled: partial?.selfTimesheetViewEnabled ?? true,
    standardWeeklyHours: partial?.standardWeeklyHours ?? 40,
    overtimeDailyThresholdHours: partial?.overtimeDailyThresholdHours ?? 8,
    inventWagesEnabled: false,
    autoPayrollMutationEnabled: false,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}
