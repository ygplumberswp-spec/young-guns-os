import { useMemo } from 'react';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { canAccessFleet } from '../../features/fleet/VehicleList';
import { FleetSectionNav } from '../../features/fleet/FleetSectionNav';
import { FleetCapabilityState } from '../../features/fleet/FleetCapabilityState';

export function FleetMaintenancePage() {
  const { user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);

  if (!canView) {
    return (
      <div className="page-stack fleet-page">
        <FleetSectionNav />
        <FleetCapabilityState capability="permission_required" title="Maintenance" />
      </div>
    );
  }

  return (
    <div className="page-stack fleet-page">
      <FleetSectionNav />
      <PageHeader title="Maintenance" description="Service schedules linked to fleet vehicles." />
      <FleetCapabilityState
        capability="waiting_for_provider_data"
        title="Maintenance schedules"
        description="Service due dates appear when odometer data is available from Cartrack and linked in vehicle profiles."
      />
    </div>
  );
}
