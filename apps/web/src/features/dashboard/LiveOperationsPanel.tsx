import { Link } from 'wouter';
import type { ExecutiveLiveJob } from '@titan/shared';
import { Button, EmptyState, Panel } from '@titan/ui';
import { StatusBadge } from '../../components/ux';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';

type LiveOperationsPanelProps = {
  jobs: ExecutiveLiveJob[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function LiveOperationsPanel({
  jobs,
  isLoading = false,
  error = null,
  onRetry,
}: LiveOperationsPanelProps) {
  return (
    <Panel title="Live operations" description="Current jobs from dispatch and scheduling">
      {isLoading ? (
        <DashboardSectionSkeleton rows={4} />
      ) : error ? (
        <EmptyState
          title="Unable to load live operations"
          description={error}
          action={
            onRetry ? (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                Retry
              </Button>
            ) : undefined
          }
        />
      ) : jobs.length === 0 ? (
        <EmptyState
          title="No active jobs right now"
          description="Scheduled and in-progress jobs will appear here throughout the day."
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
          {jobs.map((job) => (
            <li key={job.id} className="exec-live-ops__card">
              <div className="exec-live-ops__head">
                <Link href={`/jobs/${job.id}`}>
                  <strong>
                    {job.jobNumber ? `${job.jobNumber} · ` : ''}
                    {job.title}
                  </strong>
                </Link>
                <StatusBadge
                  tone={job.isDelayed ? 'warning' : job.status === 'in_progress' ? 'info' : 'neutral'}
                  label={job.isDelayed ? 'Delayed' : job.status.replace(/_/g, ' ')}
                />
              </div>
              <p className="exec-live-ops__meta">
                {job.customerName}
                {job.suburb ? ` · ${job.suburb}` : ''}
                {job.technicianName ? ` · ${job.technicianName}` : ''}
              </p>
              <p className="exec-live-ops__times">
                {formatTime(job.scheduledAt)}
                {job.scheduledEndAt ? ` – ${formatTime(job.scheduledEndAt)}` : ''}
                {job.nextJobTitle ? ` · Next: ${job.nextJobTitle}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
