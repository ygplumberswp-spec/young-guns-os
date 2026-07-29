import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, Input, PageHeader } from '@titan/ui';
import type { CustomerSummary, JobSummary, QuoteStatus } from '@titan/shared';
import { parseMoneyInput, QUOTE_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomers } from '../../lib/crm-api';
import { createQuote } from '../../lib/finance-api';
import { fetchJobs } from '../../lib/jobs-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canManageFinance } from '../../features/finance/utils';

export function QuoteCreatePage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [jobId, setJobId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<QuoteStatus>('draft');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageFinance(user.permissions) : false;

  useEffect(() => {
    if (user && !canWrite) navigate('/finance/quotes');
  }, [canWrite, navigate, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const [customerData, jobData] = await Promise.all([
          fetchCustomers(accessToken),
          fetchJobs(accessToken),
        ]);

        if (!cancelled) {
          setCustomers(customerData);
          setJobs(jobData);
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
      await createQuote(accessToken, {
        customerId,
        jobId: jobId || null,
        title,
        status,
        amountCents,
        validUntil: validUntil ? new Date(validUntil).toISOString() : null,
        notes: notes.trim() || null,
      });
      navigate('/finance/quotes');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create quote');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading form…</p>;

  return (
    <div className="finance-page">
      <PageHeader
        title="New quote"
        description="Create a quote linked to a customer and optional job."
        actions={<Link href="/finance/quotes"><Button variant="secondary">Back to quotes</Button></Link>}
      />
      <FinanceNav />
      {error ? <p className="form-error">{error}</p> : null}

      {customers.length === 0 ? (
        <p className="page-muted">Add a customer before creating a quote.</p>
      ) : (
        <form className="finance-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="titan-input-group">
            <span className="titan-input-label">Customer</span>
            <select className="titan-input" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setJobId(''); }} required>
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
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Input label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
          <label className="titan-input-group">
            <span className="titan-input-label">Status</span>
            <select className="titan-input" value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus)}>
              {QUOTE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <Input label="Valid until" type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          <label className="titan-input-group">
            <span className="titan-input-label">Notes</span>
            <textarea className="titan-input finance-textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <Button type="submit" disabled={isSaving || !title.trim()}>{isSaving ? 'Creating…' : 'Create quote'}</Button>
        </form>
      )}
    </div>
  );
}
