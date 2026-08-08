/**
 * Row 86 — Real Young Guns Equipment / Assets Import + Linkage
 *
 * Reuses canonical asset_equipment + al_asset_registry_profiles.
 * Does NOT build a parallel equipment database.
 * No fake equipment. No blind merges. No Xero writes. Staging-first.
 *
 * Preferred match order:
 * 1. sourceProvider + sourceExternalId
 * 2. exact normalized serial
 * 3. existing explicit import/mapping relationship
 * 4. other strong canonical evidence
 *
 * Ambiguous → REVIEW REQUIRED (never silent merge).
 * Royal Cape remains NO_VERIFIED_EQUIPMENT_LINKED unless genuine evidence.
 */

import { PROPERTY_SITE_360_ROYAL_CAPE } from './property-site-360.js';
import { scoreEquipmentHistoricalMatch } from './historical-import.js';

export const EQUIPMENT_ASSETS_IMPORT_KEY = 'equipment-assets-import' as const;

export const EQUIPMENT_ASSETS_IMPORT_CRC = {
  ...PROPERTY_SITE_360_ROYAL_CAPE,
  rowanSourceCustomerId: 'd73df05b-d1e1-4f17-bc1d-890baa9f1e7e',
  rowanXeroContactId: 'b37e7820-178f-42d1-8855-11d647c42d62',
} as const;

export type EquipmentImportAction =
  | 'DISCOVERED'
  | 'EXACT_MATCH'
  | 'CREATE'
  | 'UPDATE'
  | 'UNCHANGED'
  | 'REVIEW_REQUIRED'
  | 'SKIP'
  | 'FAILED';

export type EquipmentReviewReason =
  | 'IDENTITY_CONFLICT'
  | 'AMBIGUOUS_CANDIDATE'
  | 'CONFLICTING_SERIAL_CUSTOMER'
  | 'CONFLICTING_SERIAL_PROPERTY'
  | 'CONFLICTING_SERIAL_TYPE'
  | 'CONFLICTING_SERIAL_SOURCE'
  | 'CUSTOMER_KNOWN_PROPERTY_UNKNOWN'
  | 'WEAK_IDENTITY'
  | 'CONFLICTING_MAKE_MODEL'
  | 'UNKNOWN_OWNERSHIP'
  | 'AMBIGUOUS_JOB_LINKAGE'
  | 'VERIFIED_FIELD_CONFLICT'
  | 'MISSING_AUTHORISED_SOURCE'
  | 'SOLE_SITE_GUESS_REJECTED';

export type EquipmentFieldConflictClass =
  | 'SOURCE_NEWER_AUTHORITATIVE'
  | 'CURRENT_VERIFIED'
  | 'CONFLICT_REVIEW_REQUIRED';

export type EquipmentSourceRecord = {
  sourceProvider: string;
  sourceExternalId: string | null;
  name: string | null;
  equipmentType: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  status: string | null;
  installationDate: string | null;
  commissioningDate: string | null;
  warrantyExpiresAt: string | null;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  propertyId: string | null;
  propertyName: string | null;
  jobId: string | null;
  jobNumber: string | null;
  documentIds: string[];
  sourceOccurredAt: string | null;
  mappingAssetId: string | null;
  notes: string | null;
};

export type ExistingCanonicalEquipment = {
  assetId: string;
  name: string;
  assetType: string;
  status: string;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  customerId: string | null;
  propertyId: string | null;
  sourceProvider: string | null;
  sourceExternalId: string | null;
  installationDate: string | null;
  warrantyExpiresAt: string | null;
  documentIds: string[];
  verifiedFields: string[];
  relatedJobNumbers: string[];
  updatedAt: string | null;
};

export type EquipmentMatchDecision = {
  action: EquipmentImportAction;
  matchedAssetId: string | null;
  confidence: 'exact' | 'high' | 'low' | 'none';
  matchReason: string;
  reviewReasons: EquipmentReviewReason[];
  proposedCustomerId: string | null;
  proposedPropertyId: string | null;
  propertyLinkageState: 'LINKED' | 'UNASSIGNED' | 'REVIEW_REQUIRED';
  fieldsChanging: string[];
  fieldConflicts: Array<{
    field: string;
    current: string | null;
    incoming: string | null;
    classification: EquipmentFieldConflictClass;
  }>;
  provenancePreserved: true;
  inventsData: false;
  xeroWrites: 0;
  autoMerge: false;
};

export type EquipmentPreviewRow = {
  sourceId: string;
  sourceProvider: string;
  sourceExternalId: string | null;
  equipmentIdentity: {
    name: string | null;
    serialNumber: string | null;
    manufacturer: string | null;
    model: string | null;
    equipmentType: string | null;
  };
  proposedCustomerId: string | null;
  proposedPropertyId: string | null;
  decision: EquipmentMatchDecision;
};

export type EquipmentPreviewSummary = {
  discovered: number;
  exactMatch: number;
  create: number;
  update: number;
  unchanged: number;
  reviewRequired: number;
  skip: number;
  failed: number;
  missingAuthorisedSource: boolean;
  oldestSourceDate: string | null;
  newestSourceDate: string | null;
  xeroWrites: 0;
  productionWrites: 0;
  inventsData: false;
  rows: EquipmentPreviewRow[];
};

export type EquipmentApplyCounts = {
  discovered: number;
  created: number;
  updated: number;
  unchanged: number;
  reviewRequired: number;
  skipped: number;
  failed: number;
  duplicateEquipment: number;
  duplicateRegistryProfiles: number;
  duplicatePropertyLinks: number;
  duplicateJobLinks: number;
  duplicateDocumentLinks: number;
  xeroWrites: 0;
  productionWrites: 0;
};

export type EquipmentDataQualityStats = {
  withSerial: number;
  missingSerial: number;
  withMake: number;
  missingMake: number;
  withModel: number;
  missingModel: number;
  customerLinked: number;
  customerUnlinked: number;
  propertyLinked: number;
  propertyUnassigned: number;
  jobHistoryLinked: number;
  noHistory: number;
  ambiguous: number;
  duplicateCandidates: number;
};

/** Normalize serial for strong identity compare — spaces/casing/harmless formatting only. */
export function normalizeEquipmentSerial(serial: string | null | undefined): string | null {
  if (serial == null) return null;
  const trimmed = String(serial).trim();
  if (!trimmed) return null;
  // Collapse internal whitespace and strip common harmless separators around alphanumerics.
  const collapsed = trimmed.replace(/\s+/g, '').replace(/[-_./]/g, '').toUpperCase();
  return collapsed.length > 0 ? collapsed : null;
}

export function serialsEquivalent(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeEquipmentSerial(a);
  const nb = normalizeEquipmentSerial(b);
  if (!na || !nb) return false;
  return na === nb;
}

/** Materially different serials must not collapse (e.g. SN-001 vs SN-001A). */
export function serialsMateriallyDifferent(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeEquipmentSerial(a);
  const nb = normalizeEquipmentSerial(b);
  if (!na || !nb) return false;
  return na !== nb;
}

export function extractEquipmentProvenance(metadata: Record<string, unknown> | null | undefined): {
  sourceProvider: string | null;
  sourceExternalId: string | null;
  manufacturer: string | null;
  model: string | null;
  relatedJobNumber: string | null;
  historicalImport: boolean;
} {
  const meta = metadata ?? {};
  return {
    sourceProvider: typeof meta.sourceProvider === 'string' ? meta.sourceProvider : null,
    sourceExternalId: typeof meta.sourceExternalId === 'string' ? meta.sourceExternalId : null,
    manufacturer: typeof meta.manufacturer === 'string' ? meta.manufacturer : null,
    model: typeof meta.model === 'string' ? meta.model : null,
    relatedJobNumber: typeof meta.relatedJobNumber === 'string' ? meta.relatedJobNumber : null,
    historicalImport: meta.historicalImport === true,
  };
}

export function findBySourceExternalId(
  existing: ExistingCanonicalEquipment[],
  sourceProvider: string,
  sourceExternalId: string | null,
): ExistingCanonicalEquipment | null {
  if (!sourceExternalId) return null;
  const provider = sourceProvider.trim().toLowerCase();
  const ext = sourceExternalId.trim();
  return (
    existing.find(
      (row) =>
        (row.sourceProvider ?? '').trim().toLowerCase() === provider &&
        (row.sourceExternalId ?? '').trim() === ext,
    ) ?? null
  );
}

export function findByNormalizedSerial(
  existing: ExistingCanonicalEquipment[],
  serialNumber: string | null,
): ExistingCanonicalEquipment[] {
  const target = normalizeEquipmentSerial(serialNumber);
  if (!target) return [];
  return existing.filter((row) => normalizeEquipmentSerial(row.serialNumber) === target);
}

export function detectSerialIdentityConflicts(
  matches: ExistingCanonicalEquipment[],
  source: EquipmentSourceRecord,
): EquipmentReviewReason[] {
  if (matches.length <= 1) {
    if (matches.length === 1) {
      const m = matches[0]!;
      const reasons: EquipmentReviewReason[] = [];
      if (
        source.customerId &&
        m.customerId &&
        source.customerId !== m.customerId
      ) {
        reasons.push('CONFLICTING_SERIAL_CUSTOMER');
      }
      if (
        source.propertyId &&
        m.propertyId &&
        source.propertyId !== m.propertyId
      ) {
        reasons.push('CONFLICTING_SERIAL_PROPERTY');
      }
      if (
        source.equipmentType &&
        m.assetType &&
        source.equipmentType.trim().toLowerCase().replace(/\s+/g, '_') !==
          m.assetType.trim().toLowerCase()
      ) {
        // Only conflict when both sides have concrete non-generic types that disagree.
        const srcType = source.equipmentType.trim().toLowerCase().replace(/\s+/g, '_');
        if (srcType !== 'equipment' && m.assetType !== 'equipment' && srcType !== m.assetType) {
          reasons.push('CONFLICTING_SERIAL_TYPE');
        }
      }
      if (
        source.sourceExternalId &&
        m.sourceExternalId &&
        source.sourceProvider &&
        m.sourceProvider &&
        (source.sourceProvider !== m.sourceProvider ||
          source.sourceExternalId !== m.sourceExternalId)
      ) {
        reasons.push('CONFLICTING_SERIAL_SOURCE');
      }
      if (reasons.length > 0) reasons.unshift('IDENTITY_CONFLICT');
      return reasons;
    }
    return [];
  }
  return ['IDENTITY_CONFLICT', 'AMBIGUOUS_CANDIDATE', 'CONFLICTING_SERIAL_SOURCE'];
}

export function resolvePropertyLinkage(input: {
  customerId: string | null;
  propertyId: string | null;
  propertyName: string | null;
  customerPropertyCount: number;
  explicitPropertyEvidence: boolean;
}): {
  propertyId: string | null;
  state: 'LINKED' | 'UNASSIGNED' | 'REVIEW_REQUIRED';
  reviewReasons: EquipmentReviewReason[];
} {
  if (input.propertyId && input.explicitPropertyEvidence) {
    return { propertyId: input.propertyId, state: 'LINKED', reviewReasons: [] };
  }
  if (input.propertyId && input.propertyName) {
    return { propertyId: input.propertyId, state: 'LINKED', reviewReasons: [] };
  }
  // Never guess the customer's only site.
  if (input.customerId && !input.propertyId) {
    if (input.customerPropertyCount === 1 && !input.explicitPropertyEvidence) {
      return {
        propertyId: null,
        state: 'REVIEW_REQUIRED',
        reviewReasons: ['CUSTOMER_KNOWN_PROPERTY_UNKNOWN', 'SOLE_SITE_GUESS_REJECTED'],
      };
    }
    return {
      propertyId: null,
      state: 'UNASSIGNED',
      reviewReasons: ['CUSTOMER_KNOWN_PROPERTY_UNKNOWN'],
    };
  }
  return { propertyId: null, state: 'UNASSIGNED', reviewReasons: [] };
}

export function classifyVerifiedFieldConflict(input: {
  field: string;
  currentValue: string | null | undefined;
  incomingValue: string | null | undefined;
  verified: boolean;
  sourceIsNewerAuthoritative?: boolean;
}): {
  field: string;
  current: string | null;
  incoming: string | null;
  classification: EquipmentFieldConflictClass;
  applyIncoming: boolean;
} {
  const current = input.currentValue?.trim() || null;
  const incoming = input.incomingValue?.trim() || null;
  if (!incoming || incoming === current) {
    return {
      field: input.field,
      current,
      incoming,
      classification: 'CURRENT_VERIFIED',
      applyIncoming: false,
    };
  }
  if (!current) {
    return {
      field: input.field,
      current,
      incoming,
      classification: input.sourceIsNewerAuthoritative
        ? 'SOURCE_NEWER_AUTHORITATIVE'
        : 'SOURCE_NEWER_AUTHORITATIVE',
      applyIncoming: true,
    };
  }
  if (input.verified) {
    return {
      field: input.field,
      current,
      incoming,
      classification: 'CONFLICT_REVIEW_REQUIRED',
      applyIncoming: false,
    };
  }
  if (input.sourceIsNewerAuthoritative) {
    return {
      field: input.field,
      current,
      incoming,
      classification: 'SOURCE_NEWER_AUTHORITATIVE',
      applyIncoming: true,
    };
  }
  return {
    field: input.field,
    current,
    incoming,
    classification: 'CONFLICT_REVIEW_REQUIRED',
    applyIncoming: false,
  };
}

export function classifyEquipmentImportMatch(input: {
  source: EquipmentSourceRecord;
  existing: ExistingCanonicalEquipment[];
  resolvedCustomerId: string | null;
  resolvedPropertyId: string | null;
  customerPropertyCount: number;
  explicitPropertyEvidence: boolean;
  jobLinkEvidenceStrong: boolean;
}): EquipmentMatchDecision {
  const base = {
    provenancePreserved: true as const,
    inventsData: false as const,
    xeroWrites: 0 as const,
    autoMerge: false as const,
  };

  const name = input.source.name?.trim() || null;
  const serial = input.source.serialNumber;
  const hasWeakIdentity = !name && !normalizeEquipmentSerial(serial) && !input.source.sourceExternalId;

  const propertyLink = resolvePropertyLinkage({
    customerId: input.resolvedCustomerId,
    propertyId: input.resolvedPropertyId,
    propertyName: input.source.propertyName,
    customerPropertyCount: input.customerPropertyCount,
    explicitPropertyEvidence: input.explicitPropertyEvidence,
  });

  if (hasWeakIdentity) {
    return {
      ...base,
      action: 'REVIEW_REQUIRED',
      matchedAssetId: null,
      confidence: 'none',
      matchReason: 'Weak equipment identity — REVIEW REQUIRED',
      reviewReasons: ['WEAK_IDENTITY', ...propertyLink.reviewReasons],
      proposedCustomerId: input.resolvedCustomerId,
      proposedPropertyId: propertyLink.propertyId,
      propertyLinkageState: propertyLink.state,
      fieldsChanging: [],
      fieldConflicts: [],
    };
  }

  // 1. sourceProvider + sourceExternalId
  const byExternal = findBySourceExternalId(
    input.existing,
    input.source.sourceProvider,
    input.source.sourceExternalId,
  );
  if (byExternal) {
    return finalizeExistingMatch({
      matched: byExternal,
      source: input.source,
      resolvedCustomerId: input.resolvedCustomerId,
      propertyLink,
      matchReason: 'sourceProvider+sourceExternalId exact match',
      confidence: 'exact',
      actionHint: 'EXACT_MATCH',
      jobLinkEvidenceStrong: input.jobLinkEvidenceStrong,
    });
  }

  // 2. exact normalized serial
  const serialMatches = findByNormalizedSerial(input.existing, serial);
  const serialConflicts = detectSerialIdentityConflicts(serialMatches, {
    ...input.source,
    customerId: input.resolvedCustomerId ?? input.source.customerId,
    propertyId: propertyLink.propertyId ?? input.source.propertyId,
  });
  if (serialConflicts.includes('IDENTITY_CONFLICT') || serialMatches.length > 1) {
    return {
      ...base,
      action: 'REVIEW_REQUIRED',
      matchedAssetId: serialMatches.length === 1 ? serialMatches[0]!.assetId : null,
      confidence: 'low',
      matchReason: 'IDENTITY CONFLICT — REVIEW REQUIRED',
      reviewReasons: serialConflicts.length
        ? serialConflicts
        : ['IDENTITY_CONFLICT', 'AMBIGUOUS_CANDIDATE'],
      proposedCustomerId: input.resolvedCustomerId,
      proposedPropertyId: propertyLink.propertyId,
      propertyLinkageState: 'REVIEW_REQUIRED',
      fieldsChanging: [],
      fieldConflicts: [],
    };
  }
  if (serialMatches.length === 1) {
    const scored = scoreEquipmentHistoricalMatch({
      serialMatch: true,
      customerMatch: Boolean(input.resolvedCustomerId),
      propertyMatch: Boolean(propertyLink.propertyId),
      manufacturerModelMatch: Boolean(input.source.manufacturer || input.source.model),
      typeMatch: Boolean(input.source.equipmentType),
    });
    if (scored.requiresHumanReview && !input.resolvedCustomerId) {
      return {
        ...base,
        action: 'REVIEW_REQUIRED',
        matchedAssetId: serialMatches[0]!.assetId,
        confidence: 'low',
        matchReason: 'Serial match without customer evidence — REVIEW REQUIRED',
        reviewReasons: ['UNKNOWN_OWNERSHIP', ...propertyLink.reviewReasons],
        proposedCustomerId: null,
        proposedPropertyId: propertyLink.propertyId,
        propertyLinkageState: propertyLink.state,
        fieldsChanging: [],
        fieldConflicts: [],
      };
    }
    return finalizeExistingMatch({
      matched: serialMatches[0]!,
      source: input.source,
      resolvedCustomerId: input.resolvedCustomerId,
      propertyLink,
      matchReason: 'exact normalized serial match',
      confidence: 'exact',
      actionHint: 'EXACT_MATCH',
      jobLinkEvidenceStrong: input.jobLinkEvidenceStrong,
    });
  }

  // 3. existing explicit import/mapping relationship
  if (input.source.mappingAssetId) {
    const mapped = input.existing.find((e) => e.assetId === input.source.mappingAssetId) ?? null;
    if (mapped) {
      return finalizeExistingMatch({
        matched: mapped,
        source: input.source,
        resolvedCustomerId: input.resolvedCustomerId,
        propertyLink,
        matchReason: 'explicit import/mapping relationship',
        confidence: 'high',
        actionHint: 'EXACT_MATCH',
        jobLinkEvidenceStrong: input.jobLinkEvidenceStrong,
      });
    }
  }

  // Do not merge on name/type/customer/make-model alone.
  const nameTypeHits = input.existing.filter((e) => {
    const sameName =
      name && e.name.trim().toLowerCase() === name.toLowerCase();
    const sameType =
      input.source.equipmentType &&
      e.assetType.trim().toLowerCase() ===
        input.source.equipmentType.trim().toLowerCase().replace(/\s+/g, '_');
    const sameCustomer =
      input.resolvedCustomerId && e.customerId === input.resolvedCustomerId;
    const sameMakeModel =
      input.source.manufacturer &&
      e.manufacturer &&
      input.source.manufacturer.trim().toLowerCase() === e.manufacturer.trim().toLowerCase() &&
      input.source.model &&
      e.model &&
      input.source.model.trim().toLowerCase() === e.model.trim().toLowerCase();
    return Boolean((sameName && sameType) || (sameCustomer && sameMakeModel));
  });
  if (nameTypeHits.length > 0) {
    return {
      ...base,
      action: 'REVIEW_REQUIRED',
      matchedAssetId: nameTypeHits.length === 1 ? nameTypeHits[0]!.assetId : null,
      confidence: 'low',
      matchReason: 'Weak similarity only (name/type/customer/make-model) — REVIEW REQUIRED',
      reviewReasons: ['AMBIGUOUS_CANDIDATE', ...propertyLink.reviewReasons],
      proposedCustomerId: input.resolvedCustomerId,
      proposedPropertyId: propertyLink.propertyId,
      propertyLinkageState: propertyLink.state === 'LINKED' ? 'LINKED' : 'REVIEW_REQUIRED',
      fieldsChanging: [],
      fieldConflicts: [],
    };
  }

  if (!name) {
    return {
      ...base,
      action: 'REVIEW_REQUIRED',
      matchedAssetId: null,
      confidence: 'none',
      matchReason: 'Cannot create without equipment name',
      reviewReasons: ['WEAK_IDENTITY', ...propertyLink.reviewReasons],
      proposedCustomerId: input.resolvedCustomerId,
      proposedPropertyId: propertyLink.propertyId,
      propertyLinkageState: propertyLink.state,
      fieldsChanging: [],
      fieldConflicts: [],
    };
  }

  if (input.source.jobNumber && !input.jobLinkEvidenceStrong) {
    // Job reference present but not strong — still allow CREATE of asset; job link deferred.
  }

  const fieldsChanging = [
    'name',
    serial ? 'serialNumber' : null,
    input.source.manufacturer ? 'manufacturer' : null,
    input.source.model ? 'model' : null,
    input.resolvedCustomerId ? 'customerId' : null,
    propertyLink.propertyId ? 'propertyId' : null,
    'sourceProvider',
    'sourceExternalId',
  ].filter(Boolean) as string[];

  return {
    ...base,
    action: 'CREATE',
    matchedAssetId: null,
    confidence: 'none',
    matchReason: 'No deterministic match — create canonical equipment',
    reviewReasons: propertyLink.reviewReasons.filter(
      (r) => r !== 'SOLE_SITE_GUESS_REJECTED' || propertyLink.state === 'REVIEW_REQUIRED',
    ),
    proposedCustomerId: input.resolvedCustomerId,
    proposedPropertyId: propertyLink.propertyId,
    propertyLinkageState: propertyLink.state,
    fieldsChanging,
    fieldConflicts: [],
  };
}

function finalizeExistingMatch(input: {
  matched: ExistingCanonicalEquipment;
  source: EquipmentSourceRecord;
  resolvedCustomerId: string | null;
  propertyLink: {
    propertyId: string | null;
    state: 'LINKED' | 'UNASSIGNED' | 'REVIEW_REQUIRED';
    reviewReasons: EquipmentReviewReason[];
  };
  matchReason: string;
  confidence: 'exact' | 'high';
  actionHint: 'EXACT_MATCH' | 'UPDATE' | 'UNCHANGED';
  jobLinkEvidenceStrong: boolean;
}): EquipmentMatchDecision {
  const verified = new Set(input.matched.verifiedFields);
  const candidates: Array<[string, string | null | undefined, string | null | undefined]> = [
    ['name', input.matched.name, input.source.name],
    ['serialNumber', input.matched.serialNumber, input.source.serialNumber],
    ['manufacturer', input.matched.manufacturer, input.source.manufacturer],
    ['model', input.matched.model, input.source.model],
    ['installationDate', input.matched.installationDate, input.source.installationDate],
    ['warrantyExpiresAt', input.matched.warrantyExpiresAt, input.source.warrantyExpiresAt],
  ];

  const fieldConflicts: Array<{
    field: string;
    current: string | null;
    incoming: string | null;
    classification: EquipmentFieldConflictClass;
  }> = [];
  const fieldsChanging: string[] = [];
  let hasReviewConflict = false;

  for (const [field, current, incoming] of candidates) {
    if (!incoming?.trim()) continue;
    const equivalent =
      field === 'serialNumber'
        ? serialsEquivalent(current, incoming)
        : (current?.trim() || null) === (incoming?.trim() || null);
    if (equivalent) continue;
    const classified = classifyVerifiedFieldConflict({
      field,
      currentValue: current,
      incomingValue: incoming,
      verified: verified.has(field),
      sourceIsNewerAuthoritative: !verified.has(field),
    });
    if (classified.current && classified.incoming && classified.current !== classified.incoming) {
      fieldConflicts.push({
        field: classified.field,
        current: classified.current,
        incoming: classified.incoming,
        classification: classified.classification,
      });
      if (classified.classification === 'CONFLICT_REVIEW_REQUIRED') {
        hasReviewConflict = true;
      } else if (classified.applyIncoming) {
        fieldsChanging.push(field);
      }
    } else if (!classified.current && classified.incoming) {
      fieldsChanging.push(field);
    }
  }

  if (
    input.resolvedCustomerId &&
    input.matched.customerId &&
    input.resolvedCustomerId !== input.matched.customerId
  ) {
    hasReviewConflict = true;
    fieldConflicts.push({
      field: 'customerId',
      current: input.matched.customerId,
      incoming: input.resolvedCustomerId,
      classification: 'CONFLICT_REVIEW_REQUIRED',
    });
  } else if (input.resolvedCustomerId && !input.matched.customerId) {
    fieldsChanging.push('customerId');
  }

  if (
    input.propertyLink.propertyId &&
    input.matched.propertyId &&
    input.propertyLink.propertyId !== input.matched.propertyId
  ) {
    hasReviewConflict = true;
    fieldConflicts.push({
      field: 'propertyId',
      current: input.matched.propertyId,
      incoming: input.propertyLink.propertyId,
      classification: 'CONFLICT_REVIEW_REQUIRED',
    });
  } else if (input.propertyLink.propertyId && !input.matched.propertyId) {
    fieldsChanging.push('propertyId');
  }

  if (
    input.source.manufacturer &&
    input.matched.manufacturer &&
    input.source.manufacturer.trim().toLowerCase() !==
      input.matched.manufacturer.trim().toLowerCase() &&
    input.source.model &&
    input.matched.model &&
    input.source.model.trim().toLowerCase() !== input.matched.model.trim().toLowerCase()
  ) {
    hasReviewConflict = true;
  }

  if (input.source.jobNumber && !input.jobLinkEvidenceStrong) {
    // Ambiguous job linkage must not auto-apply.
  }

  if (hasReviewConflict || input.propertyLink.state === 'REVIEW_REQUIRED') {
    return {
      action: 'REVIEW_REQUIRED',
      matchedAssetId: input.matched.assetId,
      confidence: input.confidence,
      matchReason: `${input.matchReason} — field/linkage conflict requires review`,
      reviewReasons: [
        ...(hasReviewConflict ? (['VERIFIED_FIELD_CONFLICT'] as EquipmentReviewReason[]) : []),
        ...input.propertyLink.reviewReasons,
        ...(input.source.manufacturer &&
        input.matched.manufacturer &&
        input.source.manufacturer !== input.matched.manufacturer
          ? (['CONFLICTING_MAKE_MODEL'] as EquipmentReviewReason[])
          : []),
      ],
      proposedCustomerId: input.resolvedCustomerId,
      proposedPropertyId: input.propertyLink.propertyId,
      propertyLinkageState: input.propertyLink.state,
      fieldsChanging,
      fieldConflicts,
      provenancePreserved: true,
      inventsData: false,
      xeroWrites: 0,
      autoMerge: false,
    };
  }

  if (fieldsChanging.length === 0) {
    return {
      action: 'UNCHANGED',
      matchedAssetId: input.matched.assetId,
      confidence: input.confidence,
      matchReason: input.matchReason,
      reviewReasons: input.propertyLink.reviewReasons.filter(
        (r) => r === 'CUSTOMER_KNOWN_PROPERTY_UNKNOWN',
      ),
      proposedCustomerId: input.resolvedCustomerId ?? input.matched.customerId,
      proposedPropertyId: input.propertyLink.propertyId ?? input.matched.propertyId,
      propertyLinkageState: input.propertyLink.propertyId
        ? 'LINKED'
        : input.matched.propertyId
          ? 'LINKED'
          : input.resolvedCustomerId
            ? 'UNASSIGNED'
            : 'UNASSIGNED',
      fieldsChanging: [],
      fieldConflicts: [],
      provenancePreserved: true,
      inventsData: false,
      xeroWrites: 0,
      autoMerge: false,
    };
  }

  return {
    action: 'UPDATE',
    matchedAssetId: input.matched.assetId,
    confidence: input.confidence,
    matchReason: input.matchReason,
    reviewReasons: input.propertyLink.reviewReasons.filter(
      (r) => r === 'CUSTOMER_KNOWN_PROPERTY_UNKNOWN',
    ),
    proposedCustomerId: input.resolvedCustomerId ?? input.matched.customerId,
    proposedPropertyId: input.propertyLink.propertyId ?? input.matched.propertyId,
    propertyLinkageState: (input.propertyLink.propertyId ?? input.matched.propertyId)
      ? 'LINKED'
      : input.resolvedCustomerId
        ? 'UNASSIGNED'
        : 'UNASSIGNED',
    fieldsChanging,
    fieldConflicts,
    provenancePreserved: true,
    inventsData: false,
    xeroWrites: 0,
    autoMerge: false,
  };
}

export function buildEquipmentPreview(input: {
  sources: EquipmentSourceRecord[];
  existing: ExistingCanonicalEquipment[];
  resolveCustomer: (source: EquipmentSourceRecord) => string | null;
  resolveProperty: (
    source: EquipmentSourceRecord,
    customerId: string | null,
  ) => { propertyId: string | null; explicitEvidence: boolean; customerPropertyCount: number };
  jobLinkEvidenceStrong: (source: EquipmentSourceRecord) => boolean;
}): EquipmentPreviewSummary {
  if (input.sources.length === 0) {
    return {
      discovered: 0,
      exactMatch: 0,
      create: 0,
      update: 0,
      unchanged: 0,
      reviewRequired: 0,
      skip: 0,
      failed: 0,
      missingAuthorisedSource: true,
      oldestSourceDate: null,
      newestSourceDate: null,
      xeroWrites: 0,
      productionWrites: 0,
      inventsData: false,
      rows: [],
    };
  }

  const dates = input.sources
    .map((s) => s.sourceOccurredAt)
    .filter((d): d is string => Boolean(d))
    .sort();

  const rows: EquipmentPreviewRow[] = input.sources.map((source, idx) => {
    const customerId = input.resolveCustomer(source);
    const property = input.resolveProperty(source, customerId);
    const decision = classifyEquipmentImportMatch({
      source,
      existing: input.existing,
      resolvedCustomerId: customerId,
      resolvedPropertyId: property.propertyId,
      customerPropertyCount: property.customerPropertyCount,
      explicitPropertyEvidence: property.explicitEvidence,
      jobLinkEvidenceStrong: input.jobLinkEvidenceStrong(source),
    });
    return {
      sourceId: source.sourceExternalId ?? `row-${idx + 1}`,
      sourceProvider: source.sourceProvider,
      sourceExternalId: source.sourceExternalId,
      equipmentIdentity: {
        name: source.name,
        serialNumber: source.serialNumber,
        manufacturer: source.manufacturer,
        model: source.model,
        equipmentType: source.equipmentType,
      },
      proposedCustomerId: decision.proposedCustomerId,
      proposedPropertyId: decision.proposedPropertyId,
      decision,
    };
  });

  const count = (action: EquipmentImportAction) =>
    rows.filter((r) => r.decision.action === action).length;

  return {
    discovered: rows.length,
    exactMatch: count('EXACT_MATCH'),
    create: count('CREATE'),
    update: count('UPDATE'),
    unchanged: count('UNCHANGED'),
    reviewRequired: count('REVIEW_REQUIRED'),
    skip: count('SKIP'),
    failed: count('FAILED'),
    missingAuthorisedSource: false,
    oldestSourceDate: dates[0] ?? null,
    newestSourceDate: dates[dates.length - 1] ?? null,
    xeroWrites: 0,
    productionWrites: 0,
    inventsData: false,
    rows,
  };
}

export function emptyApplyCounts(): EquipmentApplyCounts {
  return {
    discovered: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    reviewRequired: 0,
    skipped: 0,
    failed: 0,
    duplicateEquipment: 0,
    duplicateRegistryProfiles: 0,
    duplicatePropertyLinks: 0,
    duplicateJobLinks: 0,
    duplicateDocumentLinks: 0,
    xeroWrites: 0,
    productionWrites: 0,
  };
}

export function summarizeEquipmentDataQuality(
  rows: Array<{
    serialNumber: string | null;
    manufacturer: string | null;
    model: string | null;
    customerId: string | null;
    propertyId: string | null;
    hasJobHistory: boolean;
    ambiguous?: boolean;
    duplicateCandidate?: boolean;
  }>,
): EquipmentDataQualityStats {
  return {
    withSerial: rows.filter((r) => Boolean(normalizeEquipmentSerial(r.serialNumber))).length,
    missingSerial: rows.filter((r) => !normalizeEquipmentSerial(r.serialNumber)).length,
    withMake: rows.filter((r) => Boolean(r.manufacturer?.trim())).length,
    missingMake: rows.filter((r) => !r.manufacturer?.trim()).length,
    withModel: rows.filter((r) => Boolean(r.model?.trim())).length,
    missingModel: rows.filter((r) => !r.model?.trim()).length,
    customerLinked: rows.filter((r) => Boolean(r.customerId)).length,
    customerUnlinked: rows.filter((r) => !r.customerId).length,
    propertyLinked: rows.filter((r) => Boolean(r.propertyId)).length,
    propertyUnassigned: rows.filter((r) => !r.propertyId).length,
    jobHistoryLinked: rows.filter((r) => r.hasJobHistory).length,
    noHistory: rows.filter((r) => !r.hasJobHistory).length,
    ambiguous: rows.filter((r) => r.ambiguous).length,
    duplicateCandidates: rows.filter((r) => r.duplicateCandidate).length,
  };
}

export function canAccessEquipmentImport(roleName: string | null | undefined): boolean {
  if (!roleName) return false;
  const role = roleName.trim().toLowerCase();
  return role === 'owner' || role === 'manager' || role === 'admin' || role === 'office';
}

export function canAccessFullEquipmentDirectory(roleName: string | null | undefined): boolean {
  if (!roleName) return false;
  const role = roleName.trim().toLowerCase();
  if (role === 'technician' || role === 'client') return false;
  return canAccessEquipmentImport(roleName);
}

export function clientMayAccessEquipment(input: {
  actorCustomerId: string;
  assetCustomerId: string | null;
  companyId: string;
  assetCompanyId: string;
}): boolean {
  if (input.companyId !== input.assetCompanyId) return false;
  if (!input.assetCustomerId) return false;
  return input.actorCustomerId === input.assetCustomerId;
}

export function technicianMayAccessEquipment(input: {
  assignedToJobOrSite: boolean;
  unrestrictedDirectory: boolean;
}): boolean {
  if (input.unrestrictedDirectory) return false;
  return input.assignedToJobOrSite;
}

export function assertRoyalCapeNoVerifiedEquipment(input: {
  propertyId: string;
  linkedEquipmentCount: number;
  strongEvidenceProvided: boolean;
}): { ok: true; truth: 'NO_VERIFIED_EQUIPMENT_LINKED' } | { ok: false; reason: string } {
  if (input.propertyId !== EQUIPMENT_ASSETS_IMPORT_CRC.propertyId) {
    return { ok: false, reason: 'Not Royal Cape property' };
  }
  if (input.linkedEquipmentCount > 0 && !input.strongEvidenceProvided) {
    return {
      ok: false,
      reason: 'Royal Cape must remain NO_VERIFIED_EQUIPMENT_LINKED without strong evidence',
    };
  }
  if (input.linkedEquipmentCount === 0) {
    return { ok: true, truth: 'NO_VERIFIED_EQUIPMENT_LINKED' };
  }
  return { ok: true, truth: 'NO_VERIFIED_EQUIPMENT_LINKED' };
}

export function assertNoXeroWrites(xeroWriteCalls: number): void {
  if (xeroWriteCalls !== 0) {
    throw new Error('Row 86 forbids Xero writes');
  }
}

export function assertRow87NotStarted(row87Started: boolean): void {
  if (row87Started) {
    throw new Error('Row 87 must not start during Row 86');
  }
}

export function isSafeApplyAction(action: EquipmentImportAction): boolean {
  return action === 'CREATE' || action === 'UPDATE' || action === 'UNCHANGED' || action === 'EXACT_MATCH';
}

/** Actions that mutate canonical equipment on staging apply. */
export function isMutatingApplyAction(action: EquipmentImportAction): boolean {
  return action === 'CREATE' || action === 'UPDATE';
}

export function mergeDocumentIds(
  existing: string[] | null | undefined,
  incoming: string[] | null | undefined,
): { merged: string[]; added: number; duplicatesAvoided: number } {
  const base = [...(existing ?? [])];
  const seen = new Set(base);
  let added = 0;
  let duplicatesAvoided = 0;
  for (const id of incoming ?? []) {
    if (!id) continue;
    if (seen.has(id)) {
      duplicatesAvoided += 1;
      continue;
    }
    seen.add(id);
    base.push(id);
    added += 1;
  }
  return { merged: base, added, duplicatesAvoided };
}

export function equipmentSearchMatches(
  query: string,
  row: {
    name: string;
    serialNumber: string | null;
    assetType: string;
    manufacturer: string | null;
    model: string | null;
    customerName: string | null;
    propertyName: string | null;
  },
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const serialQ = normalizeEquipmentSerial(query);
  const serialRow = normalizeEquipmentSerial(row.serialNumber);
  if (serialQ && serialRow && serialQ === serialRow) return true;
  const hay = [
    row.name,
    row.serialNumber,
    row.assetType,
    row.manufacturer,
    row.model,
    row.customerName,
    row.propertyName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}
