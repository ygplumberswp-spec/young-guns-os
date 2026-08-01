import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { LoadingState, Panel } from '@titan/ui';
import type { PaymentDetail } from '@titan/shared';
import { formatMoney, PAYMENT_METHOD_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchPayment } from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canAccessFinance } from '../../features/finance/utils';

function formatMethod(method: PaymentDetail['method']): string {
  return PAYMENT_METHOD_OPTIONS.find((option) => option.value === method)?.label ?? method;
}

export function PaymentDetailPage() {
  const [, params] = useRoute('/finance/payments/:id');
  const paymentId = params?.id ?? '';
  const { accessToken, user } = useAuth();

  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !paymentId || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchPayment(accessToken, paymentId);
        if (!cancelled) setPayment(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load payment');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, paymentId, canView]);

  if (!canView) {
    return (
      <div className="finance-page">
        <PageHeader title="Payment" description="You do not have permission to view finance." />
      </div>
    );
  }

  if (isLoading) {
    return <LoadingState label="Loading payment…" />;
  }

  if (error && !payment) {
    return (
      <div className="finance-page">
        <PageHeader title="Payment" description="Payment detail" />
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!payment) {
    return null;
  }

  return (
    <div className="finance-page">
      <PageHeader
        title={`Payment · ${formatMoney(payment.amountCents, payment.currency)}`}
        description={`${payment.customerName} · ${payment.invoiceNumber}`}
      />
      <FinanceNav />

      {error ? <p className="form-error">{error}</p> : null}

      <div className="finance-detail">
        <Panel title="Summary">
          <dl className="finance-detail-list">
            <div>
              <dt>Amount</dt>
              <dd className="tabular-nums">{formatMoney(payment.amountCents, payment.currency)}</dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>{formatMethod(payment.method)}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{payment.reference ?? '—'}</dd>
            </div>
            <div>
              <dt>Paid at</dt>
              <dd>{new Date(payment.paidAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Invoice</dt>
              <dd>
                <Link href={`/finance/invoices/${payment.invoiceId}`} className="finance-link">
                  {payment.invoiceNumber} · {payment.invoiceTitle}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Customer</dt>
              <dd>{payment.customerName}</dd>
            </div>
            <div>
              <dt>Receipt number</dt>
              <dd className="tabular-nums">{payment.receiptNumber ?? '—'}</dd>
            </div>
            <div>
              <dt>Xero payment</dt>
              <dd>{payment.xeroPaymentId ?? 'Not synced'}</dd>
            </div>
          </dl>
        </Panel>

        {payment.notes ? (
          <Panel title="Notes">
            <p className="page-muted">{payment.notes}</p>
          </Panel>
        ) : null}

        {payment.receipt ? (
          <Panel title="Receipt">
            <dl className="finance-detail-list">
              <div>
                <dt>Receipt number</dt>
                <dd className="tabular-nums">{payment.receipt.receiptNumber}</dd>
              </div>
              <div>
                <dt>Issued</dt>
                <dd>{new Date(payment.receipt.issuedAt).toLocaleString()}</dd>
              </div>
            </dl>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: '0.8125rem',
                background: 'var(--titan-surface-muted)',
                border: '1px solid var(--titan-border-subtle)',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                margin: 0,
              }}
            >
              {JSON.stringify(payment.receipt.payload, null, 2)}
            </pre>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
