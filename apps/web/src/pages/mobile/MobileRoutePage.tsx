import { useState } from 'react';
import { Link } from 'wouter';
import { PageHeader } from '../../components/ux';
import { Panel, Button } from '@titan/ui';
import {
  ETA_UNAVAILABLE_LABEL,
  buildVehiclePositionNavigateUrl,
  formatVehicleIgnitionLabel,
  formatVehicleMotionLabel,
  formatVehiclePositionCoordinates,
  formatVehiclePositionFreshness,
  resolveVehiclePositionAddressDisplay,
} from '@titan/shared';
import {
  MobileApiClientError,
  confirmMobileEnRoute,
  fetchMobileRoute,
} from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';

/** UX-043 — route stops with stored site address + Maps deep-link; no fake live ETA. */
export function MobileRoutePage() {
  const { accessToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const routeQuery = useStaffCachedQuery({
    queryKey: 'mobile/route',
    enabled: Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: async () => fetchMobileRoute(accessToken!),
  });

  const route = routeQuery.data;
  const nextDeepLink = route?.route.nextDestination?.navigationUrl ?? null;

  async function markNextEnRoute() {
    if (!accessToken || !route?.route.nextDestination || busy) return;
    setBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const result = await confirmMobileEnRoute(accessToken, route.route.nextDestination.jobId);
      setActionMessage(
        `EN ROUTE · ${result.eta.arrivalWindowLabel} · customer ${result.customerNotification.status.replace(/_/g, ' ')}`,
      );
      await routeQuery.refetch();
    } catch (err) {
      setActionError(err instanceof MobileApiClientError ? err.message : 'Unable to mark EN ROUTE');
    } finally {
      setBusy(false);
    }
  }

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
                {route.etaSource === 'google_maps'
                  ? 'Cartrack vehicle position + Google Maps live route'
                  : route.etaSource === 'schedule_only'
                    ? 'Planned appointment time only (not live traffic routing)'
                    : 'None — no truthful live route available'}
              </p>
              <p className="page-muted">
                Travel estimate: {route.route.travelEstimateLabel ?? ETA_UNAVAILABLE_LABEL}
              </p>
              <p className="page-muted">
                Live tracking:{' '}
                {route.liveTrackingAvailable
                  ? 'Assigned-vehicle Cartrack GPS available for technician ETA (not shared as a live customer feed)'
                  : 'Unavailable — no assigned-vehicle GPS for this technician; fleet-wide tracking is blocked'}
              </p>
              {actionMessage ? <p className="form-success">{actionMessage}</p> : null}
              {actionError ? <p className="form-error">{actionError}</p> : null}
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
              <Panel title="NEXT JOB">
                <p>
                  <strong>{route.route.nextDestination.customerName}</strong>
                </p>
                <p>{route.route.nextDestination.title}</p>
                <p>
                  {route.route.nextDestination.address
                    ? `Address: ${route.route.nextDestination.address}`
                    : 'Site address missing on job snapshot'}
                </p>
                <p className="page-muted">
                  Scheduled:{' '}
                  {route.route.nextDestination.scheduledAt
                    ? new Date(route.route.nextDestination.scheduledAt).toLocaleString()
                    : '—'}
                </p>
                <p className="page-muted">
                  Travel estimate: {route.route.travelEstimateLabel ?? ETA_UNAVAILABLE_LABEL}
                </p>
                {route.route.assignedVehicleName ? (
                  <p>
                    Vehicle: {route.route.assignedVehicleName} (
                    {route.route.assignedVehiclePlate})
                  </p>
                ) : (
                  <p className="page-muted">No vehicle assigned on this technician record.</p>
                )}
                <div className="jobs-form__actions" style={{ marginTop: '0.75rem' }}>
                  {nextDeepLink ? (
                    <a
                      className="mobile-action-btn mobile-action-btn--primary"
                      href={nextDeepLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      NAVIGATE
                    </a>
                  ) : null}
                  <Button type="button" disabled={busy} onClick={() => void markNextEnRoute()}>
                    EN ROUTE
                  </Button>
                  <Link href={`/mobile/jobs/${route.route.nextDestination.jobId}`}>
                    <Button type="button" variant="secondary">
                      Open job
                    </Button>
                  </Link>
                </div>
              </Panel>
            ) : null}

            <Panel title="Route Stops">
              {route.route.stops.length === 0 ? (
                <p className="page-muted">No active stops on your route.</p>
              ) : (
                <ul className="portal-list">
                  {route.route.stops.map((stop) => {
                    const link = stop.navigationUrl;
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
                            NAVIGATE
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
