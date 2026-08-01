import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button, Input } from '@titan/ui';
import type { CustomerSummary, InvoiceStage, InvoiceStatus, JobSummary, QuoteSummary } from '@titan/shared';
import { parseMoneyInput, INVOICE_STAGE_OPTIONS, INVOICE_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomers } from '../../lib/crm-api';
import { createInvoice, fetchQuotes } from '../../lib/finance-api';
import { fetchJobs } from '../../lib/jobs-api';
import { fetchDraft } from '../../lib/drafts-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canManageFinance, newFinanceClientActionId } from '../../features/finance/utils';
import { PageHeader } from '../../components/ux';
import { useFormDraftShell } from '../../hooks/useFormDraftShell';
import { useTitanNotify } from '../../components/ux/TitanNotifications';

export function InvoiceCreatePage() {
  const { accessToken, user } = useAuth();
  const { invalidateInvoices } = useStaffMutationInvalidation();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [jobId, setJobId] = useState('');
  const [quoteId, setQuoteId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<InvoiceStatus>('draft');
  const [stage, setStage] = useState<InvoiceStage>('standard');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [clientActionId] = useState(() => newFinanceClientActionId('invoice'));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageFinance(user.permissions) : false;

  const draftShell = useFormDraftShell({
    accessToken,
    userId: user?.id,
    recordType: 'invoice',
    enabled: canWrite && !isLoading,
    getPayload: () => ({
      customerId,
      jobId,
      quoteId,
      title,
      amount,
      status,
      stage,
      dueDate,
      notes,
    }),
    getMeta: () => ({
      title: title || 'New invoice',
      customerLabel: customers.find((customer) => customer.id === customerId)?.name ?? null,
      completionPct: title.trim() && amount.trim() ? 50 : 20,
    }),
  });

  const { notify } = useTitanNotify();

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
          const params = new URLSearchParams(search);
          const preCustomerId = params.get('customerId');
          const preJobId = params.get('jobId');
          const prefillJob =
            preJobId != null ? jobData.find((job) => job.id === preJobId) ?? null : null;

          if (preCustomerId && customerData.some((customer) => customer.id === preCustomerId)) {
            setCustomerId(preCustomerId);
          } else if (prefillJob) {
            setCustomerId(prefillJob.customerId);
          } else {
            setCustomerId(customerData[0]?.id ?? '');
          }

          if (prefillJob) {
            setJobId(prefillJob.id);
            setTitle(prefillJob.title);
          }
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
    return () => {
      cancelled = true;
    };
  }, [accessToken, search]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const draftId = params.get('draftId');
    if (!accessToken || !draftId) return;

    let cancelled = false;
    void fetchDraft(accessToken, draftId).then((draft) => {
      if (cancelled || draft.recordType !== 'invoice') return;
      const payload = draft.payload;
      if (typeof payload.customerId === 'string') setCustomerId(payload.customerId);
      if (typeof payload.jobId === 'string') setJobId(payload.jobId);
      if (typeof payload.quoteId === 'string') setQuoteId(payload.quoteId);
      if (typeof payload.title === 'string') setTitle(payload.title);
      if (typeof payload.amount === 'string') setAmount(payload.amount);
      if (typeof payload.status === 'string') setStatus(payload.status as InvoiceStatus);
      if (typeof payload.stage === 'string') setStage(payload.stage as InvoiceStage);
      if (typeof payload.dueDate === 'string') setDueDate(payload.dueDate);
      if (typeof payload.notes === 'string') setNotes(payload.notes);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, search]);

  useEffect(() => {
    if (isLoading) return;
    draftShell.touchField();
  }, [
    isLoading,
    customerId,
    jobId,
    quoteId,
    title,
    amount,
    status,
    stage,
    dueDate,
    notes,
    draftShell,
  ]);

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
      const invoice = await createInvoice(accessToken, {
        customerId,
        jobId: jobId || null,
        quoteId: quoteId || null,
        title,
        status,
        stage,
        amountCents,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        notes: notes.trim() || null,
        clientActionId,
      });
      invalidateInvoices();
      draftShell.markSubmitted();
      notify({ variant: 'saved', message: 'Invoice created', dedupeKey: 'invoice-created' });
      navigate(`/finance/invoices/${invoice.id}`);
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
        showBack
        backFallbackHref="/finance/invoices"
        onBackNavigate={() => draftShell.guard.guardNavigation(() => navigate('/finance/invoices'))}
      />
      <FinanceNav />
      {draftShell.autosave.statusLabel ? (
        <p className="finance-draft-status">{draftShell.autosave.statusLabel}</p>
      ) : null}
      {draftShell.guard.unsavedChangesModal}
      {error ? <p className="form-error">{error}</p> : null}

      {customers.length === 0 ? (
        <p className="page-muted">Add a customer before creating an invoice.</p>
      ) : (
        <form className="finance-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="titan-input-group">
            <span className="titan-input-label">Customer</span>
            <select
              className="titan-input"
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setJobId('');
                setQuoteId('');
              }}
              required
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Job (optional)</span>
            <select
              className="titan-input"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
            >
              <option value="">No linked job</option>
              {customerJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Quote (optional)</span>
            <select
              className="titan-input"
              value={quoteId}
              onChange={(e) => setQuoteId(e.target.value)}
            >
              <option value="">No linked quote</option>
              {customerQuotes.map((quote) => (
                <option key={quote.id} value={quote.id}>
                  {quote.quoteNumber} · {quote.title}
                </option>
              ))}
            </select>
          </label>
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Input
            label="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
          <label className="titan-input-group">
            <span className="titan-input-label">Stage</span>
            <select
              className="titan-input"
              value={stage}
              onChange={(e) => setStage(e.target.value as InvoiceStage)}
            >
              {INVOICE_STAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Status</span>
            <select
              className="titan-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
            >
              {INVOICE_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Due date"
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <p className="page-muted">
            The invoice number shown here is an internal placeholder. The official invoice number
            is assigned only once Xero sync completes.
          </p>
          <label className="titan-input-group">
            <span className="titan-input-label">Notes</span>
            <textarea
              className="titan-input finance-textarea"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={isSaving || !title.trim()}>
            {isSaving ? 'Creating…' : 'Create invoice'}
          </Button>
        </form>
      )}
    </div>
  );
}
