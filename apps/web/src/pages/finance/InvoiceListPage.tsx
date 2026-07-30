import { useMemo } from 'react';
import { Link } from 'wouter';
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

  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFinance(user.permissions) : false), [user]);

  const { data: invoices, error, isLoading } = useStaffCachedQuery({
    queryKey: 'finance/invoices',
    enabled: canView,
    fetcher: async () => fetchInvoices(accessToken!),
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

      <PageLoadState
        isLoading={isLoading}
        error={error}
        isEmpty={(invoices?.length ?? 0) === 0}
        emptyTitle="No invoices yet"
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
        <Panel title="Invoices">
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Title</th>
                  <th>Customer</th>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {(invoices ?? []).map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.invoiceNumber}</td>
                    <td>{invoice.title}</td>
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
                    </td>
                    <td>{formatMoney(invoice.amountCents, invoice.currency)}</td>
                    <td>{formatMoney(invoice.amountPaidCents, invoice.currency)}</td>
                    <td>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </PageLoadState>
    </div>
  );
}
