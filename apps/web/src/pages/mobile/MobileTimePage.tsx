import { useEffect, useMemo, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { Button, PageHeader, Panel } from '@titan/ui';
import type { JobSummary } from '@titan/shared';
import {
  MobileApiClientError,
  createMobileTimeEntry,
  fetchMobileTimeEntries,
  fetchMobileWorkforceJobs,
} from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';

function formatJobOption(job: JobSummary): string {
  return job.jobNumber ? `${job.jobNumber} · ${job.title}` : job.title;
}

function formatEntryJobLabel(entry: {
  jobNumber: string | null;
  jobTitle: string | null;
}): string | null {
  if (entry.jobNumber && entry.jobTitle) return `${entry.jobNumber} · ${entry.jobTitle}`;
  return entry.jobNumber ?? entry.jobTitle;
}

export function MobileTimePage() {
  const { accessToken } = useAuth();
  const search = useSearch();
  const preselectedJobId = useMemo(() => new URLSearchParams(search).get('jobId'), [search]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const jobsQuery = useStaffCachedQuery({
    queryKey: 'mobile/workforce-jobs',
    enabled: Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: async () => fetchMobileWorkforceJobs(accessToken!),
  });

  const entriesQuery = useStaffCachedQuery({
    queryKey: 'mobile/time-entries',
    enabled: Boolean(accessToken),
    staleTimeMs: 20_000,
    fetcher: async () => fetchMobileTimeEntries(accessToken!),
  });

  const jobs = jobsQuery.data?.jobs ?? [];
  const entries = entriesQuery.data ?? [];
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;

  useEffect(() => {
    if (jobs.length === 0) {
      setSelectedJobId('');
      return;
    }

    if (preselectedJobId && jobs.some((job) => job.id === preselectedJobId)) {
      setSelectedJobId(preselectedJobId);
      return;
    }

    setSelectedJobId((current) =>
      current && jobs.some((job) => job.id === current) ? current : (jobs[0]?.id ?? ''),
    );
  }, [jobs, preselectedJobId]);

  async function handleShiftClock(action: 'clock_in' | 'clock_out') {
    if (!accessToken) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await createMobileTimeEntry(accessToken, { entryType: action });
      await entriesQuery.refetch();
    } catch (err) {
      setActionError(
        err instanceof MobileApiClientError ? err.message : 'Unable to record time entry',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleJobTime() {
    if (!accessToken || !selectedJobId) {
      setActionError('Select a job before logging on-site time');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      await createMobileTimeEntry(accessToken, {
        entryType: 'job_time',
        jobId: selectedJobId,
        notes: 'On-site labour',
      });
      await entriesQuery.refetch();
    } catch (err) {
      setActionError(
        err instanceof MobileApiClientError ? err.message : 'Unable to record job time',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="portal-page">
      <PageHeader
        title="Time & attendance"
        description="Pick a job for on-site labour, or clock in/out for shift time."
      />

      <Panel title="Job-scoped labour">
        {jobsQuery.isLoading ? (
          <p className="page-muted">Loading assigned jobs…</p>
        ) : jobs.length === 0 ? (
          <p className="page-muted">
            No assigned jobs yet. Open a job from{' '}
            <Link href="/mobile/jobs" className="jobs-link">
              My jobs
            </Link>{' '}
            to log on-site time there.
          </p>
        ) : (
          <>
            <label className="titan-input-group">
              <span className="titan-input-label">Job</span>
              <select
                className="titan-input"
                value={selectedJobId}
                onChange={(event) => setSelectedJobId(event.target.value)}
              >
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {formatJobOption(job)}
                  </option>
                ))}
              </select>
            </label>
            {selectedJob ? (
              <p className="page-muted" style={{ marginTop: '0.5rem' }}>
                {selectedJob.customerName}
                {selectedJob.addressDisplay ? ` · ${selectedJob.addressDisplay}` : ''}
              </p>
            ) : null}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <Button disabled={isSubmitting || !selectedJobId} onClick={() => void handleJobTime()}>
                Log on-site time
              </Button>
              {selectedJobId ? (
                <Link href={`/mobile/jobs/${selectedJobId}`}>
                  <Button variant="secondary">Open job</Button>
                </Link>
              ) : null}
            </div>
          </>
        )}
      </Panel>

      <Panel title="Shift clock">
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button disabled={isSubmitting} onClick={() => void handleShiftClock('clock_in')}>
            Clock in
          </Button>
          <Button
            variant="secondary"
            disabled={isSubmitting}
            onClick={() => void handleShiftClock('clock_out')}
          >
            Clock out
          </Button>
        </div>
      </Panel>

      {actionError ? <p className="form-error">{actionError}</p> : null}

      <AnalyticsTabPanel
        isLoading={entriesQuery.isLoading}
        error={entriesQuery.error}
        hasData={entriesQuery.data !== undefined}
        isEmpty={entriesQuery.data !== undefined && entries.length === 0}
        emptyTitle="No time entries"
        emptyDescription="Log on-site time against a job or clock in to start recording shift time."
        loadingLabel="Loading time entries…"
        onRetry={() => void entriesQuery.refetch()}
      >
        {entries.length > 0 ? (
          <Panel title="Time entries">
            <ul className="portal-list">
              {entries.map((entry) => {
                const jobLabel = formatEntryJobLabel(entry);
                return (
                  <li key={entry.id}>
                    <strong>{entry.entryType.replace(/_/g, ' ')}</strong>
                    <span>
                      {new Date(entry.startedAt).toLocaleString()}
                      {entry.durationMinutes ? ` · ${entry.durationMinutes} min` : ''}
                      {jobLabel ? ` · ${jobLabel}` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ) : null}
      </AnalyticsTabPanel>
    </div>
  );
}
