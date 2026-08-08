/**
 * Row 85 — Customer Duplicate Detection / Side-by-Side Review /
 * Safe Xero Contact Reconciliation
 *
 * Reuses M7 candidate pairs + Row 83 people/associations.
 * Never silently merges. Never writes to Xero.
 * CRC/Rowan must classify as SAME_COMPANY_DIFFERENT_PERSON — not destructive merge.
 */

import {
  CUSTOMER_360_CRC_STAGING,
  assertAssociationDoesNotMoveOwnership,
} from './customer-360.js';
import {
  normalizeCustomerEmailKey,
  normalizeCustomerNameKey,
  normalizeCustomerPhoneKey,
  orderCustomerPairIds,
  scoreCustomerDuplicateEvidence,
  type CustomerDuplicateMatchEvidence,
  type CustomerMergeLinkCounts,
} from './customer-duplicate-merge.js';

export const CUSTOMER_DUPLICATE_RECONCILIATION_KEY = 'customer-duplicate-reconciliation' as const;

export const CUSTOMER_DUPLICATE_RECONCILIATION_CRC = {
  ...CUSTOMER_360_CRC_STAGING,
  rowanXeroContactId: 'b37e7820-178f-42d1-8855-11d647c42d62',
} as const;

/** Explainable confidence labels — not opaque AI scores. */
export type DuplicateConfidenceLabel =
  | 'HIGH_CONFIDENCE_DUPLICATE'
  | 'POSSIBLE_DUPLICATE'
  | 'SAME_COMPANY_DIFFERENT_CONTACT'
  | 'LIKELY_DIFFERENT'
  | 'REVIEW_REQUIRED';

export type DuplicateResolutionType =
  | 'NOT_DUPLICATE'
  | 'SAME_COMPANY_DIFFERENT_PERSON'
  | 'TRUE_DUPLICATE_CANONICALIZE'
  | 'DEFER';

export type ReconciliationLifecycleStatus =
  | 'unreviewed'
  | 'draft'
  | 'approved'
  | 'executed'
  | 'reversed'
  | 'dismissed'
  | 'deferred';

export type DuplicateFieldCompareStatus = 'MATCH' | 'DIFFERENT' | 'MISSING';

export type DuplicateFieldCompare = {
  field: string;
  left: string | null;
  right: string | null;
  status: DuplicateFieldCompareStatus;
};

export type DuplicateClassificationInput = {
  leftCustomerId: string;
  rightCustomerId: string;
  leftName: string;
  rightName: string;
  leftCompanyName?: string | null;
  rightCompanyName?: string | null;
  leftContactPerson?: string | null;
  rightContactPerson?: string | null;
  leftEmail?: string | null;
  rightEmail?: string | null;
  leftPhone?: string | null;
  rightPhone?: string | null;
  leftVat?: string | null;
  rightVat?: string | null;
  leftBillingAddress?: string | null;
  rightBillingAddress?: string | null;
  leftXeroContactIds: string[];
  rightXeroContactIds: string[];
  leftSourceExternalId?: string | null;
  rightSourceExternalId?: string | null;
  leftSourceProvider?: string | null;
  rightSourceProvider?: string | null;
  /** Existing match evidence from M7 scan (optional). */
  evidence?: CustomerDuplicateMatchEvidence[];
  /** Existing active source association between the pair. */
  alreadyAssociated?: boolean;
};

export type DuplicateClassificationResult = {
  confidenceLabel: DuplicateConfidenceLabel;
  suggestedResolution: DuplicateResolutionType | null;
  rationale: string[];
  matchSignals: string[];
  differingSignals: string[];
  fieldCompares: DuplicateFieldCompare[];
  autoMerge: false;
  xeroIdsDiffer: boolean;
  blocksDestructiveMerge: boolean;
  score: number;
};

export type ReconciliationImpactPreview = {
  canonicalCustomerId: string;
  secondaryCustomerId: string;
  resolutionType: DuplicateResolutionType;
  peopleAffected: number;
  propertiesAffected: number;
  jobsAffected: number;
  leadsAffected: number;
  documentsAffected: number;
  financialRecordsPreserved: true;
  sourceIdsPreserved: true;
  xeroWrites: 0;
  recordsUntouched: string[];
  reversible: boolean;
  irreversibleWarning: string | null;
  previewHash: string;
  fieldConflictSelections: Record<string, 'left' | 'right' | 'preserve_both'>;
};

function compareField(
  field: string,
  left: string | null | undefined,
  right: string | null | undefined,
  normalize?: (v: string | null | undefined) => string | null,
): DuplicateFieldCompare {
  const ln = normalize ? normalize(left) : (left?.trim() || null);
  const rn = normalize ? normalize(right) : (right?.trim() || null);
  if (!ln && !rn) return { field, left: left ?? null, right: right ?? null, status: 'MISSING' };
  if (!ln || !rn) return { field, left: left ?? null, right: right ?? null, status: 'MISSING' };
  if (ln === rn) return { field, left: left ?? null, right: right ?? null, status: 'MATCH' };
  return { field, left: left ?? null, right: right ?? null, status: 'DIFFERENT' };
}

function emailDomain(email: string | null | undefined): string | null {
  const key = normalizeCustomerEmailKey(email);
  if (!key || !key.includes('@')) return null;
  return key.split('@')[1] ?? null;
}

function normalizeVat(vat: string | null | undefined): string | null {
  if (!vat) return null;
  const n = vat.replace(/[\s-]/g, '').toUpperCase();
  return n || null;
}

function normalizeAddressKey(address: string | null | undefined): string | null {
  if (!address) return null;
  const n = address
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return n || null;
}

/** CRC ↔ Rowan known pair — never destructive merge. */
export function isCrcRowanPair(leftCustomerId: string, rightCustomerId: string): boolean {
  const ids = new Set([leftCustomerId, rightCustomerId]);
  return (
    ids.has(CUSTOMER_DUPLICATE_RECONCILIATION_CRC.canonicalCustomerId) &&
    ids.has(CUSTOMER_DUPLICATE_RECONCILIATION_CRC.rowanSourceCustomerId)
  );
}

export function assertCrcRowanNotDestructivelyMerged(input: {
  leftCustomerId: string;
  rightCustomerId: string;
  resolutionType: DuplicateResolutionType;
}): { ok: true } {
  if (
    isCrcRowanPair(input.leftCustomerId, input.rightCustomerId) &&
    input.resolutionType === 'TRUE_DUPLICATE_CANONICALIZE'
  ) {
    throw new Error(
      'CRC/Rowan must not be destructively merged — use SAME_COMPANY_DIFFERENT_PERSON.',
    );
  }
  return { ok: true };
}

/**
 * Explainable classification. Never auto-merges.
 */
export function classifyDuplicateCandidate(
  input: DuplicateClassificationInput,
): DuplicateClassificationResult {
  const rationale: string[] = [];
  const matchSignals: string[] = [];
  const differingSignals: string[] = [];
  const fieldCompares: DuplicateFieldCompare[] = [
    compareField('name', input.leftName, input.rightName, normalizeCustomerNameKey),
    compareField(
      'companyName',
      input.leftCompanyName ?? input.leftName,
      input.rightCompanyName ?? input.rightName,
      normalizeCustomerNameKey,
    ),
    compareField('contactPerson', input.leftContactPerson, input.rightContactPerson, (v) =>
      normalizeCustomerNameKey(v),
    ),
    compareField('email', input.leftEmail, input.rightEmail, normalizeCustomerEmailKey),
    compareField('phone', input.leftPhone, input.rightPhone, normalizeCustomerPhoneKey),
    compareField('vat', input.leftVat, input.rightVat, normalizeVat),
    compareField(
      'billingAddress',
      input.leftBillingAddress,
      input.rightBillingAddress,
      normalizeAddressKey,
    ),
  ];

  const leftXero = [...new Set(input.leftXeroContactIds.filter(Boolean))];
  const rightXero = [...new Set(input.rightXeroContactIds.filter(Boolean))];
  const sharedXero = leftXero.filter((id) => rightXero.includes(id));
  const xeroIdsDiffer =
    leftXero.length > 0 && rightXero.length > 0 && sharedXero.length === 0;

  if (sharedXero.length > 0) {
    matchSignals.push(`same_xero_contact_id:${sharedXero.join(',')}`);
  }
  if (xeroIdsDiffer) {
    differingSignals.push(
      `different_xero_contact_ids:left=${leftXero.join(',')};right=${rightXero.join(',')}`,
    );
  }

  const leftEmail = normalizeCustomerEmailKey(input.leftEmail);
  const rightEmail = normalizeCustomerEmailKey(input.rightEmail);
  if (leftEmail && rightEmail && leftEmail === rightEmail) {
    matchSignals.push('exact_normalized_email');
  }
  const leftDomain = emailDomain(input.leftEmail);
  const rightDomain = emailDomain(input.rightEmail);
  const domainOnly =
    Boolean(leftDomain && rightDomain && leftDomain === rightDomain) &&
    !(leftEmail && rightEmail && leftEmail === rightEmail);

  const leftPhone = normalizeCustomerPhoneKey(input.leftPhone);
  const rightPhone = normalizeCustomerPhoneKey(input.rightPhone);
  if (leftPhone && rightPhone && leftPhone === rightPhone) {
    matchSignals.push('exact_normalized_phone');
  }

  const leftVat = normalizeVat(input.leftVat);
  const rightVat = normalizeVat(input.rightVat);
  if (leftVat && rightVat && leftVat === rightVat) {
    matchSignals.push('same_vat');
  } else if (leftVat && rightVat && leftVat !== rightVat) {
    differingSignals.push('vat_conflict');
  }

  const leftName = normalizeCustomerNameKey(input.leftName);
  const rightName = normalizeCustomerNameKey(input.rightName);
  const leftCompany = normalizeCustomerNameKey(input.leftCompanyName ?? input.leftName);
  const rightCompany = normalizeCustomerNameKey(input.rightCompanyName ?? input.rightName);
  const exactCompanyName =
    Boolean(leftCompany && rightCompany && leftCompany === rightCompany) ||
    Boolean(leftName && rightName && leftName === rightName);
  if (exactCompanyName) matchSignals.push('exact_company_name');

  const leftContact = normalizeCustomerNameKey(input.leftContactPerson);
  const rightContact = normalizeCustomerNameKey(input.rightContactPerson);
  const differentContacts =
    Boolean(leftContact && rightContact && leftContact !== rightContact) ||
    Boolean(leftContact || rightContact);

  if (
    input.leftSourceProvider &&
    input.rightSourceProvider &&
    input.leftSourceExternalId &&
    input.rightSourceExternalId &&
    input.leftSourceProvider === input.rightSourceProvider &&
    input.leftSourceExternalId === input.rightSourceExternalId
  ) {
    matchSignals.push('same_source_provider_external_id');
  }

  const evidence = input.evidence ?? [];
  const score = scoreCustomerDuplicateEvidence(evidence.length ? evidence : synthesizeEvidence(matchSignals));

  // Known CRC/Rowan regression case
  if (isCrcRowanPair(input.leftCustomerId, input.rightCustomerId) || input.alreadyAssociated) {
    rationale.push(
      'CRC canonical company with related person/source identity — preserve both; do not destructive-merge.',
    );
    if (xeroIdsDiffer) {
      rationale.push('Distinct Xero Contact IDs — treat cautiously; financial ownership stays on source.');
    }
    return {
      confidenceLabel: 'SAME_COMPANY_DIFFERENT_CONTACT',
      suggestedResolution: 'SAME_COMPANY_DIFFERENT_PERSON',
      rationale,
      matchSignals,
      differingSignals,
      fieldCompares,
      autoMerge: false,
      xeroIdsDiffer,
      blocksDestructiveMerge: true,
      score: Math.max(score, 60),
    };
  }

  // Weak-only signals must not drive merges
  if (domainOnly && matchSignals.length === 0) {
    rationale.push('Same email domain alone is NOT enough for a duplicate candidate.');
    return {
      confidenceLabel: 'LIKELY_DIFFERENT',
      suggestedResolution: null,
      rationale,
      matchSignals: [`weak_email_domain:${leftDomain}`],
      differingSignals,
      fieldCompares,
      autoMerge: false,
      xeroIdsDiffer,
      blocksDestructiveMerge: true,
      score: 5,
    };
  }

  // Different Xero IDs + company name match + different people → same company / different contact
  // (evaluated before name-only weak path so person/source distinctions are not collapsed)
  if (xeroIdsDiffer && exactCompanyName && differentContacts) {
    rationale.push(
      'Different Xero Contact IDs with matching company signals and different contact persons.',
    );
    rationale.push('Classify as SAME COMPANY — DIFFERENT PERSON / CONTACT. Preserve both Xero IDs.');
    return {
      confidenceLabel: 'SAME_COMPANY_DIFFERENT_CONTACT',
      suggestedResolution: 'SAME_COMPANY_DIFFERENT_PERSON',
      rationale,
      matchSignals,
      differingSignals,
      fieldCompares,
      autoMerge: false,
      xeroIdsDiffer: true,
      blocksDestructiveMerge: true,
      score: Math.max(score, 55),
    };
  }

  const onlyFuzzyName =
    exactCompanyName &&
    matchSignals.filter((s) => s !== 'exact_company_name').length === 0 &&
    !sharedXero.length &&
    !leftVat &&
    !xeroIdsDiffer;

  if (onlyFuzzyName && !leftPhone && !leftEmail) {
    rationale.push('Similar/exact name alone stays low confidence — review required; never auto-merge.');
    return {
      confidenceLabel: 'REVIEW_REQUIRED',
      suggestedResolution: 'DEFER',
      rationale,
      matchSignals,
      differingSignals,
      fieldCompares,
      autoMerge: false,
      xeroIdsDiffer,
      blocksDestructiveMerge: true,
      score: Math.min(score, 25),
    };
  }

  // Same Xero or same VAT → high confidence duplicate (still never auto-merge)
  if (sharedXero.length > 0 || (leftVat && rightVat && leftVat === rightVat)) {
    rationale.push(
      sharedXero.length > 0
        ? 'Same Xero Contact ID mapped to two Titan customers — high confidence duplicate.'
        : 'Same VAT/tax number — high confidence duplicate company.',
    );
    rationale.push('Requires Draft → Approve → Execute. No silent merge. No Xero write.');
    return {
      confidenceLabel: 'HIGH_CONFIDENCE_DUPLICATE',
      suggestedResolution: 'TRUE_DUPLICATE_CANONICALIZE',
      rationale,
      matchSignals,
      differingSignals,
      fieldCompares,
      autoMerge: false,
      xeroIdsDiffer,
      blocksDestructiveMerge: xeroIdsDiffer,
      score: Math.max(score, 80),
    };
  }

  if (
    matchSignals.includes('exact_normalized_email') ||
    matchSignals.includes('exact_normalized_phone')
  ) {
    rationale.push('Exact normalized contact match — possible duplicate; explicit review required.');
    if (xeroIdsDiffer) {
      rationale.push('Xero Contact IDs differ — preserve both; do not auto-merge.');
    }
    return {
      confidenceLabel: 'POSSIBLE_DUPLICATE',
      suggestedResolution: null,
      rationale,
      matchSignals,
      differingSignals,
      fieldCompares,
      autoMerge: false,
      xeroIdsDiffer,
      blocksDestructiveMerge: xeroIdsDiffer,
      score: Math.max(score, 50),
    };
  }

  if (score >= 40) {
    rationale.push('Medium stacked signals — possible duplicate; never auto-merge.');
    return {
      confidenceLabel: 'POSSIBLE_DUPLICATE',
      suggestedResolution: null,
      rationale,
      matchSignals,
      differingSignals,
      fieldCompares,
      autoMerge: false,
      xeroIdsDiffer,
      blocksDestructiveMerge: xeroIdsDiffer,
      score,
    };
  }

  // Different Xero without corroborating contact/VAT/company-person signals → review
  if (xeroIdsDiffer) {
    rationale.push('Different Xero Contact IDs — do not auto-merge; authorised review required.');
    return {
      confidenceLabel: 'REVIEW_REQUIRED',
      suggestedResolution: 'DEFER',
      rationale,
      matchSignals,
      differingSignals,
      fieldCompares,
      autoMerge: false,
      xeroIdsDiffer: true,
      blocksDestructiveMerge: true,
      score,
    };
  }

  rationale.push('Signals too weak — likely different customers.');
  return {
    confidenceLabel: 'LIKELY_DIFFERENT',
    suggestedResolution: 'NOT_DUPLICATE',
    rationale,
    matchSignals,
    differingSignals,
    fieldCompares,
    autoMerge: false,
    xeroIdsDiffer,
    blocksDestructiveMerge: true,
    score,
  };
}

function synthesizeEvidence(matchSignals: string[]): CustomerDuplicateMatchEvidence[] {
  const out: CustomerDuplicateMatchEvidence[] = [];
  for (const signal of matchSignals) {
    if (signal.startsWith('same_xero')) {
      out.push({ reason: 'xero_mapping', detail: signal, weight: 50 });
    } else if (signal === 'exact_normalized_email') {
      out.push({ reason: 'email', detail: signal, weight: 35 });
    } else if (signal === 'exact_normalized_phone') {
      out.push({ reason: 'phone', detail: signal, weight: 40 });
    } else if (signal === 'exact_company_name') {
      out.push({ reason: 'normalized_name', detail: signal, weight: 20 });
    } else if (signal === 'same_vat') {
      out.push({ reason: 'normalized_name', detail: signal, weight: 45 });
    }
  }
  return out;
}

/** Draft → Approve → Execute state machine. */
export function assertReconciliationLifecycleTransition(input: {
  from: ReconciliationLifecycleStatus;
  to: ReconciliationLifecycleStatus;
  resolutionType: DuplicateResolutionType;
}): { ok: true } {
  const allowed: Record<ReconciliationLifecycleStatus, ReconciliationLifecycleStatus[]> = {
    unreviewed: ['draft', 'dismissed', 'deferred'],
    draft: ['approved', 'dismissed', 'deferred', 'unreviewed'],
    approved: ['executed', 'draft', 'dismissed'],
    executed: ['reversed'],
    reversed: ['draft', 'dismissed'],
    dismissed: [],
    deferred: ['draft', 'dismissed', 'unreviewed'],
  };
  if (!allowed[input.from].includes(input.to)) {
    throw new Error(`Invalid lifecycle transition ${input.from} → ${input.to}`);
  }
  if (input.to === 'executed' && input.from !== 'approved') {
    throw new Error('Execute requires approved draft.');
  }
  if (
    input.to === 'executed' &&
    input.resolutionType !== 'NOT_DUPLICATE' &&
    input.resolutionType !== 'SAME_COMPANY_DIFFERENT_PERSON' &&
    input.resolutionType !== 'TRUE_DUPLICATE_CANONICALIZE' &&
    input.resolutionType !== 'DEFER'
  ) {
    throw new Error('Execute requires an explicit resolution type.');
  }
  return { ok: true };
}

export function assertPreviewHashMatches(input: {
  draftHash: string;
  currentHash: string;
}): { ok: true } {
  if (input.draftHash !== input.currentHash) {
    throw new Error('Stale preview — preconditions changed since draft. Re-preview required.');
  }
  return { ok: true };
}

export function buildReconciliationPreviewHash(input: {
  canonicalCustomerId: string;
  secondaryCustomerId: string;
  resolutionType: DuplicateResolutionType;
  leftUpdatedAt: string;
  rightUpdatedAt: string;
  leftXeroContactIds: string[];
  rightXeroContactIds: string[];
  leftLinkCounts: CustomerMergeLinkCounts;
  rightLinkCounts: CustomerMergeLinkCounts;
}): string {
  const payload = JSON.stringify({
    c: input.canonicalCustomerId,
    s: input.secondaryCustomerId,
    r: input.resolutionType,
    lu: input.leftUpdatedAt,
    ru: input.rightUpdatedAt,
    lx: [...input.leftXeroContactIds].sort(),
    rx: [...input.rightXeroContactIds].sort(),
    lc: input.leftLinkCounts,
    rc: input.rightLinkCounts,
  });
  // Deterministic non-crypto hash for stale-preview detection (not a security boundary).
  let h = 0;
  for (let i = 0; i < payload.length; i++) {
    h = (Math.imul(31, h) + payload.charCodeAt(i)) | 0;
  }
  return `p85_${(h >>> 0).toString(16)}_${payload.length}`;
}

export function planSameCompanyDifferentPersonAction(input: {
  canonicalCustomerId: string;
  sourceCustomerId: string;
  personIdentityKnown: boolean;
}): {
  action: 'ASSOCIATE_SOURCE' | 'ASSOCIATE_WITH_PERSON' | 'REVIEW_REQUIRED';
  createsCustomerPeople: boolean;
  movesFinancialOwnership: false;
  deletesSourceCustomer: false;
  xeroWrite: false;
  reason: string;
} {
  if (input.canonicalCustomerId === input.sourceCustomerId) {
    return {
      action: 'REVIEW_REQUIRED',
      createsCustomerPeople: false,
      movesFinancialOwnership: false,
      deletesSourceCustomer: false,
      xeroWrite: false,
      reason: 'Canonical and source must be different customers.',
    };
  }
  if (!input.personIdentityKnown) {
    return {
      action: 'ASSOCIATE_SOURCE',
      createsCustomerPeople: false,
      movesFinancialOwnership: false,
      deletesSourceCustomer: false,
      xeroWrite: false,
      reason: 'Person identity unclear — associate source only; do not invent a person.',
    };
  }
  return {
    action: 'ASSOCIATE_WITH_PERSON',
    createsCustomerPeople: true,
    movesFinancialOwnership: false,
    deletesSourceCustomer: false,
    xeroWrite: false,
    reason: 'Reuse customer_people + customer_source_associations; preserve Xero ownership.',
  };
}

export function planTrueDuplicateCanonicalization(input: {
  leftXeroContactIds: string[];
  rightXeroContactIds: string[];
  resolutionAllowed: boolean;
}): {
  mode: 'NON_DESTRUCTIVE_CANONICAL' | 'BLOCKED_XERO_CONFLICT' | 'BLOCKED';
  movesFinancialRows: false;
  hardDeletes: false;
  xeroWrite: false;
  reason: string;
} {
  if (!input.resolutionAllowed) {
    return {
      mode: 'BLOCKED',
      movesFinancialRows: false,
      hardDeletes: false,
      xeroWrite: false,
      reason: 'True-duplicate canonicalize not allowed for this pair.',
    };
  }
  const left = new Set(input.leftXeroContactIds);
  const right = [...input.rightXeroContactIds];
  const differ =
    input.leftXeroContactIds.length > 0 &&
    input.rightXeroContactIds.length > 0 &&
    right.every((id) => !left.has(id));
  if (differ) {
    return {
      mode: 'BLOCKED_XERO_CONFLICT',
      movesFinancialRows: false,
      hardDeletes: false,
      xeroWrite: false,
      reason:
        'Distinct Xero Contact IDs — use SAME_COMPANY_DIFFERENT_PERSON or defer; do not collapse Xero identities.',
    };
  }
  return {
    mode: 'NON_DESTRUCTIVE_CANONICAL',
    movesFinancialRows: false,
    hardDeletes: false,
    xeroWrite: false,
    reason:
      'Soft-canonicalize secondary under canonical via merged_into + association; do not rewrite Xero-backed finance rows.',
  };
}

export function assertNoFinancialDoubleCount(input: {
  canonicalQuoteIds: string[];
  associatedQuoteIds: string[];
  displayedQuoteIds: string[];
}): { ok: true } {
  const all = [...input.canonicalQuoteIds, ...input.associatedQuoteIds];
  const unique = new Set(all);
  if (input.displayedQuoteIds.length !== new Set(input.displayedQuoteIds).size) {
    throw new Error('Displayed quotes contain duplicates — double counting risk.');
  }
  for (const id of input.displayedQuoteIds) {
    if (!unique.has(id)) {
      throw new Error('Displayed quote not in canonical or associated set.');
    }
  }
  return { ok: true };
}

export function assertConsentNotWeakened(input: {
  leftDoNotContact: boolean;
  rightDoNotContact: boolean;
  consolidatedDoNotContact: boolean;
  leftConsent?: string | null;
  rightConsent?: string | null;
  consolidatedConsent?: string | null;
}): { ok: true } {
  if ((input.leftDoNotContact || input.rightDoNotContact) && !input.consolidatedDoNotContact) {
    throw new Error('Reconciliation must not weaken DO NOT CONTACT.');
  }
  const blocked = new Set(['denied', 'withdrawn', 'do_not_contact']);
  const left = (input.leftConsent ?? '').toLowerCase();
  const right = (input.rightConsent ?? '').toLowerCase();
  const cons = (input.consolidatedConsent ?? '').toLowerCase();
  if ((blocked.has(left) || blocked.has(right)) && cons === 'granted') {
    throw new Error('Reconciliation must not upgrade revoked/denied consent to granted.');
  }
  return { ok: true };
}

export function canAccessDuplicateReconciliation(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Technician' || role === 'Client') return false;
  const perms = identity.permissions ?? [];
  return (
    perms.includes('*') ||
    perms.includes('customers:read') ||
    perms.includes('customers:write') ||
    role === 'Company Owner' ||
    role === 'Owner' ||
    role === 'Manager' ||
    role === 'Admin' ||
    role === 'Office'
  );
}

export function canExecuteDuplicateReconciliation(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Technician' || role === 'Client') return false;
  const perms = identity.permissions ?? [];
  return (
    perms.includes('*') ||
    role === 'Company Owner' ||
    role === 'Owner' ||
    (perms.includes('customers:write') && (role === 'Admin' || role === 'Manager'))
  );
}

export function assertTechnicianDeniedDuplicateReconciliation(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): { allowed: false; reason: string } | { allowed: true } {
  const role = identity.roleName ?? '';
  if (role === 'Technician') {
    return { allowed: false, reason: 'Technicians cannot open the duplicate review queue.' };
  }
  if (role === 'Client') {
    return { allowed: false, reason: 'Clients cannot access internal duplicate reconciliation.' };
  }
  if (!canAccessDuplicateReconciliation(identity)) {
    return { allowed: false, reason: 'Missing duplicate reconciliation permissions.' };
  }
  return { allowed: true };
}

export function buildDuplicateReconciliationAuditActions() {
  return [
    'duplicate_candidate_created',
    'duplicate_candidate_reviewed',
    'duplicate_dismissed_not_duplicate',
    'duplicate_classified_same_company_different_person',
    'duplicate_canonical_selected',
    'duplicate_draft_created',
    'duplicate_approved',
    'duplicate_executed',
    'duplicate_reversed',
    'duplicate_field_conflict_decided',
    'duplicate_deferred',
  ] as const;
}

export function assertCrcRowanRegression(input: {
  canonicalCustomerId: string;
  rowanSourceCustomerId: string;
  rowanPersonExists: boolean;
  associationActive: boolean;
  rowanXeroContactId: string | null;
  royalCapeQuoteCustomerId: string;
  crcDestructivelyMerged: boolean;
}): { ok: true } {
  if (input.canonicalCustomerId !== CUSTOMER_DUPLICATE_RECONCILIATION_CRC.canonicalCustomerId) {
    throw new Error('CRC canonical customer id changed.');
  }
  if (input.rowanSourceCustomerId !== CUSTOMER_DUPLICATE_RECONCILIATION_CRC.rowanSourceCustomerId) {
    throw new Error('Rowan source customer id changed.');
  }
  if (!input.rowanPersonExists) throw new Error('Rowan person must remain.');
  if (!input.associationActive) throw new Error('Rowan source association must remain active.');
  if (input.rowanXeroContactId !== CUSTOMER_DUPLICATE_RECONCILIATION_CRC.rowanXeroContactId) {
    throw new Error('Rowan Xero Contact ID must remain preserved.');
  }
  if (input.royalCapeQuoteCustomerId !== CUSTOMER_DUPLICATE_RECONCILIATION_CRC.canonicalCustomerId) {
    throw new Error('QU-0183 must remain on canonical CRC.');
  }
  if (input.crcDestructivelyMerged) {
    throw new Error('CRC must not be destructively merged.');
  }
  return { ok: true };
}

export {
  orderCustomerPairIds,
  assertAssociationDoesNotMoveOwnership,
  normalizeCustomerEmailKey,
  normalizeCustomerNameKey,
  normalizeCustomerPhoneKey,
};
