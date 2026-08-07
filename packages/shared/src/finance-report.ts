/**
 * Canonical finance report export kinds (Phase J-6.7D).
 */

import type {
  FinanceBankFeedRow,
  FinanceFreshnessState,
  FinanceProvenanceMeta,
  ReceivableAgingLine,
  ReceivableInvoiceLine,
} from './finance-report-source-policy.js';

export const FINANCE_REPORT_KINDS = [
  'finance_aggregate',
  'cashflow_collections',
  'accounts_receivable',
  'customer_property_history',
] as const;

export type FinanceReportKind = (typeof FINANCE_REPORT_KINDS)[number];

export type FinanceReportHeader = {
  reportReference: string;
  reportKind: FinanceReportKind;
  companyName: string;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  snapshotDate: string | null;
  timezone: string;
  generatedAt: string;
  provenance: FinanceProvenanceMeta;
  freshnessState: FinanceFreshnessState;
  dataSourceNote: string;
  dataQualityWarnings: string[];
};

export type FinanceMetricLine = {
  label: string;
  displayValue: string;
  amountCents: number | null;
  count: number | null;
  note: string | null;
  state: 'recorded' | 'measured_zero' | 'not_recorded' | 'unavailable' | 'unsupported';
};

export type FinanceAggregateReportContext = FinanceReportHeader & {
  reportKind: 'finance_aggregate';
  metrics: FinanceMetricLine[];
  revenueByMonth: Array<{ month: string; amountCents: number }>;
  paymentsByMonth: Array<{ month: string; amountCents: number }>;
  agingSummary: ReceivableAgingLine[];
  statusBreakdown: Array<{ status: string; count: number; totalCents: number }>;
  topOutstandingCustomers: Array<{ customerName: string; balanceDueCents: number }>;
  profitNote: string;
  cashFlowNote: string;
  vatNote: string;
};

export type CashflowCollectionsReportContext = FinanceReportHeader & {
  reportKind: 'cashflow_collections';
  cashInflowsCents: number | null;
  cashOutflowsCents: number | null;
  netCashMovementCents: number | null;
  customerPaymentsCents: number | null;
  refundsCents: number | null;
  supplierPaymentsCents: number | null;
  monthlyMovement: Array<{ month: string; inflowCents: number; outflowCents: number; netCents: number }>;
  collectionsByCustomer: Array<{ customerName: string; amountCents: number }>;
  bankFeedLines: FinanceBankFeedRow[];
  unallocatedPaymentsNote: string | null;
  metrics: FinanceMetricLine[];
};

export type AccountsReceivableReportContext = FinanceReportHeader & {
  reportKind: 'accounts_receivable';
  totalOutstandingCents: number;
  agingSummary: ReceivableAgingLine[];
  invoiceLines: ReceivableInvoiceLine[];
};

export type CustomerHistoryTimelineItem = {
  date: string;
  kind: 'job' | 'quote' | 'invoice' | 'payment' | 'completion' | 'maintenance' | 'service';
  publicReference: string;
  title: string;
  status: string | null;
  amountCents: number | null;
  propertyName: string | null;
};

export type CustomerPropertyHistoryReportContext = FinanceReportHeader & {
  reportKind: 'customer_property_history';
  audience: 'internal' | 'client';
  customerName: string;
  customerReference: string;
  contactEmail: string | null;
  contactPhone: string | null;
  properties: Array<{ name: string; address: string | null }>;
  timeline: CustomerHistoryTimelineItem[];
  outstandingBalanceCents: number | null;
  amountPaidCents: number | null;
  internalNotes: string | null;
};

export type FinanceReportContext =
  | FinanceAggregateReportContext
  | CashflowCollectionsReportContext
  | AccountsReceivableReportContext
  | CustomerPropertyHistoryReportContext;

export function financeReportKindLabel(kind: FinanceReportKind): string {
  switch (kind) {
    case 'finance_aggregate':
      return 'Finance Aggregate Summary';
    case 'cashflow_collections':
      return 'Cash-Flow and Collections Report';
    case 'accounts_receivable':
      return 'Accounts Receivable and Aging Report';
    case 'customer_property_history':
      return 'Customer and Property History Report';
  }
}

export function financeReportFilename(kind: FinanceReportKind, reference: string): string {
  const slug =
    kind === 'finance_aggregate'
      ? 'finance-aggregate'
      : kind === 'cashflow_collections'
        ? 'cashflow-collections'
        : kind === 'accounts_receivable'
          ? 'accounts-receivable'
          : 'customer-history';
  const safeRef = reference.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 32) || 'report';
  return `${slug}-${safeRef}.pdf`;
}

export function financeMetric(
  label: string,
  input: {
    amountCents?: number | null;
    count?: number | null;
    displayValue?: string;
    state?: FinanceMetricLine['state'];
    note?: string | null;
  },
  formatCents: (cents: number) => string,
): FinanceMetricLine {
  let state = input.state;
  if (!state) {
    if (input.amountCents == null && input.count == null) state = 'not_recorded';
    else if ((input.amountCents ?? input.count ?? 0) === 0) state = 'measured_zero';
    else state = 'recorded';
  }

  let displayValue = input.displayValue;
  if (!displayValue) {
    if (state === 'unavailable' || state === 'unsupported') {
      displayValue = 'Not available from current verified data';
    } else if (state === 'not_recorded') {
      displayValue = 'Not recorded';
    } else if (input.amountCents != null) {
      displayValue = formatCents(input.amountCents);
    } else if (input.count != null) {
      displayValue = String(input.count);
    } else {
      displayValue = '—';
    }
  }

  return {
    label,
    displayValue,
    amountCents: input.amountCents ?? null,
    count: input.count ?? null,
    note: input.note ?? null,
    state,
  };
}

/** Client-safe projection strips internal finance fields. */
export function projectCustomerHistoryForClient(
  ctx: CustomerPropertyHistoryReportContext,
): CustomerPropertyHistoryReportContext {
  return {
    ...ctx,
    audience: 'client',
    internalNotes: null,
    provenance: {
      ...ctx.provenance,
      duplicatePreventionBasis: 'Client-safe customer history — operational references only.',
    },
    dataQualityWarnings: ctx.dataQualityWarnings.filter((w) => !w.toLowerCase().includes('xero sync log')),
  };
}

export function resolveCustomerPublicReference(input: {
  customerNumber: string | null;
  name: string;
}): string {
  const num = input.customerNumber?.trim();
  if (num) return num;
  return input.name.trim() || 'Customer';
}
