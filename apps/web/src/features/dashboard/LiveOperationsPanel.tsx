import { useMemo } from 'react';
import { Link } from 'wouter';
import type { ExecutiveLiveJob, OpsLiveStrip } from '@titan/shared';
import {
  deriveFleetPositionHealth,
  formatFleetConnectionDisplayLabel,
  formatFleetPositionHealthLabel,
} from '@titan/shared';
import { Button, EmptyState, Panel } from '@titan/ui';
import { StatusBadge } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { useCartrackLivePositions } from '../dispatch/useCartrackLivePositions';
import { GoogleMapView, type MapMarker } from '../maps/GoogleMapView';
import {
  createLiveOpsExtensionContext,
  renderLiveOpsFutureSections,
  type LiveOpsFutureModules,
} from './live-operations-extensions';
import { DashboardSourceMeta } from './DashboardSourceMeta';
import type { DashboardDataState } from './dashboard-honesty';
import { OpsIntelligenceLiveStrip } from './OpsIntelligenceLiveStrip';

type LiveOperationsPanelProps = {
  jobs: ExecutiveLiveJob[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  opsStrip?: OpsLiveStrip | null;
  opsStripLoading?: boolean;
  opsStripError?: string | null;
  /** Typed seams for cameras / route playback / driver events — not rendered until enabled. */
  futureModules?: LiveOpsFutureModules;
};

function formatRelativeTime(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  if (deltaMs < 60_000) return 'Just now';
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function vehicleMotionLabel(speedKmh: number | null, ignitionOn: boolean | null): string {
  if (speedKmh != null && speedKmh >= 3) return 'Moving';
  if (ignitionOn === false) return 'Ignition off';
  if (speedKmh != null && speedKmh < 3) return 'Idle';
  return 'Status unknown';
}

export function LiveOperationsPanel({
  jobs,
  opsStrip = null,
  opsStripLoading = false,
  opsStripError = null,
  futureModules,
}: LiveOperationsPanelProps) {
  const { accessToken } = useAuth();
  const { tracking, isPolling, lastFetchedAt, error: fleetError, isStale } = useCartrackLivePositions({
    accessToken,
    enabled: Boolean(accessToken),
  });

  const liveOpsExtensions = useMemo(
    () => createLiveOpsExtensionContext(futureModules),
    [futureModules],
  );

  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status === 'in_progress'),
    [jobs],
  );

  const jobsByTechnician = useMemo(() => {
    const map = new Map<string, ExecutiveLiveJob[]>();
    for (const job of activeJobs) {
      const key = (job.technicianName ?? '').trim().toLowerCase();
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(job);
      map.set(key, list);
    }
    return map;
  }, [activeJobs]);

  const mapMarkers = useMemo(() => {
    const markers: MapMarker[] = [];

    for (const position of tracking?.latestPositions ?? []) {
      if (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) continue;
      const techKey = (position.assignedUserName || position.driverName || '')
        .trim()
        .toLowerCase();
      const linked = techKey ? jobsByTechnician.get(techKey)?.[0] : undefined;
      const motion = vehicleMotionLabel(position.speedKmh, position.ignitionOn);
      const parts = [
        position.vehicleName ?? position.licensePlate ?? 'Vehicle',
        motion,
        linked ? `Job: ${linked.jobNumber ?? linked.title}` : null,
        linked?.nextJobTitle ? `Next: ${linked.nextJobTitle}` : null,
      ].filter(Boolean);
      markers.push({
        id: `vehicle-${position.externalVehicleId}`,
        latitude: position.latitude,
        longitude: position.longitude,
        label: parts.join(' · '),
        tone: 'vehicle',
      });
    }

    for (const job of jobs) {
      if (job.latitude == null || job.longitude == null) continue;
      if (!Number.isFinite(job.latitude) || !Number.isFinite(job.longitude)) continue;
      markers.push({
        id: `job-${job.id}`,
        latitude: job.latitude,
        longitude: job.longitude,
        label: [
          job.customerName,
          job.jobNumber ?? job.title,
          job.technicianName ? `Tech: ${job.technicianName}` : null,
          job.etaAt ? `ETA ${new Date(job.etaAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        tone: job.status === 'in_progress' ? 'job' : 'customer',
      });
    }

    return markers.slice(0, 24);
  }, [tracking?.latestPositions, jobs, jobsByTechnician]);

  const hasStoredPositions = (tracking?.latestPositions.length ?? 0) > 0;
  const showMapSurface = hasStoredPositions || mapMarkers.length > 0;

  const { state: fleetState, note: fleetNote } = ((): {
    state: DashboardDataState;
    note: string | null;
  } => {
    if (!tracking) {
      return fleetError
        ? { state: 'unavailable', note: fleetError }
        : { state: 'unavailable', note: 'Cartrack connection state is still loading.' };
    }
    if (!tracking.cartrackConnected) {
      return {
        state: 'disconnected',
        note: 'Cartrack is not connected — TITAN will not invent vehicle positions.',
      };
    }
    if (
      tracking.connectionDisplayState === 'stale' ||
      tracking.connectionDisplayState === 'degraded'
    ) {
      return {
        state: 'partial',
        note: 'Cartrack feed is stale — positions shown are the last stored fix.',
      };
    }
    if (!hasStoredPositions) {
      return { state: 'needs_setup', note: 'No GPS positions stored yet — run a Cartrack sync.' };
    }
    return { state: 'live', note: null };
  })();

  return (
    <Panel title="Live Operations" description="Cartrack GPS and verified job sites — no invented positions">
      <div className="exec-live-ops-panel">
        <OpsIntelligenceLiveStrip
          strip={opsStrip}
          isLoading={opsStripLoading}
          error={opsStripError}
        />

        <div className="exec-live-ops-fleet">
          {showMapSurface ? (
            <div className="exec-live-ops-map">
              <GoogleMapView
                markers={mapMarkers}
                cameraContextKey="live-ops"
                height={320}
                emptyTitle="Google Maps Unavailable"
                emptyDescription="Cartrack positions or verified job coordinates exist, but Google Maps browser key is not configured. TITAN will not invent a map."
              />
            </div>
          ) : null}

          {renderLiveOpsFutureSections(liveOpsExtensions)}

          {!tracking ? (
            fleetError ? (
              <EmptyState
                title="Live GPS Unavailable"
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
              title="Live Map Unavailable"
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
                    const techKey = (position.assignedUserName || position.driverName || '')
                      .trim()
                      .toLowerCase();
                    const linked = techKey ? jobsByTechnician.get(techKey)?.[0] : undefined;
                    const motion = vehicleMotionLabel(position.speedKmh, position.ignitionOn);
                    return (
                      <li
                        key={`${position.externalVehicleId}-${position.recordedAt}`}
                        className="exec-live-ops-fleet__item"
                      >
                        <div className="exec-live-ops-fleet__head">
                          <strong>
                            {position.vehicleName ?? position.licensePlate ?? 'Vehicle'}
                          </strong>
                          <StatusBadge
                            tone={health === 'live' ? 'success' : 'warning'}
                            label={formatFleetPositionHealthLabel(health)}
                          />
                        </div>
                        <p className="exec-live-ops__meta">
                          {motion}
                          {position.driverName || position.assignedUserName
                            ? ` · ${position.driverName || position.assignedUserName}`
                            : ''}
                          {linked
                            ? ` · Current: ${linked.jobNumber ?? linked.title}`
                            : ''}
                          {linked?.nextJobTitle ? ` · Next: ${linked.nextJobTitle}` : ''}
                        </p>
                        <p className="exec-live-ops__times">
                          {position.latitude.toFixed(5)}, {position.longitude.toFixed(5)}
                          {` · ${new Date(position.recordedAt).toLocaleString()}`}
                          {isStale(position.recordedAt)
                            ? ` · ${formatRelativeTime(position.recordedAt)}`
                            : ''}
                          {position.speedKmh != null
                            ? ` · ${Math.round(position.speedKmh)} km/h`
                            : ''}
                        </p>
                        {linked ? (
                          <Link href={`/jobs/${linked.id}`} className="exec-live-ops__job360">
                            Open Job 360
                          </Link>
                        ) : (
                          <Link href="/fleet" className="exec-live-ops__job360">
                            View on map
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {!showMapSurface ? (
                <p className="page-muted exec-live-ops-fleet__note">
                  Google Maps tiles are unavailable. Coordinates above are real Cartrack GPS only.
                </p>
              ) : null}
            </>
          )}
          <DashboardSourceMeta
            source="Cartrack GPS positions · Jobs"
            updatedAt={lastFetchedAt}
            state={fleetState}
            href="/fleet"
            linkLabel="Open fleet"
            note={fleetNote}
          />
        </div>
      </div>
    </Panel>
  );
}
