import { useEffect, useState } from 'react';
import { PageHeader, Panel } from '@titan/ui';
import type { PortalFinanceCentre } from '@titan/shared';
import { PortalApiClientError, fetchPortalFinance } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';

export function PortalFinancePage() {
  const { accessToken } = usePortalAuth();
  const [finance, setFinance] = useState<PortalFinanceCentre | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void fetchPortalFinance(accessToken)
      .then(setFinance)
      .catch((err) => setError(err instanceof PortalApiClientError ? err.message : 'Unable to load finance data'));
  }, [accessToken]);

  return (
    <div className="portal-page">
      <PageHeader title="Invoices & payments" description="Invoice history, balances, and payment records." />
      {error ? <p className="form-error">{error}</p> : null}
      {finance ? (
        <>
          <Panel title="Outstanding balance">
            {(finance.outstandingBalanceCents / 100).toFixed(2)} {finance.currency}
          </Panel>
          <Panel title="Invoices">
            <ul className="portal-list">
              {finance.invoices.map((invoice) => (
                <li key={invoice.id}>
                  <strong>{invoice.invoiceNumber}</strong> — {invoice.status}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Payments">
            <ul className="portal-list">
              {finance.payments.map((payment) => (
                <li key={payment.id}>
                  <strong>{payment.invoiceNumber}</strong> — {(payment.amountCents / 100).toFixed(2)}
                </li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
