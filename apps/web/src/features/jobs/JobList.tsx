import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import type { JobSummary } from '@titan/shared';
import { JOB_STATUS_OPTIONS } from '@titan/shared';
import { hasAnyPermission } from '@titan/auth/browser';

type JobListProps = {
  jobs: JobSummary[];
  canWrite: boolean;
};

function formatStatus(status: JobSummary['status']): string {
  return JOB_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function JobList({ jobs, canWrite }: JobListProps) {
  if (jobs.length === 0) {
    return (
      <EmptyState
        title="No jobs yet"
        description="Create your first job to start tracking work for your customers."
        action={
          canWrite ? (
            <Link href="/jobs/new">
              <Button>Create job</Button>
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <Panel title="All jobs">
      <div className="jobs-table-wrap">
        <table className="jobs-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Scheduled</th>
              <th>Assigned</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <Link href={`/jobs/${job.id}`} className="jobs-link">
                    {job.title}
                  </Link>
                </td>
                <td>
                  <Link href={`/crm/${job.customerId}`} className="jobs-link jobs-link--muted">
                    {job.customerName}
                  </Link>
                </td>
                <td>
                  <span className={`jobs-status jobs-status--${job.status}`}>
                    {formatStatus(job.status)}
                  </span>
                </td>
                <td>{job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : '—'}</td>
                <td>{job.assignedUserName ?? '—'}</td>
                <td>{new Date(job.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function canAccessJobs(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['jobs:read', 'jobs:write']);
}

export function canManageJobs(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['jobs:write']);
}

export function formatJobStatus(status: JobSummary['status']): string {
  return formatStatus(status);
}
