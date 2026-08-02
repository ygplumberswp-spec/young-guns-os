import { useMemo } from 'react';
import { FleetHoldPanel } from '../../features/fleet/FleetHoldPanel';
import { FleetWorkspaceShell } from '../../features/fleet/FleetWorkspaceShell';
import { canAccessFleet } from '../../features/fleet/VehicleList';
import { useAuth } from '../../lib/auth-context';

export function FleetGeofencesPage() {
  const { user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);

  if (!canView) {
    return (
      <FleetWorkspaceShell
        title="Geofences & Places"
        description="You do not have permission to view geofences."
      >
        <FleetHoldPanel title="Access denied" reason="Fleet read permission required." cartrackSource={false} />
      </FleetWorkspaceShell>
    );
  }

  return (
    <FleetWorkspaceShell
      title="Geofences & Places"
      description="Cartrack geofences and POIs — read-only provider sync not connected."
    >
      <FleetHoldPanel
        title="Geofences and places"
        reason="Cartrack geofence and POI catalog is not synced to TITAN on staging. No placeholder shapes or fake boundaries are shown."
      />
    </FleetWorkspaceShell>
  );
}
