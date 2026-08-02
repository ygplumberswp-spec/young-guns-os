import { useMemo } from 'react';
import { Link } from 'wouter';
import { Button, PageLoadState, Panel } from '@titan/ui';
import { FleetHoldPanel } from '../../features/fleet/FleetHoldPanel';
import { FleetWorkspaceShell } from '../../features/fleet/FleetWorkspaceShell';
import { canAccessFleet, formatVehicleStatus } from '../../features/fleet/VehicleList';
import { fetchVehicles } from '../../lib/fleet-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';

export function FleetMaintenancePage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);

  const { data: vehicles, error, isLoading } = useCachedQuery({
    queryKey: 'fleet/vehicles-maintenance',
    accessToken,
    enabled: canView,
    staleTimeMs: 30_000,
    fetcher: async () => fetchVehicles(accessToken!),
  });

  const maintenanceVehicles = useMemo(
    () => (vehicles ?? []).filter((vehicle) => vehicle.status === 'maintenance'),
    [vehicles],
  );

  if (!canView) {
    return (
      <FleetWorkspaceShell title="Maintenance" description="You do not have permission to view maintenance.">
        <FleetHoldPanel title="Access denied" reason="Fleet read permission required." cartrackSource={false} />
      </FleetWorkspaceShell>
    );
  }

  return (
    <FleetWorkspaceShell
      title="Maintenance"
      description="TITAN vehicle maintenance status — Cartrack service schedules not connected."
    >
      <FleetHoldPanel
        title="Provider maintenance schedules"
        reason="Cartrack workshop and service-due feeds are not synced. Only TITAN vehicle status (maintenance flag) is shown below."
      />

      <PageLoadState
        isLoading={isLoading}
        error={error}
        isEmpty={maintenanceVehicles.length === 0}
        emptyTitle="No vehicles in maintenance"
        emptyDescription="Mark a vehicle as maintenance on the Vehicles tab to track it here."
        loadingLabel="Loading fleet records…"
      >
        <Panel title={`In maintenance (${maintenanceVehicles.length})`}>
          <ul className="fleet-maintenance-list">
            {maintenanceVehicles.map((vehicle) => (
              <li key={vehicle.id} className="fleet-maintenance-list__item">
                <div>
                  <strong>{vehicle.licensePlate}</strong>
                  <span className="page-muted">{vehicle.name}</span>
                </div>
                <span className="status-pill status-pill--warning">
                  {formatVehicleStatus(vehicle.status)}
                </span>
                <Link href={`/fleet/${vehicle.id}`}>
                  <Button variant="secondary" size="sm">
                    View vehicle
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </PageLoadState>
    </FleetWorkspaceShell>
  );
}
