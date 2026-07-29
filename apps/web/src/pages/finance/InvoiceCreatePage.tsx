import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, Input, PageHeader } from '@titan/ui';
import type { CustomerSummary, InvoiceStatus, JobSummary, QuoteSummary } from '@titan/shared';
import { parseMoneyInput, INVOICE_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomers } from '../../lib/crm-api';
import { createInvoice, fetchQuotes } from '../../lib/finance-api';
import { fetchJobs } from '../../lib/jobs-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canManageFinance } from '../../features/finance/utils';

export function InvoiceCreatePage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [jobId, setJobId] = useState('');
  const [quoteId, setQuoteId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<InvoiceStatus>('draft');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageFinance(user.permissions) : false;

  useEffect(() => {
    if (user && !canWrite) navigate('/finance/invoices');
  }, [canWrite, navigate, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const [customerData, jobData, quoteData] = await Promise.all([
          fetchCustomers(accessToken),
          fetchJobs(accessToken),
          fetchQuotes(accessToken),
        ]);

        if (!cancelled) {
          setCustomers(customerData);
          setJobs(jobData);
          setQuotes(quoteData);
          setCustomerId(customerData[0]?.id ?? '');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load form data');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadData();
    return () => { cancelled = true; };
  }, [accessToken]);

  const customerJobs = jobs.filter((job) => job.customerId === customerId);
  const customerQuotes = quotes.filter((quote) => quote.customerId === customerId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !customerId) return;

    const amountCents = parseMoneyInput(amount);
    if (amountCents === null || amountCents <= 0) {
      setError('Enter a valid amount greater than zero');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await createInvoice(accessToken, {
        customerId,
        jobId: jobId || null,
        quoteId: quoteId || null,
        title,
        status,
        amountCents,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        notes: notes.trim() || null,
      });
      navigate('/finance/invoices');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create invoice');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading form…</p>;

  return (
    <div className="finance-page">
      <PageHeader
        title="New invoice"
        description="Create an invoice linked to a customer and optional job or quote."
        actions={<Link href="/finance/invoices"><Button variant="secondary">Back to invoices</Button></Link>}
      />
      <FinanceNav />
      {error ? <p className="form-error">{error}</p> : null}

      {customers.length === 0 ? (
        <p className="page-muted">Add a customer before creating an invoice.</p>
      ) : (
        <form className="finance-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="titan-input-group">
            <span className="titan-input-label">Customer</span>
            <select className="titan-input" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setJobId(''); setQuoteId(''); }} required>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Job (optional)</span>
            <select className="titan-input" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">No linked job</option>
              {customerJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
            </select>
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Quote (optional)</span>
            <select className="titan-input" value={quoteId} onChange={(e) => setQuoteId(e.target.value)}>
              <option value="">No linked quote</option>
              {customerQuotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.quoteNumber} · {quote.title}</option>)}
            </select>
          </label>
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Input label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
          <label className="titan-input-group">
            <span className="titan-input-label">Status</span>
            <select className="titan-input" value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus)}>
              {INVOICE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <Input label="Due date" type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <label className="titan-input-group">
            <span className="titan-input-label">Notes</span>
            <textarea className="titan-input finance-textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <Button type="submit" disabled={isSaving || !title.trim()}>{isSaving ? 'Creating…' : 'Create invoice'}</Button>
        </form>
      )}
    </div>
  );
}
