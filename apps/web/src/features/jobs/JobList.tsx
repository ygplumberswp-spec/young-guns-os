import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import type { JobSummary } from '@titan/shared';
import { JOB_PRIORITY_OPTIONS, JOB_STATUS_OPTIONS } from '@titan/shared';
import { hasAnyPermission } from '@titan/auth/browser';
import { MoreMenu } from '../../components/ux';

type JobListProps = {
  jobs: JobSummary[];
  canWrite: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  selectedIds?: Set<string>;
  onSelectedIdsChange?: (next: Set<string>) => void;
};

function formatStatus(status: JobSummary['status']): string {
  return JOB_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function formatPriority(priority: JobSummary['priority']): string {
  return JOB_PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? priority;
}

export function JobList({
  jobs,
  canWrite,
  search,
  onSearchChange,
  selectedIds,
  onSelectedIdsChange,
}: JobListProps) {
  const selectionEnabled = Boolean(selectedIds && onSelectedIdsChange);

  return (
    <Panel title="All jobs">
      <div className="jobs-list-toolbar">
        <InputSearch
          value={search}
          onChange={onSearchChange}
          placeholder="Search job #, customer, address, mobile…"
        />
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title={search.trim() ? 'No matching jobs' : 'No jobs yet'}
          description={
            search.trim()
              ? 'Try a different job number, customer, address or mobile.'
              : 'Create your first job to start tracking work for your customers.'
          }
          action={
            canWrite && !search.trim() ? (
              <Link href="/jobs/new">
                <Button>Create job</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="jobs-table-wrap">
          <table className="jobs-table">
            <thead>
              <tr>
                {selectionEnabled ? <th aria-label="Select" /> : null}
                <th>Job #</th>
                <th>Customer</th>
                <th>Address</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Appointment</th>
                <th>Technician</th>
                {canWrite ? <th aria-label="Actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  {selectionEnabled ? (
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds!.has(job.id)}
                        onChange={(event) => {
                          const next = new Set(selectedIds);
                          if (event.target.checked) {
                            next.add(job.id);
                          } else {
                            next.delete(job.id);
                          }
                          onSelectedIdsChange!(next);
                        }}
                        aria-label={`Select job ${job.jobNumber ?? job.title}`}
                      />
                    </td>
                  ) : null}
                  <td>
                    <Link href={`/jobs/${job.id}`} className="jobs-link">
                      {job.jobNumber ?? job.title}
                    </Link>
                    <div className="jobs-table__sub">{job.title}</div>
                  </td>
                  <td>
                    <Link href={`/crm/${job.customerId}`} className="jobs-link jobs-link--muted">
                      {job.customerName}
                    </Link>
                  </td>
                  <td>{job.addressDisplay ?? '—'}</td>
                  <td>{job.jobType ?? '—'}</td>
                  <td>
                    <span className={`jobs-priority jobs-priority--${job.priority}`}>
                      {formatPriority(job.priority)}
                    </span>
                  </td>
                  <td>
                    <span className={`jobs-status jobs-status--${job.status}`}>
                      {formatStatus(job.status)}
                    </span>
                  </td>
                  <td>{job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : '—'}</td>
                  <td>{job.assignedUserName ?? '—'}</td>
                  {canWrite ? (
                    <td>
                      <MoreMenu
                        label="⋯"
                        items={[
                          { id: 'open', label: 'Open job', href: `/jobs/${job.id}` },
                          { id: 'schedule', label: 'Schedule', href: `/scheduling?jobId=${job.id}` },
                        ]}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function InputSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="titan-input-group jobs-search">
      <span className="titan-input-label">Search</span>
      <input
        className="titan-input"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
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
