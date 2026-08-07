/**
 * BANK-002 — Receipt / slip matching & supplier reconciliation (shared pure logic).
 */

import {
  BANK_TRANSACTION_CATEGORIES,
  type BankTransactionAllocationType,
  type BankTransactionReceiptStatus,
  normaliseBankTransactionText,
  normaliseMerchantForSupplierSuggestion,
} from './bank-transaction-control.js';

export type ReceiptMatchStatus =
  | 'awaiting_transaction_match'
  | 'linked'
  | 'verified'
  | 'needs_review';

export type ReceiptVerificationStatus = 'not_verified' | 'verified' | 'needs_review';

export type ReceiptEvidenceSource = 'document' | 'mobile_job_documentation';

export type ReceiptLinkMethod =
  | 'manual'
  | 'deterministic'
  | 'owner_approved_match'
  | 'technician_upload';

export type ReceiptDuplicateFlag = 'POSSIBLE_DUPLICATE_RECEIPT';

/** Future OCR contract — suggestions only, Owner/Finance approval authoritative. */
export type ReceiptExtractionCandidate = {
  supplierName: string | null;
  supplierVatNumber?: string | null;
  receiptNumber?: string | null;
  transactionDate?: string | null;
  totalCents?: number | null;
  subtotalCents?: number | null;
  taxCents?: number | null;
  currency?: string | null;
  confidence: 'high' | 'medium' | 'low';
};

export type ReceiptMatchCandidateEvidence = {
  signal: string;
  detail: string;
};

export type ReceiptTransactionMatchCandidate = {
  bankTransactionId: string;
  transactionDate: string;
  amountCents: number;
  description: string | null;
  confidence: 'high' | 'medium' | 'low';
  amountDifferenceCents: number;
  dateDifferenceDays: number;
  supplierEvidence: string | null;
  reasons: string[];
  evidence: ReceiptMatchCandidateEvidence[];
  sourceFingerprint: string;
};

export type SupplierSuggestion = {
  supplierId: string;
  supplierName: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: ReceiptMatchCandidateEvidence[];
};

export type FinanceReceiptRecordSummary = {
  id: string;
  documentId: string | null;
  evidenceSource: ReceiptEvidenceSource;
  evidenceSourceId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  receiptNumber: string | null;
  documentDate: string | null;
  totalAmountCents: number | null;
  vatAmountCents: number | null;
  currency: string;
  matchStatus: ReceiptMatchStatus;
  verificationStatus: ReceiptVerificationStatus;
  duplicateFlag: ReceiptDuplicateFlag | null;
  jobId: string | null;
  directCostId: string | null;
  bankTransactionIds: string[];
  linkedReceiptTotalCents: number;
  createdAt: string;
};

export type ReceiptReconciliationDailySummary = {
  date: string;
  bankDebits: number;
  receiptsRequired: number;
  receiptsAttached: number;
  receiptsMissing: number;
  transactionsReconciled: number;
  supplierUnknown: number;
  unmatchedReceiptValueCents: number;
};

export type ReceiptReconciliationControlSummary = ReceiptReconciliationDailySummary & {
  verificationRequiredCount: number;
  receiptMatchSuggestionsCount: number;
  unmatchedReceiptsCount: number;
};

export type ReceiptReconciliationControlQueue = {
  summary: ReceiptReconciliationControlSummary;
  missingReceipts: Array<{
    bankTransactionId: string;
    transactionDate: string;
    description: string | null;
    amountCents: number;
    receiptStatus: BankTransactionReceiptStatus;
    suggestedSupplierName: string | null;
    jobId: string | null;
    flag: 'BANK_RECEIPT_MISSING';
  }>;
  unmatchedReceipts: FinanceReceiptRecordSummary[];
  receiptMatchSuggestions: Array<{
    receiptId: string;
    receiptTotalCents: number | null;
    candidates: ReceiptTransactionMatchCandidate[];
  }>;
  supplierUnknown: Array<{
    bankTransactionId: string;
    transactionDate: string;
    description: string | null;
    amountCents: number;
    suggestedSupplier: SupplierSuggestion | null;
  }>;
  verificationRequired: FinanceReceiptRecordSummary[];
};

/** Categories where debit evidence is normally required. */
export const RECEIPT_REQUIRED_BANK_CATEGORIES = new Set([
  'job_material',
  'fuel',
  'parking',
  'toll',
  'subcontractor',
  'equipment',
  'supplier',
  'consumables',
]);

export const RECEIPT_EXEMPT_BANK_CATEGORIES = new Set(['bank_fee', 'tax', 'transfer']);

export function normaliseSupplierAlias(text: string): string {
  return normaliseBankTransactionText(text).replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

export function isReceiptRequiredForBankTransaction(input: {
  direction: 'debit' | 'credit';
  category?: string | null;
  allocationType?: BankTransactionAllocationType | null;
}): boolean {
  if (input.direction === 'credit') return false;
  if (input.allocationType === 'transfer' || input.allocationType === 'tax') return false;
  if (input.category && RECEIPT_EXEMPT_BANK_CATEGORIES.has(input.category)) return false;
  if (input.category && RECEIPT_REQUIRED_BANK_CATEGORIES.has(input.category)) return true;
  if (input.allocationType === 'direct_job_cost' || input.allocationType === 'supplier_settlement') {
    return true;
  }
  return false;
}

export function deriveBankReceiptStatus(input: {
  direction: 'debit' | 'credit';
  category?: string | null;
  allocationType?: BankTransactionAllocationType | null;
  receiptDocumentId?: string | null;
  linkedReceiptCount?: number;
  verifiedReceiptCount?: number;
  receiptTotalCents?: number | null;
  transactionAmountCents?: number;
  verificationStatus?: ReceiptVerificationStatus | null;
}): BankTransactionReceiptStatus {
  const linked = (input.linkedReceiptCount ?? 0) > 0 || Boolean(input.receiptDocumentId);
  const required = isReceiptRequiredForBankTransaction(input);

  if (!required) return 'receipt_not_required';
  if (!linked) return 'receipt_missing';

  if (input.verificationStatus === 'verified' || (input.verifiedReceiptCount ?? 0) > 0) {
    return 'receipt_verified';
  }

  const txAmount = input.transactionAmountCents ?? 0;
  const receiptTotal = input.receiptTotalCents ?? 0;
  if (linked && txAmount > 0 && receiptTotal > 0 && receiptTotal !== txAmount) {
    return 'receipt_needs_review';
  }

  if (input.verificationStatus === 'needs_review') return 'receipt_needs_review';
  return 'receipt_attached';
}

export function buildReceiptMatchFingerprint(input: {
  receiptId: string;
  bankTransactionId: string;
  receiptUpdatedAt: string;
  transactionUpdatedAt: string;
  transactionAllocatedAmountCents: number;
  transactionReceiptStatus: string;
}): string {
  return [
    input.receiptId,
    input.bankTransactionId,
    input.receiptUpdatedAt,
    input.transactionUpdatedAt,
    input.transactionAllocatedAmountCents.toString(),
    input.transactionReceiptStatus,
  ].join('|');
}

export function canAutoLinkReceiptMatch(input: {
  linkMethod: ReceiptLinkMethod;
  deterministic: boolean;
}): boolean {
  if (input.linkMethod === 'deterministic' && input.deterministic) return true;
  return false;
}

/** Never auto-match on amount/date/supplier alone. */
export function isDeterministicReceiptTransactionMatch(input: {
  createdFromBankTransactionId?: string | null;
  targetBankTransactionId: string;
}): boolean {
  return (
    Boolean(input.createdFromBankTransactionId) &&
    input.createdFromBankTransactionId === input.targetBankTransactionId
  );
}

export function computeDateDifferenceDays(a: string, b: string): number {
  const dayA = a.slice(0, 10);
  const dayB = b.slice(0, 10);
  const msA = Date.parse(`${dayA}T00:00:00.000Z`);
  const msB = Date.parse(`${dayB}T00:00:00.000Z`);
  if (Number.isNaN(msA) || Number.isNaN(msB)) return 999;
  return Math.abs(Math.round((msA - msB) / 86_400_000));
}

export function suggestReceiptTransactionMatches(input: {
  receipt: {
    id: string;
    totalAmountCents: number | null;
    documentDate: string | null;
    supplierId: string | null;
    receiptNumber: string | null;
    updatedAt: string;
  };
  transactions: Array<{
    id: string;
    transactionDate: string;
    amountCents: number;
    direction: 'debit' | 'credit';
    description: string | null;
    reference: string | null;
    merchantName: string | null;
    confirmedSupplierId: string | null;
    allocatedAmountCents: number;
    receiptStatus: string;
    updatedAt: string;
    hasActiveReceiptLink: boolean;
  }>;
}): ReceiptTransactionMatchCandidate[] {
  const candidates: ReceiptTransactionMatchCandidate[] = [];
  const receiptAmount = input.receipt.totalAmountCents;

  for (const tx of input.transactions) {
    if (tx.direction !== 'debit') continue;
    if (tx.hasActiveReceiptLink && tx.receiptStatus === 'receipt_verified') continue;

    const evidence: ReceiptMatchCandidateEvidence[] = [];
    let score = 0;
    const reasons: string[] = [];

    if (receiptAmount != null && receiptAmount === tx.amountCents) {
      score += 25;
      evidence.push({ signal: 'exact_amount', detail: 'Receipt total matches transaction amount' });
      reasons.push('Amount matches');
    } else if (
      receiptAmount != null &&
      Math.abs(receiptAmount - tx.amountCents) <= 100
    ) {
      score += 8;
      evidence.push({ signal: 'near_amount', detail: 'Amount within R1' });
    }

    if (input.receipt.documentDate) {
      const dayDiff = computeDateDifferenceDays(input.receipt.documentDate, tx.transactionDate);
      if (dayDiff === 0) {
        score += 15;
        evidence.push({ signal: 'same_date', detail: 'Same date' });
        reasons.push('Same date');
      } else if (dayDiff <= 3) {
        score += 8;
        evidence.push({ signal: 'near_date', detail: `Dates ${dayDiff} day(s) apart` });
      }
    }

    const haystack = normaliseBankTransactionText(
      `${tx.description ?? ''} ${tx.reference ?? ''} ${tx.merchantName ?? ''}`,
    );
    if (input.receipt.receiptNumber && haystack.includes(normaliseBankTransactionText(input.receipt.receiptNumber))) {
      score += 35;
      evidence.push({ signal: 'receipt_number_in_reference', detail: 'Receipt number in bank reference' });
      reasons.push('Receipt number in reference');
    }

    if (
      input.receipt.supplierId &&
      tx.confirmedSupplierId &&
      input.receipt.supplierId === tx.confirmedSupplierId
    ) {
      score += 20;
      evidence.push({ signal: 'confirmed_supplier', detail: 'Confirmed supplier matches' });
      reasons.push('Supplier matches');
    }

    if (score < 40 || evidence.length < 2) continue;

    const confidence: ReceiptTransactionMatchCandidate['confidence'] =
      score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low';

    candidates.push({
      bankTransactionId: tx.id,
      transactionDate: tx.transactionDate,
      amountCents: tx.amountCents,
      description: tx.description,
      confidence,
      amountDifferenceCents: (receiptAmount ?? 0) - tx.amountCents,
      dateDifferenceDays: input.receipt.documentDate
        ? computeDateDifferenceDays(input.receipt.documentDate, tx.transactionDate)
        : 999,
      supplierEvidence: input.receipt.supplierId,
      reasons,
      evidence,
      sourceFingerprint: buildReceiptMatchFingerprint({
        receiptId: input.receipt.id,
        bankTransactionId: tx.id,
        receiptUpdatedAt: input.receipt.updatedAt,
        transactionUpdatedAt: tx.updatedAt,
        transactionAllocatedAmountCents: tx.allocatedAmountCents,
        transactionReceiptStatus: tx.receiptStatus,
      }),
    });
  }

  return candidates.sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return rank[b.confidence] - rank[a.confidence];
  });
}

export function suggestSupplierWithAliases(input: {
  description: string | null;
  reference?: string | null;
  merchantName?: string | null;
  suppliers: ReadonlyArray<{ id: string; name: string }>;
  aliases: ReadonlyArray<{
    supplierId: string;
    aliasText: string;
    normalisedAlias: string;
    isEnabled: boolean;
  }>;
}): SupplierSuggestion | null {
  const merchant = normaliseMerchantForSupplierSuggestion(
    input.merchantName ?? input.description ?? input.reference,
  );
  if (!merchant) return null;

  const merchantNorm = normaliseSupplierAlias(merchant);
  const haystack = normaliseSupplierAlias(
    `${input.description ?? ''} ${input.reference ?? ''} ${input.merchantName ?? ''}`,
  );

  for (const alias of input.aliases) {
    if (!alias.isEnabled) continue;
    if (haystack.includes(alias.normalisedAlias) || merchantNorm.includes(alias.normalisedAlias)) {
      const supplier = input.suppliers.find((s) => s.id === alias.supplierId);
      if (!supplier) continue;
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        confidence: 'high',
        evidence: [
          {
            signal: 'approved_alias',
            detail: `Merchant matched approved alias "${alias.aliasText}"`,
          },
        ],
      };
    }
  }

  for (const supplier of input.suppliers) {
    const nameNorm = normaliseSupplierAlias(supplier.name);
    if (nameNorm === merchantNorm || haystack.includes(nameNorm)) {
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        confidence: 'medium',
        evidence: [{ signal: 'supplier_name', detail: `Supplier name "${supplier.name}" matched text` }],
      };
    }
  }

  return null;
}

export function sumActiveReceiptLinks(
  links: ReadonlyArray<{ amountCents: number | null; isActive?: boolean }>,
): number {
  return links
    .filter((row) => row.isActive !== false)
    .reduce((sum, row) => sum + (row.amountCents ?? 0), 0);
}

export function detectPossibleDuplicateReceipt(input: {
  fileChecksumSha256?: string | null;
  receiptNumber?: string | null;
  supplierId?: string | null;
  documentDate?: string | null;
  totalAmountCents?: number | null;
  existing: ReadonlyArray<{
    id: string;
    fileChecksumSha256: string | null;
    receiptNumber: string | null;
    supplierId: string | null;
    documentDate: string | null;
    totalAmountCents: number | null;
  }>;
}): { duplicateFlag: ReceiptDuplicateFlag; matchingReceiptId: string } | null {
  for (const row of input.existing) {
    if (
      input.fileChecksumSha256 &&
      row.fileChecksumSha256 &&
      input.fileChecksumSha256 === row.fileChecksumSha256
    ) {
      return { duplicateFlag: 'POSSIBLE_DUPLICATE_RECEIPT', matchingReceiptId: row.id };
    }
  }

  if (
    input.receiptNumber &&
    input.supplierId &&
    input.documentDate &&
    input.totalAmountCents != null
  ) {
    for (const row of input.existing) {
      if (
        row.receiptNumber === input.receiptNumber &&
        row.supplierId === input.supplierId &&
        row.documentDate === input.documentDate &&
        row.totalAmountCents === input.totalAmountCents
      ) {
        return { duplicateFlag: 'POSSIBLE_DUPLICATE_RECEIPT', matchingReceiptId: row.id };
      }
    }
  }

  return null;
}

export function resolveReceiptTaxFromMetadata(input: {
  totalAmountCents: number;
  vatAmountCents?: number | null;
  exclusiveTotalCents?: number | null;
  taxRateBps?: number | null;
}): { taxBasis: 'exclusive' | 'inclusive' | 'unknown'; economicExVatCents: number | null } {
  if (input.exclusiveTotalCents != null && input.vatAmountCents != null) {
    return { taxBasis: 'exclusive', economicExVatCents: input.exclusiveTotalCents };
  }
  if (input.vatAmountCents != null && input.vatAmountCents >= 0) {
    return {
      taxBasis: 'inclusive',
      economicExVatCents: input.totalAmountCents - input.vatAmountCents,
    };
  }
  if (input.taxRateBps != null && input.taxRateBps > 0) {
    const rate = input.taxRateBps / 10_000;
    return {
      taxBasis: 'inclusive',
      economicExVatCents: Math.round(input.totalAmountCents / (1 + rate)),
    };
  }
  return { taxBasis: 'unknown', economicExVatCents: null };
}

export function buildReceiptReconciliationDailySummary(input: {
  date: string;
  transactions: Array<{
    direction: 'debit' | 'credit';
    transactionDate: string;
    receiptStatus: BankTransactionReceiptStatus;
    amountCents: number;
    confirmedSupplierId: string | null;
    reconciliationStatus: string;
  }>;
  unmatchedReceipts: Array<{ totalAmountCents: number | null }>;
}): ReceiptReconciliationDailySummary {
  const todayTx = input.transactions.filter((tx) => tx.transactionDate === input.date);
  const debits = todayTx.filter((tx) => tx.direction === 'debit');
  const required = debits.filter((tx) => tx.receiptStatus !== 'receipt_not_required');
  const attached = required.filter(
    (tx) =>
      tx.receiptStatus === 'receipt_attached' ||
      tx.receiptStatus === 'receipt_verified' ||
      tx.receiptStatus === 'receipt_needs_review',
  );
  const missing = required.filter((tx) => tx.receiptStatus === 'receipt_missing');
  const reconciled = debits.filter((tx) => tx.reconciliationStatus === 'reconciled');
  const supplierUnknown = debits.filter((tx) => !tx.confirmedSupplierId);

  return {
    date: input.date,
    bankDebits: debits.length,
    receiptsRequired: required.length,
    receiptsAttached: attached.length,
    receiptsMissing: missing.length,
    transactionsReconciled: reconciled.length,
    supplierUnknown: supplierUnknown.length,
    unmatchedReceiptValueCents: input.unmatchedReceipts.reduce(
      (sum, row) => sum + (row.totalAmountCents ?? 0),
      0,
    ),
  };
}

export function canViewReceiptReconciliation(identity: {
  roleName: string;
  permissions: readonly string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') return false;
  if (identity.permissions.includes('*')) return true;
  return identity.permissions.some((p) => p === 'finance:read' || p === 'finance:write');
}

export function canManageReceiptReconciliation(identity: {
  roleName: string;
  permissions: readonly string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') return false;
  if (identity.permissions.includes('*')) return true;
  return identity.permissions.includes('finance:write');
}

export function canTechnicianUploadJobReceipt(identity: {
  roleName: string;
  permissions: readonly string[];
}): boolean {
  if (identity.roleName === 'Client') return false;
  if (identity.roleName === 'Technician') return true;
  return canManageReceiptReconciliation(identity);
}

export function isValidBankCategory(category: string | null | undefined): boolean {
  if (!category) return true;
  return (BANK_TRANSACTION_CATEGORIES as readonly string[]).includes(category);
}

export function shouldEmitBankReceiptMissingFlag(
  receiptStatus: BankTransactionReceiptStatus,
): boolean {
  return receiptStatus === 'receipt_missing';
}
