/**
 * Row 83 — CURRENT Customer 360
 *
 * Extends canonical CRM customers. Does not rebuild CRM or invent customers.
 * Supports multiple people/contacts per company and non-destructive
 * associations to related Xero/source customer records.
 *
 * Invariants:
 * - No destructive merge / delete of Xero source customers
 * - Quote/invoice/payment ownership never moved by association
 * - Xero numbers / sourceExternalIds never replaced
 * - Consent never inferred from presence of email/phone
 * - Technicians and Clients denied full staff Customer 360
 * - Tenant-scoped everywhere
 */

import {
  canAccessCustomer360Intelligence,
  canViewCustomer360Finance,
  canViewCustomer360InternalNotes,
  canWriteCustomer360Intelligence,
  buildC360TimelineEvents,
  type C360TimelineEvent,
  type C360TimelineKind,
} from './customer-360-intelligence.js';

export const CUSTOMER_360_KEY = 'customer-360' as const;

export const CUSTOMER_360_CRC_STAGING = {
  youngGunsCompanyId: '095aef76-fef5-4139-af37-a42f2d7e2faf',
  canonicalCustomerId: '773497f7-2d71-4a3a-8d80-d113b841b843',
  canonicalName: 'CRC',
  xeroContactId: '9ff6c727-561b-49cb-a2a5-a22e117af850',
  rowanSourceCustomerId: 'd73df05b-d1e1-4f17-bc1d-890baa9f1e7e',
  royalCapeQuoteNumber: 'QU-0183',
  royalCapeQuoteId: '41178762-bb9a-4e5d-b568-07c330f18cbb',
  royalCapeXeroQuoteId: '4d9b1ceb-83dc-4ac6-8d58-ce7ac08f6db8',
} as const;

export type CustomerPersonStatus = 'active' | 'inactive';
export type CustomerConsentStatus =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'withdrawn'
  | 'do_not_contact';

export type CustomerPerson = {
  id: string;
  customerId: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  roleTitle: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  isPrimary: boolean;
  isBillingContact: boolean;
  isSiteContact: boolean;
  emailAllowed: boolean;
  smsAllowed: boolean;
  whatsappAllowed: boolean;
  phoneAllowed: boolean;
  preferredContactMethod: string | null;
  consentStatus: CustomerConsentStatus | string;
  consentSource: string | null;
  consentCapturedAt: string | null;
  status: CustomerPersonStatus;
  notes: string | null;
  sourceProvider: string | null;
  sourceExternalId: string | null;
  linkedSourceCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateCustomerPersonRequest = {
  firstName?: string | null;
  lastName?: string | null;
  displayName: string;
  roleTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  isPrimary?: boolean;
  isBillingContact?: boolean;
  isSiteContact?: boolean;
  emailAllowed?: boolean;
  smsAllowed?: boolean;
  whatsappAllowed?: boolean;
  phoneAllowed?: boolean;
  preferredContactMethod?: string | null;
  consentStatus?: CustomerConsentStatus | string;
  consentSource?: string | null;
  notes?: string | null;
  sourceProvider?: string | null;
  sourceExternalId?: string | null;
  linkedSourceCustomerId?: string | null;
};

export type UpdateCustomerPersonRequest = Partial<CreateCustomerPersonRequest> & {
  status?: CustomerPersonStatus;
};

export type CustomerSourceAssociation = {
  id: string;
  canonicalCustomerId: string;
  sourceCustomerId: string;
  sourceCustomerName: string | null;
  personId: string | null;
  associationRole: string;
  status: 'active' | 'removed';
  reason: string | null;
  sourceProvider: string | null;
  sourceExternalId: string | null;
  preservesFinancialOwnership: true;
  destructiveMerge: false;
  xeroWrite: false;
  createdAt: string;
  removedAt: string | null;
};

export type CreateCustomerSourceAssociationRequest = {
  sourceCustomerId: string;
  personId?: string | null;
  associationRole?: string;
  reason?: string | null;
  sourceProvider?: string | null;
  sourceExternalId?: string | null;
};

export type Customer360Billing = {
  companyName: string | null;
  vatNumber: string | null;
  billingAddress: string | null;
  email: string | null;
  phone: string | null;
  xeroContactId: string | null;
  note: string;
};

export type Customer360PropertySummary = {
  id: string;
  name: string;
  address: string | null;
  isPrimary: boolean;
  href: string;
};

export type Customer360EquipmentSummary = {
  id: string;
  name: string;
  assetType: string;
  status: string;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  propertyId: string | null;
  propertyName: string | null;
  latestServiceAt: string | null;
  href: string;
};

export type Customer360LeadSummary = {
  id: string;
  title: string | null;
  status: string | null;
  createdAt: string;
  href: string;
};

export type Customer360Note = {
  id: string;
  content: string;
  authorName: string;
  createdAt: string;
  visibility: 'internal';
};

export type Customer360SectionKey =
  | 'overview'
  | 'people'
  | 'properties'
  | 'equipment'
  | 'leads'
  | 'jobs'
  | 'quotes'
  | 'invoices'
  | 'payments'
  | 'documents'
  | 'communications'
  | 'notes';

export const CUSTOMER_360_SECTIONS: Array<{ key: Customer360SectionKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'people', label: 'People / Contacts' },
  { key: 'properties', label: 'Properties' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'leads', label: 'Leads' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'payments', label: 'Payments' },
  { key: 'documents', label: 'Documents' },
  { key: 'communications', label: 'Communications / Activity' },
  { key: 'notes', label: 'Notes' },
];

export type Customer360TimelinePage = {
  events: C360TimelineEvent[];
  total: number;
  limit: number;
  offset: number;
  order: 'newest' | 'oldest';
  hasMore: boolean;
};

export type Customer360Workspace = {
  profile: {
    id: string;
    displayName: string;
    companyName: string | null;
    legalName: string | null;
    vatNumber: string | null;
    email: string | null;
    phone: string | null;
    billingAddress: string | null;
    siteAddress: string | null;
    status: string;
    doNotContact: boolean;
    xeroContactId: string | null;
    primaryContactName: string | null;
    createdAt: string;
    updatedAt: string;
    provenanceNote: string;
  };
  people: CustomerPerson[];
  associations: CustomerSourceAssociation[];
  billing: Customer360Billing;
  preferences: {
    doNotContact: boolean;
    marketingConsents: Array<{
      channel: string;
      status: string;
      captureSource: string | null;
      capturedAt: string | null;
    }>;
    consentNeverInferredFromContactPresence: true;
    optOutAuthoritative: true;
  };
  notes: Customer360Note[];
  properties: Customer360PropertySummary[];
  equipment: Customer360EquipmentSummary[];
  leads: Customer360LeadSummary[];
  timeline: Customer360TimelinePage;
  sections: typeof CUSTOMER_360_SECTIONS;
  policy: {
    rebuildsCrm: false;
    inventsData: false;
    destructiveMerge: false;
    xeroWrites: false;
    preservesFinancialOwnership: true;
    technicianClientDenied: true;
  };
};

export function canAccessCustomer360(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canAccessCustomer360Intelligence(identity);
}

export function canWriteCustomer360(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canWriteCustomer360Intelligence(identity);
}

export function canViewCustomer360FinanceAmounts(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canViewCustomer360Finance(identity);
}

export function canViewCustomer360InternalNotesAccess(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  return canViewCustomer360InternalNotes(identity);
}

export function assertTechnicianDeniedCustomer360(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): { allowed: false; reason: string } | { allowed: true } {
  const role = identity.roleName ?? '';
  if (role === 'Technician') {
    return {
      allowed: false,
      reason: 'Technicians cannot open full Customer 360 — use assigned job field surfaces only.',
    };
  }
  if (role === 'Client') {
    return {
      allowed: false,
      reason: 'Clients receive portal own-data only — internal Customer 360 denied.',
    };
  }
  if (!canAccessCustomer360(identity)) {
    return { allowed: false, reason: 'Missing Customer 360 permissions.' };
  }
  return { allowed: true };
}

/**
 * Consent must never be inferred merely because an email/phone exists.
 */
export function resolveConsentTruth(input: {
  explicitConsentStatus: string | null | undefined;
  doNotContact: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
}): { status: string; inferredFromContactPresence: false; optOutAuthoritative: boolean } {
  if (input.doNotContact) {
    return {
      status: 'do_not_contact',
      inferredFromContactPresence: false,
      optOutAuthoritative: true,
    };
  }
  const status = (input.explicitConsentStatus ?? 'unknown').trim() || 'unknown';
  // Presence of contact details never upgrades unknown → granted.
  if (status === 'unknown' && (input.hasEmail || input.hasPhone)) {
    return { status: 'unknown', inferredFromContactPresence: false, optOutAuthoritative: true };
  }
  return {
    status,
    inferredFromContactPresence: false,
    optOutAuthoritative: status === 'denied' || status === 'withdrawn' || status === 'do_not_contact',
  };
}

export function assertSourceIdsPreserved(input: {
  before: { sourceExternalId: string | null; xeroContactId: string | null; quoteNumber?: string };
  after: { sourceExternalId: string | null; xeroContactId: string | null; quoteNumber?: string };
}): { preserved: true } {
  if (input.before.sourceExternalId !== input.after.sourceExternalId) {
    throw new Error('sourceExternalId must not change during Customer 360 association.');
  }
  if (input.before.xeroContactId !== input.after.xeroContactId) {
    throw new Error('Xero contact id must not change during Customer 360 association.');
  }
  if (
    input.before.quoteNumber != null &&
    input.after.quoteNumber != null &&
    input.before.quoteNumber !== input.after.quoteNumber
  ) {
    throw new Error('Quote number must remain Xero-authoritative.');
  }
  return { preserved: true };
}

export function assertAssociationDoesNotMoveOwnership(input: {
  quoteCustomerIdsBefore: string[];
  quoteCustomerIdsAfter: string[];
  invoiceCustomerIdsBefore: string[];
  invoiceCustomerIdsAfter: string[];
}): { ownershipUnchanged: true } {
  const same = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();
  if (!same(input.quoteCustomerIdsBefore, input.quoteCustomerIdsAfter)) {
    throw new Error('Association must not move quote ownership.');
  }
  if (!same(input.invoiceCustomerIdsBefore, input.invoiceCustomerIdsAfter)) {
    throw new Error('Association must not move invoice ownership.');
  }
  return { ownershipUnchanged: true };
}

export function planRuahnAssociation(input: {
  candidates: Array<{ id: string; name: string }>;
}): {
  decision: 'ASSOCIATE' | 'REVIEW_REQUIRED' | 'NOT_FOUND';
  candidate: { id: string; name: string } | null;
  reason: string;
} {
  if (input.candidates.length === 0) {
    return {
      decision: 'NOT_FOUND',
      candidate: null,
      reason: 'No Ruahn CRC source record found — do not invent a contact.',
    };
  }
  if (input.candidates.length > 1) {
    return {
      decision: 'REVIEW_REQUIRED',
      candidate: null,
      reason: `Found ${input.candidates.length} plausible Ruahn records — stop for review; do not guess.`,
    };
  }
  return {
    decision: 'ASSOCIATE',
    candidate: input.candidates[0]!,
    reason: 'Exactly one Ruahn source record — safe to associate non-destructively to CRC.',
  };
}

export function dedupeTimelineEvents(events: C360TimelineEvent[]): C360TimelineEvent[] {
  const seen = new Set<string>();
  const out: C360TimelineEvent[] = [];
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    out.push(event);
  }
  return out;
}

export function paginateTimelineEvents(input: {
  events: C360TimelineEvent[];
  limit: number;
  offset: number;
  order: 'newest' | 'oldest';
}): Customer360TimelinePage {
  const deduped = dedupeTimelineEvents(input.events);
  const sorted = [...deduped].sort((a, b) => {
    if (a.occurredAt === b.occurredAt) return a.id.localeCompare(b.id);
    if (input.order === 'oldest') {
      return a.occurredAt < b.occurredAt ? -1 : 1;
    }
    return a.occurredAt < b.occurredAt ? 1 : -1;
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

export function buildAssociatedHistoryTimelineTag(input: {
  sourceCustomerId: string;
  sourceCustomerName: string | null;
  kind: C360TimelineKind;
  relatedId: string;
}): string {
  return `assoc:${input.sourceCustomerId}:${input.kind}:${input.relatedId}`;
}

export function assertPopDoesNotCreatePayment(input: {
  popDocumentCount: number;
  paymentCount: number;
  paymentsInventedFromPop: boolean;
}): { ok: true } {
  if (input.paymentsInventedFromPop) {
    throw new Error('POP evidence must not create payment records.');
  }
  return { ok: true };
}

export function assertRoyalCapeRelationshipUnchanged(input: {
  quoteId: string;
  quoteNumber: string;
  customerId: string;
  xeroQuoteId: string | null;
  jobId: string | null;
}): { unchanged: true } {
  if (input.quoteId !== CUSTOMER_360_CRC_STAGING.royalCapeQuoteId) {
    throw new Error('Royal Cape QU-0183 TITAN id changed unexpectedly.');
  }
  if (input.quoteNumber !== CUSTOMER_360_CRC_STAGING.royalCapeQuoteNumber) {
    throw new Error('Royal Cape quote number must remain QU-0183.');
  }
  if (input.customerId !== CUSTOMER_360_CRC_STAGING.canonicalCustomerId) {
    throw new Error('QU-0183 must remain on canonical CRC — do not move to Rowan.');
  }
  if (input.xeroQuoteId !== CUSTOMER_360_CRC_STAGING.royalCapeXeroQuoteId) {
    throw new Error('Royal Cape Xero quote id must remain unchanged.');
  }
  return { unchanged: true };
}

export function buildCustomer360AuditActions() {
  return [
    'customer_profile_updated',
    'customer_person_created',
    'customer_person_updated',
    'customer_person_deactivated',
    'customer_source_associated',
    'customer_source_association_removed',
    'customer_preference_updated',
    'customer_consent_updated',
    'customer_note_created',
  ] as const;
}

/** Re-export timeline builder for workspace composition. */
export { buildC360TimelineEvents };
