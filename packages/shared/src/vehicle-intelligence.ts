/**
 * Vehicle Intelligence Foundation (Department 8.1)
 *
 * Extends existing Fleet / Cartrack / job-vehicle foundations with:
 * - Vehicle profiles from real fleet records
 * - Fuel tracking foundation from real fleet operating costs (fuel)
 * - Maintenance schedule signals from real vehicle status + asset schedules
 * - Vehicle costs and usage history from real cost / job-assignment rows
 * - AURA insight drafts (maintenance needs, cost trends, fleet risks)
 *
 * Invariants:
 * - No fake tracking / GPS / fuel data
 * - Unavailable when Cartrack not connected or no real records — never invented
 * - Does not replace /fleet or /fleet-intelligence operational surfaces
 * - Owner approval required for insight drafts; never auto-dispatch / auto-mutate fleet
 */

export type ViInsightKind =
  | 'maintenance_need'
  | 'cost_trend'
  | 'fleet_risk'
  | 'fuel_attention'
  | 'usage_gap';

export type ViInsightDraftStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'acknowledged';

export type ViAuraInsightTarget =
  | 'command_centre'
  | 'executive_dashboard'
  | 'fleet'
  | 'fleet_intelligence'
  | 'operations'
  | 'jobs'
  | 'scheduling'
  | 'technicians';

export type ViAuraInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type ViAvailability = 'available' | 'unavailable';

export type ViVehicleProfile = {
  vehicleId: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  licensePlate: string;
  vin: string | null;
  status: string;
  assignedUserId: string | null;
  assignedUserName: string | null;
  cartrackMapped: boolean;
  externalVehicleId: string | null;
  jobAssignmentCount: number;
  fuelCostCents: number;
  totalCostCents: number;
};

export type ViFuelRow = {
  id: string;
  vehicleId: string | null;
  vehicleName: string | null;
  amountCents: number;
  currency: string;
  notes: string | null;
  recordedAt: string;
};

export type ViMaintenanceRow = {
  id: string;
  source: 'vehicle_status' | 'asset_schedule';
  vehicleId: string | null;
  vehicleName: string | null;
  assetId: string | null;
  title: string;
  status: string;
  nextDueAt: string | null;
};

export type ViCostRow = {
  id: string;
  vehicleId: string | null;
  vehicleName: string | null;
  costType: string;
  amountCents: number;
  currency: string;
  notes: string | null;
  recordedAt: string;
};

export type ViUsageRow = {
  id: string;
  vehicleId: string;
  vehicleName: string | null;
  jobId: string;
  jobTitle: string | null;
  jobStatus: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  scheduledAt: string | null;
  assignedAt: string;
  unassignedAt: string | null;
};

export type ViInsightDraftSummary = {
  id: string;
  kind: ViInsightKind;
  status: ViInsightDraftStatus;
  title: string;
  body: string;
  vehicleId: string | null;
  jobId: string | null;
  /** Invariant: always false — this layer never auto-mutates fleet. */
  autoFleetMutation: false;
  /** Invariant: always false — this layer never invents GPS/fuel. */
  inventedTracking: false;
  createdAt: string;
  decidedAt: string | null;
};

export type ViAuraInsightSummary = {
  id: string;
  target: ViAuraInsightTarget;
  status: ViAuraInsightStatus;
  title: string;
  insight: string;
  href: string | null;
  sourceInsightDraftId: string | null;
  createdAt: string;
};

export type ViAuraConnection = {
  target: ViAuraInsightTarget;
  label: string;
  href: string;
  status: 'available_link' | 'registry_stub';
  note: string;
};

export type ViSettings = {
  id: string;
  /** Invariant: always false. */
  autoFleetMutationEnabled: false;
  /** Invariant: always false. */
  inventTrackingEnabled: false;
  insightDraftsEnabled: boolean;
  fuelSignalsEnabled: boolean;
  maintenanceSignalsEnabled: boolean;
  notes: string | null;
  updatedAt: string;
};

export type ViCartrackSnapshot = {
  availability: ViAvailability;
  cartrackConnected: boolean;
  connectionStatus: string | null;
  mappedVehicleCount: number;
  gpsPositionCount: number;
  lastSyncAt: string | null;
  rationale: string;
};

export type ViFuelSnapshot = {
  availability: ViAvailability;
  fuelRecordCount: number;
  totalFuelCostCents: number;
  rationale: string;
};

export type ViUsageSnapshot = {
  availability: ViAvailability;
  assignmentCount: number;
  distinctVehicles: number;
  distinctJobs: number;
  rationale: string;
};

export type ViMaintenanceSnapshot = {
  availability: ViAvailability;
  signalCount: number;
  vehiclesInMaintenance: number;
  rationale: string;
};

export type ViCostSnapshot = {
  availability: ViAvailability;
  costRecordCount: number;
  totalCostCents: number;
  rationale: string;
};

export type ViDashboard = {
  summary: string;
  productClarification: {
    fleetOps: string;
    fleetIntelligence: string;
    thisLayer: string;
  };
  policy: {
    autoFleetMutationEnabled: false;
    inventTrackingEnabled: false;
    requiresOwnerApproval: true;
    fakeTracking: false;
  };
  cartrack: ViCartrackSnapshot;
  fuel: ViFuelSnapshot;
  usage: ViUsageSnapshot;
  maintenance: ViMaintenanceSnapshot;
  costs: ViCostSnapshot;
  vehicleProfiles: ViVehicleProfile[];
  fuelRows: ViFuelRow[];
  maintenanceRows: ViMaintenanceRow[];
  costRows: ViCostRow[];
  usageHistory: ViUsageRow[];
  insightDrafts: ViInsightDraftSummary[];
  auraInsights: ViAuraInsightSummary[];
  auraConnections: ViAuraConnection[];
  settings: ViSettings;
  pendingApprovals: number;
  totalVehicles: number;
  technicianLinkCount: number;
  scheduledJobLinkCount: number;
};

export type RefreshViInsightsRequest = {
  submitForApproval?: boolean;
};

export type DecideViInsightDraftRequest = {
  decision: 'approve' | 'reject' | 'acknowledge';
  notes?: string;
};

export type UpdateViSettingsRequest = {
  insightDraftsEnabled?: boolean;
  fuelSignalsEnabled?: boolean;
  maintenanceSignalsEnabled?: boolean;
  notes?: string | null;
};

export type CreateViAuraInsightRequest = {
  target: ViAuraInsightTarget;
  title: string;
  insight: string;
  href?: string;
  sourceInsightDraftId?: string;
};

export type AcknowledgeViInsightRequest = {
  status: 'acknowledged' | 'dismissed';
};

// ─── Access ───────────────────────────────────────────────────────────────────

export function canAccessVehicleIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') {
    return false;
  }
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('fleet:read') ||
    identity.permissions.includes('fleet:write') ||
    identity.permissions.includes('fleet_intelligence:read') ||
    identity.permissions.includes('fleet_intelligence:write') ||
    identity.permissions.includes('agents:read')
  );
}

export function canWriteVehicleIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canAccessVehicleIntelligence(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('fleet:write') ||
    identity.permissions.includes('fleet_intelligence:write')
  );
}

export function canApproveVehicleIntelligenceDrafts(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canWriteVehicleIntelligence(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return (
    identity.roleName === 'Company Owner' ||
    identity.roleName === 'Owner' ||
    identity.roleName === 'Platform Owner'
  );
}

export function canManageVehicleIntelligenceSettings(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canApproveVehicleIntelligenceDrafts(identity);
}

// ─── Pure helpers (honest empty / draft builders) ─────────────────────────────

export const VI_PRODUCT_COPY = {
  fleetOps:
    'Operational fleet CRUD remains under /fleet — this layer does not replace vehicle management.',
  fleetIntelligence:
    'GPS analytics, trips, and fleet executive dashboards remain under /fleet-intelligence.',
  thisLayer:
    'Vehicle Intelligence surfaces real vehicle profiles, fuel/cost/usage signals, maintenance cues, and Owner-gated AURA insight drafts. No fake GPS/fuel. Never auto-mutate fleet.',
} as const;

export function buildViCartrackSnapshot(input: {
  cartrackConnected: boolean;
  connectionStatus: string | null;
  mappedVehicleCount: number;
  gpsPositionCount: number;
  lastSyncAt: string | null;
}): ViCartrackSnapshot {
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
        'Cartrack is connected but no mapped vehicles or GPS positions yet — tracking signals unavailable (not invented).',
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

export function buildViFuelSnapshot(input: {
  fuelRecordCount: number;
  totalFuelCostCents: number;
}): ViFuelSnapshot {
  if (input.fuelRecordCount === 0) {
    return {
      availability: 'unavailable',
      fuelRecordCount: 0,
      totalFuelCostCents: 0,
      rationale:
        'No real fuel operating-cost records yet — fuel tracking foundation unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    fuelRecordCount: input.fuelRecordCount,
    totalFuelCostCents: input.totalFuelCostCents,
    rationale: `Fuel foundation derived from ${input.fuelRecordCount} real fleet operating-cost row(s) typed as fuel.`,
  };
}

export function buildViUsageSnapshot(input: {
  assignmentCount: number;
  distinctVehicles: number;
  distinctJobs: number;
}): ViUsageSnapshot {
  if (input.assignmentCount === 0) {
    return {
      availability: 'unavailable',
      assignmentCount: 0,
      distinctVehicles: 0,
      distinctJobs: 0,
      rationale:
        'No job–vehicle assignments yet — usage history unavailable (not invented).',
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

export function buildViMaintenanceSnapshot(input: {
  signalCount: number;
  vehiclesInMaintenance: number;
}): ViMaintenanceSnapshot {
  if (input.signalCount === 0 && input.vehiclesInMaintenance === 0) {
    return {
      availability: 'unavailable',
      signalCount: 0,
      vehiclesInMaintenance: 0,
      rationale:
        'No vehicles in maintenance status and no vehicle-linked asset schedules — maintenance signals unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    signalCount: input.signalCount,
    vehiclesInMaintenance: input.vehiclesInMaintenance,
    rationale: `Maintenance cues from ${input.vehiclesInMaintenance} vehicle(s) in maintenance and ${input.signalCount} real schedule/status signal(s).`,
  };
}

export function buildViCostSnapshot(input: {
  costRecordCount: number;
  totalCostCents: number;
}): ViCostSnapshot {
  if (input.costRecordCount === 0) {
    return {
      availability: 'unavailable',
      costRecordCount: 0,
      totalCostCents: 0,
      rationale:
        'No real fleet operating-cost records yet — vehicle cost intelligence unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    costRecordCount: input.costRecordCount,
    totalCostCents: input.totalCostCents,
    rationale: `Costs derived from ${input.costRecordCount} real fleet operating-cost record(s).`,
  };
}

export function buildViInsightDraft(input: {
  kind: ViInsightKind;
  vehicleName?: string | null;
  detail: string;
}): { kind: ViInsightKind; title: string; body: string } {
  const subject = input.vehicleName?.trim() || 'Fleet';
  const titles: Record<ViInsightKind, string> = {
    maintenance_need: `Maintenance need — ${subject}`,
    cost_trend: `Cost trend — ${subject}`,
    fleet_risk: `Fleet risk — ${subject}`,
    fuel_attention: `Fuel attention — ${subject}`,
    usage_gap: `Usage gap — ${subject}`,
  };
  return {
    kind: input.kind,
    title: titles[input.kind].slice(0, 200),
    body: [
      input.detail,
      '',
      'Insight draft from real fleet/Cartrack/job signals only. Not invented GPS or fuel.',
      'Draft only — Owner approval required. Does not auto-mutate fleet, dispatch, or tracking.',
    ].join('\n'),
  };
}

export function listViAuraConnections(): ViAuraConnection[] {
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
      note: 'GPS analytics and fleet executive dashboard when Cartrack data exists.',
    },
    {
      target: 'jobs',
      label: 'Jobs',
      href: '/jobs',
      status: 'available_link',
      note: 'Usage history links to real job–vehicle assignments.',
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
      note: 'Executive surface link; vehicle insights stay draft until acknowledged.',
    },
    {
      target: 'operations',
      label: 'Operations',
      href: '/dispatch-intelligence',
      status: 'registry_stub',
      note: 'Ops handoff stub — no invented dispatch impact.',
    },
  ];
}

export function defaultViSettings(partial?: {
  id?: string;
  insightDraftsEnabled?: boolean;
  fuelSignalsEnabled?: boolean;
  maintenanceSignalsEnabled?: boolean;
  notes?: string | null;
  updatedAt?: string;
}): ViSettings {
  return {
    id: partial?.id ?? 'pending',
    autoFleetMutationEnabled: false,
    inventTrackingEnabled: false,
    insightDraftsEnabled: partial?.insightDraftsEnabled ?? true,
    fuelSignalsEnabled: partial?.fuelSignalsEnabled ?? true,
    maintenanceSignalsEnabled: partial?.maintenanceSignalsEnabled ?? true,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}
