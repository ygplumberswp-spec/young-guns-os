import { useMemo } from 'react';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import { canAccessFleet } from '../../features/fleet/VehicleList';
import { FleetSectionNav } from '../../features/fleet/FleetSectionNav';
import { FleetCapabilityState } from '../../features/fleet/FleetCapabilityState';

export function FleetGeofencesPage() {
  const { user } = useAuth();
  const canView = useMemo(() => (user ? canAccessFleet(user.permissions) : false), [user]);

  if (!canView) {
    return (
      <div className="page-stack fleet-page">
        <FleetSectionNav />
        <FleetCapabilityState capability="permission_required" title="Geofences" />
      </div>
    );
  }

  return (
    <div className="page-stack fleet-page">
      <FleetSectionNav />
      <PageHeader
        title="Geofences"
        description="Read-only Cartrack geofence import — create/edit requires Owner approval and write permission."
      />
      <FleetCapabilityState
        capability="addon_required"
        title="Geofence import pending"
        description="Geofences and POIs display when authorised on your Cartrack account. TITAN does not store admin credentials."
      />
    </div>
  );
}
