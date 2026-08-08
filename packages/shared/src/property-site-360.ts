/**
 * Row 84 — CURRENT Property / Site 360
 *
 * Reuses cx_customer_properties as the canonical site root.
 * Does not rebuild Customer 360, equipment registries, or invent sites.
 *
 * Invariants:
 * - One customer → many sites
 * - One site → many assets (via al_asset_registry_profiles)
 * - Job site snapshots are immutable after capture
 * - Reuse customer_people for site contacts (no second people table)
 * - Technicians/Clients denied unrestricted Property 360
 * - Staging Royal Cape / CRC relationships must not regress
 */

import {
  canAccessCustomer360,
  canWriteCustomer360,
  CUSTOMER_360_CRC_STAGING,
} from './customer-360.js';

export const PROPERTY_SITE_360_KEY = 'property-site-360' as const;

export const PROPERTY_SITE_360_ROYAL_CAPE = {
  ...CUSTOMER_360_CRC_STAGING,
  propertyId: '8b42a5d3-97fa-4d53-b61a-9917accf9fa8',
  propertyName: 'Royal Cape Yacht Club',
  jobId: '5920ef4a-51a9-44ec-8577-09d187ca9c33',
  jobNumber: 'JOB-000002',
} as const;

export type PropertySiteStatus = 'active' | 'inactive' | 'archived';
export type PropertySiteContactRole = 'primary' | 'project' | 'access' | 'other';

export type PropertySiteSectionKey =
  | 'overview'
  | 'equipment'
  | 'jobs'
  | 'visits'
  | 'documents'
  | 'notes'
  | 'activity';

export const PROPERTY_SITE_360_SECTIONS: Array<{ key: PropertySiteSectionKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'visits', label: 'Visits / Service History' },
  { key: 'documents', label: 'Documents' },
  { key: 'notes', label: 'Notes' },
  { key: 'activity', label: 'Activity' },
];

export type PropertySiteContact = {
  id: string;
  propertyId: string;
  personId: string;
  displayName: string;
  role: PropertySiteContactRole;
  isPrimary: boolean;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export type PropertySiteEquipmentSummary = {
  id: string;
  name: string;
  assetType: string;
  status: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  installationDate: string | null;
  href: string;
};

export type PropertySiteJobSummary = {
  id: string;
  jobNumber: string | null;
  title: string;
  status: string;
  executionPhase: string | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  href: string;
  snapshot: PropertyJobSiteSnapshot;
};

export type PropertyJobSiteSnapshot = {
  propertyId: string | null;
  siteName: string | null;
  street: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  unit: string | null;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string | null;
  siteContactName: string | null;
  immutable: true;
};

export type PropertySiteVisitSummary = {
  id: string;
  jobId: string;
  jobNumber: string | null;
  visitNumber: number;
  status: string;
  closeReason: string | null;
  labourMinutes: number;
  startedAt: string | null;
  endedAt: string | null;
};

export type PropertySiteDocumentSummary = {
  id: string;
  title: string;
  fileName: string;
  jobId: string | null;
  createdAt: string;
};

export type PropertySiteNote = {
  id: string;
  content: string;
  authorName: string;
  createdAt: string;
  visibility: 'internal';
};

export type PropertySiteActivityEvent = {
  id: string;
  kind: 'job' | 'visit' | 'document' | 'note' | 'equipment' | 'property';
  occurredAt: string;
  title: string;
  summary: string;
  href: string | null;
  relatedId: string | null;
};

export type PropertySiteWorkspace = {
  profile: {
    id: string;
    propertyName: string;
    customerId: string;
    customerName: string;
    status: PropertySiteStatus;
    addressLine1: string | null;
    addressLine2: string | null;
    suburb: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    country: string | null;
    unitNumber: string | null;
    addressDisplay: string | null;
    latitude: number | null;
    longitude: number | null;
    geocodeStatus: string | null;
    accessInstructions: string | null;
    siteNotes: string | null;
    isPrimary: boolean;
    sourceProvider: string | null;
    sourceExternalId: string | null;
    primaryContactName: string | null;
    createdAt: string;
    updatedAt: string;
    provenanceNote: string;
  };
  contacts: PropertySiteContact[];
  equipment: PropertySiteEquipmentSummary[];
  jobs: PropertySiteJobSummary[];
  visits: PropertySiteVisitSummary[];
  documents: PropertySiteDocumentSummary[];
  notes: PropertySiteNote[];
  activity: {
    events: PropertySiteActivityEvent[];
    total: number;
    limit: number;
    offset: number;
    order: 'newest' | 'oldest';
    hasMore: boolean;
  };
  sections: typeof PROPERTY_SITE_360_SECTIONS;
  counts: {
    equipment: number;
    jobs: number;
    visits: number;
    documents: number;
  };
  policy: {
    rebuildsProperties: false;
    inventsData: false;
    parallelAssetRegistry: false;
    jobSnapshotsImmutable: true;
    technicianClientDenied: true;
  };
};

export function canAccessPropertySite360(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessCustomer360(identity);
}

export function canWritePropertySite360(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canWriteCustomer360(identity);
}

export function assertTechnicianDeniedPropertySite360(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): { allowed: false; reason: string } | { allowed: true } {
  const role = identity.roleName ?? '';
  if (role === 'Technician') {
    return {
      allowed: false,
      reason:
        'Technicians cannot open unrestricted Property 360 — use assigned job field site details only.',
    };
  }
  if (role === 'Client') {
    return {
      allowed: false,
      reason: 'Clients receive portal own-property data only — internal Property 360 denied.',
    };
  }
  if (!canAccessPropertySite360(identity)) {
    return { allowed: false, reason: 'Missing Property 360 permissions.' };
  }
  return { allowed: true };
}

export function normalizePropertyAddressKey(input: {
  propertyName: string;
  street?: string | null;
  suburb?: string | null;
  city?: string | null;
  postalCode?: string | null;
}): string {
  const parts = [
    input.propertyName,
    input.street,
    input.suburb,
    input.city,
    input.postalCode,
  ].map((p) =>
    String(p ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' '),
  );
  return parts.join('|');
}

export function planPropertyDuplicateWarning(input: {
  candidates: Array<{ id: string; propertyName: string; addressKey: string }>;
  incomingAddressKey: string;
}): {
  decision: 'OK' | 'WARN_REVIEW' | 'BLOCK_EXACT';
  matches: Array<{ id: string; propertyName: string }>;
  reason: string;
} {
  const matches = input.candidates.filter((c) => c.addressKey === input.incomingAddressKey);
  if (matches.length === 0) {
    return { decision: 'OK', matches: [], reason: 'No matching site for this customer.' };
  }
  if (matches.length === 1) {
    return {
      decision: 'WARN_REVIEW',
      matches: matches.map((m) => ({ id: m.id, propertyName: m.propertyName })),
      reason:
        'Possible duplicate site (same customer + normalized name/address). Do not auto-merge — review required.',
    };
  }
  return {
    decision: 'WARN_REVIEW',
    matches: matches.map((m) => ({ id: m.id, propertyName: m.propertyName })),
    reason: 'Multiple similar sites — stop for review; do not silently merge.',
  };
}

/**
 * Property current address may change; completed job snapshots must not.
 */
export function assertJobSiteSnapshotImmutable(input: {
  before: PropertyJobSiteSnapshot;
  afterPropertyAddress: { street: string | null; city: string | null };
  afterSnapshot: PropertyJobSiteSnapshot;
}): { immutable: true } {
  if (
    input.before.street !== input.afterSnapshot.street ||
    input.before.city !== input.afterSnapshot.city ||
    input.before.siteName !== input.afterSnapshot.siteName ||
    input.before.formattedAddress !== input.afterSnapshot.formattedAddress
  ) {
    throw new Error('Historical job-site snapshot mutated after property edit.');
  }
  // Property current address is allowed to differ from snapshot.
  void input.afterPropertyAddress;
  return { immutable: true };
}

export function buildJobSiteSnapshotFromJob(input: {
  propertyId: string | null;
  titleFallback?: string | null;
  snapshotStreet: string | null;
  snapshotSuburb: string | null;
  snapshotCity: string | null;
  snapshotProvince: string | null;
  snapshotPostalCode: string | null;
  snapshotUnit: string | null;
  snapshotLatitude: number | null;
  snapshotLongitude: number | null;
  snapshotFormattedAddress: string | null;
  snapshotSiteContactName: string | null;
  propertyName?: string | null;
}): PropertyJobSiteSnapshot {
  return {
    propertyId: input.propertyId,
    siteName: input.propertyName ?? input.titleFallback ?? null,
    street: input.snapshotStreet,
    suburb: input.snapshotSuburb,
    city: input.snapshotCity,
    province: input.snapshotProvince,
    postalCode: input.snapshotPostalCode,
    unit: input.snapshotUnit,
    latitude: input.snapshotLatitude,
    longitude: input.snapshotLongitude,
    formattedAddress: input.snapshotFormattedAddress,
    siteContactName: input.snapshotSiteContactName,
    immutable: true,
  };
}

export function dedupePropertyActivityEvents(
  events: PropertySiteActivityEvent[],
): PropertySiteActivityEvent[] {
  const seen = new Set<string>();
  const out: PropertySiteActivityEvent[] = [];
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    out.push(event);
  }
  return out;
}

export function paginatePropertyActivity(input: {
  events: PropertySiteActivityEvent[];
  limit: number;
  offset: number;
  order: 'newest' | 'oldest';
}): PropertySiteWorkspace['activity'] {
  const deduped = dedupePropertyActivityEvents(input.events);
  const sorted = [...deduped].sort((a, b) => {
    if (a.occurredAt === b.occurredAt) return a.id.localeCompare(b.id);
    return input.order === 'oldest'
      ? a.occurredAt < b.occurredAt
        ? -1
        : 1
      : a.occurredAt < b.occurredAt
        ? 1
        : -1;
  });
  const limit = Math.max(1, Math.min(input.limit, 100));
  const offset = Math.max(0, input.offset);
  const slice = sorted.slice(offset, offset + limit);
  return {
    events: slice,
    total: sorted.length,
    limit,
    offset,
    order: input.order,
    hasMore: offset + slice.length < sorted.length,
  };
}

export function assertRoyalCapePropertyUnchanged(input: {
  propertyId: string;
  customerId: string;
  jobId: string;
  jobNumber: string | null;
  quoteId: string;
  quoteNumber: string;
  xeroQuoteId: string | null;
}): { unchanged: true } {
  if (input.propertyId !== PROPERTY_SITE_360_ROYAL_CAPE.propertyId) {
    throw new Error('Royal Cape property id changed unexpectedly.');
  }
  if (input.customerId !== PROPERTY_SITE_360_ROYAL_CAPE.canonicalCustomerId) {
    throw new Error('Royal Cape must remain under canonical CRC.');
  }
  if (input.jobId !== PROPERTY_SITE_360_ROYAL_CAPE.jobId) {
    throw new Error('Royal Cape job id changed.');
  }
  if (input.jobNumber !== PROPERTY_SITE_360_ROYAL_CAPE.jobNumber) {
    throw new Error('Royal Cape job number must remain JOB-000002.');
  }
  if (input.quoteId !== PROPERTY_SITE_360_ROYAL_CAPE.royalCapeQuoteId) {
    throw new Error('QU-0183 TITAN id changed.');
  }
  if (input.quoteNumber !== PROPERTY_SITE_360_ROYAL_CAPE.royalCapeQuoteNumber) {
    throw new Error('Quote number must remain QU-0183.');
  }
  if (input.xeroQuoteId !== PROPERTY_SITE_360_ROYAL_CAPE.royalCapeXeroQuoteId) {
    throw new Error('Xero quote id must remain unchanged.');
  }
  return { unchanged: true };
}

export function assertOneJobManyVisits(input: {
  propertyId: string;
  jobIds: string[];
  visitJobIds: string[];
}): { ok: true } {
  const uniqueJobs = new Set(input.jobIds);
  if (uniqueJobs.size === 0) throw new Error('Expected at least one job for multi-day proof.');
  for (const visitJobId of input.visitJobIds) {
    if (!uniqueJobs.has(visitJobId)) {
      throw new Error('Visit must belong to the same job at this property.');
    }
  }
  return { ok: true };
}

export function buildPropertySiteAuditActions() {
  return [
    'property_created',
    'property_updated',
    'property_archived',
    'property_site_contact_linked',
    'property_site_contact_unlinked',
    'property_equipment_linked',
    'property_equipment_unlinked',
    'property_note_updated',
  ] as const;
}
