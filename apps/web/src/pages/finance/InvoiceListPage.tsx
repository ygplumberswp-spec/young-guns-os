import { useMemo, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { Button, PageHeader, PageLoadState, Panel } from '@titan/ui';
import { formatMoney, INVOICE_STATUS_OPTIONS, type InvoiceSummary } from '@titan/shared';
import { fetchInvoices } from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canAccessFinance, canManageFinance } from '../../features/finance/utils';

function formatStatus(status: InvoiceSummary['status']): string {
  return INVOICE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function InvoiceListPage() {
  const { accessToken, user } = useAuth();
  const search = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(() => searchParams.get('overdueOnly') === '1');

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
        title="Finance"
        description="Quotes, invoices, and payment records for your company."
        actions={
          canWrite ? (
            <Link href="/finance/invoices/new">
              <Button>New invoice</Button>
            </Link>
          ) : undefined
        }
      />
      <FinanceNav />

      <Panel title="Invoices">
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
        </div>

        <PageLoadState
          isLoading={isLoading}
          error={error}
          isEmpty={(invoices?.length ?? 0) === 0}
          emptyTitle={q || status || overdueOnly ? 'No matching invoices' : 'No invoices yet'}
          emptyDescription="Create your first invoice to start billing customers."
          emptyAction={
            canWrite ? (
              <Link href="/finance/invoices/new">
                <Button>New invoice</Button>
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
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {(invoices ?? []).map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <Link href={`/finance/invoices/${invoice.id}`} className="finance-link">
                        {invoice.displayInvoiceNumber}
                      </Link>
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
                    <td className="tabular-nums">{formatMoney(invoice.totalCents ?? invoice.amountCents, invoice.currency)}</td>
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
