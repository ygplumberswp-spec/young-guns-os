import { useMemo } from 'react';
import { FleetHoldPanel } from '../../features/fleet/FleetHoldPanel';
import { FleetWorkspaceShell } from '../../features/fleet/FleetWorkspaceShell';
import { canAccessFleet } from '../../features/fleet/VehicleList';
import { useAuth } from '../../lib/auth-context';

export function FleetReportsPage() {
  const { user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);

  if (!canView) {
    return (
      <FleetWorkspaceShell title="Reports" description="You do not have permission to view fleet reports.">
        <FleetHoldPanel title="Access denied" reason="Fleet read permission required." cartrackSource={false} />
      </FleetWorkspaceShell>
    );
  }

  return (
    <FleetWorkspaceShell
      title="Reports"
      description="Fleet operational reports — export pipelines not wired to Cartrack on this tab."
    >
      <FleetHoldPanel
        title="Fleet reports"
        reason="PDF/Excel fleet exports and monthly rollups are not connected to live Cartrack data on this workspace tab. GPS-derived analytics are available under Fleet Intelligence when deployed."
        alternateHref="/fleet-intelligence"
        alternateLabel="Open Fleet Intelligence"
      />
    </FleetWorkspaceShell>
  );
}
