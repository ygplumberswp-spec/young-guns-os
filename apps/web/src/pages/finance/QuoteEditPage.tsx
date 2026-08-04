import { useCallback, useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Input } from '@titan/ui';
import type { JobSummary, QuoteStatus } from '@titan/shared';
import { canIssueQuote, nextQuoteApprovalAction } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchQuote, issueQuote, updateQuote } from '../../lib/finance-api';
import { fetchJobs } from '../../lib/jobs-api';
import { FinanceDocumentActionsBar, type FinanceDocumentAction } from '../../features/finance/FinanceDocumentActionsBar';
import { FinanceDocumentAddressesFields } from '../../features/finance/FinanceDocumentAddressesFields';
import { FinanceEditorCard } from '../../features/finance/FinanceEditorCard';
import { FinanceLineItemsEditor } from '../../features/finance/FinanceLineItemsEditor';
import { FinanceLineItemsTotals } from '../../features/finance/FinanceLineItemsTotals';
import {
  inferVatModeFromLines,
  lineItemsToEditorLines,
  addressesFromSnapshot,
  addressesToApiPayload,
  parseEditorLinesForApi,
  parseEditorLinesForDraft,
  toDateInputValue,
  type FinanceDocumentAddresses,
  type FinanceDocumentPriceMode,
  type FinanceDocumentVatMode,
  type FinanceEditorLine,
} from '../../features/finance/finance-editor-utils';
import { useAuth } from '../../lib/auth-context';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canManageFinance, canViewFinanceProfit } from '../../features/finance/utils';
import { buildFinanceEditorPreviewInput } from '../../features/finance/finance-preview-request';
import { useFinanceDocumentPreview } from '../../features/finance/useFinanceDocumentPreview';
import {
  FinanceDocumentAttachmentsPanel,
} from '../../features/finance/FinanceDocumentAttachmentsPanel';
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
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [displayQuoteNumber, setDisplayQuoteNumber] = useState('');
  const [xeroQuoteNumber, setXeroQuoteNumber] = useState<string | null>(null);
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState<QuoteStatus>('draft');
  const [quoteDate, setQuoteDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [customerReference, setCustomerReference] = useState('');
  const [message, setMessage] = useState('');
  const [addresses, setAddresses] = useState<FinanceDocumentAddresses>({
    billingAddress: '',
    siteAddress: '',
    postalAddress: '',
  });
  const [lines, setLines] = useState<FinanceEditorLine[]>([]);
  const [vatMode, setVatMode] = useState<FinanceDocumentVatMode>('standard');
  const [priceMode, setPriceMode] = useState<FinanceDocumentPriceMode>('excluding_vat');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageFinance(user.permissions) : false;
  const canViewUnitCost = user ? canViewFinanceProfit(user.permissions, user.roleName) : false;
  const approvalAction = nextQuoteApprovalAction(status);
  const canSend = canIssueQuote({ isImmutable: false, status });

  const draftShell = useFormDraftShell({
    accessToken,
    userId: user?.id,
    recordType: 'quote',
    recordId: quoteId,
    enabled: canWrite && !isLoading && Boolean(quoteId),
    getPayload: () => ({
      jobId,
      status,
      quoteDate,
      validUntil,
      customerReference,
      message,
      addresses,
      lines,
      vatMode,
      priceMode,
    }),
    getMeta: () => ({
      title: customerName || 'Edit quote',
      customerLabel: customerName || null,
      completionPct: customerName ? 60 : 30,
    }),
  });

  const { notify } = useTitanNotify();
  const { openPreview, previewModal } = useFinanceDocumentPreview({ accessToken });

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
        setCustomerName(quote.customerName);
        setDisplayQuoteNumber(quote.displayQuoteNumber);
        setXeroQuoteNumber(quote.xeroQuoteNumber);
        setJobId(quote.jobId ?? '');
        setStatus(quote.status);
        setQuoteDate(toDateInputValue(quote.issuedAt ?? quote.createdAt));
        setValidUntil(toDateInputValue(quote.validUntil));
        setCustomerReference(quote.customerNotes ?? '');
        setMessage(quote.notes ?? '');
        setAddresses(addressesFromSnapshot(quote.addresses));
        setVatMode(inferVatModeFromLines(quote.lineItems));
        setLines(lineItemsToEditorLines(quote.lineItems));
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
    status,
    quoteDate,
    validUntil,
    customerReference,
    message,
    addresses,
    lines,
    vatMode,
    priceMode,
    draftShell,
  ]);

  const customerJobs = jobs.filter((job) => job.customerId === customerId);

  const persistQuote = useCallback(
    async (strict: boolean) => {
      if (!accessToken || !canWrite || !quoteId) return null;

      const lineItems = strict
        ? parseEditorLinesForApi(lines, { priceMode, vatMode })
        : parseEditorLinesForDraft(lines, { priceMode, vatMode });

      if (strict && !lineItems) {
        setError('Add at least one line item with a description and unit price');
        return null;
      }

      return updateQuote(accessToken, quoteId, {
        jobId: jobId || null,
        status: strict ? status : 'draft',
        validUntil: validUntil ? new Date(validUntil).toISOString() : null,
        issuedAt: quoteDate ? new Date(quoteDate).toISOString() : null,
        customerNotes: customerReference.trim() || null,
        notes: message.trim() || null,
        ...addressesToApiPayload(addresses),
        lineItems: lineItems!,
      });
    },
    [
      accessToken,
      addresses,
      canWrite,
      customerReference,
      jobId,
      lines,
      message,
      priceMode,
      quoteDate,
      quoteId,
      status,
      validUntil,
      vatMode,
    ],
  );

  async function handleAction(action: FinanceDocumentAction) {
    if (!accessToken || !canWrite || !quoteId) return;

    if (action === 'preview_pdf') {
      setError(null);
      const job = customerJobs.find((entry) => entry.id === jobId);
      await openPreview(
        buildFinanceEditorPreviewInput({
          kind: 'quote',
          customer: customerName
            ? { id: customerId, name: customerName, companyName: null, email: null, phone: null, xeroContactId: null }
            : null,
          customerReference,
          issuedAt: quoteDate,
          dueDate: validUntil,
          addresses,
          lines,
          vatMode,
          priceMode,
          notes: message,
          xeroQuoteNumber,
          jobReference: job?.title ?? null,
          status,
          attachmentScope: { quoteId },
        }),
      );
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await draftShell.autosave.saveNow();

      if (action === 'save' || action === 'save_draft') {
        const result = await persistQuote(false);
        if (result) setStatus(result.status);
        draftShell.markSubmitted();
        invalidateQuotes();
        notify({
          variant: 'saved',
          message: action === 'save_draft' ? 'Quote draft saved' : 'Quote saved',
          dedupeKey: action === 'save_draft' ? `quote-draft-${quoteId}` : `quote-saved-${quoteId}`,
        });
        return;
      }

      if (action === 'save_new') {
        await persistQuote(false);
        draftShell.markSubmitted();
        navigate('/finance/quotes/new');
        return;
      }

      if (action === 'approve') {
        if (!approvalAction) {
          setError('Quote is already approved for sending');
          return;
        }
        const updated = await persistQuote(true);
        if (!updated) return;
        const next = await updateQuote(accessToken, quoteId, { status: approvalAction.nextStatus });
        setStatus(next.status);
        invalidateQuotes();
        notify({ variant: 'saved', message: approvalAction.label, dedupeKey: `quote-approved-${quoteId}` });
        return;
      }

      if (action === 'send') {
        await persistQuote(true);
        if (!canIssueQuote({ isImmutable: false, status })) {
          setError('Approve the quote before sending');
          return;
        }
        await issueQuote(accessToken, quoteId);
        invalidateQuotes();
        notify({ variant: 'saved', message: 'Quote sent', dedupeKey: `quote-sent-${quoteId}` });
        navigate(`/finance/quotes/${quoteId}`);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save quote');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading quote…</p>;

  return (
    <div className="finance-page finance-page--editor finance-page--workspace">
      <PageHeader
        title={`Edit Quote${displayQuoteNumber ? ` · ${displayQuoteNumber}` : ''}`}
        description="Update draft quote lines and approval status — official numbers remain with Xero."
        backFallbackHref={`/finance/quotes/${quoteId}`}
        guardNavigation={draftShell.guard.guardNavigation}
      />
      <FinanceNav />
      {draftShell.guard.unsavedChangesModal}
      {previewModal}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="finance-editor finance-editor--workspace">
        <div className="finance-editor__layout finance-editor__layout--workspace">
          <FinanceEditorCard
            title="Customer Details"
            description="Customer is fixed for this quote."
            className="finance-editor-card--customer"
          >
            <div className="finance-editor-readonly-customer">
              <strong>{customerName || 'Customer'}</strong>
              <span>Customer cannot be changed on an existing quote.</span>
            </div>
            <Input
              label="Customer reference"
              value={customerReference}
              onChange={(e) => setCustomerReference(e.target.value)}
              placeholder="PO number, site reference, etc."
            />
            <label className="titan-input-group finance-editor-field-group">
              <span className="titan-input-label">Job (optional)</span>
              <select
                className="titan-input finance-editor-field"
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
          </FinanceEditorCard>

          <FinanceEditorCard title="Document Details" className="finance-editor-card--document">
            <Input label="Quote date" type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
            <Input
              label="Expiry date"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
            <p className="finance-editor-hint">{displayQuoteNumber || 'Draft — Xero quote number pending'}</p>
          </FinanceEditorCard>

          <FinanceEditorCard title="Addresses" className="finance-editor-card--full finance-editor-card--addresses">
            <FinanceDocumentAddressesFields addresses={addresses} onChange={setAddresses} />
          </FinanceEditorCard>

          <FinanceEditorCard title="Line Items" className="finance-editor-card--full finance-editor-card--lines">
            <FinanceLineItemsEditor
              accessToken={accessToken ?? ''}
              lines={lines}
              onChange={setLines}
              vatMode={vatMode}
              onVatModeChange={setVatMode}
              priceMode={priceMode}
              onPriceModeChange={setPriceMode}
              showUnitCost={canViewUnitCost}
            />
          </FinanceEditorCard>

          {accessToken ? (
            <FinanceDocumentAttachmentsPanel
              accessToken={accessToken}
              scope={{ mode: 'quote', quoteId }}
              jobId={jobId || undefined}
              disabled={!canWrite}
            />
          ) : null}

          <div className="finance-editor__bottom-grid">
            <FinanceEditorCard title="Message / Notes" className="finance-editor-card--notes">
              <label className="titan-input-group finance-editor-field-group">
                <span className="titan-input-label">Message to customer</span>
                <textarea
                  className="titan-input finance-editor-field finance-textarea"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Notes shown on the quote document"
                />
              </label>
            </FinanceEditorCard>
            <FinanceLineItemsTotals
              lines={lines}
              vatMode={vatMode}
              priceMode={priceMode}
              className="finance-line-items__totals-panel--workspace"
            />
          </div>
        </div>

        <footer className="finance-editor__footer finance-editor__footer--workspace">
          <FinanceDocumentActionsBar
            isSaving={isSaving}
            canApprove={Boolean(approvalAction)}
            canSend={canSend}
            approveLabel={approvalAction?.label ?? 'Approve'}
            onAction={(action) => void handleAction(action)}
          />
        </footer>
      </div>
    </div>
  );
}
