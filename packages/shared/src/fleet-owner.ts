/** Owner fleet experience — movement, capability, and operational types. */

export type FleetMovementDisplayState =
  | 'driving'
  | 'parked'
  | 'idling'
  | 'ignition_off'
  | 'off_duty'
  | 'gps_stale'
  | 'tracker_offline'
  | 'unknown';

export type FleetCapabilityReason =
  | 'available'
  | 'waiting_for_provider_data'
  | 'permission_required'
  | 'hardware_not_supported'
  | 'addon_required'
  | 'temporarily_unavailable'
  | 'not_connected';

export type FleetJobLink = {
  jobId: string;
  jobNumber: string | null;
  title: string;
  customerName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  scheduledAt: string | null;
  addressDisplay: string | null;
  status: string;
  role: 'current' | 'next';
};

export type FleetOwnerTripSummary = {
  id: string;
  vehicleId: string;
  vehicleName: string | null;
  registration: string | null;
  driverName: string | null;
  startedAt: string;
  endedAt: string | null;
  startArea: string | null;
  endArea: string | null;
  distanceKm: number | null;
  drivingMinutes: number | null;
  idleMinutes: number | null;
  linkedJobId: string | null;
  linkedJobTitle: string | null;
  pointCount: number;
};

export type FleetOwnerEventSummary = {
  id: string;
  vehicleId: string | null;
  registration: string | null;
  driverName: string | null;
  eventType: string;
  severity: 'info' | 'warning' | 'critical';
  occurredAt: string;
  description: string;
  acknowledged: boolean;
  linkedJobId: string | null;
};

export type FleetOwnerDriverSummary = {
  driverId: string | null;
  driverName: string;
  assignedVehicleId: string | null;
  assignedVehicleRegistration: string | null;
  linkedVehicleId: string | null;
  status: FleetMovementDisplayState;
  todayDistanceKm: number | null;
  currentJob: FleetJobLink | null;
  lastPositionAt: string | null;
  lastArea: string | null;
};

export type FleetGeofenceSummary = {
  id: string;
  name: string;
  type: 'geofence' | 'poi';
  readOnly: true;
};

export type FleetOwnerTripsResponse = {
  trips: FleetOwnerTripSummary[];
  capability: FleetCapabilityReason;
  generatedAt: string;
};

export type FleetOwnerEventsResponse = {
  events: FleetOwnerEventSummary[];
  capability: FleetCapabilityReason;
  generatedAt: string;
};

export type FleetOwnerDriversResponse = {
  drivers: FleetOwnerDriverSummary[];
  capability: FleetCapabilityReason;
  generatedAt: string;
};

export const FLEET_MOVEMENT_LABELS: Record<FleetMovementDisplayState, string> = {
  driving: 'Driving',
  parked: 'Parked',
  idling: 'Idling',
  ignition_off: 'Ignition off',
  off_duty: 'Off duty',
  gps_stale: 'GPS stale',
  tracker_offline: 'Tracker offline',
  unknown: 'Unknown',
};

export const FLEET_CAPABILITY_LABELS: Record<FleetCapabilityReason, string> = {
  available: 'Available',
  waiting_for_provider_data: 'Waiting for first provider data',
  permission_required: 'Permission required',
  hardware_not_supported: 'Hardware not supported',
  addon_required: 'Add-on required',
  temporarily_unavailable: 'Temporarily unavailable',
  not_connected: 'Cartrack not connected',
};

export function resolveFleetDisplayState(input: {
  movementState: 'moving' | 'parked' | 'idling' | 'off_duty' | 'unknown';
  ignitionOn: boolean | null;
  isStale: boolean;
  hasPosition: boolean;
}): FleetMovementDisplayState {
  if (!input.hasPosition) {
    return 'tracker_offline';
  }
  if (input.isStale) {
    return 'gps_stale';
  }
  if (input.ignitionOn === false) {
    return 'ignition_off';
  }
  switch (input.movementState) {
    case 'moving':
      return 'driving';
    case 'idling':
      return 'idling';
    case 'off_duty':
      return 'off_duty';
    case 'parked':
      return 'parked';
    default:
      return 'unknown';
  }
}
