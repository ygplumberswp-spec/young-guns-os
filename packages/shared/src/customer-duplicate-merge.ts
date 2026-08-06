import { isPlaceholderEmail, normalizeSaPhone } from './contact-validation.js';

/** Match evidence for a duplicate-customer candidate pair. */
export type CustomerDuplicateMatchReason =
  | 'phone'
  | 'email'
  | 'normalized_name'
  | 'address_overlap'
  | 'xero_mapping';

export type CustomerDuplicateCandidateStatus = 'pending' | 'dismissed' | 'merged';

export type CustomerDuplicateMatchEvidence = {
  reason: CustomerDuplicateMatchReason;
  detail: string;
  weight: number;
};

export type CustomerDuplicateCandidateSummary = {
  id: string;
  leftCustomerId: string;
  rightCustomerId: string;
  leftName: string;
  rightName: string;
  leftCreatedAt: string;
  rightCreatedAt: string;
  confidence: number;
  matchReasons: CustomerDuplicateMatchEvidence[];
  status: CustomerDuplicateCandidateStatus;
  survivorCustomerId: string | null;
  updatedAt: string;
};

export type CustomerMergeLinkCounts = {
  jobs: number;
  quotes: number;
  invoices: number;
  payments: number;
  properties: number;
  documents: number;
  communications: number;
  activities: number;
  leads: number;
  portalUsers: number;
  xeroMappings: number;
};

export type CustomerMergeConflictCode =
  | 'verified_phone_mismatch'
  | 'verified_email_mismatch'
  | 'address_mismatch'
  | 'separate_xero_mappings'
  | 'company_vat_conflict'
  | 'active_jobs_both'
  | 'unpaid_invoices_both';

export type CustomerMergeConflict = {
  code: CustomerMergeConflictCode;
  message: string;
  requiresConfirmation: true;
};

export type CustomerMergeFieldKey =
  | 'name'
  | 'contactPerson'
  | 'email'
  | 'phone'
  | 'notes'
  | 'status'
  | 'doNotContact'
  | 'isSupplierOnly';

export type CustomerMergeSideSnapshot = {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: string;
  doNotContact: boolean;
  isSupplierOnly: boolean;
  createdAt: string;
  updatedAt: string;
  primaryAddressDisplay: string | null;
  xeroContactIds: string[];
  linkCounts: CustomerMergeLinkCounts;
  hasActiveJobs: boolean;
  hasUnpaidInvoices: boolean;
};

export type CustomerMergePreview = {
  left: CustomerMergeSideSnapshot;
  right: CustomerMergeSideSnapshot;
  olderCustomerId: string;
  newerCustomerId: string;
  confidence: number;
  matchReasons: CustomerDuplicateMatchEvidence[];
  conflicts: CustomerMergeConflict[];
  candidateId: string | null;
};

export type CustomerMergeDecision =
  | 'keep_left'
  | 'keep_right'
  | 'selective_fields'
  | 'dismiss_not_duplicate';

export type CustomerMergeFieldSelection = Partial<Record<CustomerMergeFieldKey, 'left' | 'right'>>;

export type CustomerMergeRequest = {
  leftCustomerId: string;
  rightCustomerId: string;
  decision: CustomerMergeDecision;
  /** Required when conflicts exist and decision is a merge. */
  confirmConflicts?: boolean;
  fieldSelection?: CustomerMergeFieldSelection;
  /**
   * Structural survivor for selective_fields merges.
   * Must be leftCustomerId or rightCustomerId.
   */
  survivorCustomerId?: string | null;
  /** Required when both sides have distinct Xero contact IDs. */
  keepXeroContactId?: string | null;
  notes?: string | null;
  candidateId?: string | null;
};

export type CustomerMergeResult = {
  decision: CustomerMergeDecision;
  survivorCustomerId: string | null;
  mergedCustomerId: string | null;
  moved: CustomerMergeLinkCounts;
  candidateId: string | null;
};

export function normalizeCustomerNameKey(name: string | null | undefined): string | null {
  if (name == null) return null;
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

export function normalizeCustomerEmailKey(email: string | null | undefined): string | null {
  if (email == null) return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || isPlaceholderEmail(trimmed)) return null;
  return trimmed;
}

export function normalizeCustomerPhoneKey(phone: string | null | undefined): string | null {
  return normalizeSaPhone(phone);
}

export function orderCustomerPairIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function scoreCustomerDuplicateEvidence(
  evidence: CustomerDuplicateMatchEvidence[],
): number {
  const total = evidence.reduce((sum, item) => sum + item.weight, 0);
  return Math.min(100, total);
}

/** Minimum confidence to surface as a review candidate. */
export const CUSTOMER_DUPLICATE_CANDIDATE_THRESHOLD = 40;

export function isCustomerDuplicateCandidate(
  evidence: CustomerDuplicateMatchEvidence[],
): boolean {
  if (evidence.some((item) => item.reason === 'phone' || item.reason === 'email' || item.reason === 'xero_mapping')) {
    return true;
  }
  return scoreCustomerDuplicateEvidence(evidence) >= CUSTOMER_DUPLICATE_CANDIDATE_THRESHOLD;
}

export function emptyCustomerMergeLinkCounts(): CustomerMergeLinkCounts {
  return {
    jobs: 0,
    quotes: 0,
    invoices: 0,
    payments: 0,
    properties: 0,
    documents: 0,
    communications: 0,
    activities: 0,
    leads: 0,
    portalUsers: 0,
    xeroMappings: 0,
  };
}
