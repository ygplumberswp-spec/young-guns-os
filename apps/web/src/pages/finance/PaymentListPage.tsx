import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel } from '@titan/ui';
import { formatMoney, PAYMENT_METHOD_OPTIONS, type PaymentSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchPayments } from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canAccessFinance, canManageFinance } from '../../features/finance/utils';

function formatMethod(method: PaymentSummary['method']): string {
  return PAYMENT_METHOD_OPTIONS.find((option) => option.value === method)?.label ?? method;
}

export function PaymentListPage() {
  const { accessToken, user } = useAuth();
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFinance(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadPayments() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchPayments(accessToken);
        if (!cancelled) setPayments(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load payments');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadPayments();
    return () => { cancelled = true; };
  }, [accessToken, canView]);

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

      {isLoading ? <p className="page-muted">Loading payments…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error ? (
        payments.length === 0 ? (
          <EmptyState
            title="No payments yet"
            description="Record a payment against an invoice to track revenue."
            action={
              canWrite ? (
                <Link href="/finance/payments/new">
                  <Button>Record payment</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
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
                  {payments.map((payment) => (
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
        )
      ) : null}
    </div>
  );
}
