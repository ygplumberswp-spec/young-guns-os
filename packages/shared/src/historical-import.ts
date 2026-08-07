/**
 * Historical Import + Job 360 archive helpers.
 *
 * Reuses canonical Customers / Properties / Jobs / Quotes / Invoices / Payments /
 * Documents — never a parallel archive store. Imported records must retain original
 * identity and source provenance; low-confidence matches require human review.
 */

export const HISTORICAL_SOURCE_PROVIDERS = [
  'XERO',
  'CSV',
  'XLSX',
  'MANUAL_UPLOAD',
  'LEGACY_SYSTEM',
  'OTHER_IMPORT',
] as const;

export type HistoricalSourceProvider = (typeof HISTORICAL_SOURCE_PROVIDERS)[number];

export const HISTORICAL_PARTIAL_STATES = [
  'HISTORICAL_PARTIAL_RECORD',
  'NO_PHOTOS_IMPORTED',
  'PAYMENT_PROOF_NOT_AVAILABLE',
  'NO_COC_IMPORTED',
  'ORIGINAL_JOB_CARD_NOT_AVAILABLE',
  'NO_REPORT_IMPORTED',
  'NO_SIGNATURE_IMPORTED',
] as const;

export type HistoricalPartialState = (typeof HISTORICAL_PARTIAL_STATES)[number];

export type HistoricalMatchConfidence = 'deterministic' | 'high' | 'medium' | 'low' | 'none';

export type HistoricalMatchDecision =
  | 'MATCHED'
  | 'POSSIBLE_MATCH'
  | 'CREATE_NEW'
  | 'SKIP'
  | 'REVIEW';

export type HistoricalDocumentMatchAction =
  | 'LINK'
  | 'CHOOSE_DIFFERENT'
  | 'CREATE_HISTORICAL_RECORD'
  | 'SKIP';

export type HistoricalPhotoPhase =
  | 'BEFORE'
  | 'PROGRESS'
  | 'AFTER'
  | 'SITE_CONDITION'
  | 'REPORT_EVIDENCE'
  | 'OTHER';

export type HistoricalRecordMatchCandidate = {
  entityType: string;
  entityId: string;
  label: string;
  customerName?: string | null;
  propertyName?: string | null;
  documentNumber?: string | null;
  issuedAt?: string | null;
  amountCents?: number | null;
  sourceProvider?: string | null;
  confidence: HistoricalMatchConfidence;
  score: number;
  reasons: string[];
  requiresHumanReview: boolean;
};

export type HistoricalDocumentMatchProposal = {
  fileName: string;
  detectedNumber: string | null;
  detectedEntityHint: 'quote' | 'invoice' | 'job' | 'payment_proof' | 'other' | null;
  candidates: HistoricalRecordMatchCandidate[];
  recommendedAction: HistoricalDocumentMatchAction;
  recommendedCandidateId: string | null;
  /** Never silently link when confidence is below high/deterministic. */
  allowSilentLink: boolean;
};

export type Job360HistoricalCompleteness = {
  isHistorical: boolean;
  partialStates: HistoricalPartialState[];
  quoteCount: number;
  invoiceCount: number;
  paymentCount: number;
  hasPaymentProof: boolean;
  photoCount: number;
  hasCoc: boolean;
  hasJobCard: boolean;
  hasReport: boolean;
  hasSignature: boolean;
  searchableWhenCompleted: true;
};

export type HistoricalPaymentImportKind = 'PAYMENT_RECORD' | 'PROOF_OF_PAYMENT_DOCUMENT';

/** Map DM / file format labels onto canonical provenance providers. */
export function normalizeHistoricalSourceProvider(
  value: string | null | undefined,
  sourceFormat?: string | null,
): HistoricalSourceProvider {
  const raw = (value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (raw === 'XERO') return 'XERO';
  if (raw === 'CSV') return 'CSV';
  if (raw === 'XLSX' || raw === 'EXCEL' || raw === 'XLS') return 'XLSX';
  if (raw === 'MANUAL' || raw === 'MANUAL_UPLOAD' || raw === 'UPLOAD') return 'MANUAL_UPLOAD';
  if (raw === 'LEGACY' || raw === 'LEGACY_SYSTEM') return 'LEGACY_SYSTEM';
  if (raw === 'OTHER' || raw === 'OTHER_IMPORT') return 'OTHER_IMPORT';
  const format = (sourceFormat ?? '').trim().toLowerCase();
  if (format === 'csv') return 'CSV';
  if (format === 'excel') return 'XLSX';
  if (format === 'json' || format === 'xml') return 'OTHER_IMPORT';
  return 'OTHER_IMPORT';
}

/** Persist provider in DB source_provider columns (lowercase snake for Xero compat). */
export function toDbSourceProvider(provider: HistoricalSourceProvider): string {
  switch (provider) {
    case 'XERO':
      return 'xero';
    case 'CSV':
      return 'csv';
    case 'XLSX':
      return 'xlsx';
    case 'MANUAL_UPLOAD':
      return 'manual_upload';
    case 'LEGACY_SYSTEM':
      return 'legacy_system';
    default:
      return 'other_import';
  }
}

export function parseHistoricalAmountToCents(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.round(Math.abs(value) < 1000 && !Number.isInteger(value) ? value * 100 : value);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[R$€,\s]/gi, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  if (cleaned.includes('.')) {
    return Math.round(Number(cleaned) * 100);
  }
  const asInt = Number(cleaned);
  return Number.isFinite(asInt) ? asInt : null;
}

export function extractDocumentNumberHint(fileName: string): {
  detectedNumber: string | null;
  detectedEntityHint: HistoricalDocumentMatchProposal['detectedEntityHint'];
} {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  const quote = base.match(/\b(Q[-\s]?\d{3,})\b/i);
  if (quote) {
    return {
      detectedNumber: quote[1]!.replace(/\s+/g, '-').toUpperCase().replace(/^Q-?/, 'Q-'),
      detectedEntityHint: 'quote',
    };
  }
  const invoice = base.match(/\b(INV[-\s]?\d{3,}|I[-\s]?\d{3,})\b/i);
  if (invoice) {
    return {
      detectedNumber: invoice[1]!.replace(/\s+/g, '-').toUpperCase(),
      detectedEntityHint: 'invoice',
    };
  }
  const job = base.match(/\b(JOB[-\s]?\d{4,})\b/i);
  if (job) {
    return {
      detectedNumber: job[1]!.replace(/\s+/g, '-').toUpperCase(),
      detectedEntityHint: 'job',
    };
  }
  const pop = /(^|[_\s-])(POP|PROOF|PAYMENT[_?\s-]?PROOF|RECEIPT)([_\s-]|$)/i.test(base);
  if (pop) {
    return { detectedNumber: null, detectedEntityHint: 'payment_proof' };
  }
  const generic = base.match(/\b([A-Z]{1,5}-?\d{3,})\b/i);
  return {
    detectedNumber: generic?.[1]?.toUpperCase() ?? null,
    detectedEntityHint: generic ? 'other' : null,
  };
}

export function scoreHistoricalRecordMatch(input: {
  signals: {
    externalIdMatch?: boolean;
    numberMatch?: boolean;
    customerMatch?: boolean;
    propertyMatch?: boolean;
    amountMatch?: boolean;
    dateMatch?: boolean;
    emailMatch?: boolean;
    phoneMatch?: boolean;
  };
}): { confidence: HistoricalMatchConfidence; score: number; requiresHumanReview: boolean } {
  let score = 0;
  if (input.signals.externalIdMatch) score += 100;
  if (input.signals.numberMatch) score += 70;
  if (input.signals.customerMatch) score += 20;
  if (input.signals.propertyMatch) score += 15;
  if (input.signals.amountMatch) score += 15;
  if (input.signals.dateMatch) score += 10;
  if (input.signals.emailMatch) score += 25;
  if (input.signals.phoneMatch) score += 20;

  let confidence: HistoricalMatchConfidence = 'none';
  if (input.signals.externalIdMatch) confidence = 'deterministic';
  else if (score >= 90) confidence = 'high';
  else if (score >= 55) confidence = 'medium';
  else if (score >= 15) confidence = 'low';

  const requiresHumanReview = confidence === 'medium' || confidence === 'low' || confidence === 'none';
  return { confidence, score, requiresHumanReview };
}

export function decideHistoricalMatchAction(
  confidence: HistoricalMatchConfidence,
  hasCandidate: boolean,
): HistoricalMatchDecision {
  if (!hasCandidate) return 'CREATE_NEW';
  if (confidence === 'deterministic' || confidence === 'high') return 'MATCHED';
  if (confidence === 'medium' || confidence === 'low') return 'REVIEW';
  // Candidate exists but signals are too weak for any confidence band.
  return 'REVIEW';
}

export function buildHistoricalDocumentMatchProposal(input: {
  fileName: string;
  candidates: HistoricalRecordMatchCandidate[];
}): HistoricalDocumentMatchProposal {
  const hint = extractDocumentNumberHint(input.fileName);
  const sorted = [...input.candidates].sort((a, b) => b.score - a.score);
  const top = sorted[0] ?? null;
  const allowSilentLink = Boolean(
    top && (top.confidence === 'deterministic' || top.confidence === 'high') && !top.requiresHumanReview,
  );

  let recommendedAction: HistoricalDocumentMatchAction = 'CREATE_HISTORICAL_RECORD';
  if (top && allowSilentLink) recommendedAction = 'LINK';
  else if (top && top.requiresHumanReview) recommendedAction = 'CHOOSE_DIFFERENT';
  else if (!top && hint.detectedEntityHint === 'payment_proof') recommendedAction = 'SKIP';

  return {
    fileName: input.fileName,
    detectedNumber: hint.detectedNumber,
    detectedEntityHint: hint.detectedEntityHint,
    candidates: sorted,
    recommendedAction,
    recommendedCandidateId: allowSilentLink ? top?.entityId ?? null : null,
    allowSilentLink,
  };
}

/**
 * Proof-of-payment documents never auto-confirm a paid transaction.
 * Only an explicit PAYMENT_RECORD path (with authorised reconciliation) may create ledger money.
 */
export function paymentImportCreatesLedgerEntry(
  kind: HistoricalPaymentImportKind,
  authorisedReconciliation: boolean,
): boolean {
  if (kind === 'PROOF_OF_PAYMENT_DOCUMENT') return false;
  return authorisedReconciliation;
}

export function deriveJob360HistoricalCompleteness(input: {
  isHistorical?: boolean;
  quoteCount: number;
  invoiceCount: number;
  paymentCount: number;
  hasPaymentProof?: boolean;
  photoCount?: number;
  hasCoc?: boolean;
  hasJobCard?: boolean;
  hasReport?: boolean;
  hasSignature?: boolean;
}): Job360HistoricalCompleteness {
  const partialStates: HistoricalPartialState[] = [];
  const photoCount = input.photoCount ?? 0;
  const hasPaymentProof = input.hasPaymentProof ?? false;
  const hasCoc = input.hasCoc ?? false;
  const hasJobCard = input.hasJobCard ?? false;
  const hasReport = input.hasReport ?? false;
  const hasSignature = input.hasSignature ?? false;

  if (input.isHistorical) {
    partialStates.push('HISTORICAL_PARTIAL_RECORD');
  }
  if (photoCount === 0) partialStates.push('NO_PHOTOS_IMPORTED');
  if (!hasPaymentProof && input.paymentCount === 0) {
    partialStates.push('PAYMENT_PROOF_NOT_AVAILABLE');
  } else if (!hasPaymentProof) {
    partialStates.push('PAYMENT_PROOF_NOT_AVAILABLE');
  }
  if (!hasCoc) partialStates.push('NO_COC_IMPORTED');
  if (!hasJobCard) partialStates.push('ORIGINAL_JOB_CARD_NOT_AVAILABLE');
  if (!hasReport) partialStates.push('NO_REPORT_IMPORTED');
  if (!hasSignature) partialStates.push('NO_SIGNATURE_IMPORTED');

  return {
    isHistorical: Boolean(input.isHistorical),
    partialStates,
    quoteCount: input.quoteCount,
    invoiceCount: input.invoiceCount,
    paymentCount: input.paymentCount,
    hasPaymentProof,
    photoCount,
    hasCoc,
    hasJobCard,
    hasReport,
    hasSignature,
    searchableWhenCompleted: true,
  };
}

/** Prefer an existing Xero-imported commercial record over creating a duplicate from PDF/CSV. */
export function preferXeroCanonicalRecord<T extends { sourceProvider?: string | null }>(
  matches: T[],
): T | null {
  const xero = matches.find((row) => (row.sourceProvider ?? '').toLowerCase() === 'xero');
  return xero ?? matches[0] ?? null;
}

export function historicalQuoteRetainsOriginalNumber(
  importedNumber: string,
  storedNumber: string,
): boolean {
  return importedNumber.trim() === storedNumber.trim();
}

export function normalizeHistoricalDocumentNumber(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export function buildHistoricalIdempotencyKey(input: {
  entityType: string;
  sourceProvider?: string | null;
  sourceExternalId?: string | null;
  documentNumber?: string | null;
  customerKey?: string | null;
}): string {
  const external = (input.sourceExternalId ?? '').trim();
  if (external) {
    return `${input.entityType}:${(input.sourceProvider ?? 'import').toLowerCase()}:${external}`;
  }
  const number = normalizeHistoricalDocumentNumber(input.documentNumber);
  if (number) {
    return `${input.entityType}:number:${number}`;
  }
  const customer = (input.customerKey ?? '').trim().toLowerCase();
  return `${input.entityType}:customer:${customer}`;
}

/** Client-facing DTOs must never expose internal historical finance / JPE / cost basis. */
export function filterHistoricalInternalFinanceForClient<T extends Record<string, unknown>>(
  payload: T,
): Omit<T, 'estimatedCostCents' | 'grossProfitCents' | 'markupBps' | 'marginBps' | 'unitCostCents' | 'jpe' | 'profit' | 'internalNotes'> {
  const {
    estimatedCostCents: _c,
    grossProfitCents: _g,
    markupBps: _m,
    marginBps: _mb,
    unitCostCents: _u,
    jpe: _j,
    profit: _p,
    internalNotes: _n,
    ...safe
  } = payload;
  return safe;
}

export const HISTORICAL_IMPORT_UNSUPPORTED_MESSAGE =
  'UNSUPPORTED / REQUIRES IMPLEMENTATION — no safe canonical commit path yet.';

export function mapDmFormatToHistoricalProvider(sourceFormat: string): HistoricalSourceProvider {
  return normalizeHistoricalSourceProvider(null, sourceFormat);
}
