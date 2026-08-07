/**
 * CASH-001 — Every-Rand Control (shared types + pure calculation).
 *
 * Calculated read-model over BANK-001/002 + JPE + invoices/payments.
 * Does NOT create a second accounting system or persist duplicate finance truth.
 *
 * MONEY ≠ PROFIT:
 *   economic: revenue − economic job costs = gross profit
 *   cash:     customer cash collected − direct job cash paid = known realised cash profit
 */

import type {
  BankTransactionAllocationStatus,
  BankTransactionAllocationType,
  BankTransactionDirection,
  BankTransactionReceiptStatus,
} from './bank-transaction-control.js';
import {
  absoluteBankTransactionAmountCents,
  allocationAffectsJobProfitability,
  canViewBankTransactionControl,
  isTransferAllocation,
  resolveDirectCostCashPaidCents,
} from './bank-transaction-control.js';
import {
  isPaymentCountedForCashCollection,
  type JobProfitabilityResult,
} from './job-profitability.js';
import type { ProfitabilityConfidence } from './job-profitability-source-integrity.js';

/** Calculated control vocabulary — prefers existing BANK statuses; not a new PG enum. */
export type EveryRandControlState =
  | 'explained'
  | 'partially_explained'
  | 'unexplained'
  | 'missing_receipt'
  | 'missing_job_allocation'
  | 'missing_supplier'
  | 'needs_review'
  | 'transfer'
  | 'authorised_non_operating'
  | 'ignored';

export type CashTruthCompleteness = 'VERIFIED' | 'PROVISIONAL' | 'INCOMPLETE';

export type CashControlSourceKind =
  | 'bank_transaction'
  | 'bank_allocation'
  | 'xero_payment'
  | 'titan_payment'
  | 'invoice'
  | 'direct_cost'
  | 'receipt'
  | 'jpe';

export type CashControlIssueKind =
  | 'unexplained_debit'
  | 'unexplained_credit'
  | 'partial_allocation'
  | 'missing_receipt'
  | 'unknown_supplier'
  | 'unpaid_job_cost'
  | 'outstanding_customer_invoice';

export type CashControlPeriodKey = 'today' | 'month_to_date' | 'custom';

export type CashControlMoneyInBreakdown = {
  /** Recognised customer payments only (TITAN/Xero payment truth). Never raw bank credits. */
  customerCashCollectedCents: number;
  /** Bank credits classified as non-customer inflows (supplier refund, interest, other income, capital). */
  otherClassifiedMoneyInCents: number;
  /** Internal transfers (credits) — excluded from operating income. */
  internalTransferInCents: number;
  /** Unresolved credit residual. */
  unexplainedMoneyInCents: number;
};

export type CashControlMoneyOutBreakdown = {
  /** Authorised direct_job_cost bank allocations. */
  directJobCashOutCents: number;
  /** Overhead bank allocations — company cash out, never job GP. */
  overheadCashOutCents: number;
  /** supplier_settlement / tax / other operating classified outflows. */
  otherClassifiedMoneyOutCents: number;
  /** owner_director / tax when treated as non-operating. */
  authorisedNonOperatingOutCents: number;
  /** Internal transfers (debits) — excluded from operating expense. */
  internalTransferOutCents: number;
  /** Unresolved debit residual. */
  unexplainedMoneyOutCents: number;
};

export type CashControlPeriodMetrics = {
  periodKey: CashControlPeriodKey;
  fromDate: string;
  toDate: string;
  moneyIn: CashControlMoneyInBreakdown;
  moneyOut: CashControlMoneyOutBreakdown;
  unexplainedMoneyCents: number;
  /** Operating movement excluding transfers + unexplained residual. */
  knownNetOperationalCashMovementCents: number;
  /** Alias required by Owner language when bank coverage is incomplete. */
  knownNetCashMovementCents: number;
};

export type CashControlCompletenessReason =
  | 'incomplete_bank_coverage'
  | 'unexplained_debit'
  | 'unexplained_credit'
  | 'partial_transaction_allocation'
  | 'missing_receipt'
  | 'supplier_unresolved'
  | 'unpaid_job_cost'
  | 'invoice_payment_linkage_incomplete';

export type CashControlSummary = {
  currency: string;
  asOfDate: string;
  completeness: CashTruthCompleteness;
  completenessReasons: CashControlCompletenessReason[];
  bankCoverage: {
    activeAccountCount: number;
    transactionCount: number;
    earliestTransactionDate: string | null;
    latestTransactionDate: string | null;
    /** True when TITAN has no bank ledger rows for the company. */
    incomplete: boolean;
  };
  today: CashControlPeriodMetrics;
  monthToDate: CashControlPeriodMetrics;
  issues: {
    unexplainedDebits: { count: number; amountCents: number };
    unexplainedCredits: { count: number; amountCents: number };
    partialAllocations: { count: number; amountCents: number };
    missingReceipts: { count: number; amountCents: number };
    unknownSuppliers: { count: number; amountCents: number };
    unpaidJobCosts: { count: number; amountCents: number };
    outstandingCustomerInvoices: { count: number; amountCents: number };
  };
  /**
   * Company-level known realised cash profit from JPE jobs that have cash activity.
   * Economic gross profit is intentionally separate.
   */
  knownRealisedCashProfitCents: number;
  economicGrossProfitCents: number;
  sourceTrace: CashControlSourceKind[];
};

export type CashControlLedgerRow = {
  id: string;
  source: CashControlSourceKind;
  sourceId: string;
  transactionDate: string;
  direction: BankTransactionDirection;
  amountCents: number;
  currency: string;
  description: string | null;
  reference: string | null;
  customerOrSupplierName: string | null;
  jobId: string | null;
  classification: BankTransactionAllocationType | 'unclassified' | 'ignored';
  allocatedAmountCents: number;
  unallocatedAmountCents: number;
  receiptStatus: BankTransactionReceiptStatus;
  paymentOrCostRelationship: string | null;
  controlState: EveryRandControlState;
  bankAllocationStatus: BankTransactionAllocationStatus;
  provider: string;
};

export type CashControlLedgerPage = {
  rows: CashControlLedgerRow[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type CashControlIssue = {
  kind: CashControlIssueKind;
  source: CashControlSourceKind;
  sourceId: string;
  amountCents: number;
  currency: string;
  label: string;
  transactionDate: string | null;
  jobId: string | null;
  controlState: EveryRandControlState | null;
  metadata: Record<string, unknown>;
};

export type CashControlIssuesResult = {
  issues: CashControlIssue[];
  totals: CashControlSummary['issues'];
};

export type CashControlDirectCostSettlement = {
  directCostId: string;
  jobId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  economicCostCents: number;
  amountPaidCents: number;
  unpaidCents: number;
  receiptStatus: 'none' | 'attached' | 'verified';
  linkedBankAllocationIds: string[];
  linkedBankAllocationCents: number;
  source: 'direct_cost';
};

export type CashControlJobView = {
  jobId: string;
  currency: string;
  /** Economic (JPE authority). */
  invoicedEconomicRevenueCents: number;
  economicDirectCostsCents: number;
  grossProfitCents: number;
  grossMarginPct: number | null;
  /** Cash (JPE authority). */
  cashCollectedCents: number;
  cashDirectCostsPaidCents: number;
  knownRealisedCashProfitCents: number;
  unpaidDirectCostsCents: number;
  customerBalanceOutstandingCents: number;
  completeness: string;
  confidence: string | null;
  directCostSettlements: CashControlDirectCostSettlement[];
  bankAllocations: Array<{
    allocationId: string;
    transactionId: string;
    amountCents: number;
    allocationType: BankTransactionAllocationType;
    transactionDate: string;
    description: string | null;
  }>;
  sourceTrace: CashControlSourceKind[];
};

export type CashControlOutstandingInvoice = {
  invoiceId: string;
  invoiceNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  jobId: string | null;
  totalCents: number;
  amountPaidCents: number;
  balanceDueCents: number;
  dueDate: string | null;
  status: string;
  paymentSource: 'titan_payment' | 'xero_payment' | 'mixed' | 'none';
  source: 'invoice';
};

export type CashControlPaymentInput = {
  id: string;
  amountCents: number;
  paidAt: string | null;
  xeroPaymentStatus?: string | null;
  xeroPaymentId?: string | null;
  invoiceId: string;
};

export type CashControlBankAllocationInput = {
  id: string;
  transactionId: string;
  amountCents: number;
  allocationType: BankTransactionAllocationType;
  category?: string | null;
  jobId?: string | null;
  supplierId?: string | null;
  directCostId?: string | null;
  isActive?: boolean;
};

export type CashControlBankTransactionInput = {
  id: string;
  transactionDate: string;
  direction: BankTransactionDirection;
  amountCents: number;
  currency: string;
  description: string | null;
  reference: string | null;
  allocationStatus: BankTransactionAllocationStatus;
  receiptStatus: BankTransactionReceiptStatus;
  allocatedAmountCents: number;
  merchantName: string | null;
  confirmedSupplierId: string | null;
  confirmedSupplierName: string | null;
  suggestedSupplierId: string | null;
  provider: string;
  allocations: CashControlBankAllocationInput[];
};

export function canViewCashControl(identity: {
  roleName: string;
  permissions: readonly string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') return false;
  return canViewBankTransactionControl(identity);
}

export function canAccessCashControl(identity: {
  roleName: string;
  permissions: readonly string[];
}): boolean {
  return canViewCashControl(identity);
}

/** Calendar helpers (UTC date strings YYYY-MM-DD — matches BANK control today semantics). */
export function cashControlTodayDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function cashControlMonthStartDate(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  return `${iso.slice(0, 7)}-01`;
}

export function isDateInInclusiveRange(
  date: string,
  fromDate: string,
  toDate: string,
): boolean {
  return date >= fromDate && date <= toDate;
}

/**
 * Derive Every-Rand control state from existing BANK statuses + active allocations.
 * Does not invent a parallel persisted enum.
 */
export function deriveEveryRandControlState(input: {
  direction: BankTransactionDirection;
  allocationStatus: BankTransactionAllocationStatus;
  receiptStatus: BankTransactionReceiptStatus;
  unallocatedAmountCents: number;
  allocations: ReadonlyArray<{
    allocationType: BankTransactionAllocationType;
    amountCents: number;
    jobId?: string | null;
    supplierId?: string | null;
  }>;
  confirmedSupplierId?: string | null;
}): EveryRandControlState {
  if (input.allocationStatus === 'ignored') return 'ignored';

  const active = input.allocations;
  const totalAllocated = active.reduce((s, a) => s + a.amountCents, 0);
  const allTransfer =
    totalAllocated > 0 && active.every((a) => isTransferAllocation(a.allocationType));
  if (allTransfer && input.unallocatedAmountCents === 0) return 'transfer';

  const allNonOperating =
    totalAllocated > 0 &&
    active.every(
      (a) => a.allocationType === 'owner_director' || a.allocationType === 'tax',
    );
  if (allNonOperating && input.unallocatedAmountCents === 0) {
    return 'authorised_non_operating';
  }

  if (input.receiptStatus === 'receipt_missing' && input.direction === 'debit') {
    // Prefer missing_receipt when receipt is the outstanding control gap after allocation.
    if (input.allocationStatus === 'allocated' || input.allocationStatus === 'partially_allocated') {
      return 'missing_receipt';
    }
  }

  if (input.allocationStatus === 'needs_review') return 'needs_review';

  if (
    input.direction === 'debit' &&
    input.unallocatedAmountCents > 0 &&
    !active.some((a) => a.allocationType === 'direct_job_cost' && a.jobId) &&
    input.allocationStatus !== 'allocated'
  ) {
    if (input.allocationStatus === 'partially_allocated') return 'partially_explained';
    if (
      input.confirmedSupplierId == null &&
      active.some((a) => a.allocationType === 'supplier_settlement' || a.allocationType === 'direct_job_cost')
    ) {
      return 'missing_supplier';
    }
  }

  if (input.allocationStatus === 'allocated' && input.unallocatedAmountCents === 0) {
    if (input.receiptStatus === 'receipt_missing' && input.direction === 'debit') {
      return 'missing_receipt';
    }
    return 'explained';
  }

  if (input.allocationStatus === 'partially_allocated' || input.unallocatedAmountCents > 0) {
    if (totalAllocated > 0) return 'partially_explained';
    return 'unexplained';
  }

  if (input.allocationStatus === 'unallocated' || input.allocationStatus === 'suggested') {
    return 'unexplained';
  }

  return 'needs_review';
}

export type ClassifiedBankMoney = {
  customerPaymentBankCents: number;
  otherClassifiedMoneyInCents: number;
  internalTransferInCents: number;
  unexplainedMoneyInCents: number;
  directJobCashOutCents: number;
  overheadCashOutCents: number;
  otherClassifiedMoneyOutCents: number;
  authorisedNonOperatingOutCents: number;
  internalTransferOutCents: number;
  unexplainedMoneyOutCents: number;
};

/**
 * Classify bank ledger money for a period.
 * Bank credits allocated as customer_payment explain the bank side but do NOT
 * contribute to customer cash collected (payments are authoritative — no double count).
 */
export function classifyBankMoneyForPeriod(
  transactions: ReadonlyArray<CashControlBankTransactionInput>,
  fromDate: string,
  toDate: string,
): ClassifiedBankMoney {
  const result: ClassifiedBankMoney = {
    customerPaymentBankCents: 0,
    otherClassifiedMoneyInCents: 0,
    internalTransferInCents: 0,
    unexplainedMoneyInCents: 0,
    directJobCashOutCents: 0,
    overheadCashOutCents: 0,
    otherClassifiedMoneyOutCents: 0,
    authorisedNonOperatingOutCents: 0,
    internalTransferOutCents: 0,
    unexplainedMoneyOutCents: 0,
  };

  for (const tx of transactions) {
    if (!isDateInInclusiveRange(tx.transactionDate, fromDate, toDate)) continue;
    if (tx.allocationStatus === 'ignored') continue;

    const abs = absoluteBankTransactionAmountCents(tx.amountCents);
    const active = tx.allocations.filter((a) => a.isActive !== false);
    const allocated = active.reduce((s, a) => s + a.amountCents, 0);
    const unallocated = Math.max(0, abs - allocated);

    if (tx.direction === 'credit') {
      for (const a of active) {
        if (a.allocationType === 'customer_payment') {
          result.customerPaymentBankCents += a.amountCents;
        } else if (a.allocationType === 'transfer') {
          result.internalTransferInCents += a.amountCents;
        } else if (
          a.allocationType === 'owner_director' ||
          a.allocationType === 'other' ||
          a.allocationType === 'supplier_settlement'
        ) {
          result.otherClassifiedMoneyInCents += a.amountCents;
        } else {
          result.otherClassifiedMoneyInCents += a.amountCents;
        }
      }
      result.unexplainedMoneyInCents += unallocated;
      continue;
    }

    // debit
    for (const a of active) {
      if (a.allocationType === 'direct_job_cost') {
        result.directJobCashOutCents += a.amountCents;
      } else if (a.allocationType === 'overhead') {
        result.overheadCashOutCents += a.amountCents;
      } else if (a.allocationType === 'transfer') {
        result.internalTransferOutCents += a.amountCents;
      } else if (a.allocationType === 'owner_director' || a.allocationType === 'tax') {
        result.authorisedNonOperatingOutCents += a.amountCents;
      } else {
        result.otherClassifiedMoneyOutCents += a.amountCents;
      }
    }
    result.unexplainedMoneyOutCents += unallocated;
  }

  return result;
}

/**
 * Customer cash collected = recognised payments only.
 * Bank customer_payment allocations are NOT added — they explain bank credits
 * that typically represent the same economic event as the payment row.
 */
export function sumCustomerCashCollectedCents(
  payments: ReadonlyArray<CashControlPaymentInput>,
  fromDate: string,
  toDate: string,
): number {
  return payments
    .filter((p) => isPaymentCountedForCashCollection(p))
    .filter((p) => {
      const day = (p.paidAt ?? '').slice(0, 10);
      if (!day) return false;
      return isDateInInclusiveRange(day, fromDate, toDate);
    })
    .reduce((sum, p) => sum + p.amountCents, 0);
}

/**
 * Prove that payment + matching bank customer_payment credit do not double-count.
 * Returns the single customer-cash figure (payments authority).
 */
export function resolveCustomerCashCollectedWithoutDoubleCount(input: {
  payments: ReadonlyArray<CashControlPaymentInput>;
  bankCustomerPaymentAllocationCents: number;
  fromDate: string;
  toDate: string;
}): {
  customerCashCollectedCents: number;
  bankCustomerPaymentExplanationCents: number;
  doubleCountAvoidedCents: number;
} {
  const customerCashCollectedCents = sumCustomerCashCollectedCents(
    input.payments,
    input.fromDate,
    input.toDate,
  );
  const bankCustomerPaymentExplanationCents = input.bankCustomerPaymentAllocationCents;
  return {
    customerCashCollectedCents,
    bankCustomerPaymentExplanationCents,
    doubleCountAvoidedCents: Math.min(
      customerCashCollectedCents,
      bankCustomerPaymentExplanationCents,
    ),
  };
}

export function buildPeriodMetrics(input: {
  periodKey: CashControlPeriodKey;
  fromDate: string;
  toDate: string;
  payments: ReadonlyArray<CashControlPaymentInput>;
  transactions: ReadonlyArray<CashControlBankTransactionInput>;
}): CashControlPeriodMetrics {
  const bank = classifyBankMoneyForPeriod(input.transactions, input.fromDate, input.toDate);
  const customerCashCollectedCents = sumCustomerCashCollectedCents(
    input.payments,
    input.fromDate,
    input.toDate,
  );

  const moneyIn: CashControlMoneyInBreakdown = {
    customerCashCollectedCents,
    otherClassifiedMoneyInCents: bank.otherClassifiedMoneyInCents,
    internalTransferInCents: bank.internalTransferInCents,
    unexplainedMoneyInCents: bank.unexplainedMoneyInCents,
  };

  const moneyOut: CashControlMoneyOutBreakdown = {
    directJobCashOutCents: bank.directJobCashOutCents,
    overheadCashOutCents: bank.overheadCashOutCents,
    otherClassifiedMoneyOutCents: bank.otherClassifiedMoneyOutCents,
    authorisedNonOperatingOutCents: bank.authorisedNonOperatingOutCents,
    internalTransferOutCents: bank.internalTransferOutCents,
    unexplainedMoneyOutCents: bank.unexplainedMoneyOutCents,
  };

  const unexplainedMoneyCents =
    moneyIn.unexplainedMoneyInCents + moneyOut.unexplainedMoneyOutCents;

  const knownNetOperationalCashMovementCents =
    moneyIn.customerCashCollectedCents +
    moneyIn.otherClassifiedMoneyInCents -
    moneyOut.directJobCashOutCents -
    moneyOut.overheadCashOutCents -
    moneyOut.otherClassifiedMoneyOutCents;

  return {
    periodKey: input.periodKey,
    fromDate: input.fromDate,
    toDate: input.toDate,
    moneyIn,
    moneyOut,
    unexplainedMoneyCents,
    knownNetOperationalCashMovementCents,
    knownNetCashMovementCents: knownNetOperationalCashMovementCents,
  };
}

/**
 * Economic direct cost is the cost entry amount once.
 * Receipt evidence and bank payment settlement must not inflate economic cost.
 */
export function resolveEconomicCostWithoutDoubleCount(input: {
  directCostAmountCents: number;
  receiptAmountCents?: number | null;
  bankPaymentAmountCents?: number | null;
}): {
  economicCostCents: number;
  cashSpentCents: number;
  receiptIsEvidenceOnly: true;
} {
  const paid = Math.min(
    input.directCostAmountCents,
    Math.max(0, input.bankPaymentAmountCents ?? 0),
  );
  return {
    economicCostCents: input.directCostAmountCents,
    cashSpentCents: paid,
    receiptIsEvidenceOnly: true,
  };
}

export function resolveDirectCostSettlementView(cost: {
  id: string;
  jobId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  amountCents: number;
  amountPaidCents?: number | null;
  isPaid: boolean;
  receiptDocumentId?: string | null;
  linkedAllocations?: ReadonlyArray<{ id: string; amountCents: number }>;
}): CashControlDirectCostSettlement {
  const amountPaidCents = resolveDirectCostCashPaidCents(cost);
  const linked = cost.linkedAllocations ?? [];
  return {
    directCostId: cost.id,
    jobId: cost.jobId,
    supplierId: cost.supplierId,
    supplierName: cost.supplierName,
    economicCostCents: cost.amountCents,
    amountPaidCents,
    unpaidCents: Math.max(0, cost.amountCents - amountPaidCents),
    receiptStatus: cost.receiptDocumentId ? 'attached' : 'none',
    linkedBankAllocationIds: linked.map((a) => a.id),
    linkedBankAllocationCents: linked.reduce((s, a) => s + a.amountCents, 0),
    source: 'direct_cost',
  };
}

export function invoiceBalanceDueCents(invoice: {
  totalCents: number;
  amountPaidCents: number;
  status: string;
}): number {
  if (invoice.status === 'cancelled' || invoice.status === 'draft') return 0;
  if (invoice.status === 'paid') return 0;
  return Math.max(0, invoice.totalCents - invoice.amountPaidCents);
}

export function isOutstandingCustomerInvoice(invoice: {
  totalCents: number;
  amountPaidCents: number;
  status: string;
}): boolean {
  return invoiceBalanceDueCents(invoice) > 0;
}

export function deriveCashTruthCompleteness(input: {
  bankCoverageIncomplete: boolean;
  unexplainedDebitCents: number;
  unexplainedCreditCents: number;
  partialAllocationCount: number;
  missingReceiptCount: number;
  unknownSupplierCount: number;
  unpaidJobCostCents: number;
  invoicePaymentLinkageIncomplete?: boolean;
}): { completeness: CashTruthCompleteness; reasons: CashControlCompletenessReason[] } {
  const reasons: CashControlCompletenessReason[] = [];
  if (input.bankCoverageIncomplete) reasons.push('incomplete_bank_coverage');
  if (input.unexplainedDebitCents > 0) reasons.push('unexplained_debit');
  if (input.unexplainedCreditCents > 0) reasons.push('unexplained_credit');
  if (input.partialAllocationCount > 0) reasons.push('partial_transaction_allocation');
  if (input.missingReceiptCount > 0) reasons.push('missing_receipt');
  if (input.unknownSupplierCount > 0) reasons.push('supplier_unresolved');
  if (input.unpaidJobCostCents > 0) reasons.push('unpaid_job_cost');
  if (input.invoicePaymentLinkageIncomplete) reasons.push('invoice_payment_linkage_incomplete');

  if (reasons.length === 0) return { completeness: 'VERIFIED', reasons };
  if (input.bankCoverageIncomplete || input.unexplainedDebitCents > 0 || input.unexplainedCreditCents > 0) {
    return { completeness: 'INCOMPLETE', reasons };
  }
  return { completeness: 'PROVISIONAL', reasons };
}

export function buildLedgerRowFromBankTransaction(
  tx: CashControlBankTransactionInput,
): CashControlLedgerRow {
  const abs = absoluteBankTransactionAmountCents(tx.amountCents);
  const active = tx.allocations.filter((a) => a.isActive !== false);
  const allocatedAmountCents = active.reduce((s, a) => s + a.amountCents, 0);
  const unallocatedAmountCents = Math.max(0, abs - allocatedAmountCents);

  const primaryType =
    active.length === 1
      ? active[0]!.allocationType
      : active.length > 1
        ? active[0]!.allocationType
        : tx.allocationStatus === 'ignored'
          ? 'ignored'
          : 'unclassified';

  const controlState = deriveEveryRandControlState({
    direction: tx.direction,
    allocationStatus: tx.allocationStatus,
    receiptStatus: tx.receiptStatus,
    unallocatedAmountCents,
    allocations: active,
    confirmedSupplierId: tx.confirmedSupplierId,
  });

  const jobId = active.find((a) => a.jobId)?.jobId ?? null;
  const costLink = active.find((a) => a.directCostId);
  const paymentOrCostRelationship = costLink
    ? `direct_cost:${costLink.directCostId}`
    : primaryType === 'customer_payment'
      ? 'customer_payment_allocation'
      : null;

  return {
    id: tx.id,
    source: 'bank_transaction',
    sourceId: tx.id,
    transactionDate: tx.transactionDate,
    direction: tx.direction,
    amountCents: abs,
    currency: tx.currency,
    description: tx.description,
    reference: tx.reference,
    customerOrSupplierName: tx.confirmedSupplierName ?? tx.merchantName,
    jobId,
    classification: primaryType,
    allocatedAmountCents,
    unallocatedAmountCents,
    receiptStatus: tx.receiptStatus,
    paymentOrCostRelationship,
    controlState,
    bankAllocationStatus: tx.allocationStatus,
    provider: tx.provider,
  };
}

export function paginateCashControlLedger(
  rows: ReadonlyArray<CashControlLedgerRow>,
  page: number,
  pageSize: number,
): CashControlLedgerPage {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safeSize = Math.min(200, Math.max(1, Math.floor(pageSize) || 50));
  const total = rows.length;
  const start = (safePage - 1) * safeSize;
  const slice = rows.slice(start, start + safeSize);
  return {
    rows: slice,
    page: safePage,
    pageSize: safeSize,
    total,
    hasMore: start + safeSize < total,
  };
}

export function mapJpeToCashControlJobView(
  result: Pick<JobProfitabilityResult, 'summary' | 'cash' | 'completeness' | 'profitabilityConfidence'>,
  extras: {
    jobId: string;
    directCostSettlements: CashControlDirectCostSettlement[];
    bankAllocations: CashControlJobView['bankAllocations'];
    customerBalanceOutstandingCents: number;
  },
): CashControlJobView {
  return {
    jobId: extras.jobId,
    currency: result.summary.currency,
    invoicedEconomicRevenueCents: result.summary.economicRevenueCents,
    economicDirectCostsCents: result.summary.totalDirectCostCents,
    grossProfitCents: result.summary.grossProfitCents,
    grossMarginPct: result.summary.grossMarginPct,
    cashCollectedCents: result.cash.cashCollectedCents,
    cashDirectCostsPaidCents: result.cash.cashSpentCents,
    knownRealisedCashProfitCents: result.cash.knownRealisedCashProfitCents,
    unpaidDirectCostsCents: result.cash.unpaidJobCostsCents,
    customerBalanceOutstandingCents: extras.customerBalanceOutstandingCents,
    completeness: result.completeness,
    confidence: result.profitabilityConfidence ?? null,
    directCostSettlements: extras.directCostSettlements,
    bankAllocations: extras.bankAllocations,
    sourceTrace: ['jpe', 'direct_cost', 'bank_allocation', 'titan_payment', 'invoice'],
  };
}

/** Overhead must never modify job gross profit (JPE rule). */
export function overheadExcludedFromJobGrossProfit(input: {
  economicRevenueCents: number;
  economicDirectCostsCents: number;
  overheadCashOutCents: number;
}): { grossProfitCents: number; overheadExcluded: true } {
  return {
    grossProfitCents: input.economicRevenueCents - input.economicDirectCostsCents,
    overheadExcluded: true,
  };
}

export function allocationTypeAffectsJobCash(allocationType: BankTransactionAllocationType): boolean {
  return allocationAffectsJobProfitability(allocationType);
}

export function emptyIssueTotals(): CashControlSummary['issues'] {
  return {
    unexplainedDebits: { count: 0, amountCents: 0 },
    unexplainedCredits: { count: 0, amountCents: 0 },
    partialAllocations: { count: 0, amountCents: 0 },
    missingReceipts: { count: 0, amountCents: 0 },
    unknownSuppliers: { count: 0, amountCents: 0 },
    unpaidJobCosts: { count: 0, amountCents: 0 },
    outstandingCustomerInvoices: { count: 0, amountCents: 0 },
  };
}
)
