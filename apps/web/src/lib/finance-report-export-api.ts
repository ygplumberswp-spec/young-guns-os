import { requestBlob } from './api-client';

export type FinanceReportExportKind =
  | 'finance_aggregate'
  | 'cashflow_collections'
  | 'accounts_receivable'
  | 'customer_property_history';

export type FinanceReportExportChannel = 'staff' | 'portal';

export type FinanceReportExportTarget =
  | { scope: 'tenant' }
  | { scope: 'customer'; customerId: string };

export type FinanceReportPdfPreview = {
  blob: Blob;
  filename: string;
};

function staffPath(kind: FinanceReportExportKind, target: FinanceReportExportTarget): string {
  switch (kind) {
    case 'finance_aggregate':
      return '/report-exports/finance/aggregate/pdf';
    case 'cashflow_collections':
      return '/report-exports/finance/cashflow/pdf';
    case 'accounts_receivable':
      return '/report-exports/finance/receivables/pdf';
    case 'customer_property_history':
      if (target.scope !== 'customer') {
        throw new Error('Customer ID is required for customer history export');
      }
      return `/report-exports/customers/${encodeURIComponent(target.customerId)}/history/pdf`;
  }
}

function portalPath(kind: FinanceReportExportKind): string | null {
  if (kind !== 'customer_property_history') return null;
  return '/portal/report-exports/customer/history/pdf';
}

export function defaultFinancePeriod(days = 30): { periodStart: string; periodEnd: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

export async function fetchFinanceReportPdf(
  accessToken: string,
  kind: FinanceReportExportKind,
  target: FinanceReportExportTarget,
  options: {
    channel?: FinanceReportExportChannel;
    periodStart: string;
    periodEnd: string;
    snapshotDate?: string;
  },
): Promise<FinanceReportPdfPreview> {
  const channel = options.channel ?? 'staff';
  const path =
    channel === 'portal'
      ? portalPath(kind)
      : staffPath(kind, target);

  if (!path) {
    throw new Error('This finance report is not available on the client portal');
  }

  const query = new URLSearchParams();
  if (kind === 'accounts_receivable') {
    if (options.snapshotDate) query.set('snapshotDate', options.snapshotDate);
  } else {
    query.set('periodStart', options.periodStart);
    query.set('periodEnd', options.periodEnd);
  }

  const blob = await requestBlob(`${path}?${query.toString()}`, {
    method: 'GET',
    accessToken,
    timeoutMs: 60_000,
    headers: { Accept: 'application/pdf' },
  });

  if (blob.type && blob.type !== 'application/pdf') {
    throw new Error('Finance report export did not return a PDF document');
  }

  const slug =
    kind === 'finance_aggregate'
      ? 'finance-aggregate'
      : kind === 'cashflow_collections'
        ? 'cashflow-collections'
        : kind === 'accounts_receivable'
          ? 'accounts-receivable'
          : 'customer-history';

  return { blob, filename: `${slug}-${options.periodEnd || options.snapshotDate || 'report'}.pdf` };
}

export function financeReportKindLabel(kind: FinanceReportExportKind): string {
  switch (kind) {
    case 'finance_aggregate':
      return 'Finance Aggregate Summary';
    case 'cashflow_collections':
      return 'Cash-Flow and Collections';
    case 'accounts_receivable':
      return 'Accounts Receivable and Aging';
    case 'customer_property_history':
      return 'Customer and Property History';
  }
}
