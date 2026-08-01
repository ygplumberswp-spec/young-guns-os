import { useMemo, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { PageLoadState, Panel } from '@titan/ui';
import { formatMoney, INVOICE_STATUS_OPTIONS, type InvoiceSummary } from '@titan/shared';
import { fetchInvoices } from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canAccessFinance, canManageFinance } from '../../features/finance/utils';
import {
  MoreMenu,
  PageHeader,
  PrimaryAction,
  StatusBadge,
} from '../../components/ux';

function formatStatus(status: InvoiceSummary['status']): string {
  return INVOICE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function isSyncPending(invoice: InvoiceSummary): boolean {
  return invoice.numberAuthority === 'internal_pending_xero' && !invoice.xeroInvoiceNumber;
}

export function InvoiceListPage() {
  const { accessToken, user } = useAuth();
  const search = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(() => searchParams.get('overdueOnly') === '1');
  const [hideCancelled, setHideCancelled] = useState(true);
  const [sortDesc, setSortDesc] = useState(true);

  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFinance(user.permissions) : false), [user]);

  const {
    data: invoices,
    error,
    isLoading,
  } = useStaffCachedQuery({
    queryKey: `finance/invoices:${q.trim()}:${status}:${overdueOnly ? 1 : 0}`,
    enabled: canView,
    fetcher: async () =>
      fetchInvoices(accessToken!, {
        q: q.trim() || undefined,
        status: status || undefined,
        overdueOnly,
      }),
  });

  const visibleInvoices = useMemo(() => {
    let rows = [...(invoices ?? [])];
    if (hideCancelled) {
      rows = rows.filter((invoice) => invoice.status !== 'cancelled');
    }
    rows.sort((a, b) => {
      const aTime = new Date(a.dueDate ?? a.createdAt).getTime();
      const bTime = new Date(b.dueDate ?? b.createdAt).getTime();
      return sortDesc ? bTime - aTime : aTime - bTime;
    });
    return rows;
  }, [hideCancelled, invoices, sortDesc]);

  if (!canView) {
    return (
      <div className="finance-page">
        <PageHeader title="Invoices" description="You do not have permission to view finance." />
      </div>
    );
  }

  return (
    <div className="finance-page">
      <PageHeader
        title="Invoices"
        description="Customer billing records synced with finance integrations."
        breadcrumbs={[
          { label: 'Finance', href: '/finance/quotes' },
          { label: 'Invoices' },
        ]}
        actions={
          canWrite ? (
            <Link href="/finance/invoices/new">
              <PrimaryAction>New invoice</PrimaryAction>
            </Link>
          ) : undefined
        }
      />
      <FinanceNav />

      <Panel title="Invoice list">
        <div className="finance-toolbar">
          <input
            className="titan-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search number or title…"
            aria-label="Search invoices"
          />
          <select
            className="titan-input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {INVOICE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="finance-toolbar__check">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
            />
            Overdue only
          </label>
          <label className="finance-toolbar__check">
            <input
              type="checkbox"
              checked={hideCancelled}
              onChange={(e) => setHideCancelled(e.target.checked)}
            />
            Hide cancelled
          </label>
          <MoreMenu
            items={[
              {
                id: 'sort-date',
                label: sortDesc ? 'Sort: newest due first' : 'Sort: oldest due first',
                onSelect: () => setSortDesc((value) => !value),
              },
            ]}
          />
        </div>

        <PageLoadState
          isLoading={isLoading}
          error={error}
          isEmpty={visibleInvoices.length === 0}
          emptyTitle={q || status || overdueOnly ? 'No matching invoices' : 'No invoices yet'}
          emptyDescription="Create your first invoice to start billing customers."
          emptyAction={
            canWrite ? (
              <Link href="/finance/invoices/new">
                <PrimaryAction>New invoice</PrimaryAction>
              </Link>
            ) : undefined
          }
          loadingLabel="Loading invoices…"
        >
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Title</th>
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
                {visibleInvoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className={invoice.status === 'cancelled' ? 'finance-table__row--muted' : ''}
                  >
                    <td>
                      <Link href={`/finance/invoices/${invoice.id}`} className="finance-link">
                        {invoice.displayInvoiceNumber}
                      </Link>
                      {isSyncPending(invoice) ? (
                        <StatusBadge label="Sync pending" tone="sync" className="finance-sync-badge" />
                      ) : null}
                    </td>
                    <td>
                      <Link href={`/finance/invoices/${invoice.id}`} className="finance-link">
                        {invoice.title}
                      </Link>
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
                      {invoice.isOverdue ? (
                        <span className="finance-badge--overdue"> · Overdue</span>
                      ) : null}
                    </td>
                    <td className="tabular-nums">
                      {formatMoney(invoice.totalCents ?? invoice.amountCents, invoice.currency)}
                    </td>
                    <td className="tabular-nums">
                      {formatMoney(invoice.outstandingCents, invoice.currency)}
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
