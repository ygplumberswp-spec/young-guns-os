import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';
import type { JobSummary } from '@titan/shared';
import { JOB_PRIORITY_OPTIONS, JOB_STATUS_OPTIONS } from '@titan/shared';
import { hasAnyPermission } from '@titan/auth/browser';
import { BulkActionBar, EmptyState, MoreMenu } from '../../components/ux';

type JobListProps = {
  jobs: JobSummary[];
  canWrite: boolean;
  search: string;
  onSearchChange: (value: string) => void;
};

function formatStatus(status: JobSummary['status']): string {
  return JOB_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function formatPriority(priority: JobSummary['priority']): string {
  return JOB_PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? priority;
}

export function JobList({ jobs, canWrite, search, onSearchChange }: JobListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allSelected = jobs.length > 0 && selectedIds.size === jobs.length;

  const toggleAll = (selected: boolean) => {
    setSelectedIds(selected ? new Set(jobs.map((job) => job.id)) : new Set());
  };

  const toggleOne = (jobId: string, selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(jobId);
      } else {
        next.delete(jobId);
      }
      return next;
    });
  };

  const bulkActions = useMemo(
    () =>
      canWrite
        ? [
            {
              id: 'assign',
              label: 'Assign technician (coming soon)',
              onSelect: () => undefined,
              disabled: true,
            },
            {
              id: 'status',
              label: 'Update status (coming soon)',
              onSelect: () => undefined,
              disabled: true,
            },
          ]
        : [],
    [canWrite],
  );

  return (
    <Panel title="All jobs">
      <BulkActionBar
        totalCount={jobs.length}
        selectedCount={selectedIds.size}
        allSelected={allSelected}
        onSelectAll={toggleAll}
        actions={
          bulkActions.length > 0 ? (
            <MoreMenu label="Bulk actions" items={bulkActions} />
          ) : undefined
        }
      />

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
                <th aria-label="Select" />
                <th>Job #</th>
                <th>Customer</th>
                <th>Address</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Appointment</th>
                <th>Technician</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(job.id)}
                      onChange={(event) => toggleOne(job.id, event.target.checked)}
                      aria-label={`Select job ${job.jobNumber ?? job.title}`}
                    />
                  </td>
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
                  <td>
                    <MoreMenu
                      label="⋯"
                      items={[
                        {
                          id: 'open',
                          label: 'Open job',
                          onSelect: () => {
                            window.location.href = `/jobs/${job.id}`;
                          },
                        },
                        ...(canWrite
                          ? [
                              {
                                id: 'schedule',
                                label: 'Schedule (coming soon)',
                                onSelect: () => undefined,
                                disabled: true,
                              },
                            ]
                          : []),
                      ]}
                    />
                  </td>
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
