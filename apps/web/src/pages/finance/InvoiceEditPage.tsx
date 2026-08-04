import { useCallback, useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Input } from '@titan/ui';
import type { DocumentPhoto, FinanceCustomerSearchResult, InvoiceStage, InvoiceStatus } from '@titan/shared';
import { canEditInvoice, INVOICE_STAGE_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchInvoice, updateInvoice } from '../../lib/finance-api';
import { CustomerSearchField } from '../../features/finance/CustomerSearchField';
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
import { canManageFinance } from '../../features/finance/utils';
import {
  financeDocumentSaveSuccessMessage,
  resolveFinanceDocumentPersistStatus,
  type FinanceDocumentPersistMode,
} from '../../features/finance/finance-document-save';
import { buildFinanceEditorPreviewInput } from '../../features/finance/finance-preview-request';
import { useFinanceDocumentPreview } from '../../features/finance/useFinanceDocumentPreview';
import { FinanceDocumentPhotosPanel } from '../../features/finance/FinanceDocumentPhotosPanel';
import { linkPhotosAfterFinanceSave } from '../../features/finance/finance-document-editor-save';
import { PageHeader } from '../../components/ux';
import { useFormDraftShell } from '../../hooks/useFormDraftShell';
import { useTitanNotify } from '../../components/ux/TitanNotifications';

export function InvoiceEditPage() {
  const [, params] = useRoute('/finance/invoices/:id/edit');
  const invoiceId = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const { invalidateInvoices } = useStaffMutationInvalidation();
  const [, navigate] = useLocation();

  const [customer, setCustomer] = useState<FinanceCustomerSearchResult | null>(null);
  const [displayInvoiceNumber, setDisplayInvoiceNumber] = useState('');
  const [xeroInvoiceNumber, setXeroInvoiceNumber] = useState<string | null>(null);
  const [status, setStatus] = useState<InvoiceStatus>('draft');
  const [stage, setStage] = useState<InvoiceStage>('standard');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [customerReference, setCustomerReference] = useState('');
  const [message, setMessage] = useState('');
  const [jobId, setJobId] = useState('');
  const [photos, setPhotos] = useState<DocumentPhoto[]>([]);
  const [addresses, setAddresses] = useState<FinanceDocumentAddresses>({
    billingAddress: '',
    siteAddress: '',
    postalAddress: '',
  });
  const [lines, setLines] = useState<FinanceEditorLine[]>([]);
  const [vatMode, setVatMode] = useState<FinanceDocumentVatMode>('standard');
  const [priceMode, setPriceMode] = useState<FinanceDocumentPriceMode>('excluding_vat');
  const [approvedForSend, setApprovedForSend] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editable, setEditable] = useState(true);

  const canWrite = user ? canManageFinance(user.permissions) : false;

  const draftShell = useFormDraftShell({
    accessToken,
    userId: user?.id,
    recordType: 'invoice',
    recordId: invoiceId,
    enabled: canWrite && !isLoading && Boolean(invoiceId) && editable,
    getPayload: () => ({
      status,
      stage,
      invoiceDate,
      dueDate,
      customerReference,
      message,
      addresses,
      lines,
      vatMode,
      priceMode,
      approvedForSend,
    }),
    getMeta: () => ({
      title: customer?.name || 'Edit invoice',
      customerLabel: customer?.name ?? null,
    }),
  });

  const { notify } = useTitanNotify();

  useEffect(() => {
    if (user && !canWrite) navigate(`/finance/invoices/${invoiceId}`);
  }, [canWrite, invoiceId, navigate, user]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken || !invoiceId) {
        setIsLoading(false);
        return;
      }

      try {
        const invoice = await fetchInvoice(accessToken, invoiceId);
        if (cancelled) return;

        const canEdit = canEditInvoice(invoice);
        setEditable(canEdit);
        if (!canEdit) {
          navigate(`/finance/invoices/${invoiceId}`);
          return;
        }

        setCustomer({
          id: invoice.customerId,
          name: invoice.customerName,
          companyName: null,
          email: null,
          phone: null,
          xeroContactId: null,
        });
        setDisplayInvoiceNumber(invoice.displayOfficialInvoiceNumber);
        setXeroInvoiceNumber(invoice.xeroInvoiceNumber);
        setStatus(invoice.status);
        setStage(invoice.stage);
        setInvoiceDate(toDateInputValue(invoice.issuedAt ?? invoice.createdAt));
        setDueDate(toDateInputValue(invoice.dueDate));
        setCustomerReference(invoice.customerReference ?? invoice.xeroReference ?? '');
        setMessage(invoice.notes ?? '');
        setJobId(invoice.jobId ?? '');
        setAddresses(addressesFromSnapshot(invoice.addresses));
        setVatMode(inferVatModeFromLines(invoice.lineItems));
        setLines(lineItemsToEditorLines(invoice.lineItems));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load invoice');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, invoiceId, navigate]);

  useEffect(() => {
    if (isLoading || !editable) return;
    draftShell.touchField();
  }, [
    isLoading,
    editable,
    status,
    stage,
    invoiceDate,
    dueDate,
    customerReference,
    message,
    addresses,
    lines,
    vatMode,
    priceMode,
    approvedForSend,
    draftShell,
  ]);

  const persistInvoice = useCallback(
    async (strict: boolean, mode: FinanceDocumentPersistMode = 'save') => {
      if (!accessToken || !canWrite || !invoiceId || !editable) return null;

      const lineItems = strict
        ? parseEditorLinesForApi(lines, { priceMode, vatMode })
        : parseEditorLinesForDraft(lines, { priceMode, vatMode });

      if (strict && !lineItems) {
        setError('Add at least one line item with a description and unit price');
        return null;
      }

      return updateInvoice(accessToken, invoiceId, {
        status: strict ? status : (resolveFinanceDocumentPersistStatus(mode, status) as InvoiceStatus),
        stage,
        lineItems: lineItems!,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        issuedAt: invoiceDate ? new Date(invoiceDate).toISOString() : null,
        customerReference: customerReference.trim() || null,
        notes: message.trim() || null,
        ...addressesToApiPayload(addresses),
      });
    },
    [
      accessToken,
      addresses,
      canWrite,
      customerReference,
      dueDate,
      editable,
      invoiceDate,
      invoiceId,
      lines,
      message,
      priceMode,
      stage,
      status,
      vatMode,
    ],
  );

  const saveInvoiceDraft = useCallback(async () => {
    if (!accessToken || !canWrite || !invoiceId || !editable) {
      throw new Error('You do not have permission to save');
    }
    await draftShell.autosave.saveNow();
    const result = await persistInvoice(false);
    if (!result) {
      throw new Error('Unable to save invoice');
    }
    await linkPhotosAfterFinanceSave(accessToken, {
      documentType: 'invoice',
      recordId: invoiceId,
      documentNumber: displayInvoiceNumber || 'Draft — Xero invoice number pending',
      title: customer?.name ?? 'Invoice',
      customerId: customer?.id ?? null,
      jobId: jobId || null,
      photos,
    });
    setStatus(result.status);
    draftShell.markSubmitted();
    invalidateInvoices();
  }, [accessToken, canWrite, customer, displayInvoiceNumber, draftShell, editable, invalidateInvoices, invoiceId, jobId, persistInvoice, photos]);

  const { openPreview, previewModal } = useFinanceDocumentPreview({
    accessToken,
    saveHandlers: {
      canSave: canWrite && editable,
      onSave: saveInvoiceDraft,
      onSaveDraft: saveInvoiceDraft,
    },
  });

  async function handleAction(action: FinanceDocumentAction) {
    if (!accessToken || !canWrite || !editable) return;

    if (action === 'preview_pdf') {
      setError(null);
      await openPreview(
        buildFinanceEditorPreviewInput({
          kind: 'invoice',
          customer,
          customerReference,
          issuedAt: invoiceDate,
          dueDate,
          addresses,
          lines,
          vatMode,
          priceMode,
          notes: message,
          xeroInvoiceNumber,
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
        const result = await persistInvoice(false, mode);
        if (result) {
          setStatus(result.status);
          await linkPhotosAfterFinanceSave(accessToken, {
            documentType: 'invoice',
            recordId: invoiceId,
            documentNumber: displayInvoiceNumber || 'Draft — Xero invoice number pending',
            title: customer?.name ?? 'Invoice',
            customerId: customer?.id ?? null,
            jobId: jobId || null,
            photos,
          });
        }
        draftShell.markSubmitted();
        invalidateInvoices();
        notify({
          variant: 'saved',
          message: result
            ? financeDocumentSaveSuccessMessage(mode, 'invoice', result.status)
            : 'Unable to save invoice',
          dedupeKey: mode === 'save_draft' ? `invoice-draft-${invoiceId}` : `invoice-saved-${invoiceId}`,
        });
        return;
      }

      if (action === 'save_new') {
        const result = await persistInvoice(false, 'save');
        if (!result) return;
        draftShell.markSubmitted();
        navigate('/finance/invoices/new');
        return;
      }

      if (action === 'approve') {
        const updated = await persistInvoice(true);
        if (!updated) return;
        setApprovedForSend(true);
        notify({
          variant: 'saved',
          message: 'Invoice approved for sending',
          dedupeKey: `invoice-approved-${invoiceId}`,
        });
        return;
      }

      if (action === 'send') {
        if (!approvedForSend) {
          setError('Approve the invoice before sending');
          return;
        }
        await persistInvoice(true);
        await updateInvoice(accessToken, invoiceId, { status: 'sent' });
        setStatus('sent');
        invalidateInvoices();
        notify({ variant: 'saved', message: 'Invoice marked sent', dedupeKey: `invoice-sent-${invoiceId}` });
        navigate(`/finance/invoices/${invoiceId}`);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save invoice');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading invoice…</p>;

  if (!editable) {
    return (
      <div className="finance-page finance-page--editor finance-page--workspace">
        <PageHeader title="Edit Invoice" backFallbackHref={`/finance/invoices/${invoiceId}`} />
        <FinanceNav />
        <p className="form-error">This invoice is synced with Xero and cannot be edited locally.</p>
      </div>
    );
  }

  return (
    <div className="finance-page finance-page--editor finance-page--workspace">
      <PageHeader
        title={`Edit Invoice${displayInvoiceNumber ? ` · ${displayInvoiceNumber}` : ''}`}
        description={customer ? customer.name : undefined}
        backFallbackHref={`/finance/invoices/${invoiceId}`}
        guardNavigation={draftShell.guard.guardNavigation}
      />
      <FinanceNav />
      {draftShell.guard.unsavedChangesModal}
      {previewModal}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="finance-editor finance-editor--workspace">
        <div className="finance-editor__layout finance-editor__layout--workspace">
          <FinanceEditorCard title="Customer Details" className="finance-editor-card--customer">
            {accessToken ? (
              <CustomerSearchField accessToken={accessToken} value={customer} onChange={() => {}} disabled />
            ) : null}
            <Input
              label="Customer reference"
              value={customerReference}
              onChange={(e) => setCustomerReference(e.target.value)}
              placeholder="PO number, site reference, etc."
            />
          </FinanceEditorCard>

          <FinanceEditorCard title="Document Details" className="finance-editor-card--document">
            <Input
              label="Invoice date"
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
            <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <label className="titan-input-group finance-editor-field-group">
              <span className="titan-input-label">Stage</span>
              <select
                className="titan-input finance-editor-field"
                value={stage}
                onChange={(e) => setStage(e.target.value as InvoiceStage)}
              >
                {INVOICE_STAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="finance-editor-hint">{displayInvoiceNumber || 'Draft — Xero invoice number pending'}</p>
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

          {accessToken ? (
            <FinanceDocumentPhotosPanel
              accessToken={accessToken}
              documentType="invoice"
              invoiceId={invoiceId}
              jobId={jobId || undefined}
              customerId={customer?.id}
              documentNumber={displayInvoiceNumber || 'Draft — Xero invoice number pending'}
              customerName={customer?.name}
              photos={photos}
              onPhotosChange={setPhotos}
              disabled={!canWrite || !editable}
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
                  placeholder="Notes shown on the invoice document"
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
