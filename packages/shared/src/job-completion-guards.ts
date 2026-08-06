import type { UpdateJobRequest } from './jobs.js';

/** Fields that must not change silently on a completed job without reopen. */
export const COMPLETED_JOB_STRUCTURAL_KEYS = [
  'title',
  'customerId',
  'jobType',
  'description',
  'status',
  'priority',
  'scheduledAt',
  'scheduledEndAt',
  'assignedUserId',
] as const satisfies ReadonlyArray<keyof UpdateJobRequest>;

/** Fields allowed after completion (must be audited as post-completion). */
export const COMPLETED_JOB_POST_COMPLETION_KEYS = [
  'notes',
  'customerVisibleNotes',
  'accessInstructions',
] as const satisfies ReadonlyArray<keyof UpdateJobRequest>;

export function getCompletedJobStructuralAttempts(
  input: UpdateJobRequest,
): Array<(typeof COMPLETED_JOB_STRUCTURAL_KEYS)[number]> {
  return COMPLETED_JOB_STRUCTURAL_KEYS.filter((key) => input[key] !== undefined);
}

export function getCompletedJobPostCompletionAttempts(
  input: UpdateJobRequest,
): Array<(typeof COMPLETED_JOB_POST_COMPLETION_KEYS)[number]> {
  return COMPLETED_JOB_POST_COMPLETION_KEYS.filter((key) => input[key] !== undefined);
}
