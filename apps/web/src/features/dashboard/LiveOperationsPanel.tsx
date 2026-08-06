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
  formatVehicleMotionLabel,
  formatVehiclePositionFreshness,
} from '@titan/shared';
import { Button, EmptyState, Panel } from '@titan/ui';
import { GoogleMapView, type MapMarker } from '../maps/GoogleMapView';
import { DashboardDetailsDisclosure } from './DashboardDetailsDisclosure';
import { DashboardFreshnessFooter } from './DashboardFreshnessFooter';
import { DashboardSourceMeta } from './DashboardSourceMeta';
import { resolveFleetCardHonesty } from './dashboard-honesty';
import {
  FLEET_LIVE_UNAVAILABLE_NOTE,
  FLEET_SHOWING_STORED_POSITIONS_NOTE,
  FLEET_UPDATED_RECENTLY_LABEL,
  buildFleetMapDisclosureLines,
  fleetMapHasLiveDegradation,
  fleetMapShowsStoredPositions,
} from './fleet-dashboard-copy';
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

/** Owner-visible map freshness — position age without provider diagnostics. */
function mapVisibleFreshnessLabel(tracking: FleetTrackingContext | null): string {
  if (!tracking?.cartrackConnected) return FLEET_UPDATED_RECENTLY_LABEL;
  const newest = tracking.latestPositions.reduce<string | null>((latest, position) => {
    if (!latest) return position.recordedAt;
    return new Date(position.recordedAt) > new Date(latest) ? position.recordedAt : latest;
  }, null);
  if (!newest) return FLEET_UPDATED_RECENTLY_LABEL;
  const label = formatVehiclePositionFreshness(newest);
  return label.startsWith('Updated') ? label : FLEET_UPDATED_RECENTLY_LABEL;
}

export function LiveOperationsPanel({
  jobs,
  tracking,
  lastFetchedAt = null,
  isPolling: _isPolling = false,
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

  const hasStoredPositions = fleetMapShowsStoredPositions(tracking);
  const showMapSurface = hasStoredPositions || mapMarkers.length > 0;
  const liveDegraded = fleetMapHasLiveDegradation({
    tracking,
    fleetError,
    opsFreshness,
  });
  const honesty = resolveFleetCardHonesty({
    hasTracking: Boolean(tracking),
    cartrackConnected: Boolean(tracking?.cartrackConnected),
    connectionDisplayState: tracking?.connectionDisplayState ?? null,
    hasStoredPositions,
    error: null,
  });
  const disclosureLines = buildFleetMapDisclosureLines({
    tracking,
    opsSources,
    opsFreshness,
    hasStoredPositions,
  });

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
          <>
            {hasStoredPositions && liveDegraded ? (
              <p className="exec-live-ops-panel__calm-note">{FLEET_SHOWING_STORED_POSITIONS_NOTE}</p>
            ) : null}
            {liveDegraded && !hasStoredPositions ? (
              <p className="exec-live-ops-panel__calm-note">{FLEET_LIVE_UNAVAILABLE_NOTE}</p>
            ) : null}
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
          </>
        ) : (
          <EmptyState
            title="Live Map Unavailable"
            description={`${FLEET_LIVE_UNAVAILABLE_NOTE} TITAN will not invent a live map.`}
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
          state={honesty.state === 'partial' ? 'live' : honesty.state}
          label={mapVisibleFreshnessLabel(tracking)}
        />
        <DashboardDetailsDisclosure>
          {disclosureLines.map((line) => (
            <p key={line} className="exec-source-meta">
              {line}
            </p>
          ))}
          <DashboardSourceMeta
            source="Cartrack · Fleet tracking"
            updatedAt={lastFetchedAt}
            state={honesty.state === 'partial' ? 'live' : honesty.state}
            href="/fleet"
            linkLabel="Open fleet"
            note={
              honesty.state === 'partial'
                ? FLEET_SHOWING_STORED_POSITIONS_NOTE
                : honesty.note
            }
          />
        </DashboardDetailsDisclosure>
      </div>
    </Panel>
  );
}
