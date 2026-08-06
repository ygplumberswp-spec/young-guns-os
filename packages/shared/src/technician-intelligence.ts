/**
 * TITAN Operations — Technician Intelligence
 *
 * Live aggregation over Jobs / Dispatch execution phases / Timesheets /
 * Quality comebacks / CX reviews. Never invents ratings, travel times,
 * overtime, or demo technicians. AURA insights are draft/advisory only.
 *
 * Lifecycle product labels map onto existing job_execution_phase values:
 *   assigned → accepted → travelling(en_route) → arrived(on_site) →
 *   started(in_progress) → completed
 */

import type { JobExecutionPhase } from './job-execution.js';

/** Product-facing lifecycle steps (mapped from job_execution_phase). */
export type TechnicianLifecycleStep =
  | 'assigned'
  | 'accepted'
  | 'travelling'
  | 'arrived'
  | 'started'
  | 'completed';

export const TECHNICIAN_LIFECYCLE_FLOW: readonly TechnicianLifecycleStep[] = [
  'assigned',
  'accepted',
  'travelling',
  'arrived',
  'started',
  'completed',
] as const;

export type TechnicianIntelligencePeriod = 'daily' | 'weekly' | 'monthly';

export type TechnicianMetricAvailability =
  | 'available'
  | 'partial'
  | 'unavailable';

export type TechnicianAuraInsightType =
  | 'delay'
  | 'trend'
  | 'improvement';

export type TechnicianAuraInsightStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type TechnicianLifecycleEventSummary = {
  id: string;
  jobId: string;
  action: string;
  fromPhase: JobExecutionPhase | null;
  toPhase: JobExecutionPhase | null;
  lifecycleStep: TechnicianLifecycleStep | null;
  createdAt: string;
  userId: string;
};

export type TechnicianJobLifecycleSummary = {
  jobId: string;
  jobNumber: string | null;
  title: string;
  status: string;
  executionPhase: JobExecutionPhase | null;
  lifecycleStep: TechnicianLifecycleStep | null;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  assignedUserId: string | null;
  phaseUpdatedAt: string | null;
  events: TechnicianLifecycleEventSummary[];
};

export type TechnicianMetricValue = {
  value: number | null;
  unit: 'count' | 'hours' | 'minutes' | 'percent' | 'rating' | 'score';
  availability: TechnicianMetricAvailability;
  /** Honest note when value is null/partial — never fabricate. */
  honestyNote: string | null;
  sampleSize: number;
};

export type TechnicianPerformanceMetrics = {
  technicianId: string;
  technicianName: string;
  jobsCompleted: TechnicianMetricValue;
  jobsAssigned: TechnicianMetricValue;
  averageCompletionHours: TechnicianMetricValue;
  averageTravelMinutes: TechnicianMetricValue;
  overtimeHours: TechnicianMetricValue;
  callbacks: TechnicianMetricValue;
  customerRatingAvg: TechnicianMetricValue;
  productivityScore: TechnicianMetricValue;
};

export type TechnicianAssignedJobSummary = {
  jobId: string;
  jobNumber: string | null;
  title: string;
  status: string;
  executionPhase: JobExecutionPhase | null;
  lifecycleStep: TechnicianLifecycleStep | null;
  scheduledAt: string | null;
  customerName: string | null;
  phaseUpdatedAt: string | null;
};

export type TechnicianCompletionHistoryItem = {
  jobId: string;
  jobNumber: string | null;
  title: string;
  completedAt: string | null;
  completionHours: number | null;
  travelMinutes: number | null;
  hadCallback: boolean;
};

/** Owner company-scoped overview — never returned to technicians. */
export type TechnicianIntelligenceOwnerOverview = {
  generatedAt: string;
  period: TechnicianIntelligencePeriod;
  range: { from: string; to: string };
  technicianCount: number;
  technicians: TechnicianPerformanceMetrics[];
  companyTotals: {
    jobsCompleted: number;
    jobsAssigned: number;
    overtimeHours: number | null;
    overtimeAvailability: TechnicianMetricAvailability;
    callbacks: number;
    averageTravelMinutes: number | null;
    travelAvailability: TechnicianMetricAvailability;
    customerRatingAvg: number | null;
    ratingsAvailability: TechnicianMetricAvailability;
  };
  honestyNotes: string[];
  guarantees: TechnicianIntelligenceGuarantees;
};

/** Technician self view — no finances, no peer private metrics. */
export type TechnicianIntelligenceSelfView = {
  generatedAt: string;
  period: TechnicianIntelligencePeriod;
  range: { from: string; to: string };
  technicianId: string;
  technicianName: string;
  performance: TechnicianPerformanceMetrics;
  assignedJobs: TechnicianAssignedJobSummary[];
  completionHistory: TechnicianCompletionHistoryItem[];
  honestyNotes: string[];
  /** Explicit exclusions for technician audience. */
  exclusions: {
    companyFinances: true;
    otherTechnicians: true;
    ownerAnalytics: true;
  };
  guarantees: TechnicianIntelligenceGuarantees;
};

export type TechnicianAuraInsightSummary = {
  id: string;
  insightType: TechnicianAuraInsightType;
  status: TechnicianAuraInsightStatus;
  subject: string;
  body: string;
  technicianId: string | null;
  technicianName: string | null;
  supportingSignals: string[];
  /** Always false — insights never auto-execute operational changes. */
  autoExecuted: false;
  createdAt: string;
  decidedAt: string | null;
};

export type TechnicianIntelligenceInsightsBundle = {
  generatedAt: string;
  insights: TechnicianAuraInsightSummary[];
  pendingCount: number;
  guarantees: TechnicianIntelligenceGuarantees;
};

export type TechnicianIntelligenceGuarantees = {
  autoOperationalChanges: false;
  ownerApprovalRequired: true;
  draftOnlyInsights: true;
  noDemoData: true;
};

export const TECHNICIAN_INTELLIGENCE_GUARANTEES: TechnicianIntelligenceGuarantees = {
  autoOperationalChanges: false,
  ownerApprovalRequired: true,
  draftOnlyInsights: true,
  noDemoData: true,
};

export type GenerateTechnicianInsightsRequest = {
  period?: TechnicianIntelligencePeriod;
};

export type DecideTechnicianInsightRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Map dual-track execution phase onto product lifecycle labels.
 * Intermediate awaiting/paused phases collapse to "started" (work underway).
 */
export function mapExecutionPhaseToLifecycle(
  phase: JobExecutionPhase | null | undefined,
  officeStatus?: string | null,
): TechnicianLifecycleStep | null {
  if (officeStatus === 'completed' || phase === 'completed') return 'completed';
  if (!phase) {
    if (officeStatus === 'scheduled' || officeStatus === 'new') return 'assigned';
    if (officeStatus === 'in_progress') return 'started';
    return null;
  }
  switch (phase) {
    case 'assigned':
      return 'assigned';
    case 'accepted':
      return 'accepted';
    case 'en_route':
      return 'travelling';
    case 'on_site':
      return 'arrived';
    case 'in_progress':
    case 'paused':
    case 'awaiting_customer':
    case 'awaiting_parts':
    case 'awaiting_approval':
    case 'ready_to_complete':
      return 'started';
    default:
      return null;
  }
}

export function lifecycleStepLabel(step: TechnicianLifecycleStep): string {
  switch (step) {
    case 'assigned':
      return 'Assigned';
    case 'accepted':
      return 'Accepted';
    case 'travelling':
      return 'Travelling';
    case 'arrived':
      return 'Arrived';
    case 'started':
      return 'Started';
    case 'completed':
      return 'Completed';
    default:
      return step;
  }
}

export function lifecycleStepIndex(step: TechnicianLifecycleStep): number {
  return TECHNICIAN_LIFECYCLE_FLOW.indexOf(step);
}

/** Minutes between first en_route and first on_site event for a job. */
export function computeTravelMinutesFromEvents(
  events: Array<{ toPhase: string | null; createdAt: Date | string }>,
): number | null {
  let enRouteAt: number | null = null;
  let onSiteAt: number | null = null;
  const ordered = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  for (const event of ordered) {
    if (event.toPhase === 'en_route' && enRouteAt === null) {
      enRouteAt = new Date(event.createdAt).getTime();
    }
    if (
      (event.toPhase === 'on_site' || event.toPhase === 'in_progress') &&
      onSiteAt === null &&
      enRouteAt !== null
    ) {
      onSiteAt = new Date(event.createdAt).getTime();
      break;
    }
  }
  if (enRouteAt === null || onSiteAt === null || onSiteAt < enRouteAt) return null;
  return Math.round((onSiteAt - enRouteAt) / 60_000);
}

/**
 * Completion hours from first started/in_progress (or on_site) to completed.
 * Returns null when workflow events lack both endpoints.
 */
export function computeCompletionHoursFromEvents(
  events: Array<{ toPhase: string | null; createdAt: Date | string }>,
): number | null {
  let startAt: number | null = null;
  let completedAt: number | null = null;
  const ordered = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  for (const event of ordered) {
    if (
      startAt === null &&
      (event.toPhase === 'in_progress' ||
        event.toPhase === 'on_site' ||
        event.toPhase === 'ready_to_complete')
    ) {
      startAt = new Date(event.createdAt).getTime();
    }
    if (event.toPhase === 'completed') {
      completedAt = new Date(event.createdAt).getTime();
    }
  }
  if (startAt === null || completedAt === null || completedAt < startAt) return null;
  return Math.round(((completedAt - startAt) / 3_600_000) * 10) / 10;
}

export function averageOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

/**
 * Productivity score from real available signals only.
 * Formula: completed / assigned * 100, minus callback penalty (5 pts each, floor 0).
 * Returns null when no assigned jobs in range.
 */
export function computeProductivityScore(input: {
  jobsAssigned: number;
  jobsCompleted: number;
  callbacks: number;
}): number | null {
  if (input.jobsAssigned <= 0) return null;
  const completionRate = (input.jobsCompleted / input.jobsAssigned) * 100;
  const penalty = Math.min(completionRate, input.callbacks * 5);
  return Math.max(0, Math.round((completionRate - penalty) * 10) / 10);
}

export function metric(
  value: number | null,
  unit: TechnicianMetricValue['unit'],
  availability: TechnicianMetricAvailability,
  honestyNote: string | null,
  sampleSize = 0,
): TechnicianMetricValue {
  return { value, unit, availability, honestyNote, sampleSize };
}

export function resolveTechnicianIntelligenceRange(
  period: TechnicianIntelligencePeriod,
  now = new Date(),
): { from: Date; to: Date } {
  const to = new Date(now);
  const from = new Date(now);
  if (period === 'daily') {
    from.setUTCHours(0, 0, 0, 0);
  } else if (period === 'weekly') {
    from.setTime(to.getTime() - 7 * 24 * 60 * 60_000);
  } else {
    from.setTime(to.getTime() - 30 * 24 * 60 * 60_000);
  }
  return { from, to };
}

/** Build draft AURA insights from real aggregated metrics — never invents rows. */
export function buildTechnicianAuraInsightDrafts(input: {
  technicians: TechnicianPerformanceMetrics[];
  generatedAt?: string;
}): Array<{
  insightType: TechnicianAuraInsightType;
  subject: string;
  body: string;
  technicianId: string | null;
  supportingSignals: string[];
}> {
  const drafts: Array<{
    insightType: TechnicianAuraInsightType;
    subject: string;
    body: string;
    technicianId: string | null;
    supportingSignals: string[];
  }> = [];

  const withTravel = input.technicians.filter(
    (t) => t.averageTravelMinutes.availability !== 'unavailable' && t.averageTravelMinutes.value !== null,
  );
  const companyTravelAvg = averageOrNull(
    withTravel.map((t) => t.averageTravelMinutes.value as number),
  );

  for (const tech of input.technicians) {
    if (
      tech.averageTravelMinutes.value !== null &&
      companyTravelAvg !== null &&
      tech.averageTravelMinutes.value > companyTravelAvg * 1.35 &&
      tech.averageTravelMinutes.sampleSize >= 2
    ) {
      drafts.push({
        insightType: 'delay',
        subject: `Elevated travel time — ${tech.technicianName}`,
        body: `${tech.technicianName} averages ${tech.averageTravelMinutes.value} min travel vs company ${companyTravelAvg} min (from en_route→on_site workflow events). Review routing or schedule density before changing assignments.`,
        technicianId: tech.technicianId,
        supportingSignals: [
          `avg_travel_minutes=${tech.averageTravelMinutes.value}`,
          `company_avg_travel_minutes=${companyTravelAvg}`,
          `travel_samples=${tech.averageTravelMinutes.sampleSize}`,
        ],
      });
    }

    if (
      tech.callbacks.value !== null &&
      tech.callbacks.value >= 2 &&
      tech.jobsCompleted.value !== null &&
      tech.jobsCompleted.value > 0
    ) {
      drafts.push({
        insightType: 'trend',
        subject: `Callback volume — ${tech.technicianName}`,
        body: `${tech.technicianName} has ${tech.callbacks.value} quality callback(s) against ${tech.jobsCompleted.value} completed job(s) in range. Suggest a quality review on recent comebacks — no automatic reassignment.`,
        technicianId: tech.technicianId,
        supportingSignals: [
          `callbacks=${tech.callbacks.value}`,
          `jobs_completed=${tech.jobsCompleted.value}`,
        ],
      });
    }

    if (
      tech.overtimeHours.value !== null &&
      tech.overtimeHours.value >= 8 &&
      tech.overtimeHours.availability !== 'unavailable'
    ) {
      drafts.push({
        insightType: 'improvement',
        subject: `Overtime load — ${tech.technicianName}`,
        body: `${tech.technicianName} recorded ${tech.overtimeHours.value} overtime hours from approved/submitted timesheets. Consider workload balancing or schedule buffering — requires owner approval to act.`,
        technicianId: tech.technicianId,
        supportingSignals: [`overtime_hours=${tech.overtimeHours.value}`],
      });
    }
  }

  const completionRates = input.technicians
    .filter((t) => (t.jobsAssigned.value ?? 0) > 0)
    .map((t) => ({
      name: t.technicianName,
      rate: ((t.jobsCompleted.value ?? 0) / (t.jobsAssigned.value as number)) * 100,
      assigned: t.jobsAssigned.value as number,
    }));

  if (completionRates.length >= 2) {
    const avgRate =
      completionRates.reduce((acc, r) => acc + r.rate, 0) / completionRates.length;
    const below = completionRates.filter((r) => r.rate < avgRate - 20 && r.assigned >= 3);
    if (below.length > 0) {
      drafts.push({
        insightType: 'trend',
        subject: 'Completion rate spread across crew',
        body: `${below.length} technician(s) are ≥20pts below the crew average completion rate (${Math.round(avgRate)}%). Review assigned vs completed counts — do not auto-reassign.`,
        technicianId: null,
        supportingSignals: below.map((b) => `${b.name}:${Math.round(b.rate)}%`),
      });
    }
  }

  return drafts;
}

export function emptyPerformanceMetrics(
  technicianId: string,
  technicianName: string,
): TechnicianPerformanceMetrics {
  return {
    technicianId,
    technicianName,
    jobsCompleted: metric(0, 'count', 'available', null, 0),
    jobsAssigned: metric(0, 'count', 'available', null, 0),
    averageCompletionHours: metric(
      null,
      'hours',
      'unavailable',
      'No workflow events with start→completed timestamps in range.',
      0,
    ),
    averageTravelMinutes: metric(
      null,
      'minutes',
      'unavailable',
      'No en_route→on_site workflow events in range.',
      0,
    ),
    overtimeHours: metric(
      null,
      'hours',
      'unavailable',
      'No timesheet overtime rows in range.',
      0,
    ),
    callbacks: metric(0, 'count', 'available', null, 0),
    customerRatingAvg: metric(
      null,
      'rating',
      'unavailable',
      'No CX job_rating / technician_rating reviews linked to this technician’s jobs in range.',
      0,
    ),
    productivityScore: metric(
      null,
      'score',
      'unavailable',
      'No assigned jobs in range to score.',
      0,
    ),
  };
}
