import { Link } from 'wouter';
import type { ExecutiveLiveJob } from '@titan/shared';
import { Button, EmptyState, Panel } from '@titan/ui';
import { StatusBadge } from '../../components/ux';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';

type ActiveJobsPanelProps = {
  jobs: ExecutiveLiveJob[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTimeOnSite(startedAt: string | null): string {
  if (!startedAt) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

export function ActiveJobsPanel({
  jobs,
  isLoading = false,
  error = null,
  onRetry,
}: ActiveJobsPanelProps) {
  const activeJobs = jobs.filter((job) => job.status === 'in_progress');

  return (
    <Panel title="Active Jobs" description="In-progress jobs only — no invented activity">
      <div className="exec-active-jobs">
        {isLoading ? (
          <DashboardSectionSkeleton rows={3} />
        ) : error ? (
          <EmptyState
            title="Unable To Load Active Jobs"
            description={error}
            action={
              onRetry ? (
                <Button size="sm" variant="secondary" onClick={onRetry}>
                  Retry
                </Button>
              ) : undefined
            }
          />
        ) : activeJobs.length === 0 ? (
          <EmptyState
            title="No Active Jobs Right Now"
            description="Jobs move here when technicians start work. TITAN will not invent active jobs."
            action={
              <Link href="/scheduling">
                <Button size="sm" variant="secondary">
                  Open schedule
                </Button>
              </Link>
            }
          />
        ) : (
          <ul className="exec-live-ops">
            {activeJobs.map((job) => (
              <li key={job.id} className="exec-live-ops__card exec-active-jobs__card">
                <div className="exec-live-ops__head">
                  <Link href={`/jobs/${job.id}`}>
                    <strong>
                      {job.jobNumber ? `${job.jobNumber} · ` : ''}
                      {job.title}
                    </strong>
                  </Link>
                  <StatusBadge
                    tone={job.isDelayed ? 'warning' : 'info'}
                    label={job.isDelayed ? 'Delayed' : 'In progress'}
                  />
                </div>
                <p className="exec-live-ops__meta">
                  <span>{job.customerName}</span>
                  {job.suburb ? <span> · {job.suburb}</span> : null}
                  <span> · {job.technicianName ?? 'Unassigned'}</span>
                </p>
                <div className="exec-active-jobs__metrics">
                  <span>
                    <em>ETA</em> {job.etaAt ? formatTime(job.etaAt) : 'Unavailable'}
                  </span>
                  <span>
                    <em>On site</em> {formatTimeOnSite(job.timeOnSiteStartedAt)}
                  </span>
                  {job.nextJobTitle ? (
                    <span>
                      <em>Next</em> {job.nextJobTitle}
                    </span>
                  ) : null}
                </div>
                <Link href={`/jobs/${job.id}`} className="exec-live-ops__job360">
                  Open Job 360
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
