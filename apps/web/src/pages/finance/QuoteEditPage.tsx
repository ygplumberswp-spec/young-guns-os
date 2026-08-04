import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Button, Input } from '@titan/ui';
import type { JobSummary, QuoteStatus } from '@titan/shared';
import { QUOTE_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchQuote, updateQuote } from '../../lib/finance-api';
import { fetchJobs } from '../../lib/jobs-api';
import { FinanceLineItemsEditor } from '../../features/finance/FinanceLineItemsEditor';
import {
  newFinanceEditorLine,
  parseEditorLinesForApi,
  type FinanceEditorLine,
} from '../../features/finance/finance-editor-utils';
import { useAuth } from '../../lib/auth-context';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canManageFinance } from '../../features/finance/utils';
import { PageHeader } from '../../components/ux';
import { useFormDraftShell } from '../../hooks/useFormDraftShell';
import { useTitanNotify } from '../../components/ux/TitanNotifications';

export function QuoteEditPage() {
  const [, params] = useRoute('/finance/quotes/:id/edit');
  const quoteId = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const { invalidateQuotes } = useStaffMutationInvalidation();
  const [, navigate] = useLocation();

  const [jobs, setJobs] = useState<JobSummary[]>([]);
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
  const [customerId, setCustomerId] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageFinance(user.permissions) : false;

  const draftShell = useFormDraftShell({
    accessToken,
    userId: user?.id,
    recordType: 'quote',
    recordId: quoteId,
    enabled: canWrite && !isLoading && Boolean(quoteId),
    getPayload: () => ({
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
      customerId,
    }),
    getMeta: () => ({
      title: title || 'Edit quote',
      completionPct: title.trim() ? 60 : 30,
    }),
  });

  const { notify } = useTitanNotify();

  useEffect(() => {
    if (user && !canWrite) navigate(`/finance/quotes/${quoteId}`);
  }, [canWrite, navigate, quoteId, user]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken || !quoteId || !canWrite) {
        setIsLoading(false);
        return;
      }

      try {
        const [quote, jobData] = await Promise.all([
          fetchQuote(accessToken, quoteId),
          fetchJobs(accessToken),
        ]);

        if (cancelled) return;

        if (quote.isImmutable) {
          navigate(`/finance/quotes/${quoteId}`);
          return;
        }

        setJobs(jobData);
        setCustomerId(quote.customerId);
        setJobId(quote.jobId ?? '');
        setTitle(quote.title);
        setStatus(quote.status);
        setValidUntil(quote.validUntil ? quote.validUntil.slice(0, 16) : '');
        setNotes(quote.internalNotes ?? '');
        setScopeOfWork(quote.scopeOfWork ?? '');
        setExclusions(quote.exclusions ?? '');
        setPaymentTerms(quote.paymentTerms ?? '');
        setBelowFloorOverride(quote.belowFloorOverride);
        setBelowFloorReason(quote.belowFloorReason ?? '');
        setLines(
          quote.lineItems.length
            ? quote.lineItems.map((line) => ({
                key: line.id,
                category: line.category,
                description: line.description,
                quantity: String(line.quantity),
                unitPrice: (line.unitPriceCents / 100).toFixed(2),
                unitCost:
                  line.unitCostCents != null ? (line.unitCostCents / 100).toFixed(2) : '',
                vatRateBps: String(line.vatRateBps),
              }))
            : [newFinanceEditorLine()],
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load quote');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canWrite, navigate, quoteId]);

  useEffect(() => {
    if (isLoading) return;
    draftShell.touchField();
  }, [
    isLoading,
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
    if (!accessToken || !canWrite || !quoteId) return;

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
      await updateQuote(accessToken, quoteId, {
        jobId: jobId || null,
        title,
        status,
        validUntil: validUntil ? new Date(validUntil).toISOString() : null,
        notes: notes.trim() || null,
        internalNotes: notes.trim() || null,
        scopeOfWork: scopeOfWork.trim() || null,
        exclusions: exclusions.trim() || null,
        paymentTerms: paymentTerms.trim() || null,
        lineItems,
        belowFloorOverride,
        belowFloorReason: belowFloorOverride ? belowFloorReason.trim() : null,
      });
      invalidateQuotes();
      draftShell.markSubmitted();
      notify({ variant: 'saved', message: 'Quote updated', dedupeKey: `quote-updated-${quoteId}` });
      navigate(`/finance/quotes/${quoteId}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update quote');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading quote…</p>;

  return (
    <div className="finance-page">
      <PageHeader
        title="Edit Quote"
        description="Update draft quote lines, scope and approval status."
        backFallbackHref={`/finance/quotes/${quoteId}`}
        guardNavigation={draftShell.guard.guardNavigation}
      />
      <FinanceNav />
      {draftShell.autosave.statusLabel ? (
        <p className="finance-draft-status">{draftShell.autosave.statusLabel}</p>
      ) : null}
      {draftShell.guard.unsavedChangesModal}
      {error ? <p className="form-error">{error}</p> : null}

      <form className="finance-form finance-form--wide" onSubmit={(event) => void handleSubmit(event)}>
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <label className="titan-input-group">
          <span className="titan-input-label">Job (optional)</span>
          <select className="titan-input" value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">No linked job</option>
            {customerJobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
        </label>
        <label className="titan-input-group">
          <span className="titan-input-label">Status</span>
          <select
            className="titan-input"
            value={status}
            onChange={(e) => setStatus(e.target.value as QuoteStatus)}
          >
            {QUOTE_STATUS_OPTIONS.filter((option) =>
              ['draft', 'internal_review', 'approved_for_sending', 'cancelled'].includes(option.value),
            ).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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
          <span className="titan-input-label">Scope of work</span>
          <textarea
            className="titan-input finance-textarea"
            rows={3}
            value={scopeOfWork}
            onChange={(e) => setScopeOfWork(e.target.value)}
          />
        </label>
        <label className="titan-input-group">
          <span className="titan-input-label">Exclusions</span>
          <textarea
            className="titan-input finance-textarea"
            rows={2}
            value={exclusions}
            onChange={(e) => setExclusions(e.target.value)}
          />
        </label>
        <label className="titan-input-group">
          <span className="titan-input-label">Payment terms</span>
          <textarea
            className="titan-input finance-textarea"
            rows={2}
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
          />
        </label>
        <label className="titan-input-group">
          <span className="titan-input-label">Notes</span>
          <textarea
            className="titan-input finance-textarea"
            rows={2}
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

        <Button type="submit" disabled={isSaving || !title.trim()}>
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </div>
  );
}
