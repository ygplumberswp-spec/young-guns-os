/**
 * Xero customer ↔ contact mapping classifications (XERO-002 P0 — X-P0-3).
 * Never auto-merge on fuzzy name alone.
 */

import { normalizeContactEmail, normalizeContactPhone } from './xero-finance-pipeline.js';

export type XeroCustomerMappingClassification =
  | 'confirmed_linked'
  | 'safe_deterministic_match'
  | 'possible_match_review_required'
  | 'no_matching_xero_contact'
  | 'duplicate_xero_contacts'
  | 'duplicate_titan_customers'
  | 'conflict'
  | 'archived_xero_contact'
  | 'invalid_source_data';

export type XeroCustomerMappingCandidate = {
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  classification: XeroCustomerMappingClassification;
  xeroContactId: string | null;
  xeroContactName: string | null;
  matchReason: string | null;
  reviewRequired: boolean;
};

export type XeroCustomerMappingReport = {
  generatedAt: string;
  totalCustomers: number;
  confirmedLinked: number;
  unmappedCustomers: number;
  ambiguousReviewRequired: number;
  safeDeterministicMatches: number;
  noMatchingXeroContact: number;
  items: XeroCustomerMappingCandidate[];
};

export type XeroContactLookup = {
  xeroContactId: string;
  name: string;
  email: string | null;
  phone: string | null;
  isArchived: boolean;
};

export function classifyCustomerMapping(input: {
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  existingXeroContactId: string | null;
  emailMatches: XeroContactLookup[];
  phoneMatches: XeroContactLookup[];
  exactNameMatches: XeroContactLookup[];
}): XeroCustomerMappingCandidate {
  if (input.existingXeroContactId) {
    return {
      customerId: input.customerId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      classification: 'confirmed_linked',
      xeroContactId: input.existingXeroContactId,
      xeroContactName: null,
      matchReason: 'Existing stored Xero Contact ID',
      reviewRequired: false,
    };
  }

  const normEmail = normalizeContactEmail(input.customerEmail);
  const normPhone = normalizeContactPhone(input.customerPhone);

  if (!normEmail && !normPhone && !input.customerName.trim()) {
    return {
      customerId: input.customerId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      classification: 'invalid_source_data',
      xeroContactId: null,
      xeroContactName: null,
      matchReason: 'Customer has no email, phone, or name for matching',
      reviewRequired: true,
    };
  }

  if (input.emailMatches.length > 1 || input.phoneMatches.length > 1) {
    return {
      customerId: input.customerId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      classification: 'duplicate_xero_contacts',
      xeroContactId: null,
      xeroContactName: null,
      matchReason: 'Multiple Xero contacts match the same identifier',
      reviewRequired: true,
    };
  }

  if (input.emailMatches.length === 1) {
    const contact = input.emailMatches[0]!;
    if (contact.isArchived) {
      return {
        customerId: input.customerId,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        classification: 'archived_xero_contact',
        xeroContactId: contact.xeroContactId,
        xeroContactName: contact.name,
        matchReason: 'Exact email match to archived Xero contact',
        reviewRequired: true,
      };
    }
    return {
      customerId: input.customerId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      classification: 'safe_deterministic_match',
      xeroContactId: contact.xeroContactId,
      xeroContactName: contact.name,
      matchReason: 'Exact normalized email match',
      reviewRequired: false,
    };
  }

  if (input.phoneMatches.length === 1) {
    const contact = input.phoneMatches[0]!;
    if (contact.isArchived) {
      return {
        customerId: input.customerId,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        classification: 'archived_xero_contact',
        xeroContactId: contact.xeroContactId,
        xeroContactName: contact.name,
        matchReason: 'Exact phone match to archived Xero contact',
        reviewRequired: true,
      };
    }
    return {
      customerId: input.customerId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      classification: 'safe_deterministic_match',
      xeroContactId: contact.xeroContactId,
      xeroContactName: contact.name,
      matchReason: 'Exact normalized phone match',
      reviewRequired: false,
    };
  }

  if (input.exactNameMatches.length === 1 && (normEmail || normPhone)) {
    const contact = input.exactNameMatches[0]!;
    return {
      customerId: input.customerId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      classification: 'safe_deterministic_match',
      xeroContactId: contact.xeroContactId,
      xeroContactName: contact.name,
      matchReason: 'Exact normalized name with corroborating email or phone',
      reviewRequired: false,
    };
  }

  if (input.exactNameMatches.length > 1) {
    return {
      customerId: input.customerId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      classification: 'possible_match_review_required',
      xeroContactId: null,
      xeroContactName: null,
      matchReason: 'Multiple name matches — Owner review required',
      reviewRequired: true,
    };
  }

  if (input.exactNameMatches.length === 1) {
    return {
      customerId: input.customerId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      classification: 'possible_match_review_required',
      xeroContactId: input.exactNameMatches[0]!.xeroContactId,
      xeroContactName: input.exactNameMatches[0]!.name,
      matchReason: 'Name-only match without corroborating email or phone',
      reviewRequired: true,
    };
  }

  return {
    customerId: input.customerId,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    classification: 'no_matching_xero_contact',
    xeroContactId: null,
    xeroContactName: null,
    matchReason: 'No deterministic Xero contact match found',
    reviewRequired: false,
  };
}

export function summarizeCustomerMappingReport(
  items: XeroCustomerMappingCandidate[],
): Omit<XeroCustomerMappingReport, 'items'> {
  const confirmedLinked = items.filter((i) => i.classification === 'confirmed_linked').length;
  const safeDeterministicMatches = items.filter(
    (i) => i.classification === 'safe_deterministic_match',
  ).length;
  const ambiguousReviewRequired = items.filter((i) => i.reviewRequired).length;
  const noMatchingXeroContact = items.filter(
    (i) => i.classification === 'no_matching_xero_contact',
  ).length;
  const unmappedCustomers = items.filter((i) => i.classification !== 'confirmed_linked').length;

  return {
    generatedAt: new Date().toISOString(),
    totalCustomers: items.length,
    confirmedLinked,
    unmappedCustomers,
    ambiguousReviewRequired,
    safeDeterministicMatches,
    noMatchingXeroContact,
  };
}

export function normalizeDisplayName(name: string | null | undefined): string | null {
  const trimmed = name?.trim().toLowerCase();
  return trimmed ? trimmed.replace(/\s+/g, ' ') : null;
}

/**
 * Owner-facing review buckets for XERO-002A controlled mapping review.
 * Ambiguous and conflict matches always require explicit Owner approval before linking.
 */
export type XeroCustomerMappingReviewBucket =
  | 'exact_match'
  | 'strong_suggested_match'
  | 'ambiguous'
  | 'no_match'
  | 'conflict'
  | 'already_mapped';

export const XERO_MAPPING_REVIEW_BUCKET_LABELS: Record<XeroCustomerMappingReviewBucket, string> = {
  exact_match: 'Exact match',
  strong_suggested_match: 'Strong suggested match',
  ambiguous: 'Ambiguous',
  no_match: 'No match',
  conflict: 'Conflict',
  already_mapped: 'Already mapped',
};

/** Maps internal classifications to Owner review vocabulary — never auto-merge ambiguous/conflict. */
export function toOwnerMappingReviewBucket(
  classification: XeroCustomerMappingClassification,
  matchReason: string | null = null,
): XeroCustomerMappingReviewBucket {
  switch (classification) {
    case 'confirmed_linked':
      return 'already_mapped';
    case 'safe_deterministic_match':
      return matchReason?.includes('name with corroborating')
        ? 'strong_suggested_match'
        : 'exact_match';
    case 'possible_match_review_required':
    case 'invalid_source_data':
    case 'archived_xero_contact':
      return 'ambiguous';
    case 'duplicate_xero_contacts':
    case 'duplicate_titan_customers':
    case 'conflict':
      return 'conflict';
    case 'no_matching_xero_contact':
    default:
      return 'no_match';
  }
}

export function ownerApprovalRequiredForMappingBucket(
  bucket: XeroCustomerMappingReviewBucket,
): boolean {
  return bucket === 'ambiguous' || bucket === 'conflict';
}
