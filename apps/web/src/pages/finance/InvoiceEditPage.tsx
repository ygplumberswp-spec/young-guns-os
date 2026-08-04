import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Button, Input } from '@titan/ui';
import type { FinanceCustomerSearchResult, InvoiceStatus } from '@titan/shared';
import { canEditInvoice, INVOICE_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchInvoice, updateInvoice } from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { CustomerSearchField } from '../../features/finance/CustomerSearchField';
import { FinanceCustomerAddresses } from '../../features/finance/FinanceCustomerAddresses';
import { FinanceEditorActions } from '../../features/finance/FinanceEditorActions';
import { FinanceEditorCard } from '../../features/finance/FinanceEditorCard';
import { FinanceLineItemsEditor } from '../../features/finance/FinanceLineItemsEditor';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { newFinanceEditorLine, parseEditorLinesForApi, type FinanceEditorLine } from '../../features/finance/finance-editor-utils';
import { canManageFinance } from '../../features/finance/utils';
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
  const [customerId, setCustomerId] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<InvoiceStatus>('draft');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<FinanceEditorLine[]>([newFinanceEditorLine()]);
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
    enabled: canWrite && !isLoading && Boolean(invoiceId),
    getPayload: () => ({ title, status, dueDate, notes, lines }),
    getMeta: () => ({ title: title || 'Edit invoice', customerLabel: customer?.name ?? null }),
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
        setEditable(canEditInvoice(invoice));
        setCustomerId(invoice.customerId);
        setCustomer({
          id: invoice.customerId,
          name: invoice.customerName,
          companyName: null,
          email: null,
          phone: null,
          xeroContactId: null,
        });
        setTitle(invoice.title);
        setStatus(invoice.status);
        setDueDate(invoice.dueDate ? invoice.dueDate.slice(0, 16) : '');
        setNotes(invoice.notes ?? '');
        setLines(
          invoice.lineItems.length
            ? invoice.lineItems.map((line) => ({
                key: line.id,
                category: line.category as FinanceEditorLine['category'],
                description: line.description,
                quantity: String(line.quantity),
                unitPrice: (line.unitPriceCents / 100).toFixed(2),
                unitCost: '',
                vatRateBps: String(line.vatRateBps),
              }))
            : [newFinanceEditorLine()],
        );
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Unable to load invoice');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, invoiceId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !editable) return;
    const lineItems = parseEditorLinesForApi(lines);
    if (!lineItems) {
      setError('Add at least one valid line item');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await updateInvoice(accessToken, invoiceId, {
        title,
        status,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        notes: notes.trim() || null,
        lineItems,
      });
      invalidateInvoices();
      draftShell.markSubmitted();
      notify({ variant: 'saved', message: 'Invoice updated', dedupeKey: 'invoice-updated' });
      navigate(`/finance/invoices/${invoiceId}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update invoice');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading invoice…</p>;

  return (
    <div className="finance-page finance-page--editor">
      <PageHeader
        title="Edit Invoice"
        description={customer ? customer.name : undefined}
        backFallbackHref={`/finance/invoices/${invoiceId}`}
        guardNavigation={draftShell.guard.guardNavigation}
      />
      <FinanceNav />
      {!editable ? (
        <p className="form-error">This invoice is synced with Xero and cannot be edited locally.</p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      {draftShell.guard.unsavedChangesModal}

      <form
        className="finance-editor"
        onSubmit={(event) => void handleSubmit(event)}
        onChange={() => draftShell.touchField()}
      >
        <div className="finance-editor__layout">
          <FinanceEditorCard id="invoice-edit-customer" title="Customer Details">
            <CustomerSearchField accessToken={accessToken!} value={customer} onChange={() => {}} disabled />
          </FinanceEditorCard>

          <FinanceEditorCard id="invoice-edit-document" title="Document Details">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={!editable} />
            <label className="titan-input-group finance-editor-field-group">
              <span className="titan-input-label">Status</span>
              <select
                className="titan-input finance-editor-field"
                value={status}
                disabled={!editable}
                onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
              >
                {INVOICE_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Due date"
              type="datetime-local"
              value={dueDate}
              disabled={!editable}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </FinanceEditorCard>

          {accessToken && customerId ? (
            <FinanceEditorCard id="invoice-edit-addresses" title="Addresses" className="finance-editor-card--full">
              <FinanceCustomerAddresses accessToken={accessToken} customerId={customerId} />
            </FinanceEditorCard>
          ) : null}

          <FinanceEditorCard id="invoice-edit-lines" title="Line Items" className="finance-editor-card--full">
            <FinanceLineItemsEditor lines={lines} onChange={setLines} disabled={!editable} showUnitCost={false} />
          </FinanceEditorCard>

          <FinanceEditorCard id="invoice-edit-notes" title="Notes" className="finance-editor-card--full">
            <label className="titan-input-group finance-editor-field-group">
              <span className="titan-input-label">Notes</span>
              <textarea
                className="titan-input finance-editor-field finance-textarea"
                rows={3}
                value={notes}
                disabled={!editable}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </FinanceEditorCard>
        </div>

        <footer className="finance-editor__footer">
          <FinanceEditorActions>
            <Button type="button" variant="secondary" onClick={() => navigate(`/finance/invoices/${invoiceId}`)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !editable}>
              {isSaving ? 'Saving…' : 'Save invoice'}
            </Button>
          </FinanceEditorActions>
        </footer>
      </form>
    </div>
  );
}
