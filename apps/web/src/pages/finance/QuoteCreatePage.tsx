import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button, Input } from '@titan/ui';
import type { CustomerSummary, JobSummary, QuoteLineCategory, QuoteStatus } from '@titan/shared';
import { parseMoneyInput, QUOTE_LINE_CATEGORY_OPTIONS, QUOTE_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomers } from '../../lib/crm-api';
import { createQuote, updateQuoteBillingRecipient } from '../../lib/finance-api';
import { fetchJobs } from '../../lib/jobs-api';
import { fetchDraft } from '../../lib/drafts-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canManageFinance, newFinanceClientActionId } from '../../features/finance/utils';
import { PageHeader } from '../../components/ux';
import { useFormDraftShell } from '../../hooks/useFormDraftShell';
import { useTitanNotify } from '../../components/ux/TitanNotifications';
import { BillingRecipientPanel } from '../../features/finance/BillingRecipientPanel';
import {
  defaultBillingRecipientValues,
  hasCustomBillingRecipient,
  resolveBillingCustomerName,
  toBillingRecipientPatch,
  type BillingRecipientFormValues,
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

export function QuoteCreatePage() {
  const { accessToken, user } = useAuth();
  const { invalidateQuotes } = useStaffMutationInvalidation();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [jobId, setJobId] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<QuoteStatus>('draft');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [scopeOfWork, setScopeOfWork] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');

  const [useSimpleAmount, setUseSimpleAmount] = useState(false);
  const [amount, setAmount] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);

  const [belowFloorOverride, setBelowFloorOverride] = useState(false);
  const [belowFloorReason, setBelowFloorReason] = useState('');

  const [billingRecipient, setBillingRecipient] = useState<BillingRecipientFormValues>(
    defaultBillingRecipientValues(),
  );

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
      useSimpleAmount,
      amount,
      lines,
      belowFloorOverride,
      belowFloorReason,
    }),
    getMeta: () => ({
      title: title || 'New quote',
      customerLabel: customers.find((customer) => customer.id === customerId)?.name ?? null,
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
        const [customerData, jobData] = await Promise.all([
          fetchCustomers(accessToken),
          fetchJobs(accessToken),
        ]);

        if (!cancelled) {
          setCustomers(customerData);
          setJobs(jobData);
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
      if (cancelled || draft.recordType !== 'quote') return;
      const payload = draft.payload;
      if (typeof payload.customerId === 'string') setCustomerId(payload.customerId);
      if (typeof payload.jobId === 'string') setJobId(payload.jobId);
      if (typeof payload.title === 'string') setTitle(payload.title);
      if (typeof payload.status === 'string') setStatus(payload.status as QuoteStatus);
      if (typeof payload.validUntil === 'string') setValidUntil(payload.validUntil);
      if (typeof payload.notes === 'string') setNotes(payload.notes);
      if (typeof payload.scopeOfWork === 'string') setScopeOfWork(payload.scopeOfWork);
      if (typeof payload.exclusions === 'string') setExclusions(payload.exclusions);
      if (typeof payload.paymentTerms === 'string') setPaymentTerms(payload.paymentTerms);
      if (typeof payload.useSimpleAmount === 'boolean') setUseSimpleAmount(payload.useSimpleAmount);
      if (typeof payload.amount === 'string') setAmount(payload.amount);
      if (Array.isArray(payload.lines)) setLines(payload.lines as DraftLine[]);
      if (typeof payload.belowFloorOverride === 'boolean') {
        setBelowFloorOverride(payload.belowFloorOverride);
      }
      if (typeof payload.belowFloorReason === 'string') {
        setBelowFloorReason(payload.belowFloorReason);
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
    useSimpleAmount,
    amount,
    lines,
    belowFloorOverride,
    belowFloorReason,
    draftShell,
  ]);

  const customerJobs = jobs.filter((job) => job.customerId === customerId);
  const serviceCustomerName =
    customers.find((customer) => customer.id === customerId)?.name ?? 'Customer';
  const billingCustomerName = resolveBillingCustomerName(
    billingRecipient.billingCustomerId,
    customers,
    serviceCustomerName,
  );

  useFinanceDraftAuraContext(
    customerId
      ? {
          pageTitle: 'New quote',
          recordType: 'quote',
          serviceCustomerId: customerId,
          serviceCustomerName,
          billingCustomerName,
          recipientName: billingRecipient.recipientName,
          jobId: jobId || null,
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
    if (!accessToken || !canWrite || !customerId) return;

    setError(null);

    if (belowFloorOverride && !belowFloorReason.trim()) {
      setError('A reason is required when overriding the profit floor');
      return;
    }

    let lineItems: Array<{
      category: QuoteLineCategory;
      description: string;
      quantity: number;
      unitPriceCents: number;
      unitCostCents?: number;
      vatRateBps: number;
    }> = [];
    let amountCents: number | undefined;

    if (useSimpleAmount) {
      const parsedAmount = parseMoneyInput(amount);
      if (parsedAmount === null || parsedAmount <= 0) {
        setError('Enter a valid amount greater than zero');
        return;
      }
      amountCents = parsedAmount;
    } else {
      const validLines = lines.filter((line) => line.description.trim() && line.unitPrice.trim());
      if (validLines.length === 0) {
        setError('Add at least one line item with a description and unit price');
        return;
      }

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
        ...(amountCents != null ? { amountCents } : {}),
        belowFloorOverride,
        belowFloorReason: belowFloorOverride ? belowFloorReason.trim() : null,
        clientActionId,
      });
      if (hasCustomBillingRecipient(billingRecipient, customerId)) {
        await updateQuoteBillingRecipient(
          accessToken,
          quote.id,
          toBillingRecipientPatch(billingRecipient, 'Initial billing recipient on quote create'),
        );
      }
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
        title="New quote"
        description="Create a quote linked to a customer and optional job."
        guardNavigation={draftShell.guard.guardNavigation}
      />
      <FinanceNav />
      {draftShell.autosave.statusLabel ? (
        <p className="finance-draft-status">{draftShell.autosave.statusLabel}</p>
      ) : null}
      {draftShell.guard.unsavedChangesModal}
      {error ? <p className="form-error">{error}</p> : null}

      {customers.length === 0 ? (
        <p className="page-muted">Add a customer before creating a quote.</p>
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

          <BillingRecipientPanel
            recipientLabel="Quote Recipient"
            serviceCustomerId={customerId}
            serviceCustomerName={serviceCustomerName}
            customers={customers}
            values={billingRecipient}
            editable={canWrite}
            mode="local"
            requireReason={false}
            onChange={setBillingRecipient}
          />

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
            label="Valid until"
            type="datetime-local"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />

          <div className="finance-mode-toggle">
            <label>
              <input
                type="radio"
                name="quote-amount-mode"
                checked={!useSimpleAmount}
                onChange={() => setUseSimpleAmount(false)}
              />
              Itemized lines
            </label>
            <label>
              <input
                type="radio"
                name="quote-amount-mode"
                checked={useSimpleAmount}
                onChange={() => setUseSimpleAmount(true)}
              />
              Simple amount
            </label>
          </div>

          {useSimpleAmount ? (
            <Input
              label="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required={useSimpleAmount}
            />
          ) : (
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
                      {QUOTE_LINE_CATEGORY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
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
                      placeholder="0.00"
                    />
                  </label>
                  <label className="titan-input-group">
                    <span className="titan-input-label">Unit cost (internal)</span>
                    <input
                      className="titan-input"
                      value={line.unitCost}
                      onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                      placeholder="0.00"
                    />
                  </label>
                  <label className="titan-input-group">
                    <span className="titan-input-label">VAT bps</span>
                    <input
                      className="titan-input"
                      value={line.vatRateBps}
                      onChange={(e) => updateLine(line.key, { vatRateBps: e.target.value })}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="finance-line-item-row__remove"
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
          )}

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
            {isSaving ? 'Creating…' : 'Create quote'}
          </Button>
        </form>
      )}
    </div>
  );
}
