import { useMemo } from 'react';
import { Link } from 'wouter';
import type {
  ExecutiveLiveJob,
  FleetTrackingContext,
  OpsLiveStrip,
  OpsSnapshotFreshness,
  OpsSourceState,
} from '@titan/shared';
import {
  CARTRACK_SLOW_SNAPSHOT_BANNER,
  formatFleetConnectionDisplayLabel,
  formatVehicleMotionLabel,
  formatVehiclePositionFreshness,
} from '@titan/shared';
import { mapFleetConnectionDisplayToEnterpriseLabel } from '../integrations/enterprise-overview-status';
import { Button, EmptyState, Panel } from '@titan/ui';
import { GoogleMapView, type MapMarker } from '../maps/GoogleMapView';
import { DashboardDetailsDisclosure } from './DashboardDetailsDisclosure';
import { DashboardFreshnessFooter } from './DashboardFreshnessFooter';
import { DashboardSourceMeta } from './DashboardSourceMeta';
import { resolveFleetCardHonesty } from './dashboard-honesty';
import {
  createLiveOpsExtensionContext,
  renderLiveOpsFutureSections,
  type LiveOpsFutureModules,
} from './live-operations-extensions';
import { OpsIntelligenceLiveStrip } from './OpsIntelligenceLiveStrip';

type LiveOperationsPanelProps = {
  jobs: ExecutiveLiveJob[];
  tracking: FleetTrackingContext | null;
  lastFetchedAt?: string | null;
  isPolling?: boolean;
  fleetError?: string | null;
  opsStrip?: OpsLiveStrip | null;
  opsStripLoading?: boolean;
  opsStripError?: string | null;
  opsFreshness?: OpsSnapshotFreshness | null;
  opsAgeSeconds?: number;
  opsRefreshing?: boolean;
  opsDataAvailable?: boolean;
  opsSources?: OpsSourceState[];
  /** Typed seams for cameras / route playback / driver events — not rendered until enabled. */
  futureModules?: LiveOpsFutureModules;
};

/**
 * Owner-visible map freshness — position age only, without provider diagnostics.
 */
function mapVisibleFreshnessLabel(tracking: FleetTrackingContext | null): string {
  if (!tracking?.cartrackConnected) return 'Updated recently';
  const newest = tracking.latestPositions.reduce<string | null>((latest, position) => {
    if (!latest) return position.recordedAt;
    return new Date(position.recordedAt) > new Date(latest) ? position.recordedAt : latest;
  }, null);
  if (!newest) return 'Updated recently';
  return formatVehiclePositionFreshness(newest);
}

/**
 * Full Cartrack provenance for the details disclosure — includes connection and sync context.
 */
function mapFooterLabel(
  tracking: FleetTrackingContext | null,
  isPolling: boolean,
): string {
  if (!tracking) return 'Waiting for Cartrack connection state';
  if (!tracking.cartrackConnected) return 'Cartrack not connected · no live positions';

  const newest = tracking.latestPositions.reduce<string | null>((latest, position) => {
    if (!latest) return position.recordedAt;
    return new Date(position.recordedAt) > new Date(latest) ? position.recordedAt : latest;
  }, null);

  if (!newest) return 'No stored positions · Cartrack';
  const age = formatVehiclePositionFreshness(newest);
  const stale =
    tracking.connectionDisplayState === 'stale' || tracking.connectionDisplayState === 'degraded';
  if (stale) return `${age} · Stale position`;
  if (isPolling) return `${age} · Refreshing from Cartrack`;
  return `${age} · Cartrack`;
}

export function LiveOperationsPanel({
  jobs,
  tracking,
  lastFetchedAt = null,
  isPolling = false,
  fleetError = null,
  opsStrip = null,
  opsStripLoading = false,
  opsStripError = null,
  opsFreshness = null,
  opsAgeSeconds = 0,
  opsRefreshing = false,
  opsDataAvailable = true,
  opsSources = [],
  futureModules,
}: LiveOperationsPanelProps) {
  const liveOpsExtensions = useMemo(
    () => createLiveOpsExtensionContext(futureModules),
    [futureModules],
  );

  const activeJobs = useMemo(() => jobs.filter((job) => job.status === 'in_progress'), [jobs]);

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
      const parts = [
        position.licensePlate ?? position.vehicleName ?? 'Vehicle',
        formatVehicleMotionLabel(position.speedKmh),
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
          job.etaAt
            ? `ETA ${new Date(job.etaAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : null,
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
  const honesty = resolveFleetCardHonesty({
    hasTracking: Boolean(tracking),
    cartrackConnected: Boolean(tracking?.cartrackConnected),
    connectionDisplayState: tracking?.connectionDisplayState ?? null,
    hasStoredPositions,
    error: fleetError ?? null,
  });
  const cachedSnapshotNote = tracking?.providerRefresh?.showingCachedSnapshot
    ? [
        CARTRACK_SLOW_SNAPSHOT_BANNER,
        tracking.providerRefresh.failedEndpoint
          ? `Failed endpoint: ${tracking.providerRefresh.failedEndpoint}.`
          : null,
        tracking.providerRefresh.timeoutMessage ?? null,
      ]
        .filter(Boolean)
        .join(' ')
    : null;

  return (
    <Panel
      title="Live Fleet Map"
      description="Cartrack GPS and verified job sites — no invented positions"
      headerAction={<Link href="/fleet">Open fleet</Link>}
    >
      <div className="exec-live-ops-panel">
        <OpsIntelligenceLiveStrip
          strip={opsStrip}
          isLoading={opsStripLoading}
          error={opsStripError}
          freshness={opsFreshness}
          ageSeconds={opsAgeSeconds}
          refreshing={opsRefreshing}
          dataAvailable={opsDataAvailable}
          sources={opsSources}
        />

        {showMapSurface ? (
          <div className="exec-live-ops-map">
            <GoogleMapView
              markers={mapMarkers}
              cameraContextKey="live-ops"
              height="100%"
              allowFullscreen
              emptyTitle="Google Maps Unavailable"
              emptyDescription="Cartrack positions or verified job coordinates exist, but Google Maps browser key is not configured. TITAN will not invent a map."
            />
          </div>
        ) : (
          <EmptyState
            title="Live Map Unavailable"
            description={
              fleetError ??
              'Cartrack has no stored GPS and no job has verified coordinates, so TITAN will not invent a live map.'
            }
            action={
              <Link href="/integrations/cartrack">
                <Button size="sm" variant="secondary">
                  Open Cartrack settings
                </Button>
              </Link>
            }
          />
        )}

        {renderLiveOpsFutureSections(liveOpsExtensions)}

        <DashboardFreshnessFooter
          updatedAt={lastFetchedAt}
          state={honesty.state}
          label={mapVisibleFreshnessLabel(tracking)}
        />
        <DashboardDetailsDisclosure>
          {cachedSnapshotNote ? <p className="exec-source-meta">{cachedSnapshotNote}</p> : null}
          {fleetError ? <p className="exec-source-meta">{fleetError}</p> : null}
          {tracking?.lastError && !tracking.providerRefresh?.showingCachedSnapshot ? (
            <p className="exec-source-meta">{tracking.lastError}</p>
          ) : null}
          <p className="exec-source-meta">{mapFooterLabel(tracking, isPolling)}</p>
          {tracking && !tracking.livePollingAllowed ? (
            <p className="exec-source-meta">
              Live polling disabled — showing the last stored positions
            </p>
          ) : null}
          {tracking ? (
            <p className="exec-source-meta">
              {mapFleetConnectionDisplayToEnterpriseLabel(
                formatFleetConnectionDisplayLabel(tracking.connectionDisplayState),
              )}
              {lastFetchedAt ? ' · TITAN refreshed just now' : ''}
            </p>
          ) : null}
          <DashboardSourceMeta
            source={
              tracking
                ? `Cartrack · ${mapFleetConnectionDisplayToEnterpriseLabel(formatFleetConnectionDisplayLabel(tracking.connectionDisplayState))}`
                : 'Cartrack'
            }
            updatedAt={lastFetchedAt}
            state={honesty.state}
            href="/fleet"
            linkLabel="Open fleet"
            note={honesty.note}
          />
        </DashboardDetailsDisclosure>
      </div>
    </Panel>
  );
}
