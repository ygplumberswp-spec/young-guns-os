import { useMemo } from 'react';
import { FleetHoldPanel } from '../../features/fleet/FleetHoldPanel';
import { FleetWorkspaceShell } from '../../features/fleet/FleetWorkspaceShell';
import { canAccessFleet } from '../../features/fleet/VehicleList';
import { useAuth } from '../../lib/auth-context';

export function FleetTripsPage() {
  const { user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);

  if (!canView) {
    return (
      <FleetWorkspaceShell
        title="Trips"
        description="You do not have permission to view fleet trips."
      >
        <FleetHoldPanel title="Access denied" reason="Fleet read permission required." cartrackSource={false} />
      </FleetWorkspaceShell>
    );
  }

  return (
    <FleetWorkspaceShell
      title="Trips"
      description="Cartrack trip history — provider API not wired to this workspace tab yet."
    >
      <FleetHoldPanel
        title="Trip history"
        reason="Cartrack trip segments are not exposed on GET /api/v1/fleet/trips in staging. GPS-derived trip analytics live under Fleet Intelligence once that route is deployed."
        alternateHref="/fleet-intelligence"
        alternateLabel="Open Fleet Intelligence"
      />
    </FleetWorkspaceShell>
  );
}
