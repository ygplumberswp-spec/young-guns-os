import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Button, Input } from '@titan/ui';
import type { CustomerSummary, JobSummary, QuoteLineCategory, QuoteStatus } from '@titan/shared';
import { canEditQuote, parseMoneyInput, QUOTE_LINE_CATEGORY_OPTIONS, QUOTE_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomers } from '../../lib/crm-api';
import { fetchQuote, updateQuote, updateQuoteBillingRecipient } from '../../lib/finance-api';
import { fetchJobs } from '../../lib/jobs-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canManageFinance } from '../../features/finance/utils';
import { PageHeader } from '../../components/ux';
import { useFormDraftShell } from '../../hooks/useFormDraftShell';
import { useTitanNotify } from '../../components/ux/TitanNotifications';
import { BillingRecipientPanel } from '../../features/finance/BillingRecipientPanel';
import {
  billingValuesFromRecord,
  defaultBillingRecipientValues,
  resolveBillingCustomerName,
} from '../../features/finance/billing-recipient-state';
import { useFinanceDraftAuraContext } from '../../features/finance/useFinanceDraftAuraContext';

type DraftLine = {
  key: string;
  category: QuoteLineCategory;
  description: string;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  vatRateBps: string;
};

function newDraftLine(): DraftLine {
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category: 'labour',
    description: '',
    quantity: '1',
    unitPrice: '',
    unitCost: '',
    vatRateBps: '1500',
  };
}

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
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);
  const [belowFloorOverride, setBelowFloorOverride] = useState(false);
  const [belowFloorReason, setBelowFloorReason] = useState('');
  const [quoteMeta, setQuoteMeta] = useState({ isImmutable: false, status: 'draft' as QuoteStatus });
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [billingValues, setBillingValues] = useState(defaultBillingRecipientValues());

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
        const [quote, jobData, customerData] = await Promise.all([
          fetchQuote(accessToken, quoteId),
          fetchJobs(accessToken),
          fetchCustomers(accessToken),
        ]);

        if (cancelled) return;

        if (quote.isImmutable) {
          navigate(`/finance/quotes/${quoteId}`);
          return;
        }

        setJobs(jobData);
        setCustomers(customerData);
        setCustomerId(quote.customerId);
        setCustomerName(quote.customerName);
        setBillingValues(billingValuesFromRecord(quote));
        setQuoteMeta({ isImmutable: quote.isImmutable, status: quote.status });
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
            : [newDraftLine()],
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
  const billingCustomerName = resolveBillingCustomerName(
    billingValues.billingCustomerId,
    customers,
    customerName,
  );
  const quoteEditable = canEditQuote(quoteMeta);

  useFinanceDraftAuraContext(
    customerId
      ? {
          pageTitle: title || 'Edit quote',
          recordType: 'quote',
          recordId: quoteId,
          serviceCustomerId: customerId,
          serviceCustomerName: customerName,
          billingCustomerName,
          recipientName: billingValues.recipientName,
          jobId: jobId || null,
          propertyId: null,
        }
      : null,
  );

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, newDraftLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((line) => line.key !== key) : prev));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !quoteId) return;

    setError(null);

    if (belowFloorOverride && !belowFloorReason.trim()) {
      setError('A reason is required when overriding the profit floor');
      return;
    }

    const validLines = lines.filter((line) => line.description.trim() && line.unitPrice.trim());
    if (validLines.length === 0) {
      setError('Add at least one line item with a description and unit price');
      return;
    }

    const lineItems = [];
    for (const line of validLines) {
      const unitPriceCents = parseMoneyInput(line.unitPrice);
      if (unitPriceCents === null) {
        setError(`Enter a valid unit price for "${line.description}"`);
        return;
      }
      const unitCostCents = line.unitCost.trim() ? parseMoneyInput(line.unitCost) : null;
      lineItems.push({
        category: line.category,
        description: line.description.trim(),
        quantity: Number.parseFloat(line.quantity) || 1,
        unitPriceCents,
        ...(unitCostCents != null ? { unitCostCents } : {}),
        vatRateBps: Number.parseInt(line.vatRateBps, 10) || 1500,
      });
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
        title="Edit quote"
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

      <form className="finance-form" onSubmit={(event) => void handleSubmit(event)}>
        <BillingRecipientPanel
          recipientLabel="Quote Recipient"
          serviceCustomerId={customerId}
          serviceCustomerName={customerName}
          customers={customers}
          values={billingValues}
          editable={canWrite && quoteEditable}
          blockedMessage={
            !quoteEditable
              ? 'Issued quotes cannot change billing recipient here. Create a new version or reissue.'
              : null
          }
          requireReason={quoteMeta.status !== 'draft'}
          onSave={async (input) => {
            if (!accessToken) return;
            const updated = await updateQuoteBillingRecipient(accessToken, quoteId, input);
            setBillingValues(billingValuesFromRecord(updated));
            invalidateQuotes();
          }}
        />

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
          label="Valid until"
          type="datetime-local"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
        />

        <div className="finance-line-items">
          {lines.map((line) => (
            <div className="finance-line-item-row" key={line.key}>
              <label className="titan-input-group">
                <span className="titan-input-label">Description</span>
                <input
                  className="titan-input"
                  value={line.description}
                  onChange={(e) => updateLine(line.key, { description: e.target.value })}
                />
              </label>
              <label className="titan-input-group">
                <span className="titan-input-label">Category</span>
                <select
                  className="titan-input"
                  value={line.category}
                  onChange={(e) =>
                    updateLine(line.key, { category: e.target.value as QuoteLineCategory })
                  }
                >
                  {QUOTE_LINE_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="titan-input-group">
                <span className="titan-input-label">Qty</span>
                <input
                  className="titan-input"
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                />
              </label>
              <label className="titan-input-group">
                <span className="titan-input-label">Unit price</span>
                <input
                  className="titan-input"
                  value={line.unitPrice}
                  onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                />
              </label>
              <label className="titan-input-group">
                <span className="titan-input-label">Unit cost</span>
                <input
                  className="titan-input"
                  value={line.unitCost}
                  onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={lines.length <= 1}
                onClick={() => removeLine(line.key)}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={addLine}>
            Add line
          </Button>
        </div>

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

        <label className="finance-toolbar__check">
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
