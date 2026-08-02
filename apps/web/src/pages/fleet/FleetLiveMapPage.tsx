import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { FLEET_MOVEMENT_LABELS } from '@titan/shared';
import { Button, Panel } from '@titan/ui';
import { useAuth } from '../../lib/auth-context';
import { canAccessFleet } from '../../features/fleet/VehicleList';
import { FleetWorkspaceShell } from '../../features/fleet/FleetWorkspaceShell';
import { FleetLiveMapCanvas } from '../../features/fleet/FleetLiveMapCanvas';
import { FleetVehicleSidePanel } from '../../features/fleet/FleetVehicleSidePanel';
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

export function FleetLiveMapPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);
  const { snapshot, isPolling, lastFetchedAt, error, refresh } = useFleetLiveMap({
    accessToken,
    enabled: canView,
  });
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mapStatus, setMapStatus] = useState<{ ready: boolean; error: string | null }>({
    ready: false,
    error: null,
  });

  const vehicles = snapshot?.vehicles ?? [];
  const selected =
    vehicles.find((vehicle) => vehicle.vehicleId === selectedVehicleId) ?? vehicles[0] ?? null;

  if (!canView) {
    return (
      <FleetWorkspaceShell title="Live Map" description="You do not have permission to view fleet.">
        <p className="page-muted">Fleet read permission required.</p>
      </FleetWorkspaceShell>
    );
  }

  return (
    <FleetWorkspaceShell
      title="Live Map"
      description="Live Cartrack positions from TITAN cache — UI refreshes every 3 seconds while visible."
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
    >
      <div className="fleet-live-map-page">

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
            <dt>UI poll (cached)</dt>
            <dd>{isPolling ? 'Refreshing…' : formatRelativeTime(lastFetchedAt)}</dd>
          </div>
          <div>
            <dt>Provider positions</dt>
            <dd>
              {snapshot?.generatedAt
                ? `Snapshot ${new Date(snapshot.generatedAt).toLocaleTimeString()}`
                : '—'}
            </dd>
          </div>
        </dl>
        {error ? <p className="form-error">{error}</p> : null}
        {mapStatus.error ? <p className="form-error">{mapStatus.error}</p> : null}
      </Panel>

      <div className="fleet-live-map-layout">
        <Panel title={`Vehicles (${vehicles.length})`} className="fleet-live-map-list">
          {vehicles.length === 0 ? (
            <p className="page-muted">
              Waiting for first automatic GPS update. Mapped vehicles CF172047 and CF77263 appear
              here after Cartrack background sync — no manual sync required.
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
                    onClick={() => {
                      setSelectedVehicleId(vehicle.vehicleId);
                      setMobileDrawerOpen(true);
                    }}
                  >
                    <div className="fleet-live-map-vehicle-card__header">
                      <strong>{vehicle.registration ?? vehicle.name ?? 'Unnamed vehicle'}</strong>
                      <span
                        className={`status-pill status-pill--${
                          vehicle.isStale || vehicle.isTrackerOffline ? 'warning' : 'success'
                        }`}
                      >
                        {FLEET_MOVEMENT_LABELS[vehicle.displayState]}
                      </span>
                    </div>
                    <p className="page-muted">
                      {vehicle.driverName ?? vehicle.technicianName ?? 'No driver'} ·{' '}
                      {vehicle.speedKmh != null ? `${Math.round(vehicle.speedKmh)} km/h` : '—'}
                    </p>
                    <p className="page-muted">
                      {vehicle.address ?? 'Area unknown'} · Last:{' '}
                      {formatRelativeTime(vehicle.recordedAt)}
                    </p>
                    {vehicle.currentJob ? (
                      <p className="page-muted">Job: {vehicle.currentJob.title}</p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Live map" className="fleet-live-map-canvas-panel">
          <FleetLiveMapCanvas
            vehicles={vehicles}
            selectedVehicleId={selected?.vehicleId ?? null}
            onMapStatusChange={setMapStatus}
            onSelect={(vehicleId) => {
              setSelectedVehicleId(vehicleId);
              setMobileDrawerOpen(true);
            }}
          />
        </Panel>

        {selected ? (
          <div
            className={`fleet-live-map-mobile-drawer${
              mobileDrawerOpen ? ' fleet-live-map-mobile-drawer--open' : ''
            }`}
          >
            <FleetVehicleSidePanel
              vehicle={selected}
              onShareEta={() => {
                /* Customer ETA share — audited link flow deferred to dedicated endpoint */
              }}
            />
            <button
              type="button"
              className="fleet-live-map-mobile-drawer__close"
              onClick={() => setMobileDrawerOpen(false)}
            >
              Close
            </button>
          </div>
        ) : null}
      </div>
      </div>
    </FleetWorkspaceShell>
  );
}
