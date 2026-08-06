import type { JobStatus } from '@titan/shared';

type JobEtaInput = {
  assignedUserId: string | null;
  status: JobStatus;
  scheduledAt: Date | null;
  scheduledEndAt: Date | null;
};

/** Customer-visible ETA for open jobs (OPS-016 / POR-003 / UX-030). */
export function resolveCustomerVisibleJobEtaAt(job: JobEtaInput): string | null {
  const scheduledEta =
    job.scheduledEndAt?.toISOString() ?? job.scheduledAt?.toISOString() ?? null;
  const trackingEligible =
    Boolean(job.assignedUserId) &&
    job.status !== 'cancelled' &&
    job.status !== 'completed' &&
    (job.status === 'scheduled' || job.status === 'in_progress' || job.status === 'new');

  return trackingEligible ? scheduledEta : null;
}
