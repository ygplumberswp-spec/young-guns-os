/**
 * YG-CUTOVER-001E — Technician Field Mobile data truth + greeting.
 * Canonical assigned-job source: jobs assigned to user OR active crew membership
 * (API: getJobIdsForUserIncludingCrew → listAssignedJobs).
 */

export const TECHNICIAN_ACTIVE_JOB_STATUSES = [
  'new',
  'scheduled',
  'dispatched',
  'en_route',
  'on_site',
  'in_progress',
  'paused',
] as const;

export function isTechnicianActiveJobStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'completed' || normalized === 'cancelled' || normalized === 'canceled') {
    return false;
  }
  return true;
}

/** Active assigned jobs drive greeting, Assigned Jobs panel, and route stops together. */
export function countTechnicianActiveAssignedJobs(
  jobs: ReadonlyArray<{ status: string }>,
): number {
  return jobs.filter((job) => isTechnicianActiveJobStatus(job.status)).length;
}

export function buildTechnicianFieldGreeting(input: {
  activeAssignedJobCount: number;
  now?: Date;
}): { message: string; generatedAt: string } {
  const now = input.now ?? new Date();
  const hour = now.getHours();
  const salutation = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const count = Math.max(0, input.activeAssignedJobCount);

  const message =
    count === 0
      ? `${salutation}. No jobs are assigned to you right now.`
      : `${salutation}. You have ${count} assigned job${count === 1 ? '' : 's'}.`;

  return {
    message,
    generatedAt: now.toISOString(),
  };
}

/** Forbidden themes in technician field greeting / dashboard copy. */
export const TECHNICIAN_FIELD_FORBIDDEN_COPY: readonly RegExp[] = [
  /\bunpaid invoice/i,
  /\binvoice\b/i,
  /\bpayment\b/i,
  /\brevenue\b/i,
  /\bprofit\b/i,
  /\bbusiness overview\b/i,
  /\blow-stock\b/i,
  /\binventory alert/i,
];

export function technicianFieldCopyLeaksFinance(text: string): boolean {
  return TECHNICIAN_FIELD_FORBIDDEN_COPY.some((pattern) => pattern.test(text));
}
