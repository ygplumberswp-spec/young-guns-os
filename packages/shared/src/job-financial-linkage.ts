/**
 * JPE-003 — Job ↔ quote ↔ invoice linkage control.
 *
 * Deterministic matching first; secondary signals rank candidates only.
 * Never auto-link historical records on weak evidence alone.
 */

import { canViewFinanceProfit } from './finance-tenant-pricebook.js';
import { canManageJobProfitabilityAdjustments } from './job-profitability.js';

export const JOB_NUMBER_REFERENCE_PATTERN = /\bJOB-\d{6}\b/gi;

export type LinkageConfidence = 'deterministic' | 'high' | 'medium' | 'low' | 'ambiguous';

export type LinkageMechanism =
  | 'native'
  | 'deterministic_reference'
  | 'deterministic_quote'
  | 'manual_owner'
  | 'manual_finance'
  | 'corrected'
  | 'unlinked'
  | 'rejected';

export type LinkageState =
  | 'linked'
  | 'unlinked'
  | 'suggested'
  | 'ambiguous'
  | 'rejected'
  | 'needs_review';

export type LinkageConflictType =
  | 'LINKAGE_CONFLICT'
  | 'QUOTE_INVOICE_JOB_MISMATCH'
  | 'DUPLICATE_EXTERNAL_DOCUMENT';

export type LinkageEvidenceReason = {
  code: string;
  message: string;
  weight: number;
};

export type LinkageCandidate = {
  jobId: string;
  jobNumber: string | null;
  jobTitle: string | null;
  jobStatus: string | null;
  confidence: LinkageConfidence;
  score: number;
  reasons: string[];
  isDeterministic: boolean;
  evidence: LinkageEvidenceReason[];
};

export type LinkageConflict = {
  type: LinkageConflictType;
  message: string;
  details?: Record<string, unknown>;
};

export type LinkageDocumentBase = {
  id: string;
  companyId: string;
  customerId: string;
  jobId: string | null;
  totalCents: number;
  siteAddress: string | null;
  issuedAt: string | null;
  updatedAt: string | null;
};

export type LinkageInvoiceDocument = LinkageDocumentBase & {
  entityType: 'invoice';
  invoiceNumber: string;
  quoteId: string | null;
  xeroReference: string | null;
  sourceProvider: string | null;
  sourceExternalId: string | null;
  status: string;
};

export type LinkageQuoteDocument = LinkageDocumentBase & {
  entityType: 'quote';
  quoteNumber: string;
  status: string;
  acceptedAt: string | null;
};

export type LinkageJobCandidateInput = {
  id: string;
  jobNumber: string;
  customerId: string;
  propertyId: string | null;
  title: string;
  status: string;
  snapshotFormattedAddress: string | null;
  snapshotSuburb: string | null;
  scheduledAt: string | null;
  updatedAt: string | null;
};

export type LinkageQuoteContext = {
  quoteId: string;
  quoteJobId: string | null;
  quoteTotalCents: number | null;
  quoteStatus: string | null;
};

export type ScoreLinkageCandidatesInput = {
  document: LinkageInvoiceDocument | LinkageQuoteDocument;
  jobs: LinkageJobCandidateInput[];
  linkedQuote?: LinkageQuoteContext | null;
  rejectedJobIds?: string[];
  referenceTexts?: string[];
};

export type JobLinkageQueueItem = {
  entityType: 'invoice' | 'quote';
  entityId: string;
  documentNumber: string;
  customerId: string;
  customerName: string | null;
  amountCents: number;
  currency: string;
  documentDate: string | null;
  reference: string | null;
  linkageState: LinkageState;
  currentJobId: string | null;
  currentJobNumber: string | null;
  topCandidate: LinkageCandidate | null;
  candidateCount: number;
  conflicts: LinkageConflict[];
  entityFingerprint: string;
};

export type JobLinkageControlSummary = {
  unlinkedInvoicesCount: number;
  unlinkedInvoicesValueCents: number;
  unlinkedQuotesCount: number;
  unlinkedQuotesValueCents: number;
  highConfidenceSuggestions: number;
  ambiguousRecords: number;
  linkageConflicts: number;
  recentlyLinkedCount: number;
};

export type JobLinkageControlQueue = {
  summary: JobLinkageControlSummary;
  unlinkedInvoices: JobLinkageQueueItem[];
  unlinkedQuotes: JobLinkageQueueItem[];
  suggested: JobLinkageQueueItem[];
  ambiguous: JobLinkageQueueItem[];
  recentlyLinked: JobLinkageQueueItem[];
  rejected: JobLinkageQueueItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};

const DATE_PROXIMITY_DAYS = 14;

export function extractJobNumberReferences(...texts: Array<string | null | undefined>): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(JOB_NUMBER_REFERENCE_PATTERN)) {
      found.add(match[0].toUpperCase());
    }
  }
  return [...found];
}

/** Lightweight address normalisation for candidate ranking — not financial authority. */
export function normalizeAddressForLinkage(address: string | null | undefined): string {
  if (!address) return '';
  return address
    .toLowerCase()
    .replace(/\b(st|street)\b/g, 'street')
    .replace(/\b(rd|road)\b/g, 'road')
    .replace(/\b(ave|avenue)\b/g, 'avenue')
    .replace(/\b(dr|drive)\b/g, 'drive')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function addressesLikelyMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeAddressForLinkage(a);
  const right = normalizeAddressForLinkage(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.includes(right) || right.includes(left);
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return Math.abs(left - right) / (1000 * 60 * 60 * 24);
}

export function buildLinkageEntityFingerprint(
  document: Pick<LinkageDocumentBase, 'id' | 'customerId' | 'jobId' | 'totalCents' | 'updatedAt'>,
  entityType: 'invoice' | 'quote',
): string {
  return `${entityType}:${document.id}:${document.customerId}:${document.jobId ?? 'null'}:${document.totalCents}:${document.updatedAt ?? 'null'}`;
}

function buildJobLookup(jobs: LinkageJobCandidateInput[]): Map<string, LinkageJobCandidateInput> {
  const byNumber = new Map<string, LinkageJobCandidateInput>();
  for (const job of jobs) {
    byNumber.set(job.jobNumber.toUpperCase(), job);
  }
  return byNumber;
}

function scoreJobCandidate(
  document: LinkageInvoiceDocument | LinkageQuoteDocument,
  job: LinkageJobCandidateInput,
  input: ScoreLinkageCandidatesInput,
): LinkageCandidate {
  const evidence: LinkageEvidenceReason[] = [];
  let score = 0;
  let isDeterministic = false;

  if (document.jobId === job.id) {
    evidence.push({ code: 'native_job_id', message: 'Document already linked to this job', weight: 100 });
    return {
      jobId: job.id,
      jobNumber: job.jobNumber,
      jobTitle: job.title,
      jobStatus: job.status,
      confidence: 'deterministic',
      score: 100,
      reasons: ['Native job linkage'],
      isDeterministic: true,
      evidence,
    };
  }

  const referenceTexts =
    input.referenceTexts ??
    (document.entityType === 'invoice'
      ? [document.xeroReference, document.invoiceNumber]
      : [document.quoteNumber]);

  const refs = extractJobNumberReferences(...referenceTexts);
  const exactRef = refs.find((ref) => ref === job.jobNumber.toUpperCase());
  if (exactRef) {
    evidence.push({
      code: 'exact_job_reference',
      message: `Exact job reference match (${exactRef})`,
      weight: 95,
    });
    score += 95;
    if (refs.length === 1) {
      isDeterministic = true;
    }
  }

  if (document.entityType === 'invoice' && input.linkedQuote?.quoteJobId === job.id) {
    evidence.push({
      code: 'linked_quote_job',
      message: 'Invoice created from a TITAN quote linked to this job',
      weight: 100,
    });
    score = 100;
    isDeterministic = true;
  }

  if (document.customerId === job.customerId) {
    evidence.push({ code: 'same_customer', message: 'Same customer', weight: 15 });
    score += 15;
  } else {
    score -= 40;
  }

  const docAddress = document.siteAddress;
  const jobAddress = job.snapshotFormattedAddress ?? job.snapshotSuburb;
  if (addressesLikelyMatch(docAddress, jobAddress)) {
    evidence.push({ code: 'address_match', message: 'Same or similar service address', weight: 25 });
    score += 25;
  }

  const docDate =
    document.entityType === 'quote' ? document.acceptedAt ?? document.issuedAt : document.issuedAt;
  const jobDate = job.status === 'completed' ? job.updatedAt : job.scheduledAt ?? job.updatedAt;
  const dayGap = daysBetween(docDate, jobDate);
  if (dayGap != null && dayGap <= DATE_PROXIMITY_DAYS) {
    evidence.push({
      code: 'date_proximity',
      message: `Document date within ${Math.round(dayGap)} day(s) of job activity`,
      weight: 10,
    });
    score += 10;
  }

  if (
    document.entityType === 'invoice' &&
    input.linkedQuote?.quoteTotalCents != null &&
    input.linkedQuote.quoteTotalCents === document.totalCents
  ) {
    evidence.push({
      code: 'quote_amount_match',
      message: 'Invoice amount matches linked quote total',
      weight: 20,
    });
    score += 20;
  }

  if (document.entityType === 'invoice' && input.linkedQuote?.quoteStatus === 'accepted') {
    evidence.push({ code: 'accepted_quote', message: 'Linked quote is accepted', weight: 10 });
    score += 10;
  }

  const reasons = evidence.map((row) => row.message);
  let confidence: LinkageConfidence = 'low';
  if (isDeterministic) {
    confidence = 'deterministic';
  } else if (score >= 80) {
    confidence = 'high';
  } else if (score >= 45) {
    confidence = 'medium';
  } else if (score >= 20) {
    confidence = 'low';
  } else {
    confidence = 'ambiguous';
  }

  return {
    jobId: job.id,
    jobNumber: job.jobNumber,
    jobTitle: job.title,
    jobStatus: job.status,
    confidence,
    score,
    reasons,
    isDeterministic,
    evidence,
  };
}

export function scoreLinkageCandidates(input: ScoreLinkageCandidatesInput): LinkageCandidate[] {
  const rejected = new Set(input.rejectedJobIds ?? []);
  const jobsByNumber = buildJobLookup(input.jobs);

  const referenceTexts =
    input.referenceTexts ??
    (input.document.entityType === 'invoice'
      ? [input.document.xeroReference, input.document.invoiceNumber]
      : [input.document.quoteNumber]);

  const refMatches: LinkageJobCandidateInput[] = [];
  for (const ref of extractJobNumberReferences(...referenceTexts)) {
    const job = jobsByNumber.get(ref);
    if (job) refMatches.push(job);
  }

  const candidateJobs = new Map<string, LinkageJobCandidateInput>();
  for (const job of input.jobs) candidateJobs.set(job.id, job);
  for (const job of refMatches) candidateJobs.set(job.id, job);

  const scored = [...candidateJobs.values()]
    .filter((job) => !rejected.has(job.id))
    .map((job) => scoreJobCandidate(input.document, job, input))
    .sort((a, b) => b.score - a.score || (a.jobNumber ?? '').localeCompare(b.jobNumber ?? ''));

  if (scored.length >= 2) {
    const top = scored[0]!;
    const second = scored[1]!;
    if (!top.isDeterministic && second.score >= top.score - 5 && top.score < 80) {
      for (const row of scored) {
        if (!row.isDeterministic && row.confidence !== 'deterministic') {
          row.confidence = 'ambiguous';
        }
      }
    }
  }

  return scored;
}

export function classifyLinkageState(
  document: Pick<LinkageDocumentBase, 'jobId'>,
  candidates: LinkageCandidate[],
  rejectedJobIds: string[] = [],
): LinkageState {
  if (document.jobId) return 'linked';
  const active = candidates.filter((c) => !rejectedJobIds.includes(c.jobId));
  if (active.length === 0) return 'unlinked';
  const top = active[0]!;
  if (top.confidence === 'ambiguous') return 'ambiguous';
  if (active.length >= 2 && active[1]!.score >= top.score - 5 && !top.isDeterministic) {
    return 'ambiguous';
  }
  if (top.isDeterministic || top.confidence === 'high') return 'suggested';
  if (top.confidence === 'medium') return 'needs_review';
  return 'needs_review';
}

export function detectInvoiceLinkageConflicts(
  invoice: Pick<LinkageInvoiceDocument, 'jobId' | 'sourceProvider' | 'sourceExternalId'>,
  quote: LinkageQuoteContext | null | undefined,
  duplicateExternalIds: string[] = [],
): LinkageConflict[] {
  const conflicts: LinkageConflict[] = [];
  if (invoice.jobId && quote?.quoteJobId && quote.quoteJobId !== invoice.jobId) {
    conflicts.push({
      type: 'QUOTE_INVOICE_JOB_MISMATCH',
      message: 'Invoice job differs from linked quote job.',
      details: { invoiceJobId: invoice.jobId, quoteJobId: quote.quoteJobId },
    });
  }
  if (invoice.sourceExternalId && duplicateExternalIds.includes(invoice.sourceExternalId)) {
    conflicts.push({
      type: 'DUPLICATE_EXTERNAL_DOCUMENT',
      message: 'External document identifier appears on multiple records.',
      details: { sourceProvider: invoice.sourceProvider, sourceExternalId: invoice.sourceExternalId },
    });
  }
  return conflicts;
}

export function isCustomerOnlyMatch(evidence: LinkageEvidenceReason[]): boolean {
  const meaningful = evidence.filter((row) => row.weight >= 15);
  return meaningful.length === 1 && meaningful[0]?.code === 'same_customer';
}

export function isAmountOnlySupportingEvidence(evidence: LinkageEvidenceReason[]): boolean {
  const strong = evidence.filter((row) =>
    ['exact_job_reference', 'linked_quote_job', 'native_job_id', 'address_match'].includes(row.code),
  );
  return evidence.some((row) => row.code === 'quote_amount_match') && strong.length === 0;
}

export function isDateProximityOnlySupportingEvidence(evidence: LinkageEvidenceReason[]): boolean {
  const strong = evidence.filter((row) =>
    ['exact_job_reference', 'linked_quote_job', 'native_job_id', 'address_match', 'same_customer'].includes(
      row.code,
    ),
  );
  return strong.length === 0 && evidence.some((row) => row.code === 'date_proximity');
}

export function canAccessJobLinkageControl(identity: {
  permissions?: readonly string[] | null;
  roleName?: string | null;
}): boolean {
  return canViewFinanceProfit(identity.permissions ?? [], identity.roleName);
}

export function canManageJobLinkageControl(identity: {
  permissions?: readonly string[] | null;
  roleName?: string | null;
}): boolean {
  return canManageJobProfitabilityAdjustments(identity);
}

export function resolveLinkageMechanism(
  actorRole: string | null | undefined,
  confidence: LinkageConfidence,
  previousJobId: string | null,
): LinkageMechanism {
  if (confidence === 'deterministic') {
    return previousJobId ? 'corrected' : 'deterministic_reference';
  }
  if (actorRole === 'Company Owner') return 'manual_owner';
  return 'manual_finance';
}

export function buildLinkageQueueItem(
  document: LinkageInvoiceDocument | LinkageQuoteDocument,
  candidates: LinkageCandidate[],
  conflicts: LinkageConflict[],
  rejectedJobIds: string[],
  customerName: string | null,
  currency: string,
  currentJobNumber: string | null,
): JobLinkageQueueItem {
  const activeCandidates = candidates.filter((c) => !rejectedJobIds.includes(c.jobId));
  const linkageState = classifyLinkageState(document, activeCandidates, rejectedJobIds);
  const reference =
    document.entityType === 'invoice'
      ? document.xeroReference ?? document.invoiceNumber
      : document.quoteNumber;

  return {
    entityType: document.entityType,
    entityId: document.id,
    documentNumber:
      document.entityType === 'invoice' ? document.invoiceNumber : document.quoteNumber,
    customerId: document.customerId,
    customerName,
    amountCents: document.totalCents,
    currency,
    documentDate: document.issuedAt,
    reference,
    linkageState,
    currentJobId: document.jobId,
    currentJobNumber,
    topCandidate: activeCandidates[0] ?? null,
    candidateCount: activeCandidates.length,
    conflicts,
    entityFingerprint: buildLinkageEntityFingerprint(document, document.entityType),
  };
}

export const NATIVE_LINKAGE_GUARANTEES = {
  quoteFromJob: 'quote.jobId must be set when created from Job 360',
  invoiceFromQuote: 'invoice.jobId must inherit quote.jobId on conversion',
  invoiceFromJob: 'invoice.jobId must be set when created directly from job',
  paymentViaInvoice: 'payment job context derives from invoice.jobId',
} as const;
