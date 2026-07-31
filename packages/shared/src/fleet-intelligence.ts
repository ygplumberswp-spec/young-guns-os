export type FleetCostType =
  'fuel' | 'maintenance' | 'tyre' | 'licensing' | 'insurance' | 'repair' | 'other';

export type FleetRecommendationType =
  | 'maintenance_planning'
  | 'route_optimization'
  | 'vehicle_replacement'
  | 'fleet_balancing'
  | 'technician_allocation'
  | 'operating_cost_reduction'
  | 'excessive_travel_reduction'
  | 'comeback_travel_reduction';

export type FleetBehaviourEventType =
  'speeding' | 'harsh_braking' | 'harsh_acceleration' | 'excessive_idling' | 'route_deviation';

export type FleetActionType = 'fleet_action' | 'vehicle_replacement';
export type FleetActionStatus =
  'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled';

export type FleetTripSummary = {
  vehicleId: string | null;
  vehicleName: string | null;
  licensePlate: string | null;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  distanceKm: number;
  averageSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  idleMinutes: number;
  drivingMinutes: number;
  stopCount: number;
  pointCount: number;
};

export type FleetMonthlyReportSummary = {
  id: string;
  periodYear: number;
  periodMonth: number;
  totalKilometres: number;
  totalTrips: number;
  drivingHours: number;
  idleHours: number;
  averageTripDistanceKm: number | null;
  averageTripDurationMinutes: number | null;
  vehicleSummaries: Array<{
    vehicleId: string | null;
    vehicleName: string | null;
    kilometres: number;
    trips: number;
  }>;
  exportMetadata: Record<string, unknown>;
  generatedAt: string;
};

export type FleetDriverBehaviourSummary = {
  id: string;
  vehicleId: string | null;
  vehicleName: string | null;
  eventType: FleetBehaviourEventType;
  severity: number;
  occurredAt: string;
};

export type FleetOperatingCostSummary = {
  id: string;
  vehicleId: string | null;
  vehicleName: string | null;
  costType: FleetCostType;
  amountCents: number;
  currency: string;
  recordedAt: string;
  notes: string | null;
};

export type FleetVehicleUtilizationSummary = {
  vehicleId: string;
  vehicleName: string;
  licensePlate: string;
  status: string;
  utilizationPercent: number | null;
  downtimePercent: number | null;
  kilometresPerDay: number | null;
  operatingHours: number | null;
  jobsCompleted: number;
  gpsPointCount: number;
};

export type FleetCostAnalytics = {
  totalOperatingCostCents: number;
  totalKilometres: number;
  costPerKilometreCents: number | null;
  costByType: Array<{ costType: FleetCostType; amountCents: number }>;
  costByVehicle: Array<{ vehicleId: string; vehicleName: string; amountCents: number }>;
};

export type FleetPerformanceAnalytics = {
  bestPerformingVehicle: string | null;
  lowestUtilizationVehicle: string | null;
  highestOperatingCostVehicle: string | null;
  travelEfficiencyScore: number | null;
  maintenanceDueCount: number;
  inspectionsDueCount: number;
};

export type FleetRecommendationSummary = {
  id: string;
  recommendationType: FleetRecommendationType;
  subject: string;
  recommendation: string;
  vehicleId: string | null;
  vehicleName: string | null;
  branchKey: string | null;
  createdAt: string;
};

export type FleetActionSummary = {
  id: string;
  actionType: FleetActionType;
  status: FleetActionStatus;
  subject: string;
  recommendation: string;
  vehicleId: string | null;
  payload: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: string;
};

export type FleetExecutiveDashboard = {
  summary: string;
  totalVehicles: number;
  activeVehicles: number;
  inServiceVehicles: number;
  maintenanceDueCount: number;
  inspectionsDueCount: number;
  totalKilometres: number;
  totalOperatingCostCents: number;
  fleetHealthScore: number | null;
  utilizationPercent: number | null;
  downtimePercent: number | null;
  pendingActionCount: number;
  gpsPositionCount: number;
  cartrackConnected: boolean;
  performance: FleetPerformanceAnalytics;
  costAnalytics: FleetCostAnalytics;
  recentRecommendations: FleetRecommendationSummary[];
};

export type FleetIntelligenceAuraContext = {
  summary: string;
  totalVehicles: number;
  activeVehicles: number;
  totalKilometres: number;
  totalOperatingCostCents: number;
  pendingActionCount: number;
  cartrackConnected: boolean;
};

export type CreateFleetOperatingCostRequest = {
  vehicleId?: string;
  costType: FleetCostType;
  amountCents: number;
  currency?: string;
  recordedAt?: string;
  notes?: string;
};

export type CreateFleetActionRequest = {
  actionType: FleetActionType;
  subject: string;
  recommendation: string;
  vehicleId?: string;
  payload?: Record<string, unknown>;
};

export type GenerateFleetMonthlyReportRequest = {
  periodYear: number;
  periodMonth: number;
};

export type GenerateFleetRecommendationsRequest = {
  branchKey?: string;
};
