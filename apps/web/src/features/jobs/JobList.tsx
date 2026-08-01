import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { hasAnyPermission } from '@titan/auth/browser';
import { Button, EmptyState, Panel } from '@titan/ui';
import type { JobStatus, JobSummary } from '@titan/shared';
import {
  getJobDeleteEligibility,
  getJobStatusTone,
  JOB_PRIORITY_OPTIONS,
  JOB_QUICK_STATUS_ACTIONS,
  JOB_STATUS_OPTIONS,
} from '@titan/shared';
import { updateJob } from '../../lib/jobs-api';
import { ApiClientError } from '../../lib/api-client';
import {
  BulkActionBar,
  MultiStatusFilter,
  RowActionsCell,
  StatusBadgeDropdown,
  StatusRowAccent,
  type InlineSaveState,
  type MoreMenuItem,
  useConfirmDialog,
} from '../../components/ux';

type JobListProps = {
  jobs: JobSummary[];
  canWrite: boolean;
  accessToken: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  selectedIds?: Set<string>;
  onSelectedIdsChange?: (next: Set<string>) => void;
  onRefresh: () => Promise<void>;
};

type RowSaveState = Record<string, InlineSaveState>;

function formatPriority(priority: JobSummary['priority']): string {
  return JOB_PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? priority;
}

function formatStatus(status: JobSummary['status']): string {
  return JOB_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function JobList({
  jobs,
  canWrite,
  accessToken,
  search,
  onSearchChange,
  selectedIds,
  onSelectedIdsChange,
  onRefresh,
}: JobListProps) {
  const [, navigate] = useLocation();
  const trimmedSearch = search.trim();
  const [statusFilters, setStatusFilters] = useState<JobStatus[]>([]);
  const [rowSaveState, setRowSaveState] = useState<RowSaveState>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const { confirm, alert, dialog: confirmDialog } = useConfirmDialog();

  const selectionEnabled = Boolean(selectedIds && onSelectedIdsChange);

  const filteredJobs = useMemo(() => {
    if (statusFilters.length === 0) return jobs;
    return jobs.filter((job) => statusFilters.includes(job.status));
  }, [jobs, statusFilters]);

  const allSelected =
    filteredJobs.length > 0 &&
    selectionEnabled &&
    filteredJobs.every((job) => selectedIds!.has(job.id));

  const setRowState = useCallback((jobId: string, state: InlineSaveState) => {
    setRowSaveState((prev) => ({ ...prev, [jobId]: state }));
    if (state === 'saved') {
      window.setTimeout(() => {
        setRowSaveState((prev) => {
          if (prev[jobId] !== 'saved') return prev;
          const next = { ...prev };
          delete next[jobId];
          return next;
        });
      }, 2000);
    }
  }, []);

  async function changeJobStatus(job: JobSummary, targetStatus: JobStatus) {
    if (!accessToken || !canWrite || job.status === targetStatus) return;
    setRowState(job.id, 'saving');
    try {
      await updateJob(accessToken, job.id, { status: targetStatus });
      setRowState(job.id, 'saved');
      await onRefresh();
    } catch (err) {
      setRowState(job.id, 'failed');
      if (err instanceof ApiClientError) {
        await alert(err.message, 'Unable to update job');
      }
    }
  }

  async function handleArchiveOrCancel(job: JobSummary) {
    const eligibility = getJobDeleteEligibility({ status: job.status });
    if (eligibility.canDelete) {
      const confirmed = await confirm({
        title: 'Delete job',
        message: `Permanently delete job ${job.jobNumber ?? job.title}? Owner confirmation required.`,
        confirmLabel: 'Delete permanently',
        variant: 'destructive',
      });
      if (!confirmed) {
        return;
      }
      await changeJobStatus(job, 'cancelled');
      return;
    }
    const confirmed = await confirm({
      title: eligibility.archiveLabel,
      message: `${eligibility.archiveLabel} job ${job.jobNumber ?? job.title}? ${eligibility.blockReason ?? ''}`,
      confirmLabel: eligibility.archiveLabel,
      variant: 'destructive',
    });
    if (!confirmed) {
      return;
    }
    await changeJobStatus(job, 'cancelled');
  }

  function buildJobActions(job: JobSummary): MoreMenuItem[] {
    const eligibility = getJobDeleteEligibility({ status: job.status });

    return [
      { id: 'view', label: 'View', onSelect: () => navigate(`/jobs/${job.id}`) },
      { id: 'edit', label: 'Edit', onSelect: () => navigate(`/jobs/${job.id}#edit`) },
      {
        id: 'assign',
        label: 'Assign technician',
        onSelect: () => navigate(`/jobs/${job.id}#crew`),
      },
      {
        id: 'schedule',
        label: 'Schedule',
        onSelect: () => navigate(`/scheduling?jobId=${job.id}`),
      },
      {
        id: 'reschedule',
        label: 'Reschedule',
        onSelect: () => navigate(`/scheduling?jobId=${job.id}&mode=reschedule`),
      },
      {
        id: 'dispatch',
        label: 'Dispatch',
        disabled: job.status === 'in_progress' || job.status === 'completed',
        onSelect: () => void changeJobStatus(job, 'scheduled'),
      },
      {
        id: 'travelling',
        label: 'Mark travelling',
        disabled: job.status === 'completed' || job.status === 'cancelled',
        onSelect: () => void changeJobStatus(job, 'in_progress'),
      },
      {
        id: 'on-site',
        label: 'Mark on site',
        disabled: job.status === 'completed' || job.status === 'cancelled',
        onSelect: () => void changeJobStatus(job, 'in_progress'),
      },
      {
        id: 'complete',
        label: 'Complete',
        disabled: job.status === 'completed' || job.status === 'cancelled',
        onSelect: () => void changeJobStatus(job, 'completed'),
      },
      {
        id: 'cancel',
        label: 'Cancel',
        disabled: job.status === 'cancelled' || job.status === 'completed',
        onSelect: () => void changeJobStatus(job, 'cancelled'),
      },
      {
        id: 'duplicate',
        label: 'Duplicate draft',
        onSelect: () => navigate(`/jobs/new?duplicateFrom=${job.id}`),
      },
      {
        id: 'archive',
        label: eligibility.archiveLabel,
        disabled: job.status === 'cancelled',
        onSelect: () => void handleArchiveOrCancel(job),
      },
      {
        id: 'delete',
        label: eligibility.deleteLabel,
        disabled: !eligibility.canDelete,
        onSelect: () => void handleArchiveOrCancel(job),
      },
    ];
  }

  async function bulkSetStatus(targetStatus: JobStatus) {
    if (!accessToken || !canWrite || !selectionEnabled || selectedIds!.size === 0) return;
    setBulkSaving(true);
    try {
      for (const job of filteredJobs) {
        if (!selectedIds!.has(job.id) || job.status === targetStatus) continue;
        await changeJobStatus(job, targetStatus);
      }
      onSelectedIdsChange!(new Set());
    } finally {
      setBulkSaving(false);
    }
  }

  function toggleSelectAll(checked: boolean) {
    if (!selectionEnabled) return;
    if (!checked) {
      onSelectedIdsChange!(new Set());
      return;
    }
    onSelectedIdsChange!(new Set(filteredJobs.map((job) => job.id)));
  }

  function toggleRow(id: string, checked: boolean) {
    if (!selectionEnabled) return;
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedIdsChange!(next);
  }

  const filterOptions = JOB_STATUS_OPTIONS.map((option) => ({
    id: option.value,
    label: option.label,
    tone: getJobStatusTone(option.value),
  }));

  const bulkActions = canWrite
    ? [
        {
          id: 'assign',
          label: 'Assign technician',
          disabled: bulkSaving || !selectionEnabled || selectedIds!.size === 0,
          onClick: () => {
            const first = filteredJobs.find((job) => selectedIds!.has(job.id));
            if (first) navigate(`/jobs/${first.id}#crew`);
          },
        },
        {
          id: 'status',
          label: 'Mark scheduled',
          disabled: bulkSaving || !selectionEnabled || selectedIds!.size === 0,
          onClick: () => void bulkSetStatus('scheduled'),
        },
        {
          id: 'reschedule',
          label: 'Reschedule',
          disabled: bulkSaving || !selectionEnabled || selectedIds!.size === 0,
          onClick: () => {
            const first = filteredJobs.find((job) => selectedIds!.has(job.id));
            if (first) navigate(`/scheduling?jobId=${first.id}&mode=reschedule`);
          },
        },
        {
          id: 'archive',
          label: 'Archive / cancel',
          disabled: bulkSaving || !selectionEnabled || selectedIds!.size === 0,
          onClick: () => void bulkSetStatus('cancelled'),
          variant: 'destructive' as const,
        },
      ]
    : [];

  return (
    <>
    <Panel title="All jobs">
      <div className="jobs-list-toolbar">
        <InputSearch
          value={search}
          onChange={onSearchChange}
          placeholder="Search job #, customer, address, mobile…"
        />
      </div>

      <MultiStatusFilter
        options={filterOptions}
        selected={statusFilters}
        onChange={(selected) => setStatusFilters(selected as JobStatus[])}
        ariaLabel="Filter jobs by status"
      />

      {selectionEnabled ? (
        <BulkActionBar
          selectedCount={selectedIds!.size}
          totalCount={filteredJobs.length}
          onSelectAll={toggleSelectAll}
          allSelected={allSelected}
          actions={bulkActions}
        />
      ) : null}

      {filteredJobs.length === 0 ? (
        <EmptyState
          title={trimmedSearch || statusFilters.length ? 'No matching jobs' : 'No jobs yet'}
          description={
            trimmedSearch
              ? 'Try a different job number, customer, address or mobile.'
              : 'Create your first job to start tracking work for your customers.'
          }
          action={
            canWrite && !trimmedSearch && statusFilters.length === 0 ? (
              <Link href="/jobs/new">
                <Button>Create job</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="jobs-table-wrap leads-list">
          <table className="jobs-table crm-table--compact">
            <thead>
              <tr>
                {selectionEnabled ? <th className="leads-table__check-col" aria-label="Select" /> : null}
                <th>Job #</th>
                <th className="leads-table__hide-mobile">Customer</th>
                <th className="leads-table__hide-mobile">Address</th>
                <th className="leads-table__hide-mobile">Appointment</th>
                <th className="leads-table__hide-mobile">Technician</th>
                <th className="leads-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => {
                const tone = getJobStatusTone(job.status);
                const saveState = rowSaveState[job.id] ?? 'idle';

                return (
                  <StatusRowAccent key={job.id} tone={tone} className="jobs-table__row">
                    {selectionEnabled ? (
                      <td className="leads-table__check-col">
                        <input
                          type="checkbox"
                          checked={selectedIds!.has(job.id)}
                          onChange={(event) => toggleRow(job.id, event.target.checked)}
                          aria-label={`Select job ${job.jobNumber ?? job.title}`}
                        />
                      </td>
                    ) : null}
                    <td className="leads-table__primary">
                      <div className="leads-table__name-line">
                        <Link href={`/jobs/${job.id}`} className="jobs-link">
                          {job.jobNumber ?? job.title}
                        </Link>
                        <StatusBadgeDropdown
                          label={formatStatus(job.status)}
                          tone={tone}
                          canChange={canWrite && saveState !== 'saving'}
                          saveState={saveState}
                          options={JOB_QUICK_STATUS_ACTIONS.map((action) => ({
                            id: action.id,
                            label: action.label,
                            disabled: action.targetStatus === job.status,
                          }))}
                          onSelect={(actionId) => {
                            const action = JOB_QUICK_STATUS_ACTIONS.find((a) => a.id === actionId);
                            if (action) void changeJobStatus(job, action.targetStatus);
                          }}
                        />
                      </div>
                      <div className="leads-table__mobile-meta">
                        <span>{job.customerName}</span>
                        <span>{job.addressDisplay ?? '—'}</span>
                        <span className={`jobs-priority jobs-priority--${job.priority}`}>
                          {formatPriority(job.priority)}
                        </span>
                      </div>
                    </td>
                    <td className="leads-table__hide-mobile">
                      <Link href={`/crm/${job.customerId}`} className="jobs-link jobs-link--muted">
                        {job.customerName}
                      </Link>
                    </td>
                    <td className="leads-table__hide-mobile">{job.addressDisplay ?? '—'}</td>
                    <td className="leads-table__hide-mobile">
                      {job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : '—'}
                    </td>
                    <td className="leads-table__hide-mobile">{job.assignedUserName ?? '—'}</td>
                    <td className="leads-table__actions-col">
                      <RowActionsCell
                        editHref={`/jobs/${job.id}#edit`}
                        moreItems={buildJobActions(job)}
                        canWrite={canWrite}
                      />
                    </td>
                  </StatusRowAccent>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
    {confirmDialog}
    </>
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
