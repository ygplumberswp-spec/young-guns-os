/**
 * BINDING — TITAN WhatsApp customer contact enrichment (Young Guns).
 * Enriches legitimate existing customers only — never imports WhatsApp contacts as customers.
 *
 * Cross-ref: `customer-value-classification.ts` (legitimate customer sources),
 * `marketing-eligibility.ts` (consent / supplier exclusion).
 */

import type { CustomerValueClassification } from './customer-value-classification.js';
import { normalizeSaMobile } from './contact-validation.js';

export type WhatsAppMatchClassification =
  | 'exact_verified'
  | 'high_confidence'
  | 'review_required'
  | 'conflicting'
  | 'no_match';

export const WHATSAPP_MATCH_CLASSIFICATION_LABELS: Record<WhatsAppMatchClassification, string> = {
  exact_verified: 'Exact verified',
  high_confidence: 'High confidence',
  review_required: 'Review required',
  conflicting: 'Conflicting',
  no_match: 'No match',
};

/** Legitimate Young Guns customer buckets eligible for mobile enrichment. */
export const WHATSAPP_ENRICHMENT_ELIGIBLE_VALUE_CLASSIFICATIONS: CustomerValueClassification[] = [
  'verified_invoiced_customer',
  'paying_customer',
  'fully_paid_customer',
  'partially_paid_customer',
  'unpaid_debtor',
  'overdue_debtor',
];

export type WhatsAppMatchEvidenceCode =
  | 'name_exact'
  | 'company_exact'
  | 'site_contact_exact'
  | 'address_match'
  | 'suburb_match'
  | 'job_number_match'
  | 'xero_invoice_ref'
  | 'quote_ref'
  | 'message_content_ref'
  | 'email_exact'
  | 'partial_phone_match'
  | 'job_date_proximity'
  | 'invoice_date_proximity'
  | 'name_only_insufficient'
  | 'supplier_excluded'
  | 'prospect_excluded'
  | 'conflicting_customer'
  | 'duplicate_mobile';

export type WhatsAppMatchEvidenceItem = {
  code: WhatsAppMatchEvidenceCode;
  detail: string;
  weight: number;
  sourceRef?: string | null;
};

export type ContactSourceKind = 'whatsapp_conversation' | 'manual_review' | 'xero_import' | 'crm';

export type ContactSourceRecord = {
  id: string;
  companyId: string;
  customerId: string;
  /** SA-normalized E.164 mobile (+27…) when valid. */
  normalizedMobile: string | null;
  originalFormat: string | null;
  source: ContactSourceKind;
  conversationRef: string | null;
  evidence: WhatsAppMatchEvidenceItem[];
  confidenceScore: number;
  matchClassification: WhatsAppMatchClassification;
  capturedAt: string;
  verifiedAt: string | null;
  verifiedByUserId: string | null;
  history: ContactSourceHistoryEntry[];
  isVerified: boolean;
  /** Safe for operational/service contact — not marketing. */
  isServiceSafe: boolean;
  /** Marketing consent tracked separately — never inferred from WhatsApp presence. */
  marketingConsentChannel: 'whatsapp' | null;
  marketingConsentStatus: 'unknown' | 'granted' | 'denied' | 'withdrawn' | 'do_not_contact';
  createdAt: string;
  updatedAt: string;
};

export type ContactSourceHistoryEntry = {
  at: string;
  action: 'discovered' | 'confidence_updated' | 'review_queued' | 'approved' | 'rejected' | 'superseded';
  actorUserId: string | null;
  detail: string;
  confidenceScore?: number | null;
  matchClassification?: WhatsAppMatchClassification | null;
};

export type WhatsAppMatchReviewStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'superseded'
  | 'blocked_xero_import';

export type WhatsAppMatchReviewSummary = {
  id: string;
  companyId: string;
  customerId: string | null;
  customerName: string | null;
  whatsappWaId: string;
  whatsappDisplayName: string | null;
  proposedMobile: string | null;
  proposedMobileNormalized: string | null;
  matchClassification: WhatsAppMatchClassification;
  confidenceScore: number;
  evidence: WhatsAppMatchEvidenceItem[];
  status: WhatsAppMatchReviewStatus;
  priorityRank: number;
  conversationRef: string | null;
  conflictingCustomerIds: string[];
  requestedAt: string;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewNotes: string | null;
  /** TITAN customer phone updated after approval — never silent Xero write. */
  titanSaved: boolean;
  xeroSyncBackRequested: boolean;
};

export type WhatsAppEnrichmentMetricBucket = {
  key: string;
  label: string;
  count: number;
  filterParams: Record<string, string>;
};

export type WhatsAppEnrichmentMetrics = {
  computedAt: string;
  whatsappConnectionStatus: 'disconnected' | 'pending' | 'connected' | 'error';
  autoSyncState:
    | 'not_configured'
    | 'queued_behind_xero'
    | 'waiting_connection'
    | 'importing_conversations'
    | 'processing_matches'
    | 'idle'
    | 'failed';
  autoSyncStateLabel: string;
  xeroImportInProgress: boolean;
  eligibleCustomersMissingMobile: number;
  prioritizedPaidFullyPaidMissingMobile: number;
  conversationsImported: number;
  conversationsPermitted: number;
  matchBuckets: WhatsAppEnrichmentMetricBucket[];
  reviewQueue: {
    pending: number;
    approved: number;
    rejected: number;
    blockedXeroImport: number;
  };
  contactSources: {
    verified: number;
    serviceSafe: number;
    pendingVerification: number;
  };
  safety: {
    supplierMatchesBlocked: number;
    prospectMatchesBlocked: number;
    conflictingMatches: number;
    duplicateCustomerCreatesPrevented: number;
    unauthorizedAccessAttempts: number;
  };
  notes: string[];
};

export type WhatsAppConversationCandidate = {
  waId: string;
  displayName: string | null;
  normalizedMobile: string | null;
  lastMessageAt: string | null;
  messageSnippet: string | null;
  conversationRef: string;
};

export type WhatsAppCustomerMatchCandidate = {
  customerId: string;
  customerName: string;
  companyName: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  suburb: string | null;
  addressLine: string | null;
  jobNumbers: string[];
  invoiceNumbers: string[];
  quoteNumbers: string[];
  valueClassification: CustomerValueClassification;
  isEligibleForEnrichment: boolean;
  missingMobile: boolean;
  isSupplierOnly: boolean;
  doNotContact: boolean;
};

export type ClassifyWhatsAppMatchInput = {
  conversation: WhatsAppConversationCandidate;
  customer: WhatsAppCustomerMatchCandidate;
  evidence: WhatsAppMatchEvidenceItem[];
};

export type ClassifyWhatsAppMatchResult = {
  matchClassification: WhatsAppMatchClassification;
  confidenceScore: number;
  evidence: WhatsAppMatchEvidenceItem[];
  conflictingCustomerIds: string[];
  autoLinkPermitted: boolean;
  reviewRequired: boolean;
  reason: string;
};

const EXACT_VERIFIED_MIN_SCORE = 85;
const HIGH_CONFIDENCE_MIN_SCORE = 65;
const REVIEW_REQUIRED_MIN_SCORE = 40;

/** Name alone is never sufficient for auto-link. */
export function hasNonNameMatchEvidence(evidence: WhatsAppMatchEvidenceItem[]): boolean {
  return evidence.some(
    (item) =>
      item.code !== 'name_exact' &&
      item.code !== 'name_only_insufficient' &&
      item.weight > 0,
  );
}

export function isEligibleForWhatsAppEnrichment(
  classification: CustomerValueClassification,
  opts: { isSupplierOnly?: boolean; missingMobile?: boolean } = {},
): boolean {
  if (opts.isSupplierOnly) return false;
  if (!WHATSAPP_ENRICHMENT_ELIGIBLE_VALUE_CLASSIFICATIONS.includes(classification)) return false;
  return opts.missingMobile !== false;
}

export function computeMatchConfidenceScore(evidence: WhatsAppMatchEvidenceItem[]): number {
  const positive = evidence.filter((item) => item.weight > 0);
  if (positive.length === 0) return 0;
  const raw = positive.reduce((sum, item) => sum + item.weight, 0);
  return Math.min(100, Math.round(raw));
}

export function classifyWhatsAppMatch(
  input: ClassifyWhatsAppMatchInput,
): ClassifyWhatsAppMatchResult {
  const evidence = [...input.evidence];
  const customer = input.customer;

  if (customer.isSupplierOnly) {
    evidence.push({
      code: 'supplier_excluded',
      detail: 'Supplier-only contact — never enriched as customer.',
      weight: 0,
    });
    return {
      matchClassification: 'no_match',
      confidenceScore: 0,
      evidence,
      conflictingCustomerIds: [],
      autoLinkPermitted: false,
      reviewRequired: false,
      reason: 'Supplier-only — excluded.',
    };
  }

  if (!customer.isEligibleForEnrichment) {
    evidence.push({
      code: 'prospect_excluded',
      detail: 'Not a legitimate invoiced/paying customer — WhatsApp contact not imported.',
      weight: 0,
    });
    return {
      matchClassification: 'no_match',
      confidenceScore: 0,
      evidence,
      conflictingCustomerIds: [],
      autoLinkPermitted: false,
      reviewRequired: false,
      reason: 'Prospect/contact only — not eligible.',
    };
  }

  const confidenceScore = computeMatchConfidenceScore(evidence);
  const nonNameEvidence = hasNonNameMatchEvidence(evidence);

  if (!nonNameEvidence) {
    evidence.push({
      code: 'name_only_insufficient',
      detail: 'Name-only match is insufficient — requires corroborating evidence.',
      weight: 0,
    });
    return {
      matchClassification: 'no_match',
      confidenceScore: Math.min(confidenceScore, 25),
      evidence,
      conflictingCustomerIds: [],
      autoLinkPermitted: false,
      reviewRequired: false,
      reason: 'Name-only — insufficient evidence.',
    };
  }

  const mobile = input.conversation.normalizedMobile;
  const existingPhone = customer.phone ? normalizeSaMobile(customer.phone) : null;
  if (mobile && existingPhone && mobile !== existingPhone) {
    evidence.push({
      code: 'conflicting_customer',
      detail: 'Existing customer phone differs from WhatsApp mobile.',
      weight: -30,
    });
    return {
      matchClassification: 'conflicting',
      confidenceScore: Math.max(0, confidenceScore - 30),
      evidence,
      conflictingCustomerIds: [customer.customerId],
      autoLinkPermitted: false,
      reviewRequired: true,
      reason: 'Conflicting phone on customer record.',
    };
  }

  let matchClassification: WhatsAppMatchClassification = 'no_match';
  if (confidenceScore >= EXACT_VERIFIED_MIN_SCORE && nonNameEvidence) {
    matchClassification = 'exact_verified';
  } else if (confidenceScore >= HIGH_CONFIDENCE_MIN_SCORE) {
    matchClassification = 'high_confidence';
  } else if (confidenceScore >= REVIEW_REQUIRED_MIN_SCORE) {
    matchClassification = 'review_required';
  }

  const autoLinkPermitted =
    matchClassification === 'exact_verified' &&
    customer.missingMobile &&
    !customer.doNotContact &&
    Boolean(mobile);

  return {
    matchClassification,
    confidenceScore,
    evidence,
    conflictingCustomerIds: [],
    autoLinkPermitted,
    reviewRequired:
      matchClassification === 'review_required' || matchClassification === 'high_confidence',
    reason: autoLinkPermitted
      ? 'All rules pass — auto-link permitted for missing mobile.'
      : matchClassification === 'high_confidence'
        ? 'High confidence — human review before TITAN save.'
        : matchClassification === 'review_required'
          ? 'Moderate evidence — review required.'
          : 'Insufficient evidence.',
  };
}

/** Priority: paid/fully paid with missing mobile first. */
export function enrichmentPriorityRank(classification: CustomerValueClassification): number {
  switch (classification) {
    case 'fully_paid_customer':
      return 1;
    case 'paying_customer':
      return 2;
    case 'partially_paid_customer':
      return 3;
    case 'overdue_debtor':
      return 4;
    case 'unpaid_debtor':
      return 5;
    case 'verified_invoiced_customer':
      return 6;
    default:
      return 99;
  }
}

export function buildDefaultEnrichmentMetricBuckets(): WhatsAppEnrichmentMetricBucket[] {
  const matchKeys = Object.keys(
    WHATSAPP_MATCH_CLASSIFICATION_LABELS,
  ) as WhatsAppMatchClassification[];

  return [
    ...matchKeys.map((key) => ({
      key: `match_${key}`,
      label: WHATSAPP_MATCH_CLASSIFICATION_LABELS[key],
      count: 0,
      filterParams: { matchClassification: key },
    })),
    {
      key: 'missing_mobile_paid',
      label: 'Paid / fully paid — missing mobile',
      count: 0,
      filterParams: { missingMobile: 'true', valueClassification: 'paying_customer,fully_paid_customer' },
    },
    {
      key: 'review_pending',
      label: 'Review queue — pending',
      count: 0,
      filterParams: { reviewStatus: 'pending' },
    },
  ];
}

/** Guard: enrichment must never create a new customer row from WhatsApp. */
export function assertNoDuplicateCustomerCreateFromWhatsApp(input: {
  existingCustomerId: string | null;
  createCustomerRequested: boolean;
}): { permitted: false; reason: string } | { permitted: true } {
  if (input.createCustomerRequested) {
    return {
      permitted: false,
      reason: 'WhatsApp enrichment never creates customers — link to existing legitimate record only.',
    };
  }
  if (!input.existingCustomerId) {
    return {
      permitted: false,
      reason: 'No existing customer to enrich — queue for review or no-match.',
    };
  }
  return { permitted: true };
}

/** Guard: Xero writes require explicit approved sync-back — never silent. */
export function assertNoSilentXeroWrite(input: {
  xeroWriteRequested: boolean;
  explicitSyncBackApproved: boolean;
}): { permitted: false; reason: string } | { permitted: true } {
  if (input.xeroWriteRequested && !input.explicitSyncBackApproved) {
    return {
      permitted: false,
      reason: 'Xero contact update requires explicit Owner-approved sync-back request.',
    };
  }
  return { permitted: true };
}
