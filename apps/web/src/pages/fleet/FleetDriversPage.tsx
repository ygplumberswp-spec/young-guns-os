import { useMemo } from 'react';
import { Panel } from '@titan/ui';
import { FLEET_MOVEMENT_LABELS } from '@titan/shared';
import { FleetHoldPanel } from '../../features/fleet/FleetHoldPanel';
import { FleetWorkspaceShell } from '../../features/fleet/FleetWorkspaceShell';
import { useFleetLiveMap } from '../../features/fleet/useFleetLiveMap';
import { canAccessFleet } from '../../features/fleet/VehicleList';
import { useAuth } from '../../lib/auth-context';

export function FleetDriversPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);
  const { snapshot } = useFleetLiveMap({ accessToken, enabled: canView });

  const driverRows = useMemo(() => {
    const vehicles = snapshot?.vehicles ?? [];
    const seen = new Map<string, (typeof vehicles)[number]>();
    for (const vehicle of vehicles) {
      const name = vehicle.driverName ?? vehicle.technicianName;
      if (!name) continue;
      if (!seen.has(name)) seen.set(name, vehicle);
    }
    return [...seen.entries()].map(([name, vehicle]) => ({ name, vehicle }));
  }, [snapshot?.vehicles]);

  if (!canView) {
    return (
      <FleetWorkspaceShell title="Drivers" description="You do not have permission to view fleet drivers.">
        <FleetHoldPanel title="Access denied" reason="Fleet read permission required." cartrackSource={false} />
      </FleetWorkspaceShell>
    );
  }

  return (
    <FleetWorkspaceShell
      title="Drivers"
      description="Driver roster from Cartrack live GPS cache — full driver management API not wired."
    >
      {driverRows.length > 0 ? (
        <Panel title={`Drivers seen on live GPS (${driverRows.length})`}>
          <ul className="fleet-driver-list">
            {driverRows.map(({ name, vehicle }) => (
              <li key={name} className="fleet-driver-list__item">
                <strong>{name}</strong>
                <span>
                  {vehicle.registration ?? vehicle.name ?? 'Vehicle'} ·{' '}
                  {FLEET_MOVEMENT_LABELS[vehicle.displayState]}
                </span>
              </li>
            ))}
          </ul>
          <p className="page-muted" style={{ marginTop: '0.75rem' }}>
            Names above come from the latest Cartrack snapshot only. Dedicated driver CRUD and
            assignment history remain on HOLD until GET /api/v1/fleet/drivers ships.
          </p>
        </Panel>
      ) : (
        <FleetHoldPanel
          title="Driver roster"
          reason="No driver names in the current Cartrack GPS snapshot. Mapped vehicles CF172047 and CF77263 may lack driver metadata from the provider."
          alternateHref="/fleet/live-map"
          alternateLabel="View Live Map"
        />
      )}
    </FleetWorkspaceShell>
  );
}
