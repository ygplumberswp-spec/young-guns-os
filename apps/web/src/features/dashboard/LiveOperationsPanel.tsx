import { Link } from 'wouter';
import type { ExecutiveLiveJob } from '@titan/shared';
import {
  deriveFleetPositionHealth,
  formatFleetConnectionDisplayLabel,
  formatFleetPositionHealthLabel,
} from '@titan/shared';
import { Button, EmptyState, Panel } from '@titan/ui';
import { StatusBadge } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { useCartrackLivePositions } from '../dispatch/useCartrackLivePositions';
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

function formatRelativeTime(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  if (deltaMs < 60_000) return 'Just now';
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function LiveOperationsPanel({
  jobs,
  isLoading = false,
  error = null,
  onRetry,
}: LiveOperationsPanelProps) {
  const { accessToken } = useAuth();
  const { tracking, isPolling, lastFetchedAt, error: fleetError, isStale } = useCartrackLivePositions({
    accessToken,
    enabled: Boolean(accessToken),
  });

  return (
    <Panel title="Live operations" description="Dispatch jobs and Cartrack GPS — no invented positions">
      <div className="exec-live-ops-fleet">
        {!tracking ? (
          fleetError ? (
            <EmptyState
              title="Live GPS unavailable"
              description={fleetError}
              action={
                <Link href="/integrations/cartrack">
                  <Button size="sm" variant="secondary">
                    Open Cartrack settings
                  </Button>
                </Link>
              }
            />
          ) : (
            <p className="page-muted">Loading Cartrack connection state…</p>
          )
        ) : !tracking.cartrackConnected && tracking.latestPositions.length === 0 ? (
          <EmptyState
            title="Live map unavailable"
            description="Google Maps is not connected in TITAN yet. Cartrack is not connected or has no stored GPS, so TITAN will not invent a live map or vehicle positions."
            action={
              <Link href="/integrations/cartrack">
                <Button size="sm" variant="secondary">
                  Open Cartrack settings
                </Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="exec-live-ops-fleet__meta">
              <span
                className={`status-pill status-pill--${
                  tracking.connectionDisplayState === 'connected'
                    ? 'success'
                    : tracking.connectionDisplayState === 'stale' ||
                        tracking.connectionDisplayState === 'degraded'
                      ? 'warning'
                      : 'disabled'
                }`}
              >
                {formatFleetConnectionDisplayLabel(tracking.connectionDisplayState)}
              </span>
              <span className="page-muted">
                {tracking.livePollingAllowed
                  ? isPolling
                    ? 'Refreshing live GPS…'
                    : lastFetchedAt
                      ? `Updated ${formatRelativeTime(lastFetchedAt)}`
                      : 'Waiting for GPS'
                  : 'Live polling disabled — showing last stored Cartrack positions only'}
              </span>
              <Link href="/fleet" className="jobs-link">
                View full dispatch
              </Link>
            </div>
            {fleetError ? <p className="form-error">{fleetError}</p> : null}
            {tracking.lastError ? <p className="form-error">{tracking.lastError}</p> : null}
            {tracking.latestPositions.length === 0 ? (
              <p className="page-muted">
                No GPS positions stored yet. Run a Cartrack sync to populate mapped vehicles — TITAN
                will not invent coordinates.
              </p>
            ) : (
              <ul className="exec-live-ops-fleet__list">
                {tracking.latestPositions.slice(0, 8).map((position) => {
                  const health = deriveFleetPositionHealth({
                    cartrackConnected: tracking.cartrackConnected,
                    recordedAt: position.recordedAt,
                  });
                  return (
                    <li
                      key={`${position.externalVehicleId}-${position.recordedAt}`}
                      className="exec-live-ops-fleet__item"
                    >
                      <div className="exec-live-ops-fleet__head">
                        <strong>{position.vehicleName ?? position.licensePlate ?? 'Vehicle'}</strong>
                        <StatusBadge
                          tone={health === 'live' ? 'success' : 'warning'}
                          label={formatFleetPositionHealthLabel(health)}
                        />
                      </div>
                      <p className="exec-live-ops__meta">
                        {position.latitude.toFixed(5)}, {position.longitude.toFixed(5)}
                        {position.driverName || position.assignedUserName
                          ? ` · ${position.driverName || position.assignedUserName}`
                          : ''}
                      </p>
                      <p className="exec-live-ops__times">
                        {new Date(position.recordedAt).toLocaleString()}
                        {isStale(position.recordedAt)
                          ? ` · ${formatRelativeTime(position.recordedAt)}`
                          : ''}
                        {position.speedKmh != null ? ` · ${Math.round(position.speedKmh)} km/h` : ''}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="page-muted exec-live-ops-fleet__note">
              Google Maps tiles are not implemented. Coordinates above are real Cartrack GPS only.
            </p>
          </>
        )}
      </div>

      <h3 className="exec-live-ops-jobs-title">Active jobs</h3>
      {(() => {
        const activeJobs = jobs.filter((job) => job.status === 'in_progress');
        if (isLoading) return <DashboardSectionSkeleton rows={3} />;
        if (error) {
          return (
            <EmptyState
              title="Unable to load active jobs"
              description={error}
              action={
                onRetry ? (
                  <Button size="sm" variant="secondary" onClick={onRetry}>
                    Retry
                  </Button>
                ) : undefined
              }
            />
          );
        }
        if (activeJobs.length === 0) {
          return (
            <EmptyState
              title="No jobs in progress"
              description="Jobs move here when technicians start work. TITAN will not invent active jobs."
              action={
                <Link href="/scheduling">
                  <Button size="sm" variant="secondary">
                    Open schedule
                  </Button>
                </Link>
              }
            />
          );
        }
        return (
          <ul className="exec-live-ops">
            {activeJobs.map((job) => (
              <li key={job.id} className="exec-live-ops__card">
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
                  {job.customerName}
                  {job.suburb ? ` · ${job.suburb}` : ''}
                  {job.technicianName ? ` · ${job.technicianName}` : ' · Unassigned'}
                </p>
                <p className="exec-live-ops__times">
                  {formatTime(job.scheduledAt)}
                  {job.scheduledEndAt ? ` – ${formatTime(job.scheduledEndAt)}` : ''}
                </p>
                <Link href={`/jobs/${job.id}`} className="exec-live-ops__job360">
                  Open Job 360
                </Link>
              </li>
            ))}
          </ul>
        );
      })()}
    </Panel>
  );
}
