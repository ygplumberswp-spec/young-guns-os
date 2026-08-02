import { useMemo } from 'react';
import { FleetHoldPanel } from '../../features/fleet/FleetHoldPanel';
import { FleetWorkspaceShell } from '../../features/fleet/FleetWorkspaceShell';
import { canAccessFleet } from '../../features/fleet/VehicleList';
import { useAuth } from '../../lib/auth-context';

export function FleetAlertsPage() {
  const { user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);

  if (!canView) {
    return (
      <FleetWorkspaceShell title="Alerts" description="You do not have permission to view fleet alerts.">
        <FleetHoldPanel title="Access denied" reason="Fleet read permission required." cartrackSource={false} />
      </FleetWorkspaceShell>
    );
  }

  return (
    <FleetWorkspaceShell
      title="Alerts"
      description="Cartrack alert feed — waiting for provider events API."
    >
      <FleetHoldPanel
        title="Fleet alerts"
        reason="No Cartrack alert or geofence breach feed is connected on staging. Stale GPS and tracker-offline states appear on the Live Map from cached positions only."
        alternateHref="/fleet/live-map"
        alternateLabel="View Live Map"
      />
    </FleetWorkspaceShell>
  );
}
