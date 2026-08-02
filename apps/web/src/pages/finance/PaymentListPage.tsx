import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { PageLoadState, Panel } from '@titan/ui';
import { formatMoney, PAYMENT_METHOD_OPTIONS, type PaymentSummary } from '@titan/shared';
import { fetchPayments } from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { FinancePageHeader } from '../../features/finance/FinancePageHeader';
import {
  PAYMENT_LIST_FILTERS,
  paymentMatchesFilter,
  type PaymentListFilter,
} from '../../features/finance/finance-filters';
import { canAccessFinance, canManageFinance } from '../../features/finance/utils';
import { CompactFilterTabs, PageHeader } from '../../components/ux';

function formatMethod(method: PaymentSummary['method']): string {
  return PAYMENT_METHOD_OPTIONS.find((option) => option.value === method)?.label ?? method;
}

export function PaymentListPage() {
  const { accessToken, user } = useAuth();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<PaymentListFilter>('all');

  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFinance(user.permissions) : false), [user]);

  const {
    data: payments,
    error,
    isLoading,
  } = useStaffCachedQuery({
    queryKey: `finance/payments:${q.trim()}:${filter}`,
    enabled: canView,
    fetcher: async () => fetchPayments(accessToken!, { q: q.trim() || undefined }),
  });

  const visiblePayments = useMemo(
    () => (payments ?? []).filter((payment) => paymentMatchesFilter(payment, filter)),
    [filter, payments],
  );

  if (!canView) {
    return (
      <div className="finance-page">
        <PageHeader title="Payments" description="You do not have permission to view finance." />
      </div>
    );
  }

  return (
    <div className="finance-page">
      <FinancePageHeader canWrite={canWrite} />
      <FinanceNav />

      <Panel title="Payments">
        <CompactFilterTabs<PaymentListFilter>
          options={PAYMENT_LIST_FILTERS}
          value={filter}
          onChange={setFilter}
          ariaLabel="Payment filters"
          maxVisible={4}
        />

        <div className="finance-toolbar">
          <input
            className="titan-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search reference or notes…"
            aria-label="Search Payments"
          />
        </div>

        <PageLoadState
          isLoading={isLoading}
          error={error}
          isEmpty={visiblePayments.length === 0}
          emptyTitle={q || filter !== 'all' ? 'No matching payments' : 'No payments yet'}
          emptyDescription="Record a payment against an invoice to track revenue."
          loadingLabel="Loading payments…"
        >
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
                {visiblePayments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <Link href={`/finance/invoices/${payment.invoiceId}`} className="finance-link">
                        {payment.invoiceNumber} · {payment.invoiceTitle}
                      </Link>
                    </td>
                    <td>{payment.customerName}</td>
                    <td className="tabular-nums">
                      <Link href={`/finance/payments/${payment.id}`} className="finance-link">
                        {formatMoney(payment.amountCents, payment.currency)}
                      </Link>
                    </td>
                    <td>{formatMethod(payment.method)}</td>
                    <td>{payment.reference ?? '—'}</td>
                    <td>{new Date(payment.paidAt).toLocaleString()}</td>
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
