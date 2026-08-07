/**
 * BANK-001 — Bank transaction control layer (shared types + pure logic).
 *
 * Authoritative ingestion/allocation runs on the server. Browser consumes
 * control queue summaries and transaction detail from API responses.
 */

export type BankTransactionDirection = 'debit' | 'credit';

export type BankTransactionAllocationStatus =
  | 'unallocated'
  | 'suggested'
  | 'partially_allocated'
  | 'allocated'
  | 'ignored'
  | 'needs_review';

export type BankTransactionReconciliationStatus =
  | 'unreconciled'
  | 'partially_reconciled'
  | 'reconciled';

export type BankTransactionReceiptStatus =
  | 'receipt_not_required'
  | 'receipt_missing'
  | 'receipt_attached'
  | 'receipt_verified';

export type BankTransactionAllocationType =
  | 'direct_job_cost'
  | 'overhead'
  | 'transfer'
  | 'supplier_settlement'
  | 'customer_payment'
  | 'owner_director'
  | 'tax'
  | 'other';

/** Configurable finance categories — not hardcoded to Young Guns chart. */
export const BANK_TRANSACTION_CATEGORIES = [
  'job_material',
  'fuel',
  'parking',
  'toll',
  'subcontractor',
  'equipment',
  'supplier',
  'rent',
  'wages',
  'software',
  'marketing',
  'bank_fee',
  'tax',
  'transfer',
  'other',
] as const;

export type BankTransactionCategory = (typeof BANK_TRANSACTION_CATEGORIES)[number];

export type BankTransactionFingerprintInput = {
  companyId: string;
  bankAccountId: string;
  provider: string;
  externalTransactionId?: string | null;
  transactionDate: string;
  amountCents: number;
  direction: BankTransactionDirection;
  reference?: string | null;
  description?: string | null;
};

/** Normalise text for stable fingerprint comparison. */
export function normaliseBankTransactionText(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Build deterministic canonical fingerprint input (pre-hash). */
export function buildBankTransactionFingerprintCanonical(
  input: BankTransactionFingerprintInput,
): string {
  if (input.externalTransactionId?.trim()) {
    return [
      input.companyId,
      input.provider,
      input.externalTransactionId.trim(),
    ].join('|');
  }

  return [
    input.companyId,
    input.bankAccountId,
    input.transactionDate,
    input.direction,
    input.amountCents.toString(),
    normaliseBankTransactionText(input.reference),
    normaliseBankTransactionText(input.description),
  ].join('|');
}

export function deriveBankTransactionDirection(amountCents: number): BankTransactionDirection {
  if (amountCents < 0) return 'debit';
  if (amountCents > 0) return 'credit';
  return 'debit';
}

/** Absolute transaction amount in cents — direction stored separately. */
export function absoluteBankTransactionAmountCents(amountCents: number): number {
  return Math.abs(amountCents);
}

export type BankAllocationLineInput = {
  amountCents: number;
  allocationType: BankTransactionAllocationType;
};

export type AllocationTotals = {
  allocatedAmountCents: number;
  unallocatedAmountCents: number;
  allocationStatus: BankTransactionAllocationStatus;
};

export function computeAllocationTotals(
  transactionAmountCents: number,
  activeAllocations: ReadonlyArray<{ amountCents: number }>,
): AllocationTotals {
  const total = absoluteBankTransactionAmountCents(transactionAmountCents);
  const allocatedAmountCents = activeAllocations.reduce((sum, row) => sum + row.amountCents, 0);
  const unallocatedAmountCents = Math.max(0, total - allocatedAmountCents);

  let allocationStatus: BankTransactionAllocationStatus;
  if (allocatedAmountCents === 0) {
    allocationStatus = 'unallocated';
  } else if (allocatedAmountCents < total) {
    allocationStatus = 'partially_allocated';
  } else {
    allocationStatus = 'allocated';
  }

  return { allocatedAmountCents, unallocatedAmountCents, allocationStatus };
}

export function assertAllocationWithinTransaction(
  transactionAmountCents: number,
  proposedAllocations: ReadonlyArray<{ amountCents: number }>,
): void {
  const total = absoluteBankTransactionAmountCents(transactionAmountCents);
  const sum = proposedAllocations.reduce((acc, row) => acc + row.amountCents, 0);
  if (sum > total) {
    throw new Error(
      `Allocation total ${sum} exceeds transaction amount ${total}`,
    );
  }
  for (const row of proposedAllocations) {
    if (row.amountCents <= 0) {
      throw new Error('Allocation amounts must be positive cents');
    }
  }
}

export type BankMatchCandidateEvidence = {
  signal: string;
  detail: string;
};

export type BankMatchCandidate = {
  targetType: 'direct_cost' | 'job' | 'supplier';
  targetId: string;
  targetLabel: string;
  confidence: 'high' | 'medium' | 'low';
  amountCents: number;
  amountDifferenceCents: number;
  reason: string;
  evidence: BankMatchCandidateEvidence[];
};

export type DirectCostMatchInput = {
  id: string;
  jobId: string | null;
  description: string;
  amountCents: number;
  supplierId: string | null;
  supplierName: string | null;
  isPaid: boolean;
  costDate: string | null;
};

export function suggestDirectCostMatches(input: {
  transactionAmountCents: number;
  transactionDate: string;
  description: string | null;
  reference: string | null;
  merchantName: string | null;
  directCosts: DirectCostMatchInput[];
}): BankMatchCandidate[] {
  const txAmount = absoluteBankTransactionAmountCents(input.transactionAmountCents);
  const haystack = normaliseBankTransactionText(
    `${input.description ?? ''} ${input.reference ?? ''} ${input.merchantName ?? ''}`,
  );
  const candidates: BankMatchCandidate[] = [];

  for (const cost of input.directCosts) {
    if (cost.isPaid) continue;

    const evidence: BankMatchCandidateEvidence[] = [];
    let score = 0;

    if (cost.amountCents === txAmount) {
      score += 40;
      evidence.push({ signal: 'exact_amount', detail: 'Amount matches exactly' });
    } else if (Math.abs(cost.amountCents - txAmount) <= 100) {
      score += 10;
      evidence.push({ signal: 'near_amount', detail: 'Amount within R1' });
    }

    if (cost.supplierName && haystack.includes(normaliseBankTransactionText(cost.supplierName))) {
      score += 30;
      evidence.push({ signal: 'supplier_text', detail: `Supplier "${cost.supplierName}" in description` });
    }

    if (cost.costDate && input.transactionDate) {
      const costDay = cost.costDate.slice(0, 10);
      const txDay = input.transactionDate.slice(0, 10);
      if (costDay === txDay) {
        score += 15;
        evidence.push({ signal: 'same_date', detail: 'Same transaction date' });
      }
    }

    if (score < 40) continue;

    const confidence: BankMatchCandidate['confidence'] =
      score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low';

    // No weak single signal auto-match — require score threshold
    if (evidence.length < 2 && confidence !== 'high') continue;

    candidates.push({
      targetType: 'direct_cost',
      targetId: cost.id,
      targetLabel: cost.description,
      confidence,
      amountCents: cost.amountCents,
      amountDifferenceCents: cost.amountCents - txAmount,
      reason: 'Potential match to existing direct cost',
      evidence,
    });
  }

  return candidates.sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return rank[b.confidence] - rank[a.confidence];
  });
}

export function normaliseMerchantForSupplierSuggestion(text: string | null | undefined): string {
  const raw = (text ?? '').trim();
  if (!raw) return '';
  return raw
    .replace(/\b\d{4,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Merchant text alone must not create irreversible supplier truth. */
export function suggestSupplierFromDescription(
  description: string | null,
  suppliers: ReadonlyArray<{ id: string; name: string }>,
): { supplierId: string; supplierName: string; confidence: 'medium' | 'low' } | null {
  const merchant = normaliseMerchantForSupplierSuggestion(description);
  if (!merchant) return null;

  for (const supplier of suppliers) {
    const nameNorm = normaliseBankTransactionText(supplier.name);
    const merchantNorm = normaliseBankTransactionText(merchant);
    if (nameNorm === merchantNorm || merchantNorm.includes(nameNorm)) {
      return { supplierId: supplier.id, supplierName: supplier.name, confidence: 'medium' };
    }
  }
  return null;
}

export function deriveReceiptStatus(input: {
  allocationType?: BankTransactionAllocationType | null;
  category?: string | null;
  receiptDocumentId?: string | null;
  direction: BankTransactionDirection;
}): BankTransactionReceiptStatus {
  if (input.receiptDocumentId) return 'receipt_attached';
  if (input.direction === 'credit') return 'receipt_not_required';
  if (input.allocationType === 'transfer' || input.category === 'bank_fee') {
    return 'receipt_not_required';
  }
  if (input.allocationType === 'overhead' && input.category === 'bank_fee') {
    return 'receipt_not_required';
  }
  return 'receipt_missing';
}

export type BankTransactionAllocationSummary = {
  id: string;
  amountCents: number;
  allocationType: BankTransactionAllocationType;
  category: string | null;
  jobId: string | null;
  supplierId: string | null;
  directCostId: string | null;
  notes: string | null;
  createdAt: string;
};

export type BankTransactionSummary = {
  id: string;
  bankAccountId: string;
  bankAccountName: string;
  transactionDate: string;
  postedDate: string | null;
  description: string | null;
  reference: string | null;
  amountCents: number;
  direction: BankTransactionDirection;
  currency: string;
  allocationStatus: BankTransactionAllocationStatus;
  reconciliationStatus: BankTransactionReconciliationStatus;
  receiptStatus: BankTransactionReceiptStatus;
  allocatedAmountCents: number;
  unallocatedAmountCents: number;
  merchantName: string | null;
  suggestedSupplierName: string | null;
  receiptDocumentId: string | null;
  provider: string;
  importBatchId: string | null;
};

export type BankTransactionDetail = BankTransactionSummary & {
  allocations: BankTransactionAllocationSummary[];
  candidateMatches: BankMatchCandidate[];
  auditHistory: Array<{
    action: string;
    actorUserId: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  }>;
};

export type BankTransactionControlSummary = {
  moneyInTodayCents: number;
  moneyOutTodayCents: number;
  unallocatedDebitsCents: number;
  unallocatedDebitsCount: number;
  missingReceiptsCount: number;
  jobAttributedSpendingCents: number;
  overheadSpendingCents: number;
  creditsNeedingReviewCount: number;
};

export type BankTransactionControlQueue = {
  summary: BankTransactionControlSummary;
  unallocatedDebits: BankTransactionSummary[];
  missingReceipts: BankTransactionSummary[];
  suggestedMatches: BankTransactionSummary[];
  partiallyAllocated: BankTransactionSummary[];
  allocated: BankTransactionSummary[];
  creditsNeedingReview: BankTransactionSummary[];
};

export type BankTransactionControlFlagType =
  | 'UNALLOCATED_BANK_DEBIT'
  | 'BANK_RECEIPT_MISSING'
  | 'BANK_COST_MATCH_REVIEW'
  | 'PARTIAL_BANK_ALLOCATION';

export const BANK_TRANSACTION_CONTROL_FLAG_LABELS: Record<BankTransactionControlFlagType, string> = {
  UNALLOCATED_BANK_DEBIT: 'Unallocated bank debit',
  BANK_RECEIPT_MISSING: 'Bank receipt missing',
  BANK_COST_MATCH_REVIEW: 'Bank cost match needs review',
  PARTIAL_BANK_ALLOCATION: 'Partial bank allocation',
};

/** Whether allocation type affects a specific job's JPE. */
export function allocationAffectsJobProfitability(
  allocationType: BankTransactionAllocationType,
): boolean {
  return allocationType === 'direct_job_cost';
}

/** Credits must not auto-become customer revenue. */
export function creditRequiresManualReview(direction: BankTransactionDirection): boolean {
  return direction === 'credit';
}

/** Internal transfers must not double-count as income/expense. */
export function isTransferAllocation(allocationType: BankTransactionAllocationType): boolean {
  return allocationType === 'transfer';
}

function hasFinancePermission(
  permissions: readonly string[],
  required: readonly string[],
): boolean {
  if (permissions.includes('*')) return true;
  return required.some((perm) => permissions.includes(perm));
}

export function canViewBankTransactionControl(identity: {
  roleName: string;
  permissions: readonly string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') return false;
  return hasFinancePermission(identity.permissions, ['finance:read', 'finance:write']);
}

export function canManageBankTransactionControl(identity: {
  roleName: string;
  permissions: readonly string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') return false;
  return hasFinancePermission(identity.permissions, ['finance:write']);
}

/**
 * Future live bank-feed provider adapter contract.
 * Do NOT implement credentials/password storage in BANK-001.
 */
export type BankTransactionProviderHealth = {
  status: 'disconnected' | 'healthy' | 'degraded' | 'error';
  lastSyncAt: string | null;
  message: string | null;
};

export type BankTransactionProviderAdapter = {
  providerId: string;
  fetchAccounts(): Promise<Array<{ externalId: string; name: string; currency: string }>>;
  fetchTransactions(input: {
    accountExternalId: string;
    cursor?: string | null;
  }): Promise<{
    transactions: Array<{
      externalTransactionId: string;
      transactionDate: string;
      amountCents: number;
      description: string | null;
      reference: string | null;
    }>;
    nextCursor: string | null;
  }>;
  getConnectionHealth(): Promise<BankTransactionProviderHealth>;
};

export type BankTransactionImportPreviewSummary = {
  transactionsDetected: number;
  duplicatesSkipped: number;
  debits: number;
  credits: number;
  invalidRows: number;
  dateFrom: string | null;
  dateTo: string | null;
  totalDebitCents: number;
  totalCreditCents: number;
};

export function summariseImportPreviewRows(
  rows: ReadonlyArray<{
    transactionDate: string | null;
    amountCents: number | null;
    classification: string;
  }>,
): BankTransactionImportPreviewSummary {
  let debits = 0;
  let credits = 0;
  let totalDebitCents = 0;
  let totalCreditCents = 0;
  let duplicatesSkipped = 0;
  let invalidRows = 0;
  const dates: string[] = [];

  for (const row of rows) {
    if (
      row.classification === 'existing_manual_transaction' ||
      row.classification === 'existing_xero_transaction' ||
      row.classification === 'possible_duplicate'
    ) {
      duplicatesSkipped += 1;
      continue;
    }
    if (row.classification === 'invalid') {
      invalidRows += 1;
      continue;
    }
    if (!row.transactionDate || row.amountCents === null) continue;
    dates.push(row.transactionDate);
    const direction = deriveBankTransactionDirection(row.amountCents);
    const abs = absoluteBankTransactionAmountCents(row.amountCents);
    if (direction === 'debit') {
      debits += 1;
      totalDebitCents += abs;
    } else {
      credits += 1;
      totalCreditCents += abs;
    }
  }

  dates.sort();
  return {
    transactionsDetected: rows.length,
    duplicatesSkipped,
    debits,
    credits,
    invalidRows,
    dateFrom: dates[0] ?? null,
    dateTo: dates.at(-1) ?? null,
    totalDebitCents,
    totalCreditCents,
  };
}
