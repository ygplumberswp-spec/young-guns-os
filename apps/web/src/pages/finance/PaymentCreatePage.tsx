import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { Button, Input } from '@titan/ui';
import type { InvoiceSummary, PaymentMethod } from '@titan/shared';
import { parseMoneyInput, PAYMENT_METHOD_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { createPayment, fetchInvoices } from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canManageFinance, newFinanceClientActionId } from '../../features/finance/utils';

export function PaymentCreatePage() {
  const { accessToken, user } = useAuth();
  const { invalidatePayments } = useStaffMutationInvalidation();
  const [, navigate] = useLocation();
  const search = useSearch();
  const preJobId = useMemo(() => new URLSearchParams(search).get('jobId'), [search]);
  const preInvoiceId = useMemo(() => new URLSearchParams(search).get('invoiceId'), [search]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('other');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [notes, setNotes] = useState('');
  const [clientActionId] = useState(() => newFinanceClientActionId('payment'));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageFinance(user.permissions) : false;

  useEffect(() => {
    if (user && !canWrite) navigate('/finance/payments');
  }, [canWrite, navigate, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadInvoices() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchInvoices(accessToken);
        const jobScoped = preJobId ? data.filter((invoice) => invoice.jobId === preJobId) : data;
        const openInvoices = jobScoped.filter(
          (invoice) => invoice.status !== 'cancelled' && invoice.status !== 'paid',
        );

        if (!cancelled) {
          setInvoices(openInvoices);
          const preferred =
            (preInvoiceId
              ? openInvoices.find((invoice) => invoice.id === preInvoiceId) ?? null
              : null) ?? openInvoices[0] ?? null;
          setInvoiceId(preferred?.id ?? '');
          if (preferred && preferred.outstandingCents > 0) {
            setAmount((preferred.outstandingCents / 100).toFixed(2));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load invoices');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadInvoices();
    return () => {
      cancelled = true;
    };
  }, [accessToken, preInvoiceId, preJobId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !invoiceId) return;

    const amountCents = parseMoneyInput(amount);
    if (amountCents === null || amountCents <= 0) {
      setError('Enter a valid amount greater than zero');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const payment = await createPayment(accessToken, {
        invoiceId,
        amountCents,
        method,
        reference: reference.trim() || null,
        paidAt: paidAt ? new Date(paidAt).toISOString() : undefined,
        notes: notes.trim() || null,
        clientActionId,
      });
      invalidatePayments();
      navigate(`/finance/payments/${payment.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to record payment');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading form…</p>;

  return (
    <div className="finance-page">
      <PageHeader
        title="Record Payment"
        description="Record a payment against an invoice."
      />
      <FinanceNav />
      {error ? <p className="form-error">{error}</p> : null}

      {invoices.length === 0 ? (
        <div>
          <p className="page-muted">Create an open invoice before recording a payment.</p>
          <Link href="/finance/invoices/new">
            <Button>New Invoice</Button>
          </Link>
        </div>
      ) : (
        <form className="finance-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="titan-input-group">
            <span className="titan-input-label">Invoice</span>
            <select
              className="titan-input"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              required
            >
              {invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoiceNumber} · {invoice.title} · {invoice.customerName}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
          <label className="titan-input-group">
            <span className="titan-input-label">Method</span>
            <select
              className="titan-input"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <Input
            label="Paid At"
            type="datetime-local"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
          <label className="titan-input-group">
            <span className="titan-input-label">Notes</span>
            <textarea
              className="titan-input finance-textarea"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={isSaving || !invoiceId}>
            {isSaving ? 'Saving…' : 'Record payment'}
          </Button>
        </form>
      )}
    </div>
  );
}
