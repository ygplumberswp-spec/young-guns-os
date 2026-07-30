import { useMemo } from 'react';
import { Link } from 'wouter';
import { Button, PageHeader, PageLoadState, Panel } from '@titan/ui';
import { formatMoney, PAYMENT_METHOD_OPTIONS, type PaymentSummary } from '@titan/shared';
import { fetchPayments } from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canAccessFinance, canManageFinance } from '../../features/finance/utils';

function formatMethod(method: PaymentSummary['method']): string {
  return PAYMENT_METHOD_OPTIONS.find((option) => option.value === method)?.label ?? method;
}

export function PaymentListPage() {
  const { accessToken, user } = useAuth();

  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFinance(user.permissions) : false), [user]);

  const { data: payments, error, isLoading } = useStaffCachedQuery({
    queryKey: 'finance/payments',
    enabled: canView,
    fetcher: async () => fetchPayments(accessToken!),
  });

  if (!canView) {
    return (
      <div className="finance-page">
        <PageHeader title="Payments" description="You do not have permission to view finance." />
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
            <Link href="/finance/payments/new">
              <Button>Record payment</Button>
            </Link>
          ) : undefined
        }
      />
      <FinanceNav />

      <PageLoadState
        isLoading={isLoading}
        error={error}
        isEmpty={(payments?.length ?? 0) === 0}
        emptyTitle="No payments yet"
        emptyDescription="Record a payment against an invoice to track revenue."
        emptyAction={
          canWrite ? (
            <Link href="/finance/payments/new">
              <Button>Record payment</Button>
            </Link>
          ) : undefined
        }
        loadingLabel="Loading payments…"
      >
        <Panel title="Payments">
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Paid</th>
                </tr>
              </thead>
              <tbody>
                {(payments ?? []).map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      {payment.invoiceNumber} · {payment.invoiceTitle}
                    </td>
                    <td>{payment.customerName}</td>
                    <td>{formatMoney(payment.amountCents, payment.currency)}</td>
                    <td>{formatMethod(payment.method)}</td>
                    <td>{payment.reference ?? '—'}</td>
                    <td>{new Date(payment.paidAt).toLocaleString()}</td>
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
