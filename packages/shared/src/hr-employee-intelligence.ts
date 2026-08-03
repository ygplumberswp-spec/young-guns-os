/**
 * HR Employee Intelligence Foundation (Department 6.1)
 *
 * Extends existing users / roles / workforce skills-certs-training /
 * enterprise workforce profiles / timesheets / technician intelligence /
 * jobs / scheduling — does not rebuild HR or invent employees.
 *
 * Surfaces:
 * - Employee Profile Intelligence (identity, role, department, skills, quals, training, employment)
 * - Workforce Overview (team structure, active employees, skills overview, availability)
 * - Skills Intelligence (tracking, training needs, skill gaps; AURA recommendation drafts only)
 * - Connections to Technician Intelligence, Jobs, Scheduling; timesheets/payroll/recruitment future-ready
 *
 * Invariants:
 * - No fake employees or payroll data; unavailable when no real records
 * - Sensitive HR / analytics: Owner / Admin only (Technician/Client denied)
 * - Optional self view: caller's own non-sensitive fields only
 * - Recommendations never auto-execute HR actions
 * - Audit via security_audit_logs
 */

export const HR_EMPLOYEE_INTELLIGENCE_KEY = 'hr-employee-intelligence' as const;

export type HrIntelAvailability = 'available' | 'unavailable';

export type HrIntelInsightTarget =
  | 'command_centre'
  | 'executive_dashboard'
  | 'workforce_intelligence'
  | 'technician_intelligence'
  | 'timesheets'
  | 'payroll'
  | 'jobs'
  | 'scheduling'
  | 'recruitment'
  | 'compliance'
  | 'hr';

export type HrIntelInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type HrIntelRecommendationKind =
  | 'skills_shortage'
  | 'training_opportunity'
  | 'skill_gap'
  | 'capacity_issue'
  | 'workforce_improvement';

export type HrIntelRecommendationStatus = 'draft' | 'acknowledged' | 'dismissed';

export type HrIntelSkillSummary = {
  id: string;
  skillKey: string;
  skillName: string;
  proficiency: string;
  experienceYears: number | null;
};

export type HrIntelQualificationSummary = {
  id: string;
  certificationKey: string;
  name: string;
  issuer: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
};

export type HrIntelTrainingSummary = {
  id: string;
  trainingKey: string;
  title: string;
  status: string;
  completedAt: string | null;
};

export type HrIntelEmploymentSummary = {
  availability: HrIntelAvailability;
  employeeNumber: string | null;
  employmentType: string | null;
  jobTitle: string | null;
  department: string | null;
  branch: string | null;
  managerUserId: string | null;
  managerName: string | null;
  startDate: string | null;
  contractStatus: string | null;
  lifecycleStage: string | null;
  rationale: string;
};

export type HrIntelEmployeeRecord = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roleId: string;
  roleName: string;
  lastLoginAt: string | null;
  skills: HrIntelSkillSummary[];
  qualifications: HrIntelQualificationSummary[];
  training: HrIntelTrainingSummary[];
  employment: HrIntelEmploymentSummary;
  assignedOpenJobCount: number;
  timesheetCount: number;
  isTechnicianRole: boolean;
  availabilitySignal: 'available' | 'assigned' | 'unavailable';
};

export type HrIntelSelfProfile = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  roleName: string;
  isActive: boolean;
  skills: HrIntelSkillSummary[];
  qualifications: HrIntelQualificationSummary[];
  training: HrIntelTrainingSummary[];
  jobTitle: string | null;
  department: string | null;
  sensitiveHrHidden: true;
  payrollHidden: true;
  emergencyContactHidden: true;
  hrAnalyticsHidden: true;
};

export type HrIntelTeamNode = {
  userId: string;
  displayName: string;
  roleName: string;
  department: string | null;
  jobTitle: string | null;
  managerUserId: string | null;
  managerName: string | null;
  isActive: boolean;
  isTechnicianRole: boolean;
  skillCount: number;
  availabilitySignal: 'available' | 'assigned' | 'unavailable';
};

export type HrIntelSkillOverviewRow = {
  skillKey: string;
  skillName: string;
  holderCount: number;
  holders: Array<{ userId: string; displayName: string; proficiency: string }>;
};

export type HrIntelSkillGapRow = {
  userId: string;
  displayName: string;
  roleName: string;
  isTechnicianRole: boolean;
  skillCount: number;
  qualificationCount: number;
  plannedTrainingCount: number;
  gapKind: 'no_skills' | 'no_qualifications' | 'training_incomplete';
  rationale: string;
};

export type HrIntelTrainingNeedRow = {
  userId: string;
  displayName: string;
  trainingId: string;
  trainingKey: string;
  title: string;
  status: string;
  rationale: string;
};

export type HrIntelTechnicianRow = {
  userId: string;
  displayName: string;
  roleName: string;
  jobTitle: string | null;
  department: string | null;
  skillCount: number;
  qualificationCount: number;
  assignedOpenJobCount: number;
  availabilitySignal: 'available' | 'assigned' | 'unavailable';
  technicianIntelligenceHref: string;
};

export type HrIntelConnection = {
  target: HrIntelInsightTarget;
  label: string;
  href: string;
  status: 'available_link' | 'unavailable' | 'registry_stub';
  availability: HrIntelAvailability;
  note: string;
};

export type HrIntelAuraInsightSummary = {
  id: string;
  target: HrIntelInsightTarget;
  status: HrIntelInsightStatus;
  title: string;
  insight: string;
  href: string | null;
  subjectUserId: string | null;
  createdAt: string;
};

export type HrIntelRecommendationSummary = {
  id: string;
  kind: HrIntelRecommendationKind;
  status: HrIntelRecommendationStatus;
  title: string;
  body: string;
  skillKey: string | null;
  subjectUserId: string | null;
  autoExecuted: false;
  createdAt: string;
  decidedAt: string | null;
};

export type HrIntelSettings = {
  id: string;
  insightsEnabled: boolean;
  selfViewEnabled: boolean;
  recommendationDraftsEnabled: boolean;
  autoPayrollMutationEnabled: false;
  inventEmployeesEnabled: false;
  autoHrActionsEnabled: false;
  notes: string | null;
  updatedAt: string;
};

export type HrIntelWorkforceSnapshot = {
  availability: HrIntelAvailability;
  activeUserCount: number;
  inactiveUserCount: number;
  technicianCount: number;
  profileCount: number;
  skillRecordCount: number;
  qualificationCount: number;
  trainingRecordCount: number;
  rationale: string;
};

export type HrIntelWorkforceAvailabilitySnapshot = {
  availability: HrIntelAvailability;
  activeEmployeeCount: number;
  techniciansAvailable: number;
  techniciansAssigned: number;
  openJobAssignments: number;
  rationale: string;
};

export type HrIntelSkillsIntelligenceSnapshot = {
  availability: HrIntelAvailability;
  distinctSkillCount: number;
  skillGapCount: number;
  trainingNeedCount: number;
  rationale: string;
};

export type HrIntelTimesheetSnapshot = {
  availability: HrIntelAvailability;
  timesheetCount: number;
  rationale: string;
};

export type HrIntelPayrollSnapshot = {
  availability: HrIntelAvailability;
  periodCount: number;
  providerAdapterCount: number;
  rationale: string;
};

export type HrIntelQualificationComplianceSnapshot = {
  availability: HrIntelAvailability;
  trackedQualificationCount: number;
  withExpiryCount: number;
  expiredCount: number;
  expiringSoonCount: number;
  affectedEmployeeCount: number;
  rationale: string;
};

export type HrIntelQualificationComplianceRow = {
  userId: string;
  displayName: string;
  certificationId: string;
  certificationKey: string;
  name: string;
  expiresAt: string;
  state: 'expired' | 'expiring_soon';
  daysRemaining: number;
  rationale: string;
};

export type HrIntelDashboard = {
  summary: string;
  productClarification: {
    existingWorkforce: string;
    technicianIntelligence: string;
    thisLayer: string;
  };
  policy: {
    sensitiveHrOwnerAdminOnly: true;
    inventEmployees: false;
    autoPayrollMutation: false;
    autoHrActions: false;
    fakePayroll: false;
  };
  workforce: HrIntelWorkforceSnapshot;
  workforceAvailability: HrIntelWorkforceAvailabilitySnapshot;
  skillsIntelligence: HrIntelSkillsIntelligenceSnapshot;
  timesheets: HrIntelTimesheetSnapshot;
  payroll: HrIntelPayrollSnapshot;
  qualificationCompliance: HrIntelQualificationComplianceSnapshot;
  qualificationComplianceRows: HrIntelQualificationComplianceRow[];
  employees: HrIntelEmployeeRecord[];
  team: HrIntelTeamNode[];
  skillsOverview: HrIntelSkillOverviewRow[];
  skillGaps: HrIntelSkillGapRow[];
  trainingNeeds: HrIntelTrainingNeedRow[];
  technicians: HrIntelTechnicianRow[];
  recommendations: HrIntelRecommendationSummary[];
  connections: HrIntelConnection[];
  auraInsights: HrIntelAuraInsightSummary[];
  settings: HrIntelSettings;
};

export type UpdateHrIntelSettingsRequest = {
  insightsEnabled?: boolean;
  selfViewEnabled?: boolean;
  recommendationDraftsEnabled?: boolean;
  notes?: string | null;
};

export type CreateHrIntelAuraInsightRequest = {
  target: HrIntelInsightTarget;
  title: string;
  insight: string;
  href?: string;
  subjectUserId?: string;
};

export type AcknowledgeHrIntelInsightRequest = {
  status: 'acknowledged' | 'dismissed';
};

export type DecideHrIntelRecommendationRequest = {
  decision: 'acknowledge' | 'dismiss';
};

function isOwnerOrAdminRole(roleName: string | null | undefined): boolean {
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  );
}

export function canAccessHrEmployeeIntelligence(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Technician' || role === 'Client') return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  return isOwnerOrAdminRole(role);
}

export function canWriteHrEmployeeIntelligence(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessHrEmployeeIntelligence(identity);
}

export function canManageHrEmployeeIntelligenceSettings(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessHrEmployeeIntelligence(identity);
}

export function canAccessHrEmployeeSelfView(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Client') return false;
  return true;
}

export function isTechnicianRoleName(roleName: string | null | undefined): boolean {
  const name = (roleName ?? '').toLowerCase();
  return name === 'technician' || name.includes('technician');
}

export function deriveHrIntelAvailabilitySignal(input: {
  isActive: boolean;
  assignedOpenJobCount: number;
}): 'available' | 'assigned' | 'unavailable' {
  if (!input.isActive) return 'unavailable';
  if (input.assignedOpenJobCount > 0) return 'assigned';
  return 'available';
}

export const HR_INTEL_PRODUCT_COPY = {
  existingWorkforce:
    'Operational workforce registry, timesheets, leave, and payroll prep remain under /workforce-intelligence — this layer does not replace them.',
  technicianIntelligence:
    'Technician performance insights remain under /technician-intelligence — this layer links real technicians, it does not invent metrics.',
  thisLayer:
    'Employee Intelligence Foundation surfaces real TITAN users, roles, skills, qualifications, training, employment profiles, skill gaps, and Owner/Admin-gated AURA recommendation drafts. No fake employees. No fake payroll. No automatic HR actions.',
} as const;

export function buildHrIntelWorkforceSnapshot(input: {
  activeUserCount: number;
  inactiveUserCount: number;
  technicianCount: number;
  profileCount: number;
  skillRecordCount: number;
  qualificationCount: number;
  trainingRecordCount: number;
}): HrIntelWorkforceSnapshot {
  const total = input.activeUserCount + input.inactiveUserCount;
  if (total === 0) {
    return {
      availability: 'unavailable',
      activeUserCount: 0,
      inactiveUserCount: 0,
      technicianCount: 0,
      profileCount: 0,
      skillRecordCount: 0,
      qualificationCount: 0,
      trainingRecordCount: 0,
      rationale:
        'No real TITAN users in this tenant yet — workforce visibility unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    ...input,
    rationale: `Derived from ${total} real user(s): ${input.activeUserCount} active, ${input.technicianCount} technician-role, ${input.profileCount} employment profile(s), ${input.skillRecordCount} skill record(s).`,
  };
}

export function buildHrIntelWorkforceAvailabilitySnapshot(input: {
  activeEmployeeCount: number;
  techniciansAvailable: number;
  techniciansAssigned: number;
  openJobAssignments: number;
}): HrIntelWorkforceAvailabilitySnapshot {
  if (input.activeEmployeeCount <= 0) {
    return {
      availability: 'unavailable',
      activeEmployeeCount: 0,
      techniciansAvailable: 0,
      techniciansAssigned: 0,
      openJobAssignments: 0,
      rationale: 'Workforce availability unavailable — no active employees (not invented).',
    };
  }
  return {
    availability: 'available',
    ...input,
    rationale: `Availability derived from real active users and open job assignments: ${input.techniciansAvailable} technician(s) without open jobs, ${input.techniciansAssigned} assigned, ${input.openJobAssignments} open assignment(s).`,
  };
}

export function buildHrIntelSkillsIntelligenceSnapshot(input: {
  distinctSkillCount: number;
  skillGapCount: number;
  trainingNeedCount: number;
  skillRecordCount: number;
}): HrIntelSkillsIntelligenceSnapshot {
  if (input.skillRecordCount <= 0 && input.trainingNeedCount <= 0 && input.skillGapCount <= 0) {
    return {
      availability: 'unavailable',
      distinctSkillCount: 0,
      skillGapCount: 0,
      trainingNeedCount: 0,
      rationale:
        'Skills intelligence unavailable — no real skill, gap, or training-need signals yet (not invented).',
    };
  }
  return {
    availability: 'available',
    distinctSkillCount: input.distinctSkillCount,
    skillGapCount: input.skillGapCount,
    trainingNeedCount: input.trainingNeedCount,
    rationale: `${input.distinctSkillCount} distinct skill(s), ${input.skillGapCount} gap signal(s), ${input.trainingNeedCount} training need(s) from real records only.`,
  };
}

export function buildHrIntelTimesheetSnapshot(input: {
  timesheetCount: number;
}): HrIntelTimesheetSnapshot {
  if (input.timesheetCount <= 0) {
    return {
      availability: 'unavailable',
      timesheetCount: 0,
      rationale:
        'Timesheets future-ready — no real timesheet rows yet (honest unavailable, not invented).',
    };
  }
  return {
    availability: 'available',
    timesheetCount: input.timesheetCount,
    rationale: `Linked to ${input.timesheetCount} real timesheet row(s).`,
  };
}

export function buildHrIntelPayrollSnapshot(input: {
  periodCount: number;
  providerAdapterCount: number;
}): HrIntelPayrollSnapshot {
  if (input.periodCount <= 0 && input.providerAdapterCount <= 0) {
    return {
      availability: 'unavailable',
      periodCount: 0,
      providerAdapterCount: 0,
      rationale:
        'Payroll future-ready — no payroll periods or provider adapters recorded (honest unavailable, not invented).',
    };
  }
  return {
    availability: 'available',
    periodCount: input.periodCount,
    providerAdapterCount: input.providerAdapterCount,
    rationale: `Payroll prep signals from ${input.periodCount} period(s) and ${input.providerAdapterCount} provider adapter(s). Not a live pay-run engine.`,
  };
}

export const HR_INTEL_QUALIFICATION_EXPIRY_WINDOW_DAYS = 60;

export function buildHrIntelQualificationComplianceRows(input: {
  qualifications: Array<{
    userId: string;
    displayName: string;
    certificationId: string;
    certificationKey: string;
    name: string;
    expiresAt: string | null;
  }>;
  now?: Date;
  windowDays?: number;
}): HrIntelQualificationComplianceRow[] {
  const now = input.now ?? new Date();
  const windowDays = input.windowDays ?? HR_INTEL_QUALIFICATION_EXPIRY_WINDOW_DAYS;
  const rows: HrIntelQualificationComplianceRow[] = [];
  for (const q of input.qualifications) {
    if (!q.expiresAt) continue;
    const expires = new Date(q.expiresAt);
    if (Number.isNaN(expires.getTime())) continue;
    const daysRemaining = Math.floor((expires.getTime() - now.getTime()) / 86_400_000);
    if (daysRemaining > windowDays) continue;
    const state = daysRemaining < 0 ? 'expired' : 'expiring_soon';
    rows.push({
      userId: q.userId,
      displayName: q.displayName,
      certificationId: q.certificationId,
      certificationKey: q.certificationKey,
      name: q.name,
      expiresAt: q.expiresAt,
      state,
      daysRemaining,
      rationale:
        state === 'expired'
          ? `Real certification record expired ${Math.abs(daysRemaining)} day(s) ago — compliance review recommendation only.`
          : `Real certification record expires in ${daysRemaining} day(s) — compliance review recommendation only.`,
    });
  }
  return rows.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export function buildHrIntelQualificationComplianceSnapshot(input: {
  trackedQualificationCount: number;
  rows: HrIntelQualificationComplianceRow[];
  withExpiryCount: number;
}): HrIntelQualificationComplianceSnapshot {
  if (input.trackedQualificationCount <= 0) {
    return {
      availability: 'unavailable',
      trackedQualificationCount: 0,
      withExpiryCount: 0,
      expiredCount: 0,
      expiringSoonCount: 0,
      affectedEmployeeCount: 0,
      rationale:
        'Qualification compliance future-ready — no real certification records recorded (honest unavailable, not invented).',
    };
  }
  const expiredCount = input.rows.filter((r) => r.state === 'expired').length;
  const expiringSoonCount = input.rows.filter((r) => r.state === 'expiring_soon').length;
  const affectedEmployeeCount = new Set(input.rows.map((r) => r.userId)).size;
  if (input.withExpiryCount <= 0) {
    return {
      availability: 'unavailable',
      trackedQualificationCount: input.trackedQualificationCount,
      withExpiryCount: 0,
      expiredCount: 0,
      expiringSoonCount: 0,
      affectedEmployeeCount: 0,
      rationale: `${input.trackedQualificationCount} real certification record(s) tracked, but none carry an expiry date — expiry compliance stays unavailable (never inferred).`,
    };
  }
  return {
    availability: 'available',
    trackedQualificationCount: input.trackedQualificationCount,
    withExpiryCount: input.withExpiryCount,
    expiredCount,
    expiringSoonCount,
    affectedEmployeeCount,
    rationale: `${expiredCount} expired and ${expiringSoonCount} expiring within ${HR_INTEL_QUALIFICATION_EXPIRY_WINDOW_DAYS} day(s), from ${input.withExpiryCount} dated certification record(s). Review recommendation only — never auto-suspends work.`,
  };
}

export function buildHrIntelSkillGaps(input: {
  employees: Array<{
    userId: string;
    displayName: string;
    roleName: string;
    isActive: boolean;
    isTechnicianRole: boolean;
    skillCount: number;
    qualificationCount: number;
    plannedTrainingCount: number;
  }>;
}): HrIntelSkillGapRow[] {
  const gaps: HrIntelSkillGapRow[] = [];
  for (const e of input.employees) {
    if (!e.isActive) continue;
    if (e.skillCount === 0) {
      gaps.push({
        userId: e.userId,
        displayName: e.displayName,
        roleName: e.roleName,
        isTechnicianRole: e.isTechnicianRole,
        skillCount: 0,
        qualificationCount: e.qualificationCount,
        plannedTrainingCount: e.plannedTrainingCount,
        gapKind: 'no_skills',
        rationale: 'Active employee has no employee_skills rows — skill gap signal (not invented).',
      });
    } else if (e.isTechnicianRole && e.qualificationCount === 0) {
      gaps.push({
        userId: e.userId,
        displayName: e.displayName,
        roleName: e.roleName,
        isTechnicianRole: true,
        skillCount: e.skillCount,
        qualificationCount: 0,
        plannedTrainingCount: e.plannedTrainingCount,
        gapKind: 'no_qualifications',
        rationale:
          'Active technician has skills but no certifications rows — qualification gap signal.',
      });
    } else if (e.plannedTrainingCount > 0) {
      gaps.push({
        userId: e.userId,
        displayName: e.displayName,
        roleName: e.roleName,
        isTechnicianRole: e.isTechnicianRole,
        skillCount: e.skillCount,
        qualificationCount: e.qualificationCount,
        plannedTrainingCount: e.plannedTrainingCount,
        gapKind: 'training_incomplete',
        rationale: `${e.plannedTrainingCount} planned/in-progress training record(s) — training gap signal.`,
      });
    }
  }
  return gaps.slice(0, 100);
}

export function buildHrIntelRecommendationDrafts(input: {
  skillGaps: HrIntelSkillGapRow[];
  trainingNeeds: HrIntelTrainingNeedRow[];
  techniciansAvailable: number;
  techniciansAssigned: number;
  openJobAssignments: number;
  distinctSkillCount: number;
  activeTechnicianCount: number;
  qualificationComplianceRows?: HrIntelQualificationComplianceRow[];
}): Array<{
  kind: HrIntelRecommendationKind;
  title: string;
  body: string;
  skillKey: string | null;
  subjectUserId: string | null;
}> {
  const drafts: Array<{
    kind: HrIntelRecommendationKind;
    title: string;
    body: string;
    skillKey: string | null;
    subjectUserId: string | null;
  }> = [];

  const noSkillGaps = input.skillGaps.filter((g) => g.gapKind === 'no_skills');
  if (noSkillGaps.length > 0) {
    const sample = noSkillGaps[0]!;
    drafts.push({
      kind: 'skill_gap',
      title: `Skill gap — ${noSkillGaps.length} active employee(s) without skills`,
      body: [
        `${noSkillGaps.length} active employee(s) have no employee_skills rows (e.g. ${sample.displayName}).`,
        'Recommendation draft only — record real skills in workforce foundations.',
        'No automatic HR action will be taken.',
      ].join('\n'),
      skillKey: null,
      subjectUserId: sample.userId,
    });
  }

  if (input.trainingNeeds.length > 0) {
    const need = input.trainingNeeds[0]!;
    drafts.push({
      kind: 'training_opportunity',
      title: `Training opportunity — ${input.trainingNeeds.length} incomplete training record(s)`,
      body: [
        `${input.trainingNeeds.length} planned/in-progress training record(s) from real training_records.`,
        `Example: ${need.displayName} — ${need.title} (${need.status}).`,
        'Recommendation draft only — never auto-enrolls or mutates HR.',
      ].join('\n'),
      skillKey: need.trainingKey,
      subjectUserId: need.userId,
    });
  }

  const complianceRows = input.qualificationComplianceRows ?? [];
  if (complianceRows.length > 0) {
    const row = complianceRows[0]!;
    const expiredCount = complianceRows.filter((r) => r.state === 'expired').length;
    drafts.push({
      kind: 'workforce_improvement',
      title: `Qualification compliance — ${complianceRows.length} certification(s) expired or expiring`,
      body: [
        `${expiredCount} expired and ${complianceRows.length - expiredCount} expiring within ${HR_INTEL_QUALIFICATION_EXPIRY_WINDOW_DAYS} day(s), from real certification records.`,
        `Example: ${row.displayName} — ${row.name} (${row.state === 'expired' ? 'expired' : 'expiring'}).`,
        'Recommendation draft for Owner review with Legal & Compliance — never auto-suspends work or mutates HR.',
      ].join('\n'),
      skillKey: row.certificationKey,
      subjectUserId: row.userId,
    });
  }

  if (
    input.activeTechnicianCount > 0 &&
    input.distinctSkillCount > 0 &&
    input.distinctSkillCount < Math.max(2, Math.floor(input.activeTechnicianCount / 2))
  ) {
    drafts.push({
      kind: 'skills_shortage',
      title: 'Skills shortage — low distinct skill coverage vs technicians',
      body: [
        `Only ${input.distinctSkillCount} distinct skill key(s) across ${input.activeTechnicianCount} active technician(s).`,
        'Coverage looks thin relative to team size — consider expanding recorded skills.',
        'Recommendation draft only — not an automatic staffing change.',
      ].join('\n'),
      skillKey: null,
      subjectUserId: null,
    });
  }

  if (input.openJobAssignments > 0 && input.techniciansAvailable === 0 && input.techniciansAssigned > 0) {
    drafts.push({
      kind: 'capacity_issue',
      title: 'Capacity issue — open jobs with no unassigned technicians',
      body: [
        `${input.openJobAssignments} open job assignment(s) and ${input.techniciansAssigned} technician(s) already assigned; none without open jobs.`,
        'Recommendation draft for Owner review with Scheduling / Jobs — never auto-dispatches.',
      ].join('\n'),
      skillKey: null,
      subjectUserId: null,
    });
  } else if (input.techniciansAvailable > 0 && input.openJobAssignments === 0) {
    drafts.push({
      kind: 'workforce_improvement',
      title: 'Workforce improvement — available technician capacity',
      body: [
        `${input.techniciansAvailable} active technician(s) have no open job assignments.`,
        'Optional planning signal for Scheduling — recommendation only, no auto-assignment.',
      ].join('\n'),
      skillKey: null,
      subjectUserId: null,
    });
  }

  return drafts.slice(0, 20);
}

export function listHrIntelConnections(input?: {
  timesheetsAvailable?: boolean;
  payrollAvailable?: boolean;
  recruitmentAvailable?: boolean;
  qualificationComplianceAvailable?: boolean;
}): HrIntelConnection[] {
  const timesheetsAvailable = input?.timesheetsAvailable ?? false;
  const payrollAvailable = input?.payrollAvailable ?? false;
  const recruitmentAvailable = input?.recruitmentAvailable ?? false;
  const qualificationComplianceAvailable = input?.qualificationComplianceAvailable ?? false;
  return [
    {
      target: 'technician_intelligence',
      label: 'Technician Intelligence',
      href: '/technician-intelligence',
      status: 'available_link',
      availability: 'available',
      note: 'Performance and lifecycle insights for real technicians.',
    },
    {
      target: 'jobs',
      label: 'Jobs',
      href: '/jobs',
      status: 'available_link',
      availability: 'available',
      note: 'Assignment counts use real jobs.assignedUserId only.',
    },
    {
      target: 'scheduling',
      label: 'Scheduling',
      href: '/scheduling',
      status: 'available_link',
      availability: 'available',
      note: 'Capacity signals inform scheduling review — never auto-dispatch.',
    },
    {
      target: 'timesheets',
      label: 'Timesheets',
      href: '/workforce-intelligence',
      status: timesheetsAvailable ? 'available_link' : 'unavailable',
      availability: timesheetsAvailable ? 'available' : 'unavailable',
      note: timesheetsAvailable
        ? 'Real timesheet rows available.'
        : 'Future-ready — unavailable until real timesheet rows exist.',
    },
    {
      target: 'payroll',
      label: 'Payroll',
      href: '/workforce-intelligence',
      status: payrollAvailable ? 'available_link' : 'unavailable',
      availability: payrollAvailable ? 'available' : 'unavailable',
      note: payrollAvailable
        ? 'Payroll prep / provider signals present (not live pay-run).'
        : 'Future-ready — unavailable until real payroll periods or adapters exist.',
    },
    {
      target: 'recruitment',
      label: 'Recruitment',
      href: '/recruiting',
      status: recruitmentAvailable ? 'available_link' : 'unavailable',
      availability: recruitmentAvailable ? 'available' : 'unavailable',
      note: recruitmentAvailable
        ? 'Recruiting records present.'
        : 'Future-ready — unavailable until real recruiting candidates exist.',
    },
    {
      target: 'compliance',
      label: 'Legal & Compliance',
      href: '/legal-compliance',
      status: qualificationComplianceAvailable ? 'available_link' : 'unavailable',
      availability: qualificationComplianceAvailable ? 'available' : 'unavailable',
      note: qualificationComplianceAvailable
        ? 'Qualification expiry signals from real certification records — review only, never auto-suspends work.'
        : 'Future-ready — unavailable until real certification records carry expiry dates.',
    },
    {
      target: 'workforce_intelligence',
      label: 'Workforce Intelligence',
      href: '/workforce-intelligence',
      status: 'available_link',
      availability: 'available',
      note: 'Operational registry, leave, payroll prep, and timesheets.',
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
      target: 'hr',
      label: 'Employee Intelligence',
      href: '/hr-employee-intelligence',
      status: 'available_link',
      availability: 'available',
      note: 'This Owner/Admin foundation surface.',
    },
  ];
}

export function defaultHrIntelSettings(partial?: {
  id?: string;
  insightsEnabled?: boolean;
  selfViewEnabled?: boolean;
  recommendationDraftsEnabled?: boolean;
  notes?: string | null;
  updatedAt?: string;
}): HrIntelSettings {
  return {
    id: partial?.id ?? 'pending',
    insightsEnabled: partial?.insightsEnabled ?? true,
    selfViewEnabled: partial?.selfViewEnabled ?? true,
    recommendationDraftsEnabled: partial?.recommendationDraftsEnabled ?? true,
    autoPayrollMutationEnabled: false,
    inventEmployeesEnabled: false,
    autoHrActionsEnabled: false,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}

export function buildHrIntelEmploymentSummary(input: {
  hasProfile: boolean;
  employeeNumber?: string | null;
  employmentType?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  branch?: string | null;
  managerUserId?: string | null;
  managerName?: string | null;
  startDate?: string | null;
  contractStatus?: string | null;
  lifecycleStage?: string | null;
}): HrIntelEmploymentSummary {
  if (!input.hasProfile) {
    return {
      availability: 'unavailable',
      employeeNumber: null,
      employmentType: null,
      jobTitle: null,
      department: null,
      branch: null,
      managerUserId: null,
      managerName: null,
      startDate: null,
      contractStatus: null,
      lifecycleStage: null,
      rationale:
        'No employment profile row yet for this user — employment details unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    employeeNumber: input.employeeNumber ?? null,
    employmentType: input.employmentType ?? null,
    jobTitle: input.jobTitle ?? null,
    department: input.department ?? null,
    branch: input.branch ?? null,
    managerUserId: input.managerUserId ?? null,
    managerName: input.managerName ?? null,
    startDate: input.startDate ?? null,
    contractStatus: input.contractStatus ?? null,
    lifecycleStage: input.lifecycleStage ?? null,
    rationale: 'Employment fields from real wi_workforce_profiles row.',
  };
}
