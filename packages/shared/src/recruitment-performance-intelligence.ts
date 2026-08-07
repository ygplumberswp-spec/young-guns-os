/**
 * Recruitment & Performance Intelligence (Department 6.3)
 *
 * Extends recruiting_candidates / applications / candidate_activities /
 * workforce skills-certs-training / Technician Intelligence / jobs / quality /
 * timesheets / HR Employee Intelligence (6.1) / Payroll & Timesheet (6.2).
 *
 * Invariants:
 * - No automatic hiring decisions — Owner approval for hiring advances that execute
 * - No fake candidates / employees / performance scores — real records only
 * - Interview workflow is draft/tracking; hiring status changes stay Owner-gated
 * - AURA suggestions (training, capacity, workforce risks) are recommendations only
 * - Privacy: Owner/Admin for recruitment & others' performance; techs may see own
 */

export const RECRUITMENT_PERFORMANCE_INTELLIGENCE_KEY =
  'recruitment-performance-intelligence' as const;

export type RpiAvailability = 'available' | 'partial' | 'unavailable';

export type RpiPipelineStage =
  | 'new'
  | 'applied'
  | 'screening'
  | 'interview'
  | 'assessment'
  | 'offered'
  | 'offer'
  | 'hired'
  | 'rejected';

export type RpiHiringDraftStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'executed';

export type RpiInterviewStatus =
  | 'draft'
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'pending_approval'
  | 'approved'
  | 'rejected';

export type RpiRecommendationKind =
  | 'performance_insight'
  | 'training'
  | 'skill_gap'
  | 'development_plan'
  | 'capacity_improvement'
  | 'workforce_risk'
  | 'workforce_planning';

export type RpiRecommendationStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'acknowledged';

export type RpiAuraInsightTarget =
  | 'command_centre'
  | 'executive_dashboard'
  | 'hr_employee_intelligence'
  | 'payroll_timesheet_intelligence'
  | 'workforce_intelligence'
  | 'technician_intelligence'
  | 'recruiting'
  | 'jobs'
  | 'training'
  | 'performance'
  | 'timesheets';

export type RpiAuraInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type RpiCandidateSummary = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
  status: RpiPipelineStage;
  source: string | null;
  skills: string[];
  applicationCount: number;
  interviewCount: number;
  notes: string | null;
  updatedAt: string;
};

export type RpiPipelineBucket = {
  stage: RpiPipelineStage;
  count: number;
  candidateIds: string[];
};

export type RpiInterviewDraftSummary = {
  id: string;
  candidateId: string;
  candidateName: string | null;
  status: RpiInterviewStatus;
  scheduledAt: string | null;
  interviewerUserId: string | null;
  interviewerName: string | null;
  title: string;
  body: string;
  outcomeNotes: string | null;
  /** Invariant: interviews never auto-advance hiring. */
  autoHiringDecision: false;
  createdAt: string;
  decidedAt: string | null;
};

export type RpiHiringDraftSummary = {
  id: string;
  candidateId: string;
  candidateName: string | null;
  fromStage: RpiPipelineStage | null;
  toStage: RpiPipelineStage;
  status: RpiHiringDraftStatus;
  title: string;
  body: string;
  autoHiringDecision: false;
  executedAt: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type RpiPerformanceRow = {
  userId: string;
  displayName: string;
  roleName: string;
  isTechnicianRole: boolean;
  jobsCompleted: number | null;
  jobsAssigned: number | null;
  callbacks: number | null;
  timesheetHours: number | null;
  skillCount: number;
  trainingCount: number;
  qualificationCount: number;
  availability: RpiAvailability;
  rationale: string;
  technicianIntelligenceHref: string;
};

export type RpiSkillTrackingRow = {
  userId: string;
  displayName: string;
  skillKey: string;
  skillName: string;
  proficiency: string;
};

export type RpiWorkforcePlanningSnapshot = {
  availability: RpiAvailability;
  activeTechnicianCount: number;
  openJobAssignmentCount: number;
  interviewPipelineCount: number;
  timesheetHoursSample: number;
  rationale: string;
};

export type RpiRecommendationDraftSummary = {
  id: string;
  kind: RpiRecommendationKind;
  status: RpiRecommendationStatus;
  title: string;
  body: string;
  subjectUserId: string | null;
  subjectUserName: string | null;
  autoExecuted: false;
  createdAt: string;
  decidedAt: string | null;
};

export type RpiAuraInsightSummary = {
  id: string;
  target: RpiAuraInsightTarget;
  status: RpiAuraInsightStatus;
  title: string;
  insight: string;
  href: string | null;
  sourceHiringDraftId: string | null;
  sourceRecommendationId: string | null;
  sourceInterviewDraftId: string | null;
  createdAt: string;
};

export type RpiConnection = {
  target: RpiAuraInsightTarget;
  label: string;
  href: string;
  status: 'available_link' | 'unavailable' | 'registry_stub';
  availability: RpiAvailability;
  note: string;
};

export type RpiSettings = {
  id: string;
  recruitmentEnabled: boolean;
  performanceInsightsEnabled: boolean;
  selfPerformanceViewEnabled: boolean;
  interviewWorkflowEnabled: boolean;
  auraSuggestionsEnabled: boolean;
  autoHiringEnabled: false;
  inventScoresEnabled: false;
  notes: string | null;
  updatedAt: string;
};

export type RpiRecruitmentSnapshot = {
  availability: RpiAvailability;
  candidateCount: number;
  applicationCount: number;
  activePipelineCount: number;
  interviewStageCount: number;
  hiredCount: number;
  rejectedCount: number;
  pendingHiringApprovals: number;
  pendingInterviewApprovals: number;
  rationale: string;
};

export type RpiPerformanceSnapshot = {
  availability: RpiAvailability;
  technicianCount: number;
  skillRecordCount: number;
  trainingRecordCount: number;
  jobsCompletedSample: number;
  timesheetHoursSample: number;
  rationale: string;
};

export type RpiOwnerDashboard = {
  summary: string;
  productClarification: {
    existingRecruiting: string;
    technicianIntelligence: string;
    hrFoundation: string;
    thisLayer: string;
  };
  policy: {
    noAutomaticHiring: true;
    ownerApprovalRequiredForHiringExecute: true;
    inventScores: false;
    inventCandidates: false;
    recommendationsAreDrafts: true;
    auraSuggestionsOnly: true;
    noAutomaticHrDecisions: true;
    sensitiveHrOwnerAdminOnly: true;
  };
  recruitment: RpiRecruitmentSnapshot;
  performance: RpiPerformanceSnapshot;
  workforcePlanning: RpiWorkforcePlanningSnapshot;
  pipeline: RpiPipelineBucket[];
  candidates: RpiCandidateSummary[];
  interviewDrafts: RpiInterviewDraftSummary[];
  hiringDrafts: RpiHiringDraftSummary[];
  performanceRows: RpiPerformanceRow[];
  skillTracking: RpiSkillTrackingRow[];
  recommendationDrafts: RpiRecommendationDraftSummary[];
  auraInsights: RpiAuraInsightSummary[];
  connections: RpiConnection[];
  settings: RpiSettings;
};

export type RpiSelfPerformanceView = {
  generatedAt: string;
  userId: string;
  displayName: string;
  performance: RpiPerformanceRow | null;
  skills: RpiSkillTrackingRow[];
  ownRecommendations: RpiRecommendationDraftSummary[];
  exclusions: {
    otherTechnicians: true;
    recruitmentPipeline: true;
    peerPerformance: true;
  };
  guarantees: {
    autoHiringDecision: false;
    inventScores: false;
  };
};

export type CreateRpiCandidateRequest = {
  name: string;
  email?: string | null;
  phone?: string | null;
  roleTitle?: string | null;
  source?: string | null;
  skills?: string[];
  notes?: string | null;
  status?: RpiPipelineStage;
};

export type CreateRpiInterviewDraftRequest = {
  candidateId: string;
  title?: string;
  body?: string;
  scheduledAt?: string | null;
  interviewerUserId?: string | null;
  submitForApproval?: boolean;
};

export type DecideRpiInterviewDraftRequest = {
  decision: 'schedule' | 'complete' | 'approve' | 'reject' | 'cancel';
  notes?: string;
  scheduledAt?: string | null;
};

export type CreateRpiHiringDraftRequest = {
  candidateId: string;
  toStage: RpiPipelineStage;
  title?: string;
  body?: string;
  submitForApproval?: boolean;
};

export type DecideRpiHiringDraftRequest = {
  decision: 'approve' | 'reject' | 'cancel';
  notes?: string;
  executeOnCandidate?: boolean;
};

export type RefreshRpiRecommendationsRequest = {
  submitForApproval?: boolean;
};

export type DecideRpiRecommendationRequest = {
  decision: 'approve' | 'reject' | 'acknowledge';
  notes?: string;
};

export type UpdateRpiSettingsRequest = {
  recruitmentEnabled?: boolean;
  performanceInsightsEnabled?: boolean;
  selfPerformanceViewEnabled?: boolean;
  interviewWorkflowEnabled?: boolean;
  auraSuggestionsEnabled?: boolean;
  notes?: string | null;
};

export type CreateRpiAuraInsightRequest = {
  target: RpiAuraInsightTarget;
  title: string;
  insight: string;
  href?: string;
  sourceHiringDraftId?: string;
  sourceRecommendationId?: string;
  sourceInterviewDraftId?: string;
};

export type AcknowledgeRpiInsightRequest = {
  status: 'acknowledged' | 'dismissed';
};

export const RPI_PIPELINE_STAGES: readonly RpiPipelineStage[] = [
  'new',
  'applied',
  'screening',
  'interview',
  'assessment',
  'offered',
  'offer',
  'hired',
  'rejected',
] as const;

export const RPI_ACTIVE_PIPELINE_STAGES: readonly RpiPipelineStage[] = [
  'new',
  'applied',
  'screening',
  'interview',
  'assessment',
  'offered',
  'offer',
] as const;

function isOwnerOrAdminRole(roleName: string | null | undefined): boolean {
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  );
}

export function canAccessRecruitmentPerformanceIntelligence(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Technician' || role === 'Client') return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  return isOwnerOrAdminRole(role);
}

export function canWriteRecruitmentPerformanceIntelligence(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessRecruitmentPerformanceIntelligence(identity);
}

export function canApproveRpiHiringDrafts(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessRecruitmentPerformanceIntelligence(identity);
}

export function canManageRpiSettings(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessRecruitmentPerformanceIntelligence(identity);
}

export function canAccessRpiSelfPerformanceView(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Client') return false;
  return true;
}

export function isRpiTechnicianRoleName(roleName: string | null | undefined): boolean {
  const name = (roleName ?? '').toLowerCase();
  return name === 'technician' || name.includes('technician');
}

export function isTerminalHiringStage(stage: RpiPipelineStage): boolean {
  return stage === 'hired' || stage === 'rejected';
}

export function requiresOwnerExecuteForStage(stage: RpiPipelineStage): boolean {
  return stage === 'hired' || stage === 'offered' || stage === 'offer' || stage === 'rejected';
}

export const RPI_PRODUCT_COPY = {
  existingRecruiting:
    'Operational candidate CRUD remains under /recruiting — this layer adds pipeline, interview workflow, and Owner-gated hiring drafts.',
  technicianIntelligence:
    'Live technician performance metrics remain under /technician-intelligence — this layer links real signals and drafts recommendations; it never invents scores.',
  hrFoundation:
    'Employee records remain under /hr-employee-intelligence — skills, training, and employment profiles are reused, not rebuilt.',
  thisLayer:
    'Recruitment & Performance Intelligence tracks real candidates, interview workflow, Owner-gated hiring status, performance insights, skill development, workforce planning, and AURA recommendation drafts. No automatic hiring. No automatic HR decisions.',
} as const;

export function buildRpiRecruitmentSnapshot(input: {
  candidateCount: number;
  applicationCount: number;
  activePipelineCount: number;
  interviewStageCount: number;
  hiredCount: number;
  rejectedCount: number;
  pendingHiringApprovals: number;
  pendingInterviewApprovals: number;
}): RpiRecruitmentSnapshot {
  if (input.candidateCount <= 0) {
    return {
      availability: 'unavailable',
      candidateCount: 0,
      applicationCount: 0,
      activePipelineCount: 0,
      interviewStageCount: 0,
      hiredCount: 0,
      rejectedCount: 0,
      pendingHiringApprovals: input.pendingHiringApprovals,
      pendingInterviewApprovals: input.pendingInterviewApprovals,
      rationale:
        'No real recruiting_candidates yet — recruitment pipeline unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    candidateCount: input.candidateCount,
    applicationCount: input.applicationCount,
    activePipelineCount: input.activePipelineCount,
    interviewStageCount: input.interviewStageCount,
    hiredCount: input.hiredCount,
    rejectedCount: input.rejectedCount,
    pendingHiringApprovals: input.pendingHiringApprovals,
    pendingInterviewApprovals: input.pendingInterviewApprovals,
    rationale: `Derived from ${input.candidateCount} real candidate(s), ${input.applicationCount} application(s), ${input.interviewStageCount} in interview stage. Hiring advances that execute require Owner approval.`,
  };
}

export function buildRpiPerformanceSnapshot(input: {
  technicianCount: number;
  skillRecordCount: number;
  trainingRecordCount: number;
  jobsCompletedSample: number;
  timesheetHoursSample: number;
}): RpiPerformanceSnapshot {
  if (
    input.technicianCount <= 0 &&
    input.skillRecordCount <= 0 &&
    input.jobsCompletedSample <= 0 &&
    input.timesheetHoursSample <= 0
  ) {
    return {
      availability: 'unavailable',
      technicianCount: 0,
      skillRecordCount: 0,
      trainingRecordCount: 0,
      jobsCompletedSample: 0,
      timesheetHoursSample: 0,
      rationale:
        'No real technicians, skill records, completed jobs, or timesheet hours yet — performance intelligence unavailable (not invented).',
    };
  }
  const availability: RpiAvailability =
    input.jobsCompletedSample > 0 || input.skillRecordCount > 0 || input.timesheetHoursSample > 0
      ? 'available'
      : 'partial';
  return {
    availability,
    technicianCount: input.technicianCount,
    skillRecordCount: input.skillRecordCount,
    trainingRecordCount: input.trainingRecordCount,
    jobsCompletedSample: input.jobsCompletedSample,
    timesheetHoursSample: input.timesheetHoursSample,
    rationale: `Performance signals from ${input.technicianCount} technician-role user(s), ${input.skillRecordCount} skill(s), ${input.trainingRecordCount} training record(s), ${input.jobsCompletedSample} completed job(s), ${input.timesheetHoursSample} timesheet hour(s). Scores are never invented.`,
  };
}

export function buildRpiWorkforcePlanningSnapshot(input: {
  activeTechnicianCount: number;
  openJobAssignmentCount: number;
  interviewPipelineCount: number;
  timesheetHoursSample: number;
}): RpiWorkforcePlanningSnapshot {
  if (
    input.activeTechnicianCount <= 0 &&
    input.openJobAssignmentCount <= 0 &&
    input.interviewPipelineCount <= 0
  ) {
    return {
      availability: 'unavailable',
      activeTechnicianCount: 0,
      openJobAssignmentCount: 0,
      interviewPipelineCount: 0,
      timesheetHoursSample: 0,
      rationale:
        'Workforce planning unavailable — no real technicians, open assignments, or interview pipeline signals (not invented).',
    };
  }
  return {
    availability: 'available',
    activeTechnicianCount: input.activeTechnicianCount,
    openJobAssignmentCount: input.openJobAssignmentCount,
    interviewPipelineCount: input.interviewPipelineCount,
    timesheetHoursSample: input.timesheetHoursSample,
    rationale: `Planning signals from ${input.activeTechnicianCount} active technician(s), ${input.openJobAssignmentCount} open assignment(s), ${input.interviewPipelineCount} interview-stage candidate(s). AURA suggestions remain drafts only.`,
  };
}

export function buildRpiPipelineBuckets(
  candidates: Array<{ id: string; status: string }>,
): RpiPipelineBucket[] {
  const map = new Map<RpiPipelineStage, string[]>();
  for (const stage of RPI_PIPELINE_STAGES) map.set(stage, []);
  for (const c of candidates) {
    const stage = (RPI_PIPELINE_STAGES as readonly string[]).includes(c.status)
      ? (c.status as RpiPipelineStage)
      : 'new';
    map.get(stage)!.push(c.id);
  }
  return RPI_PIPELINE_STAGES.map((stage) => ({
    stage,
    count: map.get(stage)!.length,
    candidateIds: map.get(stage)!,
  }));
}

export function buildHiringDraftProposal(input: {
  candidateName: string;
  fromStage: RpiPipelineStage | null;
  toStage: RpiPipelineStage;
}): { title: string; body: string } {
  const from = input.fromStage ?? 'unknown';
  const executeNote = requiresOwnerExecuteForStage(input.toStage)
    ? ' This advance executes a hiring-workflow action and requires Owner approval before any candidate status change.'
    : ' Draft only until Owner approval; status is not changed automatically.';
  return {
    title: `Hiring advance: ${input.candidateName} → ${input.toStage}`,
    body: `Proposed pipeline advance for ${input.candidateName} from ${from} to ${input.toStage}.${executeNote} No automatic hiring decisions.`,
  };
}

export function buildInterviewDraftProposal(input: {
  candidateName: string;
  scheduledAt?: string | null;
}): { title: string; body: string } {
  const when = input.scheduledAt
    ? ` Proposed time: ${input.scheduledAt}.`
    : ' Schedule time can be set when approving/scheduling.';
  return {
    title: `Interview workflow: ${input.candidateName}`,
    body: `Interview draft for ${input.candidateName}.${when} Does not auto-advance hiring status — Owner approval still required for hiring executes.`,
  };
}

export function buildPerformanceInsightDraft(input: {
  displayName: string;
  jobsCompleted: number;
  callbacks: number;
  skillCount: number;
  timesheetHours?: number;
}): { title: string; body: string } {
  const hours =
    input.timesheetHours !== undefined ? `, ${input.timesheetHours} timesheet hour(s)` : '';
  return {
    title: `Performance insight draft: ${input.displayName}`,
    body: `Draft insight for ${input.displayName} from real signals: ${input.jobsCompleted} completed job(s), ${input.callbacks} callback(s), ${input.skillCount} skill record(s)${hours}. Not a scorecard invention — Owner review only; never auto-executes HR actions.`,
  };
}

export function buildTrainingRecommendationDraft(input: {
  displayName: string;
  gapNote: string;
}): { title: string; body: string } {
  return {
    title: `Training recommendation draft: ${input.displayName}`,
    body: `Draft training recommendation for ${input.displayName}: ${input.gapNote}. Draft only — does not enrol anyone or mutate training records automatically.`,
  };
}

export function buildDevelopmentPlanDraft(input: {
  displayName: string;
  focus: string;
}): { title: string; body: string } {
  return {
    title: `Development plan draft: ${input.displayName}`,
    body: `Draft development plan for ${input.displayName} focusing on ${input.focus}. Draft only — Owner/Admin review required; never auto-assigned.`,
  };
}

export function buildCapacityImprovementDraft(input: {
  openJobAssignmentCount: number;
  activeTechnicianCount: number;
}): { title: string; body: string } {
  return {
    title: 'AURA capacity improvement suggestion',
    body: `Draft capacity suggestion from real signals: ${input.openJobAssignmentCount} open job assignment(s) across ${input.activeTechnicianCount} active technician(s). Recommendation only — no automatic scheduling, hiring, or HR decisions.`,
  };
}

export function buildWorkforceRiskDraft(input: {
  callbackCount: number;
  interviewBacklog: number;
  overtimeHours?: number;
}): { title: string; body: string } {
  const ot =
    input.overtimeHours !== undefined && input.overtimeHours > 0
      ? ` Recorded overtime hours sample: ${input.overtimeHours}.`
      : '';
  return {
    title: 'AURA workforce risk suggestion',
    body: `Draft workforce risk note from real signals: ${input.callbackCount} quality callback(s), ${input.interviewBacklog} interview-stage candidate(s).${ot} Recommendation only — never auto-executes HR actions.`,
  };
}

export function buildWorkforcePlanningDraft(input: {
  interviewPipelineCount: number;
  activeTechnicianCount: number;
}): { title: string; body: string } {
  return {
    title: 'AURA workforce planning suggestion',
    body: `Draft workforce planning note: ${input.interviewPipelineCount} candidate(s) in interview pipeline vs ${input.activeTechnicianCount} active technician(s). Recommendation only — hiring remains Owner-gated.`,
  };
}

export function listRpiConnections(input?: {
  candidatesAvailable?: boolean;
  performanceAvailable?: boolean;
  timesheetsAvailable?: boolean;
}): RpiConnection[] {
  const candidatesAvailable = input?.candidatesAvailable ?? false;
  const performanceAvailable = input?.performanceAvailable ?? false;
  const timesheetsAvailable = input?.timesheetsAvailable ?? false;
  return [
    {
      target: 'recruiting',
      label: 'Recruiting',
      href: '/recruiting',
      status: candidatesAvailable ? 'available_link' : 'unavailable',
      availability: candidatesAvailable ? 'available' : 'unavailable',
      note: candidatesAvailable
        ? 'Operational candidate records available.'
        : 'No candidate records yet — recruiting connection unavailable.',
    },
    {
      target: 'technician_intelligence',
      label: 'Technician Intelligence',
      href: '/technician-intelligence',
      status: 'available_link',
      availability: performanceAvailable ? 'available' : 'partial',
      note: 'Source for real technician performance signals when present.',
    },
    {
      target: 'hr_employee_intelligence',
      label: 'Employee Intelligence',
      href: '/hr-employee-intelligence',
      status: 'available_link',
      availability: 'available',
      note: 'HR foundation for skills, training, and employment profiles.',
    },
    {
      target: 'payroll_timesheet_intelligence',
      label: 'Payroll & Timesheet Intelligence',
      href: '/payroll-timesheet-intelligence',
      status: 'available_link',
      availability: timesheetsAvailable ? 'available' : 'partial',
      note: 'Hours/overtime context when real timesheets exist.',
    },
    {
      target: 'timesheets',
      label: 'Timesheets',
      href: '/workforce-intelligence',
      status: timesheetsAvailable ? 'available_link' : 'unavailable',
      availability: timesheetsAvailable ? 'available' : 'unavailable',
      note: timesheetsAvailable
        ? 'Real wi_timesheets rows contribute to performance/capacity drafts.'
        : 'No timesheet rows yet — timesheet connection unavailable.',
    },
    {
      target: 'workforce_intelligence',
      label: 'Workforce Intelligence',
      href: '/workforce-intelligence',
      status: 'available_link',
      availability: 'available',
      note: 'Operational workforce registry and training courses.',
    },
    {
      target: 'jobs',
      label: 'Jobs',
      href: '/jobs',
      status: 'available_link',
      availability: 'available',
      note: 'Completed/assigned job counts use real jobs only.',
    },
    {
      target: 'training',
      label: 'Training records',
      href: '/workforce-intelligence',
      status: 'available_link',
      availability: 'available',
      note: 'Skill/training tracking reads real employee_skills and training_records.',
    },
    {
      target: 'command_centre',
      label: 'AURA Command Centre',
      href: '/aura/command-centre',
      status: 'available_link',
      availability: 'available',
      note: 'Insight handoffs for Owner review — recommendations only.',
    },
    {
      target: 'executive_dashboard',
      label: 'Executive dashboard',
      href: '/',
      status: 'registry_stub',
      availability: 'available',
      note: 'Executive surface link; recommendations stay drafts until decided.',
    },
    {
      target: 'performance',
      label: 'Recruitment & Performance Intelligence',
      href: '/recruitment-performance-intelligence',
      status: 'available_link',
      availability: 'available',
      note: 'This Owner/Admin intelligence surface.',
    },
  ];
}

export function defaultRpiSettings(partial?: {
  id?: string;
  recruitmentEnabled?: boolean;
  performanceInsightsEnabled?: boolean;
  selfPerformanceViewEnabled?: boolean;
  interviewWorkflowEnabled?: boolean;
  auraSuggestionsEnabled?: boolean;
  notes?: string | null;
  updatedAt?: string;
}): RpiSettings {
  return {
    id: partial?.id ?? 'pending',
    recruitmentEnabled: partial?.recruitmentEnabled ?? true,
    performanceInsightsEnabled: partial?.performanceInsightsEnabled ?? true,
    selfPerformanceViewEnabled: partial?.selfPerformanceViewEnabled ?? true,
    interviewWorkflowEnabled: partial?.interviewWorkflowEnabled ?? true,
    auraSuggestionsEnabled: partial?.auraSuggestionsEnabled ?? true,
    autoHiringEnabled: false,
    inventScoresEnabled: false,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}
