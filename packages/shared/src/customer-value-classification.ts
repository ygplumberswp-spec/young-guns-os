/**
 * BINDING TITAN CUSTOMER VALUE CLASSIFICATION
 * Distinguishes invoiced vs actually paid customers. No cash from unpaid invoices.
 * Supplier-only contacts are never counted as customers.
 */

import type { InvoiceClassificationInput } from './marketing-eligibility.js';

export type CustomerValueClassification =
  | 'verified_invoiced_customer'
  | 'paying_customer'
  | 'fully_paid_customer'
  | 'partially_paid_customer'
  | 'unpaid_debtor'
  | 'overdue_debtor'
  | 'prospect_contact'
  | 'supplier_only_contact';

export const CUSTOMER_VALUE_CLASSIFICATION_LABELS: Record<CustomerValueClassification, string> = {
  verified_invoiced_customer: 'Verified invoiced customer',
  paying_customer: 'Paying customer',
  fully_paid_customer: 'Fully paid customer',
  partially_paid_customer: 'Partially paid customer',
  unpaid_debtor: 'Unpaid debtor',
  overdue_debtor: 'Overdue debtor',
  prospect_contact: 'Prospect / contact',
  supplier_only_contact: 'Supplier-only contact',
};

/** Query/filter keys for list endpoints and dashboard deep-links. */
export const CUSTOMER_VALUE_CLASSIFICATION_FILTER_KEYS = [
  'verified_invoiced_customer',
  'paying_customer',
  'fully_paid_customer',
  'partially_paid_customer',
  'unpaid_debtor',
  'overdue_debtor',
  'prospect_contact',
  'supplier_only_contact',
] as const;

export type CustomerValueClassificationFilterKey =
  (typeof CUSTOMER_VALUE_CLASSIFICATION_FILTER_KEYS)[number];

export function isCustomerValueClassificationFilterKey(
  value: string,
): value is CustomerValueClassificationFilterKey {
  return (CUSTOMER_VALUE_CLASSIFICATION_FILTER_KEYS as readonly string[]).includes(value);
}

export type CustomerValueMetricBucket = {
  classification: CustomerValueClassification;
  label: string;
  filterKey: CustomerValueClassificationFilterKey;
  count: number;
  /** ZAR cents — metric-specific (invoiced, cash received, or outstanding). */
  valueCents: number;
};

export type CustomerValueMetricsTotals = {
  customerRecords: number;
  qualifyingCustomers: number;
  totalInvoicedCents: number;
  /** Cash actually received — never includes unpaid invoice totals. */
  cashReceivedCents: number;
  outstandingCents: number;
  overdueOutstandingCents: number;
};

export type CustomerValueMetrics = {
  currency: 'ZAR';
  computedAt: string;
  buckets: CustomerValueMetricBucket[];
  totals: CustomerValueMetricsTotals;
  dataCompleteness: 'complete' | 'partial' | 'empty';
  xeroImportInProgress: boolean;
  notes: string[];
};

/** Shown in CRM/dashboard when Xero background import is still running. */
export const CUSTOMER_VALUE_XERO_IMPORT_PARTIAL_MESSAGE =
  'Xero import in progress — customer classifications are partial';

/** Dashboard empty state when contacts exist but none have verified invoice evidence. */
export const CUSTOMER_VALUE_NO_VERIFIED_DATA_MESSAGE =
  'No verified customer value data yet';

/** Dashboard status while Xero sync is refreshing classifications. */
export const CUSTOMER_VALUE_UPDATING_FROM_XERO_MESSAGE =
  'Customer value is updating from Xero';

/** Verified customer buckets — excludes prospect/supplier-only Xero contacts. */
export const CUSTOMER_VALUE_VERIFIED_FILTER_KEYS = [
  'verified_invoiced_customer',
  'paying_customer',
  'fully_paid_customer',
  'partially_paid_customer',
  'unpaid_debtor',
  'overdue_debtor',
] as const satisfies ReadonlyArray<CustomerValueClassificationFilterKey>;

export type CustomerValueClassificationEvidence = {
  code: string;
  detail: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
};

export type ClassifyCustomerValueInput = {
  customerId: string;
  customerName: string;
  customerStatus: string;
  isSupplierOnly: boolean;
  xeroContactId: string | null;
  invoices: InvoiceClassificationInput[];
  /** ISO timestamp for overdue evaluation; defaults to now. */
  asOf?: string;
};

export type CustomerValueClassificationSummary = {
  customerId: string;
  customerName: string;
  primaryClassification: CustomerValueClassification;
  isVerifiedInvoiced: boolean;
  isPayingCustomer: boolean;
  isFullyPaid: boolean;
  isPartiallyPaid: boolean;
  isUnpaidDebtor: boolean;
  isOverdueDebtor: boolean;
  isProspect: boolean;
  isSupplierOnly: boolean;
  qualifyingInvoiceCount: number;
  totalInvoicedCents: number;
  cashReceivedCents: number;
  outstandingCents: number;
  overdueOutstandingCents: number;
  xeroContactId: string | null;
  evidence: CustomerValueClassificationEvidence[];
  reason: string;
  computedAt: string;
};

const EXCLUDED_INVOICE_STATUSES = new Set(['draft', 'cancelled', 'voided', 'deleted']);

function invoiceTotalCents(inv: InvoiceClassificationInput): number {
  return inv.totalCents || inv.amountCents || 0;
}

function invoicePaidCents(inv: InvoiceClassificationInput): number {
  return Math.max(0, inv.amountPaidCents ?? 0);
}

function isQualifyingInvoice(inv: InvoiceClassificationInput): boolean {
  if (EXCLUDED_INVOICE_STATUSES.has(inv.status)) return false;
  return invoiceTotalCents(inv) > 0;
}

function parseDueDate(inv: InvoiceClassificationInput): Date | null {
  if (!inv.dueDate) return null;
  const parsed = new Date(inv.dueDate);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function resolvePrimaryClassification(flags: {
  isSupplierOnly: boolean;
  isProspect: boolean;
  isOverdueDebtor: boolean;
  isUnpaidDebtor: boolean;
  isPartiallyPaid: boolean;
  isFullyPaid: boolean;
}): CustomerValueClassification {
  if (flags.isSupplierOnly) return 'supplier_only_contact';
  if (flags.isProspect) return 'prospect_contact';
  if (flags.isOverdueDebtor) return 'overdue_debtor';
  if (flags.isUnpaidDebtor) return 'unpaid_debtor';
  if (flags.isPartiallyPaid) return 'partially_paid_customer';
  if (flags.isFullyPaid) return 'fully_paid_customer';
  return 'verified_invoiced_customer';
}

/**
 * Pure customer value classifier — read-only evidence from invoices/payments fields.
 * Preserves unpaid history; never treats unpaid invoice totals as cash received.
 */
export function classifyCustomerValueFromEvidence(
  input: ClassifyCustomerValueInput,
): Omit<CustomerValueClassificationSummary, 'computedAt'> {
  const evidence: CustomerValueClassificationEvidence[] = [];
  const asOf = input.asOf ? new Date(input.asOf) : new Date();

  if (input.isSupplierOnly) {
    evidence.push({
      code: 'supplier_only_flag',
      detail: 'Supplier-only contact — excluded from customer value metrics.',
    });
    return {
      customerId: input.customerId,
      customerName: input.customerName,
      primaryClassification: 'supplier_only_contact',
      isVerifiedInvoiced: false,
      isPayingCustomer: false,
      isFullyPaid: false,
      isPartiallyPaid: false,
      isUnpaidDebtor: false,
      isOverdueDebtor: false,
      isProspect: false,
      isSupplierOnly: true,
      qualifyingInvoiceCount: 0,
      totalInvoicedCents: 0,
      cashReceivedCents: 0,
      outstandingCents: 0,
      overdueOutstandingCents: 0,
      xeroContactId: input.xeroContactId,
      evidence,
      reason: 'Supplier-only contact — never counted as a customer.',
    };
  }

  for (const inv of input.invoices) {
    if (inv.status === 'draft') {
      evidence.push({
        code: 'excluded_draft',
        detail: 'Draft invoice excluded from customer value proof.',
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceStatus: inv.status,
      });
    } else if (EXCLUDED_INVOICE_STATUSES.has(inv.status)) {
      evidence.push({
        code: 'excluded_void_cancelled',
        detail: 'Voided/cancelled/deleted invoice excluded from customer value proof.',
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceStatus: inv.status,
      });
    }
  }

  const qualifying = input.invoices.filter(isQualifyingInvoice);

  let totalInvoicedCents = 0;
  let cashReceivedCents = 0;
  let outstandingCents = 0;
  let overdueOutstandingCents = 0;

  for (const inv of qualifying) {
    const total = invoiceTotalCents(inv);
    const paid = Math.min(invoicePaidCents(inv), total);
    const outstanding = Math.max(0, total - paid);
    totalInvoicedCents += total;
    cashReceivedCents += paid;
    outstandingCents += outstanding;

    const dueDate = parseDueDate(inv);
    if (outstanding > 0 && dueDate && dueDate.getTime() < asOf.getTime()) {
      overdueOutstandingCents += outstanding;
      evidence.push({
        code: 'overdue_outstanding',
        detail: 'Outstanding balance past due date.',
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceStatus: inv.status,
      });
    } else if (paid > 0 && outstanding > 0) {
      evidence.push({
        code: 'partial_payment',
        detail: 'Payment allocated with balance remaining.',
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceStatus: inv.status,
      });
    } else if (paid >= total && total > 0) {
      evidence.push({
        code: 'fully_settled',
        detail: 'Invoice total settled (R0 outstanding).',
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceStatus: inv.status,
      });
    } else if (paid === 0) {
      evidence.push({
        code: 'unpaid_accrec',
        detail: 'Qualifying sales invoice with no payment allocated.',
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceStatus: inv.status,
      });
    }
  }

  const isVerifiedInvoiced = qualifying.length >= 1;
  const isPayingCustomer = cashReceivedCents > 0;
  const isFullyPaid = isVerifiedInvoiced && outstandingCents === 0;
  const isPartiallyPaid = isPayingCustomer && outstandingCents > 0;
  const isUnpaidDebtor = isVerifiedInvoiced && cashReceivedCents === 0;
  const isOverdueDebtor = overdueOutstandingCents > 0;
  const isProspect = !isVerifiedInvoiced;

  if (isProspect && input.customerStatus === 'lead') {
    evidence.push({
      code: 'prospect_lead',
      detail: 'Lead/prospect with no qualifying ACCREC sales invoice.',
    });
  } else if (isProspect && input.xeroContactId) {
    evidence.push({
      code: 'xero_mapping_without_sales',
      detail: 'Xero contact mapping retained; no qualifying ACCREC sales invoice.',
    });
  } else if (isProspect) {
    evidence.push({
      code: 'contact_only',
      detail: 'Contact record only — no qualifying sales invoice.',
    });
  }

  const primaryClassification = resolvePrimaryClassification({
    isSupplierOnly: false,
    isProspect,
    isOverdueDebtor,
    isUnpaidDebtor,
    isPartiallyPaid,
    isFullyPaid,
  });

  const reason = (() => {
    switch (primaryClassification) {
      case 'overdue_debtor':
        return 'Outstanding balance past due — collections priority.';
      case 'unpaid_debtor':
        return 'Qualifying sales invoice with no payment allocated.';
      case 'partially_paid_customer':
        return 'Some payment received; balance remains outstanding.';
      case 'fully_paid_customer':
        return 'All qualifying invoice balances fully settled.';
      case 'verified_invoiced_customer':
        return 'Qualifying ACCREC sales invoice evidence.';
      case 'prospect_contact':
        return 'No qualifying sales invoice — prospect/contact only.';
      default:
        return 'Supplier-only contact.';
    }
  })();

  return {
    customerId: input.customerId,
    customerName: input.customerName,
    primaryClassification,
    isVerifiedInvoiced,
    isPayingCustomer,
    isFullyPaid,
    isPartiallyPaid,
    isUnpaidDebtor,
    isOverdueDebtor,
    isProspect,
    isSupplierOnly: false,
    qualifyingInvoiceCount: qualifying.length,
    totalInvoicedCents,
    cashReceivedCents,
    outstandingCents,
    overdueOutstandingCents,
    xeroContactId: input.xeroContactId,
    evidence,
    reason,
  };
}

export function customerMatchesValueFilter(
  summary: Pick<
    CustomerValueClassificationSummary,
    | 'primaryClassification'
    | 'isVerifiedInvoiced'
    | 'isPayingCustomer'
    | 'isFullyPaid'
    | 'isPartiallyPaid'
    | 'isUnpaidDebtor'
    | 'isOverdueDebtor'
    | 'isProspect'
    | 'isSupplierOnly'
  >,
  filterKey: CustomerValueClassificationFilterKey,
): boolean {
  switch (filterKey) {
    case 'supplier_only_contact':
      return summary.isSupplierOnly;
    case 'prospect_contact':
      return summary.isProspect && !summary.isSupplierOnly;
    case 'verified_invoiced_customer':
      return summary.isVerifiedInvoiced && !summary.isSupplierOnly;
    case 'paying_customer':
      return summary.isPayingCustomer && !summary.isSupplierOnly;
    case 'fully_paid_customer':
      return summary.isFullyPaid && !summary.isSupplierOnly;
    case 'partially_paid_customer':
      return summary.isPartiallyPaid && !summary.isSupplierOnly;
    case 'unpaid_debtor':
      return summary.isUnpaidDebtor && !summary.isOverdueDebtor && !summary.isSupplierOnly;
    case 'overdue_debtor':
      return summary.isOverdueDebtor && !summary.isSupplierOnly;
    default:
      return summary.primaryClassification === filterKey;
  }
}

/** Marketing eligibility: paying or fully paid ACCREC customers (consent still required separately). */
export function isMarketingEligibleCustomerValue(
  summary: Pick<CustomerValueClassificationSummary, 'isPayingCustomer' | 'isFullyPaid' | 'isSupplierOnly'>,
): boolean {
  if (summary.isSupplierOnly) return false;
  return summary.isPayingCustomer || summary.isFullyPaid;
}

function bucketValueCents(
  classification: CustomerValueClassification,
  summary: Pick<
    CustomerValueClassificationSummary,
    'totalInvoicedCents' | 'cashReceivedCents' | 'outstandingCents' | 'overdueOutstandingCents'
  >,
): number {
  switch (classification) {
    case 'verified_invoiced_customer':
    case 'fully_paid_customer':
      return summary.totalInvoicedCents;
    case 'paying_customer':
      return summary.cashReceivedCents;
    case 'partially_paid_customer':
    case 'unpaid_debtor':
      return summary.outstandingCents;
    case 'overdue_debtor':
      return summary.overdueOutstandingCents;
    default:
      return 0;
  }
}

export function aggregateCustomerValueMetrics(
  summaries: CustomerValueClassificationSummary[],
  opts: { xeroImportInProgress?: boolean; notes?: string[] } = {},
): CustomerValueMetrics {
  const bucketCounts = new Map<CustomerValueClassification, number>();
  const bucketValues = new Map<CustomerValueClassification, number>();

  for (const key of CUSTOMER_VALUE_CLASSIFICATION_FILTER_KEYS) {
    bucketCounts.set(key, 0);
    bucketValues.set(key, 0);
  }

  let totalInvoicedCents = 0;
  let cashReceivedCents = 0;
  let outstandingCents = 0;
  let overdueOutstandingCents = 0;
  let qualifyingCustomers = 0;

  for (const summary of summaries) {
    if (summary.isSupplierOnly) {
      bucketCounts.set('supplier_only_contact', (bucketCounts.get('supplier_only_contact') ?? 0) + 1);
      continue;
    }

    if (summary.isVerifiedInvoiced) {
      qualifyingCustomers += 1;
      totalInvoicedCents += summary.totalInvoicedCents;
      cashReceivedCents += summary.cashReceivedCents;
      outstandingCents += summary.outstandingCents;
      overdueOutstandingCents += summary.overdueOutstandingCents;
    }

    for (const filterKey of CUSTOMER_VALUE_CLASSIFICATION_FILTER_KEYS) {
      if (!customerMatchesValueFilter(summary, filterKey)) continue;
      bucketCounts.set(filterKey, (bucketCounts.get(filterKey) ?? 0) + 1);
      bucketValues.set(
        filterKey,
        (bucketValues.get(filterKey) ?? 0) + bucketValueCents(filterKey, summary),
      );
    }
  }

  const dataCompleteness: CustomerValueMetrics['dataCompleteness'] =
    summaries.length === 0 ? 'empty' : opts.xeroImportInProgress ? 'partial' : 'complete';

  const buckets: CustomerValueMetricBucket[] = CUSTOMER_VALUE_CLASSIFICATION_FILTER_KEYS.map(
    (filterKey) => ({
      classification: filterKey,
      label: CUSTOMER_VALUE_CLASSIFICATION_LABELS[filterKey],
      filterKey,
      count: bucketCounts.get(filterKey) ?? 0,
      valueCents: bucketValues.get(filterKey) ?? 0,
    }),
  );

  return {
    currency: 'ZAR',
    computedAt: new Date().toISOString(),
    buckets,
    totals: {
      customerRecords: summaries.length,
      qualifyingCustomers,
      totalInvoicedCents,
      cashReceivedCents,
      outstandingCents,
      overdueOutstandingCents,
    },
    dataCompleteness,
    xeroImportInProgress: Boolean(opts.xeroImportInProgress),
    notes: opts.notes ?? [],
  };
}
