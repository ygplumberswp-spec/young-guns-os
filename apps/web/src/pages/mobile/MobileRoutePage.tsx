import { PageHeader } from '../../components/ux';
import { Panel, Button } from '@titan/ui';
import {
  buildAddressMapsDeepLink,
  buildVehiclePositionNavigateUrl,
  formatVehicleIgnitionLabel,
  formatVehicleMotionLabel,
  formatVehiclePositionCoordinates,
  formatVehiclePositionFreshness,
  resolveVehiclePositionAddressDisplay,
} from '@titan/shared';
import { fetchMobileRoute } from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';

/** UX-043 — route stops with stored site address + Maps deep-link; no fake live ETA. */
export function MobileRoutePage() {
  const { accessToken } = useAuth();

  const routeQuery = useStaffCachedQuery({
    queryKey: 'mobile/route',
    enabled: Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: async () => fetchMobileRoute(accessToken!),
  });

  const route = routeQuery.data;
  const nextDeepLink = buildAddressMapsDeepLink(route?.route.nextDestination?.address);

  return (
    <div className="portal-page">
      <PageHeader
        title="Route"
        description="Today's stops from assigned jobs and stored site addresses."
      />

      <AnalyticsTabPanel
        isLoading={routeQuery.isLoading}
        error={routeQuery.error}
        hasData={route !== undefined}
        isEmpty={route !== undefined && route.route.stopCount === 0}
        emptyTitle="No Route Stops"
        emptyDescription="Assigned jobs that are not completed will appear here with site addresses when available."
        loadingLabel="Loading route…"
        onRetry={() => void routeQuery.refetch()}
      >
        {route ? (
          <>
            <Panel title="Maps / ETA Capability">
              <p>
                <span className="status-pill status-pill--disabled">
                  {route.mapsCapabilityLabel}
                </span>
              </p>
              <p className="page-muted">
                ETA source:{' '}
                {route.etaSource === 'schedule_only'
                  ? 'Planned appointment time only (not live traffic routing)'
                  : 'None — no scheduled times on active stops'}
              </p>
              <p className="page-muted">
                Live tracking:{' '}
                {route.liveTrackingAvailable
                  ? 'Available from connected fleet provider'
                  : 'Unavailable — no assigned-vehicle GPS for this technician; fleet-wide tracking is blocked'}
              </p>
            </Panel>

            {route.latestGps?.isAssignedVehicle ? (
              <Panel
                title="Your Vehicle Position"
                description="Latest Cartrack position for the vehicle assigned to you."
              >
                {(() => {
                  const gps = route.latestGps!;
                  const display = resolveVehiclePositionAddressDisplay({
                    result: gps.address,
                    latitude: gps.latitude,
                    longitude: gps.longitude,
                    recordedAt: gps.recordedAt,
                    cartrackConnected: route.cartrackConnected,
                  });
                  const navigateUrl = buildVehiclePositionNavigateUrl({
                    latitude: gps.latitude,
                    longitude: gps.longitude,
                  });
                  return (
                    <>
                      <p>
                        <strong>{gps.licensePlate ?? route.route.assignedVehiclePlate}</strong>
                      </p>
                      <p>{display.line}</p>
                      {display.note ? <p className="page-muted">{display.note}</p> : null}
                      <p className="page-muted">
                        {formatVehicleMotionLabel(gps.speedKmh)} ·{' '}
                        {formatVehicleIgnitionLabel(gps.ignitionOn)}
                      </p>
                      <p className="page-muted">
                        {formatVehiclePositionFreshness(gps.recordedAt)} ·{' '}
                        {formatVehiclePositionCoordinates(gps.latitude, gps.longitude)}
                      </p>
                      {navigateUrl ? (
                        <p>
                          <a href={navigateUrl} target="_blank" rel="noreferrer">
                            Navigate to this position
                          </a>
                        </p>
                      ) : null}
                    </>
                  );
                })()}
              </Panel>
            ) : null}

            {route.route.nextDestination ? (
              <Panel title="Next Destination">
                <p>
                  <strong>{route.route.nextDestination.title}</strong> —{' '}
                  {route.route.nextDestination.customerName}
                </p>
                <p>
                  {route.route.nextDestination.address
                    ? `Site: ${route.route.nextDestination.address}`
                    : 'Site address missing on job snapshot'}
                </p>
                {route.route.nextDestination.scheduledAt ? (
                  <p>
                    Planned:{' '}
                    {new Date(route.route.nextDestination.scheduledAt).toLocaleString()}
                  </p>
                ) : null}
                {route.route.assignedVehicleName ? (
                  <p>
                    Vehicle: {route.route.assignedVehicleName} (
                    {route.route.assignedVehiclePlate})
                  </p>
                ) : (
                  <p className="page-muted">No vehicle assigned on this technician record.</p>
                )}
                {nextDeepLink ? (
                  <p>
                    <a href={nextDeepLink} target="_blank" rel="noreferrer">
                      Open site address in Maps (deep-link — TITAN does not call Google)
                    </a>
                  </p>
                ) : null}
              </Panel>
            ) : null}

            <Panel title="Route Stops">
              {route.route.stops.length === 0 ? (
                <p className="page-muted">No active stops on your route.</p>
              ) : (
                <ul className="portal-list">
                  {route.route.stops.map((stop) => {
                    const link = buildAddressMapsDeepLink(stop.address);
                    return (
                      <li key={stop.jobId}>
                        <strong>
                          {stop.sequence}. {stop.title}
                        </strong>
                        <span>
                          {stop.customerName} · {stop.status.replace(/_/g, ' ')}
                          {stop.scheduledAt
                            ? ` · planned ${new Date(stop.scheduledAt).toLocaleString()}`
                            : ''}
                        </span>
                        <span>
                          {stop.address ? `Site: ${stop.address}` : 'Site address missing'}
                        </span>
                        {link ? (
                          <a href={link} target="_blank" rel="noreferrer">
                            Maps deep-link
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            <Panel title="Fleet Provider Status">
              <p>
                Cartrack connection record:{' '}
                {route.cartrackConnected ? 'configured in integrations' : 'not connected'}
              </p>
              <p className="page-muted">
                Technician route shows assigned context only. Fleet-wide Cartrack tracking is office/owner only — TITAN never invents GPS.
              </p>
              <Button size="sm" variant="secondary" onClick={() => void routeQuery.refetch()}>
                Refresh
              </Button>
            </Panel>
          </>
        ) : null}
      </AnalyticsTabPanel>
    </div>
  );
}
