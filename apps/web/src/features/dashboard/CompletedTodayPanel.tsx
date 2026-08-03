import { Link } from 'wouter';
import type { ExecutiveCompletedJob } from '@titan/shared';
import { Button, EmptyState, Panel } from '@titan/ui';
import { StatusBadge } from '../../components/ux';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta } from './DashboardSourceMeta';

type CompletedTodayPanelProps = {
  jobs: ExecutiveCompletedJob[];
  generatedAt?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

function formatCompletedTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function CompletedTodayPanel({
  jobs,
  generatedAt = null,
  isLoading = false,
  error = null,
  onRetry,
}: CompletedTodayPanelProps) {
  return (
    <Panel title="Completed Today" description="Jobs finished today with invoice status">
      <div className="exec-completed">
        {isLoading ? (
          <DashboardSectionSkeleton rows={3} />
        ) : error ? (
          <EmptyState
            title="Unable To Load Completed Jobs"
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
            title="No Jobs Completed Yet Today"
            description="Completed jobs will appear here as technicians finish work."
            action={
              <Link href="/jobs?status=completed">
                <Button size="sm" variant="secondary">
                  View completed jobs
                </Button>
              </Link>
            }
          />
        ) : (
          <ol className="exec-completed-today exec-completed-today--timeline">
            {jobs.map((job) => (
              <li key={job.id} className="exec-completed-today__row">
                <time className="exec-completed-today__time" dateTime={job.completedAt}>
                  {formatCompletedTime(job.completedAt)}
                </time>
                <div className="exec-completed-today__body">
                  <Link href={`/jobs/${job.id}`}>
                    <strong>
                      {job.jobNumber ? `${job.jobNumber} · ` : ''}
                      {job.title}
                    </strong>
                  </Link>
                  <p className="exec-completed-today__meta">
                    {job.customerName}
                    {job.technicianName ? ` · ${job.technicianName}` : ''}
                  </p>
                  <div className="exec-completed-today__badges">
                    {job.invoiceStatus ? (
                      <StatusBadge tone="neutral" label={`Invoice: ${job.invoiceStatus}`} />
                    ) : (
                      <StatusBadge tone="warning" label="No Invoice" />
                    )}
                    {job.docsRequired ? <StatusBadge tone="warning" label="Docs Required" /> : null}
                    {job.cocRequired ? <StatusBadge tone="warning" label="COC Required" /> : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        <DashboardSourceMeta
          source="Jobs · Invoices · Job completion snapshots"
          updatedAt={generatedAt}
          state={error ? 'unavailable' : 'live'}
          href="/jobs?status=completed"
          linkLabel="Open completed jobs"
        />
      </div>
    </Panel>
  );
}
