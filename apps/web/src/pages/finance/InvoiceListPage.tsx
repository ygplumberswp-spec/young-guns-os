import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { PageLoadState, Panel } from '@titan/ui';
import { formatMoney, INVOICE_STATUS_OPTIONS, type InvoiceSummary } from '@titan/shared';
import { fetchInvoices } from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { FinancePageHeader } from '../../features/finance/FinancePageHeader';
import { FinanceWorkspaceDraftRow } from '../../features/finance/FinanceWorkspaceDraftRow';
import {
  INVOICE_LIST_FILTERS,
  invoiceApiStatus,
  invoiceMatchesFilter,
  isInvoiceDraft,
  visibleWorkspaceDrafts,
  type InvoiceListFilter,
} from '../../features/finance/finance-filters';
import { useFinanceSectionDrafts } from '../../features/finance/useFinanceSectionDrafts';
import { canAccessFinance, canManageFinance } from '../../features/finance/utils';
import { CompactFilterTabs, PageHeader, StatusBadge } from '../../components/ux';

function formatStatus(status: InvoiceSummary['status']): string {
  return INVOICE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function isSyncPending(invoice: InvoiceSummary): boolean {
  if (invoice.xeroSyncStatus === 'synced' || invoice.numberAuthority === 'xero') {
    return false;
  }
  return invoice.numberAuthority === 'internal_pending_xero' && !invoice.xeroInvoiceNumber;
}

function formatInvoiceMoney(invoice: InvoiceSummary, cents: number): string {
  if (invoice.financialDataComplete === false && cents <= 0) {
    return '—';
  }
  return formatMoney(cents, invoice.currency);
}

export function InvoiceListPage() {
  const { accessToken, user } = useAuth();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<InvoiceListFilter>('all');
  const [sortDesc, setSortDesc] = useState(true);

  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFinance(user.permissions) : false), [user]);

  const includeArchivedDrafts = filter === 'archived';

  const { drafts: workspaceDrafts } = useFinanceSectionDrafts({
    accessToken,
    recordType: 'invoice',
    enabled: canView && (filter === 'all' || filter === 'drafts' || includeArchivedDrafts),
    includeArchived: includeArchivedDrafts,
  });

  const {
    data: invoices,
    error,
    isLoading,
  } = useStaffCachedQuery({
    queryKey: `finance/invoices:${q.trim()}:${filter}`,
    enabled: canView,
    fetcher: async () =>
      fetchInvoices(accessToken!, {
        q: q.trim() || undefined,
        status: invoiceApiStatus(filter),
        overdueOnly: filter === 'overdue',
      }),
  });

  const visibleInvoices = useMemo(() => {
    let rows = (invoices ?? []).filter((invoice) => invoiceMatchesFilter(invoice, filter));
    rows.sort((a, b) => {
      const aTime = new Date(a.dueDate ?? a.createdAt).getTime();
      const bTime = new Date(b.dueDate ?? b.createdAt).getTime();
      return sortDesc ? bTime - aTime : aTime - bTime;
    });
    return rows;
  }, [filter, invoices, sortDesc]);

  const visibleDrafts = useMemo(
    () =>
      visibleWorkspaceDrafts(workspaceDrafts, visibleInvoices, {
        filter,
        isDraftRecord: (record) => isInvoiceDraft(record),
        includeArchived: includeArchivedDrafts,
      }),
    [filter, includeArchivedDrafts, visibleInvoices, workspaceDrafts],
  );

  const isEmpty = visibleInvoices.length === 0 && visibleDrafts.length === 0;

  if (!canView) {
    return (
      <div className="finance-page">
        <PageHeader title="Invoices" description="You do not have permission to view finance." />
      </div>
    );
  }

  return (
    <div className="finance-page">
      <FinancePageHeader canWrite={canWrite} usePrimaryAction />
      <FinanceNav />

      <Panel title="Invoices">
        <CompactFilterTabs<InvoiceListFilter>
          options={INVOICE_LIST_FILTERS}
          value={filter}
          onChange={setFilter}
          ariaLabel="Invoice filters"
          maxVisible={4}
        />

        <div className="finance-toolbar">
          <input
            className="titan-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search number or customer…"
            aria-label="Search Invoices"
          />
          <button
            type="button"
            className="finance-table__sort finance-toolbar__sort"
            onClick={() => setSortDesc((value) => !value)}
          >
            Due date {sortDesc ? '↓' : '↑'}
          </button>
        </div>

        <PageLoadState
          isLoading={isLoading}
          error={error}
          isEmpty={isEmpty}
          emptyTitle={q || filter !== 'all' ? 'No matching invoices' : 'No invoices yet'}
          emptyDescription="Create your first invoice to start billing customers."
          loadingLabel="Loading invoices…"
        >
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Customer</th>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Outstanding</th>
                  <th>
                    <button
                      type="button"
                      className="finance-table__sort"
                      onClick={() => setSortDesc((value) => !value)}
                    >
                      Due {sortDesc ? '↓' : '↑'}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleDrafts.map((draft) => (
                  <FinanceWorkspaceDraftRow
                    key={`draft-${draft.id}`}
                    draft={draft}
                    colSpan={7}
                    entityLabel="Invoice"
                  />
                ))}
                {visibleInvoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className={invoice.status === 'cancelled' ? 'finance-table__row--muted' : ''}
                  >
                    <td>
                      <Link href={`/finance/invoices/${invoice.id}`} className="finance-link">
                        {invoice.displayOfficialInvoiceNumber}
                      </Link>
                      {isSyncPending(invoice) ? (
                        <StatusBadge label="Sync Pending" tone="sync" className="finance-sync-badge" />
                      ) : null}
                    </td>
                    <td>
                      <Link href={`/crm/${invoice.customerId}`} className="finance-link">
                        {invoice.customerName}
                      </Link>
                    </td>
                    <td>
                      {invoice.jobId ? (
                        <Link href={`/jobs/${invoice.jobId}`} className="finance-link">
                          {invoice.jobTitle}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={`finance-status finance-status--${invoice.status}`}>
                        {formatStatus(invoice.status)}
                      </span>
                      {isInvoiceDraft(invoice) ? (
                        <StatusBadge label="Draft" tone="info" className="finance-draft-badge" />
                      ) : null}
                      {invoice.isOverdue ? (
                        <span className="finance-badge--overdue"> · Overdue</span>
                      ) : null}
                    </td>
                    <td className="tabular-nums">
                      {formatInvoiceMoney(invoice, invoice.totalCents)}
                    </td>
                    <td className="tabular-nums">
                      {formatInvoiceMoney(invoice, invoice.outstandingCents)}
                    </td>
                    <td>
                      {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PageLoadState>
      </Panel>
    </div>
  );
}
