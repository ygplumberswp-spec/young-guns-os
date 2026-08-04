import { useCallback, useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Input } from '@titan/ui';
import type {
  FinanceCustomerSearchResult,
  InvoiceStage,
  InvoiceStatus,
  JobSummary,
  QuoteSummary,
} from '@titan/shared';
import { INVOICE_STAGE_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomer } from '../../lib/crm-api';
import { createInvoice, fetchQuote, fetchQuotes, updateInvoice } from '../../lib/finance-api';
import { fetchJobs } from '../../lib/jobs-api';
import { CustomerSearchField } from '../../features/finance/CustomerSearchField';
import { FinanceDocumentActionsBar, type FinanceDocumentAction } from '../../features/finance/FinanceDocumentActionsBar';
import { FinanceDocumentAddressesFields } from '../../features/finance/FinanceDocumentAddressesFields';
import { FinanceEditorCard } from '../../features/finance/FinanceEditorCard';
import { FinanceLineItemsEditor } from '../../features/finance/FinanceLineItemsEditor';
import { FinanceLineItemsTotals } from '../../features/finance/FinanceLineItemsTotals';
import {
  createBlankEditorLines,
  addressesToApiPayload,
  exVatCentsToDisplay,
  parseEditorLinesForApi,
  parseEditorLinesForDraft,
  todayDateInputValue,
  type FinanceDocumentAddresses,
  type FinanceDocumentPriceMode,
  type FinanceDocumentVatMode,
  type FinanceEditorLine,
} from '../../features/finance/finance-editor-utils';
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
  const [selectedCustomer, setSelectedCustomer] = useState<FinanceCustomerSearchResult | null>(null);
  const customerId = selectedCustomer?.id ?? '';
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [jobId, setJobId] = useState('');
  const [quoteId, setQuoteId] = useState('');
  const [lines, setLines] = useState<FinanceEditorLine[]>(() => createBlankEditorLines());
  const [status, setStatus] = useState<InvoiceStatus>('draft');
  const [stage, setStage] = useState<InvoiceStage>('standard');
  const [invoiceDate, setInvoiceDate] = useState(todayDateInputValue());
  const [dueDate, setDueDate] = useState('');
  const [customerReference, setCustomerReference] = useState('');
  const [message, setMessage] = useState('');
  const [addresses, setAddresses] = useState<FinanceDocumentAddresses>({
    billingAddress: '',
    siteAddress: '',
    postalAddress: '',
  });
  const [vatMode, setVatMode] = useState<FinanceDocumentVatMode>('standard');
  const [priceMode, setPriceMode] = useState<FinanceDocumentPriceMode>('excluding_vat');
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | null>(null);

  const [approvedForSend, setApprovedForSend] = useState(false);

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
      lines,
      status,
      stage,
      invoiceDate,
      dueDate,
      customerReference,
      message,
      addresses,
      vatMode,
      priceMode,
      approvedForSend,
    }),
    getMeta: () => ({
      title: selectedCustomer?.name || 'New invoice',
      customerLabel: selectedCustomer?.name ?? null,
      completionPct: customerId ? 30 : 10,
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
        const [jobData, quoteData] = await Promise.all([
          fetchJobs(accessToken),
          fetchQuotes(accessToken),
        ]);
        if (cancelled) return;
        setJobs(jobData);
        setQuotes(quoteData);
        const params = new URLSearchParams(search);
        const preQuoteId = params.get('quoteId');
        if (preQuoteId) setQuoteId(preQuoteId);
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
    if (!accessToken || !quoteId) return;
    let cancelled = false;
    void fetchQuote(accessToken, quoteId).then((quote) => {
      if (cancelled) return;
      setLines(
        quote.lineItems.length
          ? quote.lineItems.map((line) => ({
              key: line.id,
              category: line.category,
              description: line.description,
              quantity: String(line.quantity),
              unit: '',
              unitPrice: exVatCentsToDisplay(line.unitPriceCents, priceMode, line.vatRateBps),
              unitCost: '',
              vatRateBps: String(line.vatRateBps),
              catalogueSourceKey: null,
              isManualLine: true,
            }))
          : createBlankEditorLines(),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, quoteId, priceMode]);

  useEffect(() => {
    if (!accessToken || !customerId) return;
    let cancelled = false;
    void fetchCustomer(accessToken, customerId).then((customer) => {
      if (cancelled) return;
      setAddresses({
        billingAddress: customer.billingAddress ?? '',
        siteAddress: customer.siteAddress ?? '',
        postalAddress: customer.siteAddress ?? '',
      });
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, customerId]);

  useEffect(() => {
    if (isLoading) return;
    draftShell.touchField();
  }, [
    isLoading,
    customerId,
    jobId,
    quoteId,
    lines,
    status,
    stage,
    invoiceDate,
    dueDate,
    customerReference,
    message,
    addresses,
    vatMode,
    priceMode,
    approvedForSend,
    draftShell,
  ]);

  const customerJobs = jobs.filter((job) => job.customerId === customerId);
  const customerQuotes = quotes.filter((quote) => quote.customerId === customerId);

  const persistInvoice = useCallback(
    async (strict: boolean) => {
      if (!accessToken || !canWrite) return null;
      const lineItems = strict
        ? parseEditorLinesForApi(lines, { priceMode, vatMode })
        : parseEditorLinesForDraft(lines, { priceMode, vatMode });

      if (strict && !lineItems) {
        setError('Add at least one line item with a description and unit price');
        return null;
      }
      if (strict && !customerId) {
        setError('Select a customer before approving or sending');
        return null;
      }

      if (!customerId) {
        await draftShell.autosave.saveNow();
        notify({ variant: 'saved', message: 'Draft saved locally', dedupeKey: 'invoice-draft-local' });
        return null;
      }

      const payload = {
        customerId,
        jobId: jobId || null,
        quoteId: quoteId || null,
        status,
        stage,
        lineItems: lineItems!,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        issuedAt: invoiceDate ? new Date(invoiceDate).toISOString() : null,
        customerReference: customerReference.trim() || null,
        notes: message.trim() || null,
        ...addressesToApiPayload(addresses),
        clientActionId,
      };

      if (savedInvoiceId) {
        return updateInvoice(accessToken, savedInvoiceId, {
          status: payload.status,
          stage: payload.stage,
          lineItems: payload.lineItems,
          dueDate: payload.dueDate,
          issuedAt: payload.issuedAt,
          customerReference: payload.customerReference,
          notes: payload.notes,
          billingAddress: payload.billingAddress,
          siteAddress: payload.siteAddress,
          postalAddress: payload.postalAddress,
        });
      }

      const created = await createInvoice(accessToken, payload);
      setSavedInvoiceId(created.id);
      return created;
    },
    [
      accessToken,
      canWrite,
      clientActionId,
      customerId,
      draftShell.autosave,
      dueDate,
      invoiceDate,
      jobId,
      lines,
      message,
      notify,
      priceMode,
      quoteId,
      savedInvoiceId,
      stage,
      status,
      vatMode,
    ],
  );

  async function handleAction(action: FinanceDocumentAction) {
    if (!accessToken || !canWrite) return;
    setError(null);
    setIsSaving(true);
    try {
      await draftShell.autosave.saveNow();

      if (action === 'save_draft') {
        await persistInvoice(false);
        draftShell.markSubmitted();
        notify({ variant: 'saved', message: 'Invoice draft saved', dedupeKey: 'invoice-draft-saved' });
        return;
      }

      if (action === 'save_new') {
        await persistInvoice(false);
        draftShell.markSubmitted();
        navigate('/finance/invoices/new');
        return;
      }

      if (action === 'preview_pdf') {
        const record = await persistInvoice(false);
        const id = record && 'id' in record ? record.id : savedInvoiceId;
        if (id) window.open(`/finance/invoices/${id}`, '_blank', 'noopener,noreferrer');
        else setError('Save the invoice with a customer before previewing');
        return;
      }

      if (action === 'approve') {
        await persistInvoice(true);
        const id = savedInvoiceId;
        if (!id) return;
        setApprovedForSend(true);
        notify({
          variant: 'saved',
          message: 'Invoice approved for sending',
          dedupeKey: 'invoice-approved',
        });
        return;
      }

      if (action === 'send') {
        if (!approvedForSend) {
          setError('Approve the invoice before sending');
          return;
        }
        await persistInvoice(true);
        const id = savedInvoiceId;
        if (!id) return;
        await updateInvoice(accessToken, id, { status: 'sent' });
        setStatus('sent');
        invalidateInvoices();
        notify({ variant: 'saved', message: 'Invoice marked sent', dedupeKey: 'invoice-sent' });
        navigate(`/finance/invoices/${id}`);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save invoice');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading form…</p>;

  return (
    <div className="finance-page finance-page--editor finance-page--workspace">
      <PageHeader
        title="New Invoice"
        description="Professional invoice editor — official numbers are assigned by Xero after sync."
        guardNavigation={draftShell.guard.guardNavigation}
      />
      <FinanceNav />
      {draftShell.guard.unsavedChangesModal}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="finance-editor finance-editor--workspace">
        <div className="finance-editor__layout finance-editor__layout--workspace">
          <FinanceEditorCard title="Customer Details" className="finance-editor-card--customer">
            {accessToken ? (
              <CustomerSearchField
                accessToken={accessToken}
                value={selectedCustomer}
                onChange={(customer) => {
                  setSelectedCustomer(customer);
                  setJobId('');
                  setQuoteId('');
                }}
              />
            ) : null}
            <Input
              label="Customer reference"
              value={customerReference}
              onChange={(e) => setCustomerReference(e.target.value)}
            />
            <label className="titan-input-group finance-editor-field-group">
              <span className="titan-input-label">Quote (optional)</span>
              <select
                className="titan-input finance-editor-field"
                value={quoteId}
                onChange={(e) => setQuoteId(e.target.value)}
                disabled={!customerId}
              >
                <option value="">No linked quote</option>
                {customerQuotes.map((quote) => (
                  <option key={quote.id} value={quote.id}>
                    {quote.displayQuoteNumber} · {quote.customerName}
                  </option>
                ))}
              </select>
            </label>
            <label className="titan-input-group finance-editor-field-group">
              <span className="titan-input-label">Job (optional)</span>
              <select
                className="titan-input finance-editor-field"
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
          </FinanceEditorCard>

          <FinanceEditorCard title="Document Details" className="finance-editor-card--document">
            <Input label="Invoice date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <label className="titan-input-group finance-editor-field-group">
              <span className="titan-input-label">Stage</span>
              <select
                className="titan-input finance-editor-field"
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
            <p className="finance-editor-hint">Draft — Xero invoice number pending</p>
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
              showUnitCost={false}
            />
          </FinanceEditorCard>

          <div className="finance-editor__bottom-grid">
            <FinanceEditorCard title="Message / Notes" className="finance-editor-card--notes">
              <label className="titan-input-group finance-editor-field-group">
                <span className="titan-input-label">Message to customer</span>
                <textarea
                  className="titan-input finance-editor-field finance-textarea"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
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
            canApprove={status === 'draft' && !approvedForSend}
            canSend={status === 'draft' && approvedForSend}
            approveLabel="Approve"
            onAction={(action) => void handleAction(action)}
          />
        </footer>
      </div>
    </div>
  );
}
