import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import type { VehicleSummary } from '@titan/shared';
import { VEHICLE_STATUS_OPTIONS } from '@titan/shared';
import { hasAnyPermission } from '@titan/auth/browser';

type VehicleListProps = {
  vehicles: VehicleSummary[];
  canWrite: boolean;
};

function formatStatus(status: VehicleSummary['status']): string {
  return VEHICLE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function formatVehicleDescription(vehicle: VehicleSummary): string {
  const parts = [vehicle.make, vehicle.model, vehicle.year ? String(vehicle.year) : null].filter(
    Boolean,
  );

  return parts.length > 0 ? parts.join(' ') : '—';
}

export function VehicleList({ vehicles, canWrite }: VehicleListProps) {
  if (vehicles.length === 0) {
    return (
      <EmptyState
        title="No Vehicles Yet"
        description="Add your first vehicle to start tracking your fleet."
        action={
          canWrite ? (
            <Link href="/fleet/new">
              <Button>Add Vehicle</Button>
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <Panel title="All Vehicles">
      <div className="fleet-table-wrap">
        <table className="fleet-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>License plate</th>
              <th>Vehicle</th>
              <th>Status</th>
              <th>Assigned to</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((vehicle) => (
              <tr key={vehicle.id}>
                <td>
                  <Link href={`/fleet/${vehicle.id}`} className="fleet-link">
                    {vehicle.name}
                  </Link>
                </td>
                <td>{vehicle.licensePlate}</td>
                <td>{formatVehicleDescription(vehicle)}</td>
                <td>
                  <span className={`fleet-status fleet-status--${vehicle.status}`}>
                    {formatStatus(vehicle.status)}
                  </span>
                </td>
                <td>{vehicle.assignedUserName ?? '—'}</td>
                <td>{new Date(vehicle.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function canAccessFleet(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['fleet:read', 'fleet:write']);
}

export function canManageFleet(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['fleet:write']);
}

export function formatVehicleStatus(status: VehicleSummary['status']): string {
  return formatStatus(status);
}
