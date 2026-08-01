import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import type { FleetLiveMapMovementState, FleetLiveMapVehicle } from '@titan/shared';
import { Button, Panel } from '@titan/ui';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { canAccessFleet } from '../../features/fleet/VehicleList';
import { useFleetLiveMap } from '../../features/fleet/useFleetLiveMap';

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const deltaMs = Date.now() - new Date(iso).getTime();
  if (deltaMs < 60_000) return 'Just now';
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function movementLabel(state: FleetLiveMapMovementState): string {
  switch (state) {
    case 'moving':
      return 'Moving';
    case 'parked':
      return 'Parked';
    case 'idling':
      return 'Idling';
    case 'off_duty':
      return 'Off duty';
    default:
      return 'Unknown';
  }
}

function projectMarkers(vehicles: FleetLiveMapVehicle[]) {
  const positioned = vehicles.filter(
    (vehicle) => vehicle.latitude != null && vehicle.longitude != null,
  );

  if (positioned.length === 0) {
    return [];
  }

  const lats = positioned.map((vehicle) => vehicle.latitude!);
  const lngs = positioned.map((vehicle) => vehicle.longitude!);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 0.01);
  const lngSpan = Math.max(maxLng - minLng, 0.01);

  return positioned.map((vehicle) => ({
    vehicle,
    x: ((vehicle.longitude! - minLng) / lngSpan) * 100,
    y: 100 - ((vehicle.latitude! - minLat) / latSpan) * 100,
  }));
}

export function FleetLiveMapPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);
  const { snapshot, isPolling, lastFetchedAt, error, refresh } = useFleetLiveMap({
    accessToken,
    enabled: canView,
  });
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const vehicles = snapshot?.vehicles ?? [];
  const selected =
    vehicles.find((vehicle) => vehicle.vehicleId === selectedVehicleId) ?? vehicles[0] ?? null;
  const markers = useMemo(() => projectMarkers(vehicles), [vehicles]);

  if (!canView) {
    return (
      <div className="page-stack">
        <PageHeader title="Fleet Live Map" description="You do not have permission to view fleet." />
      </div>
    );
  }

  return (
    <div className="page-stack fleet-live-map-page">
      <PageHeader
        title="Fleet Live Map"
        description="Live Cartrack positions for mapped fleet vehicles — refreshes every 3 seconds while visible."
        actions={
          <div className="page-header-actions">
            <Link href="/mobile-platform/dispatcher">
              <Button variant="secondary">Live Dispatch</Button>
            </Link>
            <Button variant="secondary" onClick={() => void refresh()} disabled={isPolling}>
              {isPolling ? 'Refreshing…' : 'Refresh now'}
            </Button>
          </div>
        }
      />

      <Panel title="Fleet sync status">
        <dl className="integration-status-list">
          <div>
            <dt>Cartrack</dt>
            <dd>{snapshot?.tracking.cartrackConnected ? 'Connected' : 'Not connected'}</dd>
          </div>
          <div>
            <dt>Mapped vehicles</dt>
            <dd>{snapshot?.tracking.mappedVehicleCount ?? 0}</dd>
          </div>
          <div>
            <dt>Vehicles with GPS</dt>
            <dd>{snapshot?.tracking.positionCount ?? 0}</dd>
          </div>
          <div>
            <dt>Last fleet sync</dt>
            <dd>
              {snapshot?.tracking.lastSyncAt
                ? new Date(snapshot.tracking.lastSyncAt).toLocaleString()
                : 'Never'}
            </dd>
          </div>
          <div>
            <dt>Live poll</dt>
            <dd>{isPolling ? 'Refreshing…' : formatRelativeTime(lastFetchedAt)}</dd>
          </div>
        </dl>
        {error ? <p className="form-error">{error}</p> : null}
      </Panel>

      <div className="fleet-live-map-layout">
        <Panel title={`Vehicles (${vehicles.length})`} className="fleet-live-map-list">
          {vehicles.length === 0 ? (
            <p className="page-muted">
              No mapped vehicles yet. Connect Cartrack in Integrations — CF172047 and CF77263 will
              appear here automatically once mapped.
            </p>
          ) : (
            <ul className="fleet-live-map-vehicle-list">
              {vehicles.map((vehicle) => (
                <li key={vehicle.vehicleId}>
                  <button
                    type="button"
                    className={`fleet-live-map-vehicle-card${
                      selected?.vehicleId === vehicle.vehicleId ? ' is-selected' : ''
                    }`}
                    onClick={() => setSelectedVehicleId(vehicle.vehicleId)}
                  >
                    <div className="fleet-live-map-vehicle-card__header">
                      <strong>{vehicle.registration ?? 'Unnamed vehicle'}</strong>
                      <span
                        className={`status-pill status-pill--${
                          vehicle.isStale ? 'warning' : 'success'
                        }`}
                      >
                        {movementLabel(vehicle.movementState)}
                      </span>
                    </div>
                    <p className="page-muted">
                      {vehicle.driverName ?? 'No driver'} ·{' '}
                      {vehicle.speedKmh != null ? `${Math.round(vehicle.speedKmh)} km/h` : '—'}
                    </p>
                    <p className="page-muted">
                      Last position: {formatRelativeTime(vehicle.recordedAt)}
                      {vehicle.isStale ? ' · Stale warning' : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Live map" className="fleet-live-map-canvas-panel">
          <div className="fleet-live-map-canvas" aria-label="Fleet live map">
            {markers.length === 0 ? (
              <p className="page-muted fleet-live-map-empty">
                Waiting for GPS positions from Cartrack background sync.
              </p>
            ) : (
              markers.map(({ vehicle, x, y }) => (
                <button
                  key={vehicle.vehicleId}
                  type="button"
                  className={`fleet-live-map-marker${
                    selected?.vehicleId === vehicle.vehicleId ? ' is-selected' : ''
                  }`}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  title={vehicle.registration ?? vehicle.vehicleId}
                  onClick={() => setSelectedVehicleId(vehicle.vehicleId)}
                >
                  <span>{vehicle.registration?.slice(-3) ?? 'VEH'}</span>
                </button>
              ))
            )}
          </div>
        </Panel>

        {selected ? (
          <Panel title={selected.registration ?? 'Vehicle details'} className="fleet-live-map-detail">
            <dl className="integration-status-list">
              <div>
                <dt>Driver</dt>
                <dd>{selected.driverName ?? '—'}</dd>
              </div>
              <div>
                <dt>Movement</dt>
                <dd>{movementLabel(selected.movementState)}</dd>
              </div>
              <div>
                <dt>Speed</dt>
                <dd>{selected.speedKmh != null ? `${Math.round(selected.speedKmh)} km/h` : '—'}</dd>
              </div>
              <div>
                <dt>Ignition</dt>
                <dd>
                  {selected.ignitionOn == null ? '—' : selected.ignitionOn ? 'On' : 'Off'}
                </dd>
              </div>
              <div>
                <dt>Last position</dt>
                <dd>
                  {selected.recordedAt
                    ? new Date(selected.recordedAt).toLocaleString()
                    : 'No position yet'}
                </dd>
              </div>
              <div>
                <dt>Coordinates</dt>
                <dd>
                  {selected.latitude != null && selected.longitude != null
                    ? `${selected.latitude.toFixed(5)}, ${selected.longitude.toFixed(5)}`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Area</dt>
                <dd>{selected.address ?? '—'}</dd>
              </div>
              <div>
                <dt>Trail points today</dt>
                <dd>{selected.trailToday.length}</dd>
              </div>
            </dl>

            {selected.isStale ? (
              <p className="form-error">Position is stale — last update exceeds 2 minutes.</p>
            ) : null}

            <div className="page-header-actions">
              <Link href={`/fleet/${selected.vehicleId}`}>
                <Button variant="secondary">Vehicle profile</Button>
              </Link>
              <Link href="/mobile-platform/dispatcher">
                <Button variant="secondary">Live Dispatch</Button>
              </Link>
            </div>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
