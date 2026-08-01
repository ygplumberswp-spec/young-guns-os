import { useMemo } from 'react';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { canAccessFleet } from '../../features/fleet/VehicleList';
import { FleetSectionNav } from '../../features/fleet/FleetSectionNav';
import { FleetCapabilityState } from '../../features/fleet/FleetCapabilityState';

export function FleetReportsPage() {
  const { user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);

  if (!canView) {
    return (
      <div className="page-stack fleet-page">
        <FleetSectionNav />
        <FleetCapabilityState capability="permission_required" title="Reports" />
      </div>
    );
  }

  return (
    <div className="page-stack fleet-page">
      <FleetSectionNav />
      <PageHeader title="Fleet reports" description="Operational fleet reporting from cached Cartrack data." />
      <FleetCapabilityState
        capability="waiting_for_provider_data"
        title="Reports"
        description="Distance, idle time, and trip summaries build from stored GPS once sufficient history exists."
      />
    </div>
  );
}
