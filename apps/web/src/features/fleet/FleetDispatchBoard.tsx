import { Link } from 'wouter';
import { Button, EmptyState, LoadingState, Panel } from '@titan/ui';
import {
  formatMapsEtaCapabilityLabel,
  buildGoogleMapsNavigateUrl,
  type MapsEtaCapabilityState,
} from '@titan/shared';
import { fetchTodaysJobs } from '../../lib/jobs-api';
import { fetchVehicles } from '../../lib/fleet-api';
import { fetchGoogleMapsConnection } from '../../lib/google-maps-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { LiveDispatchPositionsPanel } from '../dispatch/LiveDispatchPositionsPanel';
import { GoogleMapView } from '../maps/GoogleMapView';
import { useCartrackLivePositions } from '../dispatch/useCartrackLivePositions';
import { useMemo } from 'react';

/**
 * UX-024 / M3 FLT-001 — operational dispatch surface from stored job/vehicle data,
 * Cartrack GPS when connected, Google Maps tiles/navigate when configured.
 */
export function FleetDispatchBoard() {
  const { accessToken } = useAuth();
  const { tracking } = useCartrackLivePositions({
    accessToken,
    enabled: Boolean(accessToken),
  });

  const jobsQuery = useStaffCachedQuery({
    queryKey: 'fleet/dispatch-today-jobs',
    enabled: Boolean(accessToken),
    fetcher: async () => fetchTodaysJobs(accessToken!),
  });
  const vehiclesQuery = useStaffCachedQuery({
    queryKey: 'fleet/dispatch-vehicles',
    enabled: Boolean(accessToken),
    fetcher: async () => fetchVehicles(accessToken!),
  });
  const mapsQuery = useStaffCachedQuery({
    queryKey: 'fleet/google-maps-connection',
    enabled: Boolean(accessToken),
    fetcher: async () => fetchGoogleMapsConnection(accessToken!),
  });

  const jobs = jobsQuery.data ?? [];
  const vehicles = vehiclesQuery.data ?? [];
  const mapsConnected = Boolean(mapsQuery.data?.connected);
  const mapsState: MapsEtaCapabilityState = mapsConnected
    ? 'connected'
    : mapsQuery.data
      ? 'not_configured'
      : 'not_configured';
  const mapsLabel = formatMapsEtaCapabilityLabel(mapsState);
  const loading =
    (jobsQuery.isLoading && !jobsQuery.data) || (vehiclesQuery.isLoading && !vehiclesQuery.data);

  const mapMarkers = useMemo(
    () =>
      (tracking?.latestPositions ?? [])
        .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
        .slice(0, 16)
        .map((position) => ({
          id: `${position.externalVehicleId}-${position.recordedAt}`,
          latitude: position.latitude,
          longitude: position.longitude,
          label: position.vehicleName ?? position.licensePlate ?? 'Vehicle',
          tone: 'vehicle' as const,
        })),
    [tracking?.latestPositions],
  );

  return (
    <div className="customer-360__stack">
      <LiveDispatchPositionsPanel accessToken={accessToken} />

      <Panel
        title="Today's dispatch board"
        description="Job sites from TITAN records. Live vehicle GPS from Cartrack. Routing/navigate via Google Maps when connected."
      >
        <p className="status-pill status-pill--disabled" style={{ display: 'inline-block' }}>
          {mapsLabel}
        </p>
        <p className="page-muted" style={{ marginTop: '0.5rem' }}>
          Planned times and stored addresses are shown below. Live vehicle GPS uses Cartrack only
          when connected. Google Maps provides map tiles and navigate links when configured — TITAN
          never invents GPS, routes, or ETA.
        </p>

        {mapMarkers.length > 0 ? (
          <div style={{ marginTop: '0.75rem' }}>
            <GoogleMapView
              markers={mapMarkers}
              height={260}
              emptyTitle="Live map unavailable"
              emptyDescription="Cartrack positions exist, but Google Maps browser key is not configured."
            />
          </div>
        ) : null}

        {loading ? <LoadingState label="Loading today's dispatch…" /> : null}

        {jobsQuery.error || vehiclesQuery.error ? (
          <EmptyState
            title="Unable to load dispatch board"
            description={jobsQuery.error || vehiclesQuery.error || 'Retry to reload.'}
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void jobsQuery.refetch();
                  void vehiclesQuery.refetch();
                }}
              >
                Retry
              </Button>
            }
          />
        ) : null}

        {!loading && !jobsQuery.error ? (
          <>
            <h3 className="page-section-title" style={{ marginTop: '1rem' }}>
              Vehicles & drivers
            </h3>
            {vehicles.length === 0 ? (
              <p className="page-muted">No vehicles on file.</p>
            ) : (
              <ul className="portal-list">
                {vehicles.slice(0, 12).map((vehicle) => (
                  <li key={vehicle.id}>
                    <strong>
                      {vehicle.name} · {vehicle.licensePlate}
                    </strong>
                    <span>
                      {[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Make/model unset'}
                      {' · '}
                      {vehicle.status.replace(/_/g, ' ')}
                      {vehicle.assignedUserName
                        ? ` · driver/tech ${vehicle.assignedUserName}`
                        : ' · unassigned'}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="page-section-title" style={{ marginTop: '1rem' }}>
              Today's jobs
            </h3>
            {jobs.length === 0 ? (
              <EmptyState
                title="No jobs scheduled today"
                description="When jobs are scheduled for today with site addresses, they appear here for dispatch."
                action={
                  <Link href="/jobs/new">
                    <Button size="sm" variant="secondary">
                      Schedule job
                    </Button>
                  </Link>
                }
              />
            ) : (
              <ul className="portal-list">
                {jobs.map((job) => {
                  const navigateUrl = buildGoogleMapsNavigateUrl({
                    address: job.addressDisplay,
                  });
                  return (
                    <li key={job.id}>
                      <Link href={`/jobs/${job.id}`}>
                        <strong>
                          {job.jobNumber ? `${job.jobNumber} · ` : ''}
                          {job.title}
                        </strong>
                      </Link>
                      <span>
                        {job.customerName}
                        {job.assignedUserName ? ` · tech ${job.assignedUserName}` : ' · unassigned'}
                        {job.scheduledAt
                          ? ` · planned ${new Date(job.scheduledAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`
                          : ''}
                      </span>
                      <span>
                        {job.addressDisplay
                          ? `Site: ${job.addressDisplay}`
                          : 'Site address missing on job snapshot'}
                      </span>
                      {navigateUrl ? (
                        <a href={navigateUrl} target="_blank" rel="noreferrer">
                          {mapsConnected
                            ? 'Navigate in Google Maps'
                            : 'Open address in Maps (deep-link)'}
                        </a>
                      ) : null}
                      <Link href={`/jobs/${job.id}#property-map`}>Property map & ETA</Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : null}
      </Panel>
    </div>
  );
}
