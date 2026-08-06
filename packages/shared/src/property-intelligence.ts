/**
 * Property Intelligence Platform (Department 12 / Expansion)
 *
 * Extends existing `cx_customer_properties` + customers / Customer 360 / jobs /
 * documents / recurring maintenance — does not rebuild property tables.
 *
 * Surfaces real property profiles:
 * - Address + Google Maps location (real coords only; authenticated Maps config)
 * - Installed equipment / geysers (asset registry + maintenance plans)
 * - COCs / photos (completion reports, job document packs, CX docs)
 * - Previous work + maintenance history
 *
 * AURA: property history understanding, maintenance opportunities, follow-up
 * recommendations — drafts only; never auto-comms.
 *
 * Invariants:
 * - No fake properties, customers, jobs, or maintenance
 * - Tenant isolation via companyId
 * - Owner approval for insight drafts; never auto-send / auto-mutate
 * - Maps unavailable without real coordinates / Maps connection — never invented
 */

export const PROPERTY_INTELLIGENCE_KEY = 'property-intelligence' as const;

export type PriAvailability = 'available' | 'unavailable';

export type PriInsightKind =
  | 'property_history'
  | 'maintenance_opportunity'
  | 'follow_up'
  | 'equipment_attention'
  | 'coc_attention';

export type PriInsightDraftStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'acknowledged';

export type PriAuraInsightTarget =
  | 'command_centre'
  | 'executive_dashboard'
  | 'crm'
  | 'customer_360'
  | 'jobs'
  | 'documents'
  | 'recurring_maintenance'
  | 'operations';

export type PriAuraInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type PriPropertyProfile = {
  propertyId: string;
  customerId: string;
  customerName: string;
  propertyName: string;
  addressLine1: string | null;
  addressLine2: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  unitNumber: string | null;
  formattedAddress: string | null;
  isPrimary: boolean;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  geocodeStatus: string | null;
  hasRealCoordinates: boolean;
  jobCount: number;
  equipmentCount: number;
  geyserCount: number;
  cocCount: number;
  photoCount: number;
  maintenancePlanCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PriEquipmentRow = {
  id: string;
  source: 'asset_registry' | 'maintenance_plan';
  propertyId: string | null;
  propertyName: string | null;
  customerId: string | null;
  assetId: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  plumbingKind: string | null;
  isGeyser: boolean;
  status: string | null;
  installationDate: string | null;
};

export type PriCocRow = {
  id: string;
  source: 'completion_report' | 'job_document_pack' | 'cx_document';
  propertyId: string | null;
  propertyName: string | null;
  customerId: string | null;
  jobId: string | null;
  title: string;
  status: string | null;
  createdAt: string;
};

export type PriPhotoRow = {
  id: string;
  source: 'completion_report' | 'job_document_pack' | 'asset' | 'booking';
  propertyId: string | null;
  propertyName: string | null;
  customerId: string | null;
  jobId: string | null;
  label: string;
  createdAt: string;
};

export type PriPreviousWorkRow = {
  id: string;
  propertyId: string | null;
  propertyName: string | null;
  customerId: string;
  customerName: string | null;
  jobNumber: string | null;
  title: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PriMaintenanceHistoryRow = {
  id: string;
  source: 'plan' | 'run';
  propertyId: string | null;
  propertyName: string | null;
  customerId: string | null;
  planId: string;
  planName: string;
  plumbingKind: string | null;
  status: string;
  nextDueAt: string | null;
  lastCompletedAt: string | null;
  runCompletedAt: string | null;
};

export type PriInsightDraftSummary = {
  id: string;
  kind: PriInsightKind;
  status: PriInsightDraftStatus;
  title: string;
  body: string;
  propertyId: string | null;
  customerId: string | null;
  jobId: string | null;
  /** Invariant: always false — never auto-send customer communications. */
  autoSend: false;
  /** Invariant: always false — never invent properties/coords. */
  inventedProperty: false;
  createdAt: string;
  decidedAt: string | null;
};

export type PriAuraInsightSummary = {
  id: string;
  target: PriAuraInsightTarget;
  status: PriAuraInsightStatus;
  title: string;
  insight: string;
  href: string | null;
  propertyId: string | null;
  customerId: string | null;
  sourceInsightDraftId: string | null;
  createdAt: string;
};

export type PriAuraConnection = {
  target: PriAuraInsightTarget;
  label: string;
  href: string;
  status: 'available_link' | 'registry_stub';
  note: string;
};

export type PriSettings = {
  id: string;
  /** Invariant: always false. */
  autoSendEnabled: false;
  /** Invariant: always false. */
  inventPropertiesEnabled: false;
  insightDraftsEnabled: boolean;
  mapsSignalsEnabled: boolean;
  maintenanceSignalsEnabled: boolean;
  notes: string | null;
  updatedAt: string;
};

export type PriMapsSnapshot = {
  availability: PriAvailability;
  googleMapsConnected: boolean;
  connectionStatus: string | null;
  propertiesWithCoordinates: number;
  propertiesWithoutCoordinates: number;
  lastSyncAt: string | null;
  rationale: string;
};

export type PriEquipmentSnapshot = {
  availability: PriAvailability;
  equipmentCount: number;
  geyserCount: number;
  rationale: string;
};

export type PriDocumentSnapshot = {
  availability: PriAvailability;
  cocCount: number;
  photoCount: number;
  rationale: string;
};

export type PriWorkSnapshot = {
  availability: PriAvailability;
  jobCount: number;
  maintenancePlanCount: number;
  maintenanceRunCount: number;
  rationale: string;
};

export type PriDashboard = {
  summary: string;
  productClarification: {
    crmProperties: string;
    customer360: string;
    thisLayer: string;
  };
  policy: {
    autoSendEnabled: false;
    inventPropertiesEnabled: false;
    requiresOwnerApproval: true;
    fakeProperties: false;
  };
  maps: PriMapsSnapshot;
  equipment: PriEquipmentSnapshot;
  documents: PriDocumentSnapshot;
  work: PriWorkSnapshot;
  propertyProfiles: PriPropertyProfile[];
  equipmentRows: PriEquipmentRow[];
  geyserRows: PriEquipmentRow[];
  cocRows: PriCocRow[];
  photoRows: PriPhotoRow[];
  previousWork: PriPreviousWorkRow[];
  maintenanceHistory: PriMaintenanceHistoryRow[];
  insightDrafts: PriInsightDraftSummary[];
  auraInsights: PriAuraInsightSummary[];
  auraConnections: PriAuraConnection[];
  settings: PriSettings;
  pendingApprovals: number;
  totalProperties: number;
  linkedCustomerCount: number;
};

export type RefreshPriInsightsRequest = {
  submitForApproval?: boolean;
};

export type DecidePriInsightDraftRequest = {
  decision: 'approve' | 'reject' | 'acknowledge';
  notes?: string;
};

export type UpdatePriSettingsRequest = {
  insightDraftsEnabled?: boolean;
  mapsSignalsEnabled?: boolean;
  maintenanceSignalsEnabled?: boolean;
  notes?: string | null;
};

export type CreatePriAuraInsightRequest = {
  target: PriAuraInsightTarget;
  title: string;
  insight: string;
  href?: string;
  propertyId?: string;
  customerId?: string;
  sourceInsightDraftId?: string;
};

export type AcknowledgePriInsightRequest = {
  status: 'acknowledged' | 'dismissed';
};

// ─── Access ───────────────────────────────────────────────────────────────────

export function canAccessPropertyIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') {
    return false;
  }
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('customers:read') ||
    identity.permissions.includes('customers:write') ||
    identity.permissions.includes('jobs:read') ||
    identity.permissions.includes('documents:read') ||
    identity.permissions.includes('ops:read') ||
    identity.permissions.includes('agents:read')
  );
}

export function canWritePropertyIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canAccessPropertyIntelligence(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('customers:write') ||
    identity.permissions.includes('ops:manage') ||
    identity.permissions.includes('jobs:write')
  );
}

export function canApprovePropertyIntelligenceDrafts(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canWritePropertyIntelligence(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return (
    identity.roleName === 'Company Owner' ||
    identity.roleName === 'Owner' ||
    identity.roleName === 'Platform Owner'
  );
}

export function canManagePropertyIntelligenceSettings(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canApprovePropertyIntelligenceDrafts(identity);
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export const PRI_PRODUCT_COPY = {
  crmProperties:
    'Operational property CRUD remains under CRM customer properties — this layer does not replace property management.',
  customer360:
    'Customer 360 remains the customer-centric unified profile; Property Intelligence is the property-centric overlay that coexists with it.',
  thisLayer:
    'Property Intelligence surfaces real property profiles (address, Maps coords, equipment, geysers, COCs, photos, previous work, maintenance) and Owner-gated AURA drafts. No fake properties. Never auto-send.',
} as const;

export function buildPriMapsSnapshot(input: {
  googleMapsConnected: boolean;
  connectionStatus: string | null;
  propertiesWithCoordinates: number;
  propertiesWithoutCoordinates: number;
  lastSyncAt: string | null;
}): PriMapsSnapshot {
  if (!input.googleMapsConnected && input.propertiesWithCoordinates === 0) {
    return {
      availability: 'unavailable',
      googleMapsConnected: false,
      connectionStatus: input.connectionStatus,
      propertiesWithCoordinates: 0,
      propertiesWithoutCoordinates: input.propertiesWithoutCoordinates,
      lastSyncAt: input.lastSyncAt,
      rationale:
        'Google Maps is not connected and no stored property coordinates exist — map location stays unavailable (not invented). Connect Maps under Integrations and geocode real properties when ready.',
    };
  }
  if (input.propertiesWithCoordinates === 0) {
    return {
      availability: 'unavailable',
      googleMapsConnected: input.googleMapsConnected,
      connectionStatus: input.connectionStatus,
      propertiesWithCoordinates: 0,
      propertiesWithoutCoordinates: input.propertiesWithoutCoordinates,
      lastSyncAt: input.lastSyncAt,
      rationale:
        'No real latitude/longitude on property records yet — map pins stay unavailable (not invented). Use authenticated Google Maps geocode/browser-config when ready.',
    };
  }
  return {
    availability: 'available',
    googleMapsConnected: input.googleMapsConnected,
    connectionStatus: input.connectionStatus,
    propertiesWithCoordinates: input.propertiesWithCoordinates,
    propertiesWithoutCoordinates: input.propertiesWithoutCoordinates,
    lastSyncAt: input.lastSyncAt,
    rationale: `${input.propertiesWithCoordinates} propert(y/ies) have real stored coordinates${
      input.googleMapsConnected ? ' with Google Maps connected' : ' (Maps connection optional for pin display)'
    }.`,
  };
}

export function buildPriEquipmentSnapshot(input: {
  equipmentCount: number;
  geyserCount: number;
}): PriEquipmentSnapshot {
  if (input.equipmentCount === 0 && input.geyserCount === 0) {
    return {
      availability: 'unavailable',
      equipmentCount: 0,
      geyserCount: 0,
      rationale:
        'No property-linked asset registry profiles or geyser maintenance plans yet — equipment signals unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    equipmentCount: input.equipmentCount,
    geyserCount: input.geyserCount,
    rationale: `Installed equipment from ${input.equipmentCount} real asset/plan link(s); ${input.geyserCount} geyser signal(s).`,
  };
}

export function buildPriDocumentSnapshot(input: {
  cocCount: number;
  photoCount: number;
}): PriDocumentSnapshot {
  if (input.cocCount === 0 && input.photoCount === 0) {
    return {
      availability: 'unavailable',
      cocCount: 0,
      photoCount: 0,
      rationale:
        'No real COC or photo evidence linked to properties/jobs yet — document signals unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    cocCount: input.cocCount,
    photoCount: input.photoCount,
    rationale: `Documents from real completion reports / packs / CX docs: ${input.cocCount} COC signal(s), ${input.photoCount} photo signal(s).`,
  };
}

export function buildPriWorkSnapshot(input: {
  jobCount: number;
  maintenancePlanCount: number;
  maintenanceRunCount: number;
}): PriWorkSnapshot {
  if (
    input.jobCount === 0 &&
    input.maintenancePlanCount === 0 &&
    input.maintenanceRunCount === 0
  ) {
    return {
      availability: 'unavailable',
      jobCount: 0,
      maintenancePlanCount: 0,
      maintenanceRunCount: 0,
      rationale:
        'No property-linked jobs or recurring maintenance history yet — previous work / maintenance stay unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    jobCount: input.jobCount,
    maintenancePlanCount: input.maintenancePlanCount,
    maintenanceRunCount: input.maintenanceRunCount,
    rationale: `Work from ${input.jobCount} property-linked job(s), ${input.maintenancePlanCount} maintenance plan(s), ${input.maintenanceRunCount} run(s).`,
  };
}

export function buildPriInsightDraft(input: {
  kind: PriInsightKind;
  propertyName?: string | null;
  detail: string;
}): { kind: PriInsightKind; title: string; body: string } {
  const subject = input.propertyName?.trim() || 'Property portfolio';
  const titles: Record<PriInsightKind, string> = {
    property_history: `Property history — ${subject}`,
    maintenance_opportunity: `Maintenance opportunity — ${subject}`,
    follow_up: `Follow-up — ${subject}`,
    equipment_attention: `Equipment attention — ${subject}`,
    coc_attention: `COC attention — ${subject}`,
  };
  return {
    kind: input.kind,
    title: titles[input.kind].slice(0, 200),
    body: [
      input.detail,
      '',
      'Insight draft from real property / job / maintenance / document signals only. Not invented.',
      'Draft only — Owner approval required. Does not auto-send or auto-mutate CRM/jobs/maintenance.',
    ].join('\n'),
  };
}

export function listPriAuraConnections(): PriAuraConnection[] {
  return [
    {
      target: 'crm',
      label: 'CRM customers',
      href: '/crm',
      status: 'available_link',
      note: 'Operational customer and property CRUD.',
    },
    {
      target: 'customer_360',
      label: 'Customer 360',
      href: '/customer-360-intelligence',
      status: 'registry_stub',
      note: 'Customer-centric 360 overlay when Dept 11 is live — coexists; does not duplicate.',
    },
    {
      target: 'jobs',
      label: 'Jobs',
      href: '/jobs',
      status: 'available_link',
      note: 'Previous work from real property-linked jobs.',
    },
    {
      target: 'documents',
      label: 'Documents',
      href: '/documents',
      status: 'available_link',
      note: 'COCs and photo evidence via completion reports and packs.',
    },
    {
      target: 'recurring_maintenance',
      label: 'Recurring Maintenance',
      href: '/recurring-maintenance',
      status: 'available_link',
      note: 'Property-linked maintenance plans, geysers, and runs.',
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
      note: 'Executive surface link; property insights stay draft until acknowledged.',
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

export function defaultPriSettings(partial?: {
  id?: string;
  insightDraftsEnabled?: boolean;
  mapsSignalsEnabled?: boolean;
  maintenanceSignalsEnabled?: boolean;
  notes?: string | null;
  updatedAt?: string;
}): PriSettings {
  return {
    id: partial?.id ?? 'pending',
    autoSendEnabled: false,
    inventPropertiesEnabled: false,
    insightDraftsEnabled: partial?.insightDraftsEnabled ?? true,
    mapsSignalsEnabled: partial?.mapsSignalsEnabled ?? true,
    maintenanceSignalsEnabled: partial?.maintenanceSignalsEnabled ?? true,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}

export function formatPriAddress(parts: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  unitNumber?: string | null;
  formattedAddress?: string | null;
}): string | null {
  if (parts.formattedAddress?.trim()) return parts.formattedAddress.trim();
  const chunks = [
    parts.unitNumber ? `Unit ${parts.unitNumber}` : null,
    parts.addressLine1,
    parts.addressLine2,
    parts.suburb,
    parts.city,
    parts.province,
    parts.postalCode,
  ]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p));
  return chunks.length > 0 ? chunks.join(', ') : null;
}
