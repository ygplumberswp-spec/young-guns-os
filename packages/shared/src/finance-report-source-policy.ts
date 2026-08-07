/**
 * Finance report source-of-truth and duplicate-prevention policy (Phase J-6.7D).
 *
 * Principles:
 * 1. TITAN invoices/payments rows are the operational ledger (including Xero-imported rows).
 * 2. Separate xero_* history tables supplement credit notes and bank feed — never summed into invoice totals.
 * 3. Cash inflow totals use payments only; bank feed is informational to avoid payment+bank double-count.
 * 4. Voided/cancelled invoices excluded from AR outstanding.
 */

export type FinanceSourceSystem = 'titan_local' | 'xero_synchronized' | 'mixed' | 'unavailable';

export type FinanceFreshnessState =
  | 'current'
  | 'recently_synced'
  | 'stale'
  | 'never_synced'
  | 'incomplete'
  | 'unavailable';

export type FinanceReportingBasis = 'accrual_invoice' | 'cash_payment' | 'mixed';

export type FinanceProvenanceMeta = {
  sourceSystem: FinanceSourceSystem;
  sourceRecordType: string;
  syncedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  coverageStatus: string;
  completenessStatus: string;
  duplicatePreventionBasis: string;
  reportingBasis: FinanceReportingBasis;
  currency: string;
  vatBasis: string;
};

export type FinanceInvoiceRow = {
  id: string;
  publicNumber: string;
  customerName: string;
  status: string;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  amountPaidCents: number;
  balanceDueCents: number;
  currency: string;
  issuedAt: string | null;
  dueDate: string | null;
  sourceProvider: string | null;
  sourceExternalId: string | null;
  sourceSyncedAt: string | null;
};

export type FinancePaymentRow = {
  id: string;
  publicInvoiceNumber: string;
  amountCents: number;
  currency: string;
  method: string;
  paidAt: string;
  sourceProvider: string | null;
  sourceExternalId: string | null;
  xeroPaymentId: string | null;
};

export type FinanceBankFeedRow = {
  transactionDate: string | null;
  amountCents: number;
  currency: string;
  description: string | null;
  category: string | null;
  type: string | null;
  excludedFromCashTotals: boolean;
  exclusionReason: string | null;
};

export type ReceivableAgingBucket =
  | 'current'
  | 'days_1_30'
  | 'days_31_60'
  | 'days_61_90'
  | 'days_91_plus'
  | 'due_date_unavailable';

export type ReceivableAgingLine = {
  bucket: ReceivableAgingBucket;
  bucketLabel: string;
  invoiceCount: number;
  balanceDueCents: number;
};

export type ReceivableInvoiceLine = {
  publicNumber: string;
  customerName: string;
  invoiceDate: string | null;
  dueDate: string | null;
  originalTotalCents: number;
  amountPaidCents: number;
  balanceDueCents: number;
  status: string;
  daysOverdue: number | null;
  agingBucket: ReceivableAgingBucket;
  lastPaymentDate: string | null;
  flags: string[];
};

const MS_PER_DAY = 86_400_000;

export function resolveFinanceSourceSystem(
  invoices: Array<{ sourceProvider: string | null }>,
): FinanceSourceSystem {
  const withXero = invoices.filter((i) => i.sourceProvider === 'xero').length;
  if (invoices.length === 0) return 'unavailable';
  if (withXero === 0) return 'titan_local';
  if (withXero === invoices.length) return 'xero_synchronized';
  return 'mixed';
}

export function resolveFinanceFreshness(lastSyncAt: string | null, now = new Date()): FinanceFreshnessState {
  if (!lastSyncAt) return 'never_synced';
  const syncTime = Date.parse(lastSyncAt);
  if (Number.isNaN(syncTime)) return 'unavailable';
  const ageHours = (now.getTime() - syncTime) / 3_600_000;
  if (ageHours <= 24) return 'current';
  if (ageHours <= 72) return 'recently_synced';
  if (ageHours <= 168) return 'stale';
  return 'stale';
}

export function invoiceBalanceDueCents(invoice: {
  status: string;
  totalCents: number;
  amountCents: number;
  amountPaidCents: number;
}): number {
  if (invoice.status === 'cancelled' || invoice.status === 'draft') return 0;
  const total = Math.max(0, invoice.totalCents || invoice.amountCents);
  const paid = Math.max(0, invoice.amountPaidCents);
  const balance = total - paid;
  return balance;
}

export function classifyAgingBucket(input: {
  balanceDueCents: number;
  status: string;
  dueDate: string | Date | null;
  asOf: Date;
}): { bucket: ReceivableAgingBucket; daysOverdue: number | null } {
  if (input.status === 'cancelled' || input.status === 'paid' || input.balanceDueCents <= 0) {
    return { bucket: 'current', daysOverdue: null };
  }
  if (!input.dueDate) {
    return { bucket: 'due_date_unavailable', daysOverdue: null };
  }
  const due = typeof input.dueDate === 'string' ? new Date(input.dueDate) : input.dueDate;
  if (Number.isNaN(due.getTime())) {
    return { bucket: 'due_date_unavailable', daysOverdue: null };
  }
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const asOfDay = Date.UTC(
    input.asOf.getUTCFullYear(),
    input.asOf.getUTCMonth(),
    input.asOf.getUTCDate(),
  );
  if (dueDay >= asOfDay) {
    return { bucket: 'current', daysOverdue: 0 };
  }
  const daysOverdue = Math.floor((asOfDay - dueDay) / MS_PER_DAY);
  if (daysOverdue <= 30) return { bucket: 'days_1_30', daysOverdue };
  if (daysOverdue <= 60) return { bucket: 'days_31_60', daysOverdue };
  if (daysOverdue <= 90) return { bucket: 'days_61_90', daysOverdue };
  return { bucket: 'days_91_plus', daysOverdue };
}

export function bucketLabel(bucket: ReceivableAgingBucket): string {
  switch (bucket) {
    case 'current':
      return 'Current / not yet due';
    case 'days_1_30':
      return '1–30 days overdue';
    case 'days_31_60':
      return '31–60 days overdue';
    case 'days_61_90':
      return '61–90 days overdue';
    case 'days_91_plus':
      return '91+ days overdue';
    case 'due_date_unavailable':
      return 'Due date unavailable';
  }
}

export function buildReceivableAgingSummary(lines: ReceivableInvoiceLine[]): ReceivableAgingLine[] {
  const buckets: ReceivableAgingBucket[] = [
    'current',
    'days_1_30',
    'days_31_60',
    'days_61_90',
    'days_91_plus',
    'due_date_unavailable',
  ];
  return buckets.map((bucket) => {
    const matching = lines.filter((l) => l.agingBucket === bucket && l.balanceDueCents > 0);
    return {
      bucket,
      bucketLabel: bucketLabel(bucket),
      invoiceCount: matching.length,
      balanceDueCents: matching.reduce((sum, l) => sum + l.balanceDueCents, 0),
    };
  });
}

/** Bank feed rows are informational; payments drive cash inflow totals. */
export function annotateBankFeedRows(
  rows: Array<{
    transactionDate: string | null;
    amountCents: number;
    currency: string;
    description: string | null;
    category: string | null;
    type: string | null;
  }>,
): FinanceBankFeedRow[] {
  return rows.map((row) => {
    const isTransfer =
      (row.type?.toLowerCase() ?? '').includes('transfer') ||
      (row.category?.toLowerCase() ?? '').includes('transfer');
    return {
      ...row,
      excludedFromCashTotals: true,
      exclusionReason: isTransfer
        ? 'Transfer — excluded from cash movement totals'
        : 'Bank feed informational — customer payments use recorded payment records to prevent double-counting',
    };
  });
}

export const FINANCE_DUPLICATE_PREVENTION_BASIS =
  'Invoice and payment totals use TITAN ledger rows only (including Xero-imported rows). Bank feed and credit notes are never added to the same totals.';

export const FINANCE_PROFIT_UNAVAILABLE_NOTE =
  'Profit is not available from the currently verified report data.';

export const FINANCE_CASH_NOT_PROFIT_NOTE =
  'Cash movement is not profit. Verified profit requires a canonical accounting-derived profit-and-loss source.';
