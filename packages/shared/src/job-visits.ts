/**
 * Multi-day Job Visits + Reschedule / Still Busy contracts.
 * One canonical Job; Visit 1..N work sessions. Never duplicate the job.
 */

export const JOB_RESCHEDULE_REASONS = [
  'customer_unavailable',
  'parts_required',
  'access_problem',
  'additional_work_required',
  'site_not_ready',
  'weather',
  'other',
] as const;

export type JobRescheduleReason = (typeof JOB_RESCHEDULE_REASONS)[number];

export const JOB_RESCHEDULE_REASON_LABELS: Record<JobRescheduleReason, string> = {
  customer_unavailable: 'Customer unavailable',
  parts_required: 'Parts required',
  access_problem: 'Access problem',
  additional_work_required: 'Additional work required',
  site_not_ready: 'Site not ready',
  weather: 'Weather',
  other: 'Other',
};

export type JobVisitStatus = 'open' | 'closed';

export type JobVisitCloseReason = 'still_busy' | 'completed' | 'rescheduled' | 'cancelled';

export type JobVisitSummary = {
  id: string;
  visitNumber: number;
  status: JobVisitStatus;
  technicianUserId: string;
  technicianName: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  labourMinutes: number;
  travelMinutes: number;
  notes: string | null;
  workCompletedSummary: string | null;
  remainingWorkSummary: string | null;
  closeReason: JobVisitCloseReason | null;
  materialCount: number;
  photoCount: number;
  slipCount: number;
  createdAt: string;
};

export type JobVisitRollup = {
  jobId: string;
  visitCount: number;
  openVisitNumber: number | null;
  totalLabourMinutes: number;
  totalTravelMinutes: number;
  labourByTechnician: Array<{ userId: string; userName: string | null; minutes: number }>;
  materialCount: number;
  slipCount: number;
  photoCount: number;
  materialsTotalCents: number;
  cumulativeJobCostCents: number;
  cumulativeJpePercent: number | null;
  workCompletedSoFar: string | null;
  remainingWork: string | null;
  nextScheduledAt: string | null;
  invoiceBlocked: boolean;
  invoiceBlockReason: string | null;
  rescheduleRequestCount: number;
  pendingRescheduleCount: number;
  visits: JobVisitSummary[];
};

export type RequestJobRescheduleInput = {
  reason: JobRescheduleReason;
  notes: string;
  proposedScheduledAt?: string | null;
  clientActionId?: string | null;
};

export type ApproveJobRescheduleInput = {
  scheduledAt: string;
  scheduledEndAt?: string | null;
  notes?: string | null;
  clientActionId?: string | null;
};

export type StillBusyInput = {
  notes?: string | null;
  workCompletedSummary?: string | null;
  remainingWorkSummary?: string | null;
  proposedNextVisitAt?: string | null;
  clientActionId?: string | null;
};

/** STILL BUSY / work_continues blocks Ready for Invoicing + financial close. */
export function isInvoiceBlockedByVisitState(input: {
  executionPhase: string;
  hasOpenVisit: boolean;
  jobCompleted: boolean;
}): { blocked: boolean; reason: string | null } {
  if (input.jobCompleted) {
    return { blocked: false, reason: null };
  }
  if (input.executionPhase === 'work_continues') {
    return {
      blocked: true,
      reason: 'Job is Still Busy / work continues — final COMPLETE JOB required before invoicing.',
    };
  }
  if (input.hasOpenVisit) {
    return {
      blocked: true,
      reason: 'An open work visit is in progress — close the visit or complete the job first.',
    };
  }
  return { blocked: false, reason: null };
}

export type JobVisitAttentionItem = {
  id: string;
  priority: 'attention' | 'critical';
  category: string;
  title: string;
  customerName: string | null;
  amountCents: number | null;
  currency: string;
  ageLabel: string | null;
  reason: string;
  recommendedAction: string;
  href: string;
  draftActionAvailable: boolean;
};

export function buildRepeatedRescheduleAttention(input: {
  jobId: string;
  jobTitle: string;
  customerName: string | null;
  rescheduleCount: number;
  threshold?: number;
}): JobVisitAttentionItem | null {
  const threshold = input.threshold ?? 2;
  if (input.rescheduleCount < threshold) return null;
  return {
    id: `reschedule-${input.jobId}`,
    priority: input.rescheduleCount >= 4 ? 'critical' : 'attention',
    category: 'Repeated reschedule',
    title: input.jobTitle,
    customerName: input.customerName,
    amountCents: null,
    currency: 'ZAR',
    ageLabel: null,
    reason: `${input.rescheduleCount} reschedule requests — unfinished work may be hiding`,
    recommendedAction: 'Review schedule and job progress',
    href: `/jobs/${input.jobId}`,
    draftActionAvailable: false,
  };
}

export function buildLongOpenJobAttention(input: {
  jobId: string;
  jobTitle: string;
  customerName: string | null;
  openDays: number;
  visitCount: number;
  thresholdDays?: number;
}): JobVisitAttentionItem | null {
  const threshold = input.thresholdDays ?? 3;
  if (input.openDays < threshold) return null;
  return {
    id: `long-open-${input.jobId}`,
    priority: input.openDays >= 7 ? 'critical' : 'attention',
    category: 'Long-open job',
    title: input.jobTitle,
    customerName: input.customerName,
    amountCents: null,
    currency: 'ZAR',
    ageLabel: `${input.openDays}d`,
    reason: `Open ${input.openDays} days across ${input.visitCount} visit(s) — Still Busy / multi-day`,
    recommendedAction: 'Review remaining work and next visit',
    href: `/jobs/${input.jobId}`,
    draftActionAvailable: false,
  };
}
