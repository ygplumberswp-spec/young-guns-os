import { useCallback, useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Input } from '@titan/ui';
import type { DocumentPhoto, FinanceCustomerSearchResult, JobSummary, QuoteStatus } from '@titan/shared';
import { canIssueQuote, nextQuoteApprovalAction } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomer } from '../../lib/crm-api';
import { createQuote, issueQuote, updateQuote } from '../../lib/finance-api';
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
  parseEditorLinesForApi,
  parseEditorLinesForDraft,
  todayDateInputValue,
  type FinanceDocumentAddresses,
  type FinanceDocumentPriceMode,
  type FinanceDocumentVatMode,
  type FinanceEditorLine,
} from '../../features/finance/finance-editor-utils';
import { fetchDraft } from '../../lib/drafts-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canManageFinance, canViewFinanceProfit, canCreateCustomer, newFinanceClientActionId } from '../../features/finance/utils';
import { buildFinanceEditorPreviewInput } from '../../features/finance/finance-preview-request';
import {
  financeDocumentEditPath,
  financeDocumentSaveSuccessMessage,
  resolveFinanceDocumentPersistStatus,
  type FinanceDocumentPersistMode,
} from '../../features/finance/finance-document-save';
import { useFinanceDocumentPreview } from '../../features/finance/useFinanceDocumentPreview';
import { FinanceDocumentPhotosPanel } from '../../features/finance/FinanceDocumentPhotosPanel';
import { linkPhotosAfterFinanceSave } from '../../features/finance/finance-document-editor-save';
import { FinanceDocumentSectionsFields } from '../../features/finance/FinanceDocumentSectionsFields';
import {
  emptyFinanceDocumentSectionsEditorState,
  quoteSectionsToApiPayload,
  type FinanceDocumentSectionsEditorState,
} from '../../features/finance/finance-document-sections-state';
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
  const [status, setStatus] = useState<QuoteStatus>('draft');
  const [quoteDate, setQuoteDate] = useState(todayDateInputValue());
  const [validUntil, setValidUntil] = useState('');
  const [customerReference, setCustomerReference] = useState('');
  const [message, setMessage] = useState('');
  const [documentSections, setDocumentSections] = useState<FinanceDocumentSectionsEditorState>(
    emptyFinanceDocumentSectionsEditorState(),
  );
  const [addresses, setAddresses] = useState<FinanceDocumentAddresses>({
    billingAddress: '',
    siteAddress: '',
    postalAddress: '',
  });
  const [lines, setLines] = useState<FinanceEditorLine[]>(() => createBlankEditorLines());
  const [vatMode, setVatMode] = useState<FinanceDocumentVatMode>('standard');
  const [priceMode, setPriceMode] = useState<FinanceDocumentPriceMode>('excluding_vat');
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<DocumentPhoto[]>([]);

  const [clientActionId] = useState(() => newFinanceClientActionId('quote'));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageFinance(user.permissions) : false;
  const canCreateCustomerRecord = user ? canCreateCustomer(user.permissions) : false;
  const canViewUnitCost = user ? canViewFinanceProfit(user.permissions, user.roleName) : false;
  const approvalAction = nextQuoteApprovalAction(status);
  const canSend = canIssueQuote({ isImmutable: false, status });

  const draftShell = useFormDraftShell({
    accessToken,
    userId: user?.id,
    recordType: 'quote',
    enabled: canWrite && !isLoading,
    getPayload: () => ({
      customerId,
      jobId,
      status,
      quoteDate,
      validUntil,
      customerReference,
      message,
      documentSections,
      addresses,
      lines,
      vatMode,
      priceMode,
    }),
    getMeta: () => ({
      title: selectedCustomer?.name || 'New quote',
      customerLabel: selectedCustomer?.name ?? null,
      completionPct: customerId ? 30 : 10,
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
        const prefillJob = preJobId != null ? jobData.find((job) => job.id === preJobId) ?? null : null;
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
            setAddresses({
              billingAddress: customer.billingAddress ?? '',
              siteAddress: customer.siteAddress ?? '',
              postalAddress: customer.siteAddress ?? '',
            });
          }
        }
        if (!cancelled && prefillJob) {
          setJobId(prefillJob.id);
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
    const params = new URLSearchParams(search);
    const draftId = params.get('draftId');
    if (!accessToken || !draftId) return;
    let cancelled = false;
    void fetchDraft(accessToken, draftId).then((draft) => {
      if (cancelled || draft.recordType !== 'quote') return;
      const payload = draft.payload;
      if (typeof payload.jobId === 'string') setJobId(payload.jobId);
      if (typeof payload.quoteDate === 'string') setQuoteDate(payload.quoteDate);
      if (typeof payload.validUntil === 'string') setValidUntil(payload.validUntil);
      if (typeof payload.customerReference === 'string') setCustomerReference(payload.customerReference);
      if (typeof payload.message === 'string') setMessage(payload.message);
      if (payload.addresses && typeof payload.addresses === 'object') {
        setAddresses(payload.addresses as FinanceDocumentAddresses);
      }
      if (Array.isArray(payload.lines)) setLines(payload.lines as FinanceEditorLine[]);
      if (payload.vatMode === 'zero' || payload.vatMode === 'standard') setVatMode(payload.vatMode);
      if (payload.priceMode === 'excluding_vat' || payload.priceMode === 'including_vat') {
        setPriceMode(payload.priceMode);
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
    quoteDate,
    validUntil,
    customerReference,
    message,
    documentSections,
    addresses,
    lines,
    vatMode,
    priceMode,
    draftShell,
  ]);

  const customerJobs = jobs.filter((job) => job.customerId === customerId);

  const persistQuote = useCallback(
    async (strict: boolean, mode: FinanceDocumentPersistMode = 'save') => {
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

      const body = {
        customerId: customerId || undefined,
        jobId: jobId || null,
        status: resolveFinanceDocumentPersistStatus(mode, 'draft') as 'draft',
        validUntil: validUntil ? new Date(validUntil).toISOString() : null,
        issuedAt: quoteDate ? new Date(quoteDate).toISOString() : null,
        customerNotes: customerReference.trim() || null,
        notes: message.trim() || null,
        ...addressesToApiPayload(addresses),
        ...quoteSectionsToApiPayload(documentSections),
        lineItems: lineItems!,
        clientActionId,
      };

      if (!customerId) {
        await draftShell.autosave.saveNow();
        notify({ variant: 'saved', message: 'Draft saved locally', dedupeKey: 'quote-draft-local' });
        return null;
      }

      if (savedQuoteId) {
        const updated = await updateQuote(accessToken, savedQuoteId, {
          jobId: body.jobId,
          status: body.status,
          validUntil: body.validUntil,
          issuedAt: body.issuedAt,
          customerNotes: body.customerNotes,
          notes: body.notes,
          billingAddress: body.billingAddress,
          siteAddress: body.siteAddress,
          postalAddress: body.postalAddress,
          ...quoteSectionsToApiPayload(documentSections),
          lineItems: body.lineItems,
        });
        setStatus(updated.status);
        return updated;
      }

      const created = await createQuote(accessToken, {
        customerId,
        jobId: body.jobId,
        status: body.status,
        validUntil: body.validUntil,
        issuedAt: body.issuedAt,
        customerNotes: body.customerNotes,
        notes: body.notes,
        billingAddress: body.billingAddress,
        siteAddress: body.siteAddress,
        postalAddress: body.postalAddress,
        ...quoteSectionsToApiPayload(documentSections),
        lineItems: body.lineItems,
        clientActionId,
      });
      setSavedQuoteId(created.id);
      setStatus(created.status);
      return created;
    },
    [
      accessToken,
      addresses,
      canWrite,
      clientActionId,
      customerId,
      customerReference,
      documentSections,
      draftShell.autosave,
      jobId,
      lines,
      message,
      notify,
      priceMode,
      quoteDate,
      savedQuoteId,
      validUntil,
      vatMode,
    ],
  );

  const saveQuoteDraft = useCallback(async () => {
    if (!accessToken || !canWrite) {
      throw new Error('You do not have permission to save');
    }
    if (!customerId) {
      throw new Error('Select a customer before saving');
    }
    await draftShell.autosave.saveNow();
    const wasNew = !savedQuoteId;
    const result = await persistQuote(false);
    if (!result?.id) {
      throw new Error('Unable to save quote');
    }
    await linkPhotosAfterFinanceSave(accessToken, {
      documentType: 'quote',
      recordId: result.id,
      documentNumber: result.displayQuoteNumber ?? 'Draft — Xero quote number pending',
      title: selectedCustomer?.name ?? 'Quote',
      customerId,
      jobId: jobId || null,
      photos,
    });
    draftShell.markSubmitted();
    invalidateQuotes();
    if (wasNew) {
      navigate(financeDocumentEditPath('quote', result.id), { replace: true });
    }
  }, [
    accessToken,
    canWrite,
    customerId,
    draftShell,
    invalidateQuotes,
    navigate,
    persistQuote,
    photos,
    savedQuoteId,
    selectedCustomer?.name,
  ]);

  const { openPreview, previewModal } = useFinanceDocumentPreview({
    accessToken,
    saveHandlers: {
      canSave: canWrite,
      onSave: saveQuoteDraft,
      onSaveDraft: saveQuoteDraft,
    },
  });

  async function handleAction(action: FinanceDocumentAction) {
    if (!accessToken || !canWrite) return;

    if (action === 'preview_pdf') {
      setError(null);
      const job = customerJobs.find((entry) => entry.id === jobId);
      await openPreview(
        buildFinanceEditorPreviewInput({
          kind: 'quote',
          customer: selectedCustomer,
          customerReference,
          issuedAt: quoteDate,
          dueDate: validUntil,
          addresses,
          lines,
          vatMode,
          priceMode,
          notes: message,
          sections: documentSections,
          quoteId: savedQuoteId,
          jobReference: job?.title ?? null,
          status,
          photos,
        }),
      );
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await draftShell.autosave.saveNow();

      if (action === 'save' || action === 'save_draft') {
        const mode = action === 'save_draft' ? 'save_draft' : 'save';
        const wasNew = !savedQuoteId;
        const result = await persistQuote(false, mode);
        draftShell.markSubmitted();
        if (result?.id) {
          await linkPhotosAfterFinanceSave(accessToken, {
            documentType: 'quote',
            recordId: result.id,
            documentNumber: result.displayQuoteNumber ?? 'Draft — Xero quote number pending',
            title: selectedCustomer?.name ?? 'Quote',
            customerId,
            jobId: jobId || null,
            photos,
          });
          invalidateQuotes();
          if (wasNew) {
            navigate(financeDocumentEditPath('quote', result.id), { replace: true });
          }
          notify({
            variant: 'saved',
            message: financeDocumentSaveSuccessMessage(mode, 'quote', result.status),
            dedupeKey: mode === 'save_draft' ? 'quote-draft-saved' : 'quote-saved',
          });
        }
        return;
      }

      if (action === 'save_new') {
        const result = await persistQuote(false, 'save');
        if (!result?.id) return;
        draftShell.markSubmitted();
        navigate('/finance/quotes/new');
        return;
      }

      if (action === 'approve') {
        if (!approvalAction) {
          setError('Quote is already approved for sending');
          return;
        }
        await persistQuote(true);
        const id = savedQuoteId;
        if (!id) return;
        const updated = await updateQuote(accessToken, id, { status: approvalAction.nextStatus });
        setStatus(updated.status);
        invalidateQuotes();
        notify({ variant: 'saved', message: approvalAction.label, dedupeKey: 'quote-approved' });
        return;
      }

      if (action === 'send') {
        await persistQuote(true);
        const id = savedQuoteId;
        if (!id) return;
        if (!canIssueQuote({ isImmutable: false, status })) {
          setError('Approve the quote before sending');
          return;
        }
        await issueQuote(accessToken, id);
        invalidateQuotes();
        notify({ variant: 'saved', message: 'Quote sent', dedupeKey: 'quote-sent' });
        navigate(`/finance/quotes/${id}`);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save quote');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading form…</p>;

  return (
    <div className="finance-page finance-page--editor finance-page--workspace">
      <PageHeader
        title="New Quote"
        description="Professional quote editor — official numbers are assigned by Xero after sync."
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
            description="Search, select or create a customer."
            className="finance-editor-card--customer"
          >
            {accessToken ? (
              <CustomerSearchField
                accessToken={accessToken}
                value={selectedCustomer}
                onChange={(customer) => {
                  setSelectedCustomer(customer);
                  setJobId('');
                }}
                canCreateCustomer={canCreateCustomerRecord}
              />
            ) : null}
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
            <Input label="Quote date" type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
            <Input
              label="Expiry date"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
            <p className="finance-editor-hint">Draft — Xero quote number pending</p>
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
            <FinanceDocumentPhotosPanel
              accessToken={accessToken}
              documentType="quote"
              quoteId={savedQuoteId}
              draftClientActionId={clientActionId}
              jobId={jobId || undefined}
              customerId={customerId || undefined}
              documentNumber="Draft — Xero quote number pending"
              customerName={selectedCustomer?.name}
              photos={photos}
              onPhotosChange={setPhotos}
              disabled={!canWrite}
            />
          ) : null}

          <FinanceDocumentSectionsFields
            kind="quote"
            state={documentSections}
            onChange={setDocumentSections}
            disabled={!canWrite}
          />

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
