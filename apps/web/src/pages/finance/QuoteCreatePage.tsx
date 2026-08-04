import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button, Input } from '@titan/ui';
import type { FinanceCustomerSearchResult, JobSummary, QuoteStatus } from '@titan/shared';
import { QUOTE_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomer } from '../../lib/crm-api';
import { createQuote } from '../../lib/finance-api';
import { fetchJobs } from '../../lib/jobs-api';
import { CustomerSearchField } from '../../features/finance/CustomerSearchField';
import { FinanceLineItemsEditor } from '../../features/finance/FinanceLineItemsEditor';
import {
  newFinanceEditorLine,
  parseEditorLinesForApi,
  type FinanceEditorLine,
} from '../../features/finance/finance-editor-utils';
import { fetchDraft } from '../../lib/drafts-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canManageFinance, newFinanceClientActionId } from '../../features/finance/utils';
import { PageHeader } from '../../components/ux';
import { useFormDraftShell } from '../../hooks/useFormDraftShell';
import { useTitanNotify } from '../../components/ux/TitanNotifications';

export function QuoteCreatePage() {
  const { accessToken, user } = useAuth();
  const { invalidateQuotes } = useStaffMutationInvalidation();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [selectedCustomer, setSelectedCustomer] = useState<FinanceCustomerSearchResult | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const customerId = selectedCustomer?.id ?? '';
  const [jobId, setJobId] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<QuoteStatus>('draft');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [scopeOfWork, setScopeOfWork] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [lines, setLines] = useState<FinanceEditorLine[]>([newFinanceEditorLine()]);
  const [belowFloorOverride, setBelowFloorOverride] = useState(false);
  const [belowFloorReason, setBelowFloorReason] = useState('');

  const [clientActionId] = useState(() => newFinanceClientActionId('quote'));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageFinance(user.permissions) : false;

  const draftShell = useFormDraftShell({
    accessToken,
    userId: user?.id,
    recordType: 'quote',
    enabled: canWrite && !isLoading,
    getPayload: () => ({
      customerId,
      jobId,
      title,
      status,
      validUntil,
      notes,
      scopeOfWork,
      exclusions,
      paymentTerms,
      lines,
      belowFloorOverride,
      belowFloorReason,
    }),
    getMeta: () => ({
      title: title || 'New quote',
      customerLabel: selectedCustomer?.name ?? null,
      completionPct: title.trim() && customerId ? 40 : customerId ? 20 : 5,
    }),
  });

  const { notify } = useTitanNotify();

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
        const jobData = await fetchJobs(accessToken);
        if (cancelled) return;

        setJobs(jobData);
        const params = new URLSearchParams(search);
        const preCustomerId = params.get('customerId');
        const preJobId = params.get('jobId');
        const prefillJob =
          preJobId != null ? jobData.find((job) => job.id === preJobId) ?? null : null;

        const customerToLoad = preCustomerId ?? prefillJob?.customerId ?? null;
        if (customerToLoad) {
          const customer = await fetchCustomer(accessToken, customerToLoad);
          if (!cancelled) {
            setSelectedCustomer({
              id: customer.id,
              name: customer.name,
              companyName: customer.companyName,
              email: customer.email,
              phone: customer.phone,
              xeroContactId: customer.xeroContactId,
            });
          }
        }

        if (!cancelled && prefillJob) {
          setJobId(prefillJob.id);
          setTitle(prefillJob.title);
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
      if (cancelled || draft.recordType !== 'quote') return;
      const payload = draft.payload;
      if (typeof payload.jobId === 'string') setJobId(payload.jobId);
      if (typeof payload.title === 'string') setTitle(payload.title);
      if (typeof payload.status === 'string') setStatus(payload.status as QuoteStatus);
      if (typeof payload.validUntil === 'string') setValidUntil(payload.validUntil);
      if (typeof payload.notes === 'string') setNotes(payload.notes);
      if (typeof payload.scopeOfWork === 'string') setScopeOfWork(payload.scopeOfWork);
      if (typeof payload.exclusions === 'string') setExclusions(payload.exclusions);
      if (typeof payload.paymentTerms === 'string') setPaymentTerms(payload.paymentTerms);
      if (Array.isArray(payload.lines)) setLines(payload.lines as FinanceEditorLine[]);
      if (typeof payload.belowFloorOverride === 'boolean') {
        setBelowFloorOverride(payload.belowFloorOverride);
      }
      if (typeof payload.belowFloorReason === 'string') {
        setBelowFloorReason(payload.belowFloorReason);
      }
      if (typeof payload.customerId === 'string') {
        void fetchCustomer(accessToken, payload.customerId).then((customer) => {
          if (cancelled) return;
          setSelectedCustomer({
            id: customer.id,
            name: customer.name,
            companyName: customer.companyName,
            email: customer.email,
            phone: customer.phone,
            xeroContactId: customer.xeroContactId,
          });
        });
      }
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
    title,
    status,
    validUntil,
    notes,
    scopeOfWork,
    exclusions,
    paymentTerms,
    lines,
    belowFloorOverride,
    belowFloorReason,
    draftShell,
  ]);

  const customerJobs = jobs.filter((job) => job.customerId === customerId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !customerId) return;

    setError(null);

    if (belowFloorOverride && !belowFloorReason.trim()) {
      setError('A reason is required when overriding the profit floor');
      return;
    }

    const lineItems = parseEditorLinesForApi(lines);
    if (!lineItems) {
      setError('Add at least one line item with a description and unit price');
      return;
    }

    setIsSaving(true);

    try {
      const quote = await createQuote(accessToken, {
        customerId,
        jobId: jobId || null,
        title,
        status,
        validUntil: validUntil ? new Date(validUntil).toISOString() : null,
        notes: notes.trim() || null,
        scopeOfWork: scopeOfWork.trim() || null,
        exclusions: exclusions.trim() || null,
        paymentTerms: paymentTerms.trim() || null,
        lineItems,
        belowFloorOverride,
        belowFloorReason: belowFloorOverride ? belowFloorReason.trim() : null,
        clientActionId,
      });
      invalidateQuotes();
      draftShell.markSubmitted();
      notify({ variant: 'saved', message: 'Quote created', dedupeKey: 'quote-created' });
      navigate(`/finance/quotes/${quote.id}`);
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
        title="New Quote"
        description="Create a quote with searchable customers, line items and VAT totals."
        guardNavigation={draftShell.guard.guardNavigation}
      />
      <FinanceNav />
      {draftShell.autosave.statusLabel ? (
        <p className="finance-draft-status">{draftShell.autosave.statusLabel}</p>
      ) : null}
      {draftShell.guard.unsavedChangesModal}
      {error ? <p className="form-error">{error}</p> : null}

      <form className="finance-form finance-form--wide" onSubmit={(event) => void handleSubmit(event)}>
        {accessToken ? (
          <CustomerSearchField
            accessToken={accessToken}
            value={selectedCustomer}
            onChange={(customer) => {
              setSelectedCustomer(customer);
              setJobId('');
            }}
          />
        ) : null}

        <label className="titan-input-group">
          <span className="titan-input-label">Job (optional)</span>
          <select
            className="titan-input"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            disabled={!customerId}
          >
            <option value="">No linked job</option>
            {customerJobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
        </label>

        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <label className="titan-input-group">
          <span className="titan-input-label">Status</span>
          <select
            className="titan-input"
            value={status}
            onChange={(e) => setStatus(e.target.value as QuoteStatus)}
          >
            {QUOTE_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Valid Until"
          type="datetime-local"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
        />

        <FinanceLineItemsEditor lines={lines} onChange={setLines} />

        <label className="titan-input-group">
          <span className="titan-input-label">Scope of work (optional)</span>
          <textarea
            className="titan-input finance-textarea"
            rows={3}
            value={scopeOfWork}
            onChange={(e) => setScopeOfWork(e.target.value)}
          />
        </label>
        <label className="titan-input-group">
          <span className="titan-input-label">Exclusions (optional)</span>
          <textarea
            className="titan-input finance-textarea"
            rows={2}
            value={exclusions}
            onChange={(e) => setExclusions(e.target.value)}
          />
        </label>
        <label className="titan-input-group">
          <span className="titan-input-label">Payment terms (optional)</span>
          <textarea
            className="titan-input finance-textarea"
            rows={2}
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
          />
        </label>
        <label className="titan-input-group">
          <span className="titan-input-label">Notes (optional)</span>
          <textarea
            className="titan-input finance-textarea"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <label className="finance-toolbar__check checkbox-row">
          <input
            type="checkbox"
            checked={belowFloorOverride}
            onChange={(e) => setBelowFloorOverride(e.target.checked)}
          />
          Override profit floor (requires a reason)
        </label>
        {belowFloorOverride ? (
          <label className="titan-input-group">
            <span className="titan-input-label">Override reason</span>
            <textarea
              className="titan-input finance-textarea"
              rows={2}
              value={belowFloorReason}
              onChange={(e) => setBelowFloorReason(e.target.value)}
              required={belowFloorOverride}
            />
          </label>
        ) : null}

        <Button type="submit" disabled={isSaving || !title.trim() || !customerId}>
          {isSaving ? 'Creating…' : 'Create quote'}
        </Button>
      </form>
    </div>
  );
}
