/**
 * Driver Intelligence (Department 8.2)
 *
 * Extends Fleet / Cartrack / Vehicle Intelligence / job-vehicle foundations with:
 * - Driver profiles from real vehicle assignees + job–vehicle assignments
 * - Driving behaviour insights from real fleet behaviour events (GPS-derived)
 * - Route efficiency and trip analysis from real GPS trip segments
 * - Vehicle usage analysis from real job–vehicle assignments
 * - AURA recommendation drafts (efficiency / risk / training) — never auto-discipline
 *
 * Invariants:
 * - No fake GPS / trip / behaviour data
 * - Unavailable when Cartrack/trips/behaviour missing — never invented
 * - Owner/Admin only for driver behaviour intelligence
 * - Recommendations are drafts only; never automatic disciplinary actions
 * - Does not replace /fleet, /fleet-intelligence, or /vehicle-intelligence
 */

export const DRIVER_INTELLIGENCE_KEY = 'driver-intelligence' as const;

export type DriAvailability = 'available' | 'unavailable';

export type DriRecommendationKind =
  | 'efficiency_opportunity'
  | 'risk_pattern'
  | 'training_opportunity';

export type DriRecommendationStatus = 'draft' | 'acknowledged' | 'dismissed';

export type DriAuraInsightTarget =
  | 'command_centre'
  | 'executive_dashboard'
  | 'fleet'
  | 'fleet_intelligence'
  | 'vehicle_intelligence'
  | 'operations'
  | 'jobs'
  | 'scheduling'
  | 'technicians'
  | 'hr';

export type DriAuraInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type DriBehaviourEventType =
  | 'speeding'
  | 'harsh_braking'
  | 'harsh_acceleration'
  | 'excessive_idling'
  | 'route_deviation';

export type DriDriverProfile = {
  userId: string;
  displayName: string;
  email: string;
  roleName: string;
  isActive: boolean;
  assignedVehicleIds: string[];
  assignedVehicleNames: string[];
  jobAssignmentCount: number;
  tripCount: number;
  behaviourEventCount: number;
  totalDistanceKm: number;
  totalIdleMinutes: number;
  totalDrivingMinutes: number;
};

export type DriBehaviourRow = {
  id: string;
  vehicleId: string | null;
  vehicleName: string | null;
  driverUserId: string | null;
  driverName: string | null;
  eventType: DriBehaviourEventType;
  severity: number;
  occurredAt: string;
};

export type DriTripRow = {
  vehicleId: string | null;
  vehicleName: string | null;
  licensePlate: string | null;
  driverUserId: string | null;
  driverName: string | null;
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
  idleRatio: number | null;
};

export type DriRouteEfficiencyRow = {
  driverUserId: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
  tripCount: number;
  totalDistanceKm: number;
  totalDrivingMinutes: number;
  totalIdleMinutes: number;
  averageIdleRatio: number | null;
  efficiencyLabel: 'efficient' | 'idle_heavy' | 'insufficient_data';
  rationale: string;
};

export type DriVehicleUsageRow = {
  vehicleId: string;
  vehicleName: string;
  licensePlate: string;
  status: string;
  assignedUserId: string | null;
  assignedUserName: string | null;
  jobAssignmentCount: number;
  distinctJobCount: number;
  tripCount: number;
  totalDistanceKm: number;
};

export type DriRecommendationSummary = {
  id: string;
  kind: DriRecommendationKind;
  status: DriRecommendationStatus;
  title: string;
  body: string;
  driverUserId: string | null;
  vehicleId: string | null;
  /** Invariant: always false — never auto-discipline. */
  autoDiscipline: false;
  /** Invariant: always false — never invent GPS. */
  inventedGps: false;
  createdAt: string;
  decidedAt: string | null;
};

export type DriAuraInsightSummary = {
  id: string;
  target: DriAuraInsightTarget;
  status: DriAuraInsightStatus;
  title: string;
  insight: string;
  href: string | null;
  sourceRecommendationId: string | null;
  driverUserId: string | null;
  createdAt: string;
};

export type DriAuraConnection = {
  target: DriAuraInsightTarget;
  label: string;
  href: string;
  status: 'available_link' | 'registry_stub';
  note: string;
};

export type DriSettings = {
  id: string;
  recommendationDraftsEnabled: boolean;
  behaviourSignalsEnabled: boolean;
  tripSignalsEnabled: boolean;
  /** Invariant: always false. */
  autoDisciplineEnabled: false;
  /** Invariant: always false. */
  inventGpsEnabled: false;
  notes: string | null;
  updatedAt: string;
};

export type DriCartrackSnapshot = {
  availability: DriAvailability;
  cartrackConnected: boolean;
  connectionStatus: string | null;
  mappedVehicleCount: number;
  gpsPositionCount: number;
  lastSyncAt: string | null;
  rationale: string;
};

export type DriBehaviourSnapshot = {
  availability: DriAvailability;
  eventCount: number;
  distinctDrivers: number;
  rationale: string;
};

export type DriTripSnapshot = {
  availability: DriAvailability;
  tripCount: number;
  totalDistanceKm: number;
  rationale: string;
};

export type DriUsageSnapshot = {
  availability: DriAvailability;
  assignmentCount: number;
  distinctDrivers: number;
  distinctVehicles: number;
  rationale: string;
};

export type DriDashboard = {
  summary: string;
  productClarification: {
    fleetOps: string;
    fleetIntelligence: string;
    vehicleIntelligence: string;
    thisLayer: string;
  };
  policy: {
    ownerAdminOnly: true;
    autoDisciplineEnabled: false;
    inventGpsEnabled: false;
    requiresOwnerApproval: true;
    fakeGps: false;
    fakeBehaviour: false;
  };
  cartrack: DriCartrackSnapshot;
  behaviour: DriBehaviourSnapshot;
  trips: DriTripSnapshot;
  usage: DriUsageSnapshot;
  driverProfiles: DriDriverProfile[];
  behaviourRows: DriBehaviourRow[];
  tripRows: DriTripRow[];
  routeEfficiency: DriRouteEfficiencyRow[];
  vehicleUsage: DriVehicleUsageRow[];
  recommendations: DriRecommendationSummary[];
  auraInsights: DriAuraInsightSummary[];
  auraConnections: DriAuraConnection[];
  settings: DriSettings;
  pendingRecommendations: number;
  totalDrivers: number;
};

export type RefreshDriRecommendationsRequest = {
  submitForReview?: boolean;
};

export type DecideDriRecommendationRequest = {
  decision: 'acknowledge' | 'dismiss';
  notes?: string;
};

export type UpdateDriSettingsRequest = {
  recommendationDraftsEnabled?: boolean;
  behaviourSignalsEnabled?: boolean;
  tripSignalsEnabled?: boolean;
  notes?: string | null;
};

export type CreateDriAuraInsightRequest = {
  target: DriAuraInsightTarget;
  title: string;
  insight: string;
  href?: string;
  sourceRecommendationId?: string;
  driverUserId?: string;
};

export type AcknowledgeDriInsightRequest = {
  status: 'acknowledged' | 'dismissed';
};

function isOwnerOrAdminRole(roleName: string | null | undefined): boolean {
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  );
}

export function canAccessDriverIntelligence(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Technician' || role === 'Client') return false;
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  return isOwnerOrAdminRole(role);
}

export function canWriteDriverIntelligence(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessDriverIntelligence(identity);
}

export function canManageDriverIntelligenceSettings(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessDriverIntelligence(identity);
}

export const DRI_PRODUCT_COPY = {
  fleetOps:
    'Operational fleet CRUD remains under /fleet — this layer does not replace vehicle management.',
  fleetIntelligence:
    'GPS analytics, trip segmentation, and behaviour event storage remain under /fleet-intelligence.',
  vehicleIntelligence:
    'Vehicle profiles, fuel/cost/maintenance cues remain under /vehicle-intelligence.',
  thisLayer:
    'Driver Intelligence surfaces real driver profiles, behaviour insights, route efficiency, trip analysis, and Owner/Admin-gated AURA recommendation drafts. No fake GPS. Never auto-discipline.',
} as const;

export function buildDriCartrackSnapshot(input: {
  cartrackConnected: boolean;
  connectionStatus: string | null;
  mappedVehicleCount: number;
  gpsPositionCount: number;
  lastSyncAt: string | null;
}): DriCartrackSnapshot {
  if (!input.cartrackConnected) {
    return {
      availability: 'unavailable',
      cartrackConnected: false,
      connectionStatus: input.connectionStatus,
      mappedVehicleCount: input.mappedVehicleCount,
      gpsPositionCount: input.gpsPositionCount,
      lastSyncAt: input.lastSyncAt,
      rationale:
        'Cartrack is not connected (or credentials missing) — live tracking/GPS/trips stay unavailable (not invented). Connect Cartrack under Integrations when ready.',
    };
  }
  if (input.gpsPositionCount === 0 && input.mappedVehicleCount === 0) {
    return {
      availability: 'unavailable',
      cartrackConnected: true,
      connectionStatus: input.connectionStatus,
      mappedVehicleCount: 0,
      gpsPositionCount: 0,
      lastSyncAt: input.lastSyncAt,
      rationale:
        'Cartrack is connected but no mapped vehicles or GPS positions yet — trip/behaviour signals unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    cartrackConnected: true,
    connectionStatus: input.connectionStatus,
    mappedVehicleCount: input.mappedVehicleCount,
    gpsPositionCount: input.gpsPositionCount,
    lastSyncAt: input.lastSyncAt,
    rationale: `Cartrack connected with ${input.mappedVehicleCount} mapped vehicle(s) and ${input.gpsPositionCount} GPS position record(s).`,
  };
}

export function buildDriBehaviourSnapshot(input: {
  eventCount: number;
  distinctDrivers: number;
}): DriBehaviourSnapshot {
  if (input.eventCount === 0) {
    return {
      availability: 'unavailable',
      eventCount: 0,
      distinctDrivers: 0,
      rationale:
        'No real driver behaviour events yet — run Fleet Intelligence behaviour analysis when GPS exists, or wait for Cartrack sync. Not invented.',
    };
  }
  return {
    availability: 'available',
    eventCount: input.eventCount,
    distinctDrivers: input.distinctDrivers,
    rationale: `Behaviour derived from ${input.eventCount} real fleet behaviour event(s) across ${input.distinctDrivers} driver(s)/vehicle assignment(s).`,
  };
}

export function buildDriTripSnapshot(input: {
  tripCount: number;
  totalDistanceKm: number;
}): DriTripSnapshot {
  if (input.tripCount === 0) {
    return {
      availability: 'unavailable',
      tripCount: 0,
      totalDistanceKm: 0,
      rationale:
        'No real GPS trip segments yet — trip analysis unavailable (not invented). Requires Cartrack GPS positions.',
    };
  }
  return {
    availability: 'available',
    tripCount: input.tripCount,
    totalDistanceKm: input.totalDistanceKm,
    rationale: `Trip analysis from ${input.tripCount} real GPS-derived trip segment(s), ${input.totalDistanceKm.toFixed(1)} km total.`,
  };
}

export function buildDriUsageSnapshot(input: {
  assignmentCount: number;
  distinctDrivers: number;
  distinctVehicles: number;
}): DriUsageSnapshot {
  if (input.assignmentCount === 0) {
    return {
      availability: 'unavailable',
      assignmentCount: 0,
      distinctDrivers: 0,
      distinctVehicles: 0,
      rationale:
        'No job–vehicle assignments yet — vehicle usage analysis unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    assignmentCount: input.assignmentCount,
    distinctDrivers: input.distinctDrivers,
    distinctVehicles: input.distinctVehicles,
    rationale: `Usage from ${input.assignmentCount} real job–vehicle assignment(s) across ${input.distinctVehicles} vehicle(s) and ${input.distinctDrivers} driver(s).`,
  };
}

export function computeIdleRatio(idleMinutes: number, drivingMinutes: number): number | null {
  const total = idleMinutes + drivingMinutes;
  if (total <= 0) return null;
  return Math.round((idleMinutes / total) * 1000) / 1000;
}

export function buildDriRouteEfficiencyRow(input: {
  driverUserId: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
  tripCount: number;
  totalDistanceKm: number;
  totalDrivingMinutes: number;
  totalIdleMinutes: number;
}): DriRouteEfficiencyRow {
  const averageIdleRatio = computeIdleRatio(input.totalIdleMinutes, input.totalDrivingMinutes);
  if (input.tripCount === 0 || averageIdleRatio === null) {
    return {
      ...input,
      averageIdleRatio: null,
      efficiencyLabel: 'insufficient_data',
      rationale: 'Insufficient real trip minutes to score route efficiency (not invented).',
    };
  }
  if (averageIdleRatio >= 0.45) {
    return {
      ...input,
      averageIdleRatio,
      efficiencyLabel: 'idle_heavy',
      rationale: `Idle ratio ${(averageIdleRatio * 100).toFixed(0)}% across ${input.tripCount} real trip(s) — observational only; not a disciplinary finding.`,
    };
  }
  return {
    ...input,
    averageIdleRatio,
    efficiencyLabel: 'efficient',
    rationale: `Idle ratio ${(averageIdleRatio * 100).toFixed(0)}% across ${input.tripCount} real trip(s).`,
  };
}

export function buildDriRecommendationDraft(input: {
  kind: DriRecommendationKind;
  driverName?: string | null;
  detail: string;
}): { kind: DriRecommendationKind; title: string; body: string } {
  const subject = input.driverName?.trim() || 'Driver / fleet';
  const titles: Record<DriRecommendationKind, string> = {
    efficiency_opportunity: `Efficiency opportunity — ${subject}`,
    risk_pattern: `Risk pattern — ${subject}`,
    training_opportunity: `Training opportunity — ${subject}`,
  };
  return {
    kind: input.kind,
    title: titles[input.kind].slice(0, 200),
    body: [
      input.detail,
      '',
      'Recommendation draft from real Cartrack/fleet/job signals only. Not invented GPS or behaviour.',
      'Draft only — Owner/Admin review required. Does not auto-discipline, auto-sanction, or mutate HR records.',
    ].join('\n'),
  };
}

export function listDriAuraConnections(): DriAuraConnection[] {
  return [
    {
      target: 'fleet',
      label: 'Fleet operations',
      href: '/fleet',
      status: 'available_link',
      note: 'Live vehicle CRUD and driver assignments.',
    },
    {
      target: 'fleet_intelligence',
      label: 'Fleet Intelligence',
      href: '/fleet-intelligence',
      status: 'available_link',
      note: 'GPS trip segmentation and behaviour event analysis when Cartrack data exists.',
    },
    {
      target: 'vehicle_intelligence',
      label: 'Vehicle Intelligence',
      href: '/vehicle-intelligence',
      status: 'available_link',
      note: 'Vehicle profiles, fuel/cost/maintenance cues.',
    },
    {
      target: 'jobs',
      label: 'Jobs',
      href: '/jobs',
      status: 'available_link',
      note: 'Usage links to real job–vehicle assignments.',
    },
    {
      target: 'scheduling',
      label: 'Scheduling',
      href: '/scheduling',
      status: 'available_link',
      note: 'Scheduled jobs linked when present on assignments.',
    },
    {
      target: 'technicians',
      label: 'Technicians',
      href: '/technician-intelligence',
      status: 'available_link',
      note: 'Assigned technician/driver links from real vehicle assignees.',
    },
    {
      target: 'hr',
      label: 'Employee Intelligence',
      href: '/hr-employee-intelligence',
      status: 'available_link',
      note: 'HR profiles — Driver Intelligence never auto-disciplines.',
    },
    {
      target: 'command_centre',
      label: 'AURA Command Centre',
      href: '/aura/command-centre',
      status: 'available_link',
      note: 'Insight handoffs for Owner review.',
    },
    {
      target: 'executive_dashboard',
      label: 'Executive dashboard',
      href: '/',
      status: 'registry_stub',
      note: 'Executive surface link; driver insights stay draft until acknowledged.',
    },
    {
      target: 'operations',
      label: 'Operations',
      href: '/dispatch-intelligence',
      status: 'registry_stub',
      note: 'Ops handoff stub — no invented dispatch or discipline impact.',
    },
  ];
}

export function defaultDriSettings(partial?: {
  id?: string;
  recommendationDraftsEnabled?: boolean;
  behaviourSignalsEnabled?: boolean;
  tripSignalsEnabled?: boolean;
  notes?: string | null;
  updatedAt?: string;
}): DriSettings {
  return {
    id: partial?.id ?? 'pending',
    recommendationDraftsEnabled: partial?.recommendationDraftsEnabled ?? true,
    behaviourSignalsEnabled: partial?.behaviourSignalsEnabled ?? true,
    tripSignalsEnabled: partial?.tripSignalsEnabled ?? true,
    autoDisciplineEnabled: false,
    inventGpsEnabled: false,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}
