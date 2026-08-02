import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  DispatchEmergencyAssessmentSummary,
  DispatchOperationsDashboard,
  JobSummary,
} from '@titan/shared';
import { fetchJobs } from '../../lib/jobs-api';
import {
  fetchDispatchDashboard,
  fetchEmergencyAssessments,
} from '../../lib/dispatch-intelligence-api-client';

type LiveDispatchWorkQueuesProps = {
  accessToken: string | null;
  enabled?: boolean;
};

export function LiveDispatchWorkQueues({ accessToken, enabled = true }: LiveDispatchWorkQueuesProps) {
  const [dashboard, setDashboard] = useState<DispatchOperationsDashboard | null>(null);
  const [emergencies, setEmergencies] = useState<DispatchEmergencyAssessmentSummary[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken || !enabled) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const [dashboardData, emergencyRows, jobRows] = await Promise.all([
          fetchDispatchDashboard(accessToken),
          fetchEmergencyAssessments(accessToken),
          fetchJobs(accessToken),
        ]);
        if (cancelled) return;
        setDashboard(dashboardData);
        setEmergencies(emergencyRows);
        setJobs(jobRows);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load dispatch queues');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, enabled]);

  const unassignedJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          !job.assignedUserId &&
          job.status !== 'cancelled' &&
          job.status !== 'completed',
      ),
    [jobs],
  );

  const delayedJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.status === 'scheduled' ||
          job.status === 'in_progress' ||
          (job.scheduledAt && new Date(job.scheduledAt).getTime() < Date.now()),
      ).filter((job) => {
        if (!job.scheduledAt) return false;
        const scheduledMs = new Date(job.scheduledAt).getTime();
        return scheduledMs < Date.now() && job.status !== 'completed' && job.status !== 'cancelled';
      }),
    [jobs],
  );

  if (isLoading) {
    return <Panel title="Work queues">Loading dispatch queues…</Panel>;
  }

  if (error) {
    return (
      <Panel title="Work queues">
        <p className="form-error">{error}</p>
      </Panel>
    );
  }

  return (
    <>
      {dashboard ? (
        <div className="stat-grid">
          <StatCard label="Scheduled today" value={String(dashboard.scheduledJobCount)} />
          <StatCard label="Delayed jobs" value={String(dashboard.delayedJobCount)} />
          <StatCard label="Emergency queue" value={String(dashboard.emergencyAssessmentCount)} />
          <StatCard label="Pending callbacks" value={String(dashboard.pendingCallbackCount)} />
          <StatCard label="Live technicians" value={String(dashboard.liveTechnicianCount)} />
          <StatCard label="Call queue" value={String(dashboard.callQueue.liveQueueCount)} />
        </div>
      ) : null}

      <div className="live-dispatch-queues">
        <Panel title={`Unassigned work (${unassignedJobs.length})`}>
          {unassignedJobs.length === 0 ? (
            <EmptyState
              title="No unassigned jobs"
              description="Jobs without a technician appear here for dispatch."
            />
          ) : (
            <ul className="portal-list">
              {unassignedJobs.slice(0, 12).map((job) => (
                <li key={job.id}>
                  <Link href={`/jobs/${job.id}`}>
                    <strong>
                      {job.jobNumber ? `${job.jobNumber} · ` : ''}
                      {job.title}
                    </strong>
                  </Link>
                  <span>
                    {job.customerName ?? 'Customer'}
                    {job.priority ? ` · ${job.priority}` : ''}
                    {job.addressDisplay ? ` · ${job.addressDisplay}` : ''}
                  </span>
                  <Link href="/scheduling">
                    <Button variant="ghost" size="sm">
                      Schedule
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Emergency queue (${emergencies.length})`}>
          {emergencies.length === 0 ? (
            <EmptyState
              title="No emergency assessments"
              description="Voice and dispatch intelligence emergency assessments appear here."
            />
          ) : (
            <ul className="portal-list">
              {emergencies.slice(0, 8).map((assessment) => (
                <li key={assessment.id}>
                  <strong>{assessment.emergencyType.replace(/_/g, ' ')}</strong>
                  <span>
                    Priority {assessment.priority}
                    {assessment.recommendedResponseMinutes
                      ? ` · target ${assessment.recommendedResponseMinutes} min`
                      : ''}
                  </span>
                  {assessment.jobId ? (
                    <Link href={`/jobs/${assessment.jobId}`} className="crm-link">
                      Open job
                    </Link>
                  ) : (
                    <Link href="/dispatch-intelligence" className="crm-link">
                      Review in intelligence
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Delay risk (${delayedJobs.length})`}>
          {delayedJobs.length === 0 ? (
            <p className="page-muted">No jobs currently past scheduled start time.</p>
          ) : (
            <ul className="portal-list">
              {delayedJobs.slice(0, 8).map((job) => (
                <li key={job.id}>
                  <Link href={`/jobs/${job.id}`}>
                    <strong>{job.title}</strong>
                  </Link>
                  <span>
                    Scheduled {job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : '—'}
                    {job.assignedUserName ? ` · ${job.assignedUserName}` : ' · unassigned'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Customer notification state">
          <p className="page-muted">
            Customers see private, expiring ETA on their portal job page only — never fleet-wide GPS
            or live map. Tracking activates when a technician marks en route and expires after four
            hours.
          </p>
          <ul className="portal-list">
            <li>
              <strong>Fleet live map</strong>
              <span>Staff / owner only — `/fleet/live-map` and dispatch console</span>
            </li>
            <li>
              <strong>Customer portal</strong>
              <span>
                Job-scoped ETA at `/my/jobs/:id` — no coordinates, no other vehicles
              </span>
            </li>
            <li>
              <strong>Share ETA action</strong>
              <span>Send portal link via communications — audited, not fleet-wide</span>
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
