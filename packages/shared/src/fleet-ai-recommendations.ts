/**
 * Fleet AI Recommendations (Department 8.3)
 *
 * Extends Fleet / Cartrack / Vehicle Intelligence / Driver Intelligence /
 * job-vehicle / cost / maintenance foundations with Owner-gated AURA
 * optimisation recommendation drafts:
 * - Vehicle maintenance suggestions
 * - Cost reduction opportunities
 * - Route improvements
 * - Fleet efficiency insights
 * - Replacement planning
 *
 * Invariants:
 * - Recommendations only — never auto-assign, sell, replace, or execute maintenance
 * - Real Cartrack / fleet / job / cost / maintenance data only — never invent GPS/costs
 * - Unavailable when signals missing — honest empty states
 * - Owner approval required for drafts; does not replace /fleet or /fleet-intelligence
 */

export const FLEET_AI_RECOMMENDATIONS_KEY = 'fleet-ai-recommendations' as const;

export type FarAvailability = 'available' | 'unavailable';

export type FarRecommendationKind =
  | 'maintenance_suggestion'
  | 'cost_reduction'
  | 'route_improvement'
  | 'fleet_efficiency'
  | 'replacement_planning';

export type FarRecommendationStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'acknowledged';

export type FarAuraInsightTarget =
  | 'command_centre'
  | 'executive_dashboard'
  | 'fleet'
  | 'fleet_intelligence'
  | 'vehicle_intelligence'
  | 'driver_intelligence'
  | 'operations'
  | 'jobs'
  | 'scheduling'
  | 'technicians';

export type FarAuraInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type FarVehicleSignal = {
  vehicleId: string;
  name: string;
  licensePlate: string;
  status: string;
  year: number | null;
  cartrackMapped: boolean;
  jobAssignmentCount: number;
  totalCostCents: number;
  fuelCostCents: number;
  maintenanceCostCents: number;
  assignedUserId: string | null;
  assignedUserName: string | null;
};

export type FarMaintenanceSignal = {
  id: string;
  source: 'vehicle_status' | 'asset_schedule' | 'operating_cost';
  vehicleId: string | null;
  vehicleName: string | null;
  title: string;
  status: string;
  nextDueAt: string | null;
  amountCents: number | null;
};

export type FarCostSignal = {
  id: string;
  vehicleId: string | null;
  vehicleName: string | null;
  costType: string;
  amountCents: number;
  currency: string;
  recordedAt: string;
};

export type FarUsageSignal = {
  id: string;
  vehicleId: string;
  vehicleName: string | null;
  jobId: string;
  jobTitle: string | null;
  jobStatus: string | null;
  scheduledAt: string | null;
  assignedAt: string;
};

export type FarRecommendationDraftSummary = {
  id: string;
  kind: FarRecommendationKind;
  status: FarRecommendationStatus;
  title: string;
  body: string;
  vehicleId: string | null;
  jobId: string | null;
  autoVehicleDecision: false;
  inventedGps: false;
  inventedCosts: false;
  createdAt: string;
  decidedAt: string | null;
};

export type FarAuraInsightSummary = {
  id: string;
  target: FarAuraInsightTarget;
  status: FarAuraInsightStatus;
  title: string;
  insight: string;
  href: string | null;
  sourceRecommendationId: string | null;
  createdAt: string;
};

export type FarAuraConnection = {
  target: FarAuraInsightTarget;
  label: string;
  href: string;
  status: 'available_link' | 'registry_stub';
  note: string;
};

export type FarCartrackSnapshot = {
  availability: FarAvailability;
  cartrackConnected: boolean;
  connectionStatus: string | null;
  mappedVehicleCount: number;
  gpsPositionCount: number;
  lastSyncAt: string | null;
  rationale: string;
};

export type FarCostSnapshot = {
  availability: FarAvailability;
  costRecordCount: number;
  totalCostCents: number;
  rationale: string;
};

export type FarMaintenanceSnapshot = {
  availability: FarAvailability;
  signalCount: number;
  vehiclesInMaintenance: number;
  rationale: string;
};

export type FarUsageSnapshot = {
  availability: FarAvailability;
  assignmentCount: number;
  distinctVehicles: number;
  distinctJobs: number;
  rationale: string;
};

export type FarEfficiencySnapshot = {
  availability: FarAvailability;
  vehicleCount: number;
  mappedVehicleCount: number;
  assignedVehicleCount: number;
  rationale: string;
};

export type FarSettings = {
  id: string;
  autoVehicleDecisionEnabled: false;
  inventGpsEnabled: false;
  inventCostsEnabled: false;
  recommendationDraftsEnabled: boolean;
  maintenanceSuggestionsEnabled: boolean;
  costReductionEnabled: boolean;
  routeImprovementsEnabled: boolean;
  efficiencyInsightsEnabled: boolean;
  replacementPlanningEnabled: boolean;
  notes: string | null;
  updatedAt: string;
};

export type FarDashboard = {
  summary: string;
  productClarification: {
    fleetOps: string;
    fleetIntelligence: string;
    vehicleIntelligence: string;
    driverIntelligence: string;
    thisLayer: string;
  };
  policy: {
    autoVehicleDecisionEnabled: false;
    inventGpsEnabled: false;
    inventCostsEnabled: false;
    requiresOwnerApproval: true;
    recommendationsOnly: true;
  };
  cartrack: FarCartrackSnapshot;
  costs: FarCostSnapshot;
  maintenance: FarMaintenanceSnapshot;
  usage: FarUsageSnapshot;
  efficiency: FarEfficiencySnapshot;
  vehicleSignals: FarVehicleSignal[];
  maintenanceSignals: FarMaintenanceSignal[];
  costSignals: FarCostSignal[];
  usageSignals: FarUsageSignal[];
  recommendationDrafts: FarRecommendationDraftSummary[];
  auraInsights: FarAuraInsightSummary[];
  auraConnections: FarAuraConnection[];
  settings: FarSettings;
  pendingApprovals: number;
  totalVehicles: number;
};

export type RefreshFarRecommendationsRequest = {
  submitForApproval?: boolean;
};

export type DecideFarRecommendationRequest = {
  decision: 'approve' | 'reject' | 'acknowledge';
  notes?: string;
};

export type UpdateFarSettingsRequest = {
  recommendationDraftsEnabled?: boolean;
  maintenanceSuggestionsEnabled?: boolean;
  costReductionEnabled?: boolean;
  routeImprovementsEnabled?: boolean;
  efficiencyInsightsEnabled?: boolean;
  replacementPlanningEnabled?: boolean;
  notes?: string | null;
};

export type CreateFarAuraInsightRequest = {
  target: FarAuraInsightTarget;
  title: string;
  insight: string;
  href?: string;
  sourceRecommendationId?: string;
};

export type AcknowledgeFarInsightRequest = {
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

export function canAccessFleetAiRecommendations(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') {
    return false;
  }
  if (identity.permissions.includes('*')) return true;
  if (isOwnerOrAdminRole(identity.roleName)) return true;
  return (
    identity.permissions.includes('fleet:read') ||
    identity.permissions.includes('fleet:write') ||
    identity.permissions.includes('fleet_intelligence:read') ||
    identity.permissions.includes('fleet_intelligence:write') ||
    identity.permissions.includes('agents:read')
  );
}

export function canWriteFleetAiRecommendations(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canAccessFleetAiRecommendations(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  if (isOwnerOrAdminRole(identity.roleName)) return true;
  return (
    identity.permissions.includes('fleet:write') ||
    identity.permissions.includes('fleet_intelligence:write')
  );
}

export function canApproveFleetAiRecommendations(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canWriteFleetAiRecommendations(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return isOwnerOrAdminRole(identity.roleName);
}

export function canManageFleetAiRecommendationsSettings(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canApproveFleetAiRecommendations(identity);
}

export const FAR_PRODUCT_COPY = {
  fleetOps:
    'Operational fleet CRUD remains under /fleet — this layer does not replace vehicle management.',
  fleetIntelligence:
    'GPS analytics, trips, behaviour events, and existing fleet recommendation storage remain under /fleet-intelligence.',
  vehicleIntelligence:
    'Vehicle profiles, fuel/cost/usage foundations, and maintenance cues remain under /vehicle-intelligence.',
  driverIntelligence:
    'Driver behaviour, trip analysis, and training drafts remain under /driver-intelligence when available.',
  thisLayer:
    'Fleet AI Recommendations surfaces Owner-gated optimisation drafts (maintenance, cost, route, efficiency, replacement) from real Cartrack/fleet/job/cost/maintenance signals only. Recommendations only — never auto vehicle decisions. No invented GPS or costs.',
} as const;

export function buildFarCartrackSnapshot(input: {
  cartrackConnected: boolean;
  connectionStatus: string | null;
  mappedVehicleCount: number;
  gpsPositionCount: number;
  lastSyncAt: string | null;
}): FarCartrackSnapshot {
  if (!input.cartrackConnected) {
    return {
      availability: 'unavailable',
      cartrackConnected: false,
      connectionStatus: input.connectionStatus,
      mappedVehicleCount: input.mappedVehicleCount,
      gpsPositionCount: input.gpsPositionCount,
      lastSyncAt: input.lastSyncAt,
      rationale:
        'Cartrack is not connected (or credentials missing) — live tracking/GPS stays unavailable (not invented). Connect Cartrack under Integrations when ready.',
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
        'Cartrack is connected but no mapped vehicles or GPS positions yet — route signals unavailable (not invented).',
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

export function buildFarCostSnapshot(input: {
  costRecordCount: number;
  totalCostCents: number;
}): FarCostSnapshot {
  if (input.costRecordCount === 0) {
    return {
      availability: 'unavailable',
      costRecordCount: 0,
      totalCostCents: 0,
      rationale:
        'No real fleet operating-cost records yet — cost reduction opportunities unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    costRecordCount: input.costRecordCount,
    totalCostCents: input.totalCostCents,
    rationale: `Costs derived from ${input.costRecordCount} real fleet operating-cost record(s); total ${input.totalCostCents} cents.`,
  };
}

export function buildFarMaintenanceSnapshot(input: {
  signalCount: number;
  vehiclesInMaintenance: number;
}): FarMaintenanceSnapshot {
  if (input.signalCount === 0 && input.vehiclesInMaintenance === 0) {
    return {
      availability: 'unavailable',
      signalCount: 0,
      vehiclesInMaintenance: 0,
      rationale:
        'No vehicles in maintenance status and no vehicle-linked schedules/costs — maintenance suggestions unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    signalCount: input.signalCount,
    vehiclesInMaintenance: input.vehiclesInMaintenance,
    rationale: `Maintenance cues from ${input.vehiclesInMaintenance} vehicle(s) in maintenance and ${input.signalCount} real signal(s).`,
  };
}

export function buildFarUsageSnapshot(input: {
  assignmentCount: number;
  distinctVehicles: number;
  distinctJobs: number;
}): FarUsageSnapshot {
  if (input.assignmentCount === 0) {
    return {
      availability: 'unavailable',
      assignmentCount: 0,
      distinctVehicles: 0,
      distinctJobs: 0,
      rationale:
        'No job–vehicle assignments yet — route/usage efficiency signals unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    assignmentCount: input.assignmentCount,
    distinctVehicles: input.distinctVehicles,
    distinctJobs: input.distinctJobs,
    rationale: `Usage derived from ${input.assignmentCount} real job–vehicle assignment(s) across ${input.distinctVehicles} vehicle(s) and ${input.distinctJobs} job(s).`,
  };
}

export function buildFarEfficiencySnapshot(input: {
  vehicleCount: number;
  mappedVehicleCount: number;
  assignedVehicleCount: number;
}): FarEfficiencySnapshot {
  if (input.vehicleCount === 0) {
    return {
      availability: 'unavailable',
      vehicleCount: 0,
      mappedVehicleCount: 0,
      assignedVehicleCount: 0,
      rationale: 'No real vehicles yet — fleet efficiency insights unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    vehicleCount: input.vehicleCount,
    mappedVehicleCount: input.mappedVehicleCount,
    assignedVehicleCount: input.assignedVehicleCount,
    rationale: `Efficiency signals from ${input.vehicleCount} real vehicle(s): ${input.mappedVehicleCount} Cartrack-mapped, ${input.assignedVehicleCount} assigned.`,
  };
}

export function buildFarRecommendationDraft(input: {
  kind: FarRecommendationKind;
  vehicleName?: string | null;
  detail: string;
}): { kind: FarRecommendationKind; title: string; body: string } {
  const subject = input.vehicleName?.trim() || 'Fleet';
  const titles: Record<FarRecommendationKind, string> = {
    maintenance_suggestion: `Maintenance suggestion — ${subject}`,
    cost_reduction: `Cost reduction — ${subject}`,
    route_improvement: `Route improvement — ${subject}`,
    fleet_efficiency: `Fleet efficiency — ${subject}`,
    replacement_planning: `Replacement planning — ${subject}`,
  };
  return {
    kind: input.kind,
    title: titles[input.kind].slice(0, 200),
    body: [
      input.detail,
      '',
      'Recommendation draft from real Cartrack/fleet/job/cost/maintenance signals only. Not invented GPS or costs.',
      'Draft only — Owner/Admin approval required. Does not auto-assign, sell, replace, or execute maintenance.',
    ].join('\n'),
  };
}

export function listFarAuraConnections(): FarAuraConnection[] {
  return [
    {
      target: 'fleet',
      label: 'Fleet operations',
      href: '/fleet',
      status: 'available_link',
      note: 'Live vehicle CRUD and assignments.',
    },
    {
      target: 'fleet_intelligence',
      label: 'Fleet Intelligence',
      href: '/fleet-intelligence',
      status: 'available_link',
      note: 'GPS analytics and existing fleet recommendation storage.',
    },
    {
      target: 'vehicle_intelligence',
      label: 'Vehicle Intelligence',
      href: '/vehicle-intelligence',
      status: 'available_link',
      note: 'Vehicle profiles, fuel/cost/usage, maintenance cues.',
    },
    {
      target: 'driver_intelligence',
      label: 'Driver Intelligence',
      href: '/driver-intelligence',
      status: 'available_link',
      note: 'Driver behaviour and trip analysis when available.',
    },
    {
      target: 'jobs',
      label: 'Jobs',
      href: '/jobs',
      status: 'available_link',
      note: 'Usage and route signals from real job–vehicle assignments.',
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
      note: 'Assigned technician links from real vehicle assignees.',
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
      note: 'Executive surface link; recommendations stay draft until approved.',
    },
    {
      target: 'operations',
      label: 'Operations',
      href: '/dispatch-intelligence',
      status: 'registry_stub',
      note: 'Ops handoff stub — no automatic vehicle decisions.',
    },
  ];
}

export function defaultFarSettings(partial?: {
  id?: string;
  recommendationDraftsEnabled?: boolean;
  maintenanceSuggestionsEnabled?: boolean;
  costReductionEnabled?: boolean;
  routeImprovementsEnabled?: boolean;
  efficiencyInsightsEnabled?: boolean;
  replacementPlanningEnabled?: boolean;
  notes?: string | null;
  updatedAt?: string;
}): FarSettings {
  return {
    id: partial?.id ?? 'pending',
    autoVehicleDecisionEnabled: false,
    inventGpsEnabled: false,
    inventCostsEnabled: false,
    recommendationDraftsEnabled: partial?.recommendationDraftsEnabled ?? true,
    maintenanceSuggestionsEnabled: partial?.maintenanceSuggestionsEnabled ?? true,
    costReductionEnabled: partial?.costReductionEnabled ?? true,
    routeImprovementsEnabled: partial?.routeImprovementsEnabled ?? true,
    efficiencyInsightsEnabled: partial?.efficiencyInsightsEnabled ?? true,
    replacementPlanningEnabled: partial?.replacementPlanningEnabled ?? true,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}
