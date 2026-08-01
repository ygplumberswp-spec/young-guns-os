import { Link } from 'wouter';
import type { ExecutiveCompletedJob } from '@titan/shared';
import { Button, EmptyState, Panel } from '@titan/ui';
import { StatusBadge } from '../../components/ux';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';

type CompletedTodayPanelProps = {
  jobs: ExecutiveCompletedJob[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

function formatCompletedTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function CompletedTodayPanel({
  jobs,
  isLoading = false,
  error = null,
  onRetry,
}: CompletedTodayPanelProps) {
  return (
    <Panel title="Completed today" description="Jobs finished today with invoice status">
      {isLoading ? (
        <DashboardSectionSkeleton rows={3} />
      ) : error ? (
        <EmptyState
          title="Unable to load completed jobs"
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
          title="No jobs completed yet today"
          description="Completed jobs will appear here as technicians finish work."
        />
      ) : (
        <ul className="exec-completed-today">
          {jobs.map((job) => (
            <li key={job.id} className="exec-completed-today__row">
              <div>
                <Link href={`/jobs/${job.id}`}>
                  <strong>
                    {job.jobNumber ? `${job.jobNumber} · ` : ''}
                    {job.title}
                  </strong>
                </Link>
                <p className="exec-completed-today__meta">
                  {job.customerName}
                  {job.technicianName ? ` · ${job.technicianName}` : ''}
                  {` · ${formatCompletedTime(job.completedAt)}`}
                </p>
              </div>
              <div className="exec-completed-today__badges">
                {job.invoiceStatus ? (
                  <StatusBadge tone="neutral" label={`Invoice: ${job.invoiceStatus}`} />
                ) : (
                  <StatusBadge tone="warning" label="No invoice" />
                )}
                {job.docsRequired ? <StatusBadge tone="warning" label="Docs required" /> : null}
                {job.cocRequired ? <StatusBadge tone="warning" label="COC required" /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
