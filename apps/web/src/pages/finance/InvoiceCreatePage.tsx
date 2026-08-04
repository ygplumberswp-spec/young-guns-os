import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button, Input } from '@titan/ui';
import type {
  FinanceCustomerSearchResult,
  InvoiceStage,
  InvoiceStatus,
  JobSummary,
  QuoteSummary,
} from '@titan/shared';
import { INVOICE_STAGE_OPTIONS, INVOICE_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomer } from '../../lib/crm-api';
import { createInvoice, fetchQuote, fetchQuotes } from '../../lib/finance-api';
import { fetchJobs } from '../../lib/jobs-api';
import { CustomerSearchField } from '../../features/finance/CustomerSearchField';
import { FinanceCustomerAddresses } from '../../features/finance/FinanceCustomerAddresses';
import { FinanceEditorActions } from '../../features/finance/FinanceEditorActions';
import { FinanceEditorCard } from '../../features/finance/FinanceEditorCard';
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
import { AutosaveIndicator, PageHeader } from '../../components/ux';
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
  const [title, setTitle] = useState('');
  const [lines, setLines] = useState<FinanceEditorLine[]>([newFinanceEditorLine()]);
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
      lines,
      status,
      stage,
      dueDate,
      notes,
    }),
    getMeta: () => ({
      title: title || 'New invoice',
      customerLabel: selectedCustomer?.name ?? null,
      completionPct: title.trim() && customerId ? 40 : 20,
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
        const preCustomerId = params.get('customerId');
        const preJobId = params.get('jobId');
        const preQuoteId = params.get('quoteId');
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

        if (!cancelled && preQuoteId) {
          setQuoteId(preQuoteId);
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
    if (!accessToken || !quoteId) return;

    let cancelled = false;
    void fetchQuote(accessToken, quoteId).then((quote) => {
      if (cancelled) return;
      setTitle(quote.title);
      setLines(
        quote.lineItems.length
          ? quote.lineItems.map((line) => ({
              key: line.id,
              category: line.category,
              description: line.description,
              quantity: String(line.quantity),
              unitPrice: (line.unitPriceCents / 100).toFixed(2),
              unitCost: '',
              vatRateBps: String(line.vatRateBps),
            }))
          : [newFinanceEditorLine()],
      );
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, quoteId]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const draftId = params.get('draftId');
    if (!accessToken || !draftId) return;

    let cancelled = false;
    void fetchDraft(accessToken, draftId).then((draft) => {
      if (cancelled || draft.recordType !== 'invoice') return;
      const payload = draft.payload;
      if (typeof payload.jobId === 'string') setJobId(payload.jobId);
      if (typeof payload.quoteId === 'string') setQuoteId(payload.quoteId);
      if (typeof payload.title === 'string') setTitle(payload.title);
      if (Array.isArray(payload.lines)) setLines(payload.lines as FinanceEditorLine[]);
      if (typeof payload.status === 'string') setStatus(payload.status as InvoiceStatus);
      if (typeof payload.stage === 'string') setStage(payload.stage as InvoiceStage);
      if (typeof payload.dueDate === 'string') setDueDate(payload.dueDate);
      if (typeof payload.notes === 'string') setNotes(payload.notes);
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
    quoteId,
    title,
    lines,
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

    const lineItems = parseEditorLinesForApi(lines);
    if (!lineItems) {
      setError('Add at least one line item with a description and unit price');
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
        lineItems,
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
    <div className="finance-page finance-page--editor">
      <PageHeader
        title="New Invoice"
        description="Create an invoice with line items. Official numbers are assigned by Xero after sync."
        guardNavigation={draftShell.guard.guardNavigation}
      />
      <FinanceNav />
      <AutosaveIndicator status={draftShell.autosave.status} className="finance-draft-status" />
      {draftShell.guard.unsavedChangesModal}
      {error ? <p className="form-error">{error}</p> : null}

      <form className="finance-editor" onSubmit={(event) => void handleSubmit(event)}>
        <div className="finance-editor__layout">
          <FinanceEditorCard
            id="invoice-customer"
            title="Customer Details"
            description="Search, select or create the customer for this invoice."
          >
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
                    {quote.displayQuoteNumber} · {quote.title}
                  </option>
                ))}
              </select>
            </label>
          </FinanceEditorCard>

          <FinanceEditorCard
            id="invoice-document"
            title="Document Details"
            description="Title, stage, status and due date."
          >
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
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
            <label className="titan-input-group finance-editor-field-group">
              <span className="titan-input-label">Status</span>
              <select
                className="titan-input finance-editor-field"
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
            <p className="finance-editor-hint">Draft — Xero invoice number pending until sync completes.</p>
          </FinanceEditorCard>

          {accessToken && customerId ? (
            <FinanceEditorCard
              id="invoice-addresses"
              title="Addresses"
              description="Billing and site addresses on file for this customer."
              className="finance-editor-card--full"
            >
              <FinanceCustomerAddresses accessToken={accessToken} customerId={customerId} />
            </FinanceEditorCard>
          ) : null}

          <FinanceEditorCard
            id="invoice-lines"
            title="Line Items"
            description="Add work, materials and totals. VAT applies at document level."
            className="finance-editor-card--full"
          >
            <FinanceLineItemsEditor lines={lines} onChange={setLines} showUnitCost={false} />
          </FinanceEditorCard>

          <FinanceEditorCard
            id="invoice-notes"
            title="Notes"
            description="Additional notes shown on the invoice."
            className="finance-editor-card--full"
          >
            <label className="titan-input-group finance-editor-field-group">
              <span className="titan-input-label">Notes</span>
              <textarea
                className="titan-input finance-editor-field finance-textarea"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </FinanceEditorCard>
        </div>

        <footer className="finance-editor__footer">
          <FinanceEditorActions>
            <Button type="button" variant="secondary" onClick={() => navigate('/finance/invoices')}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !title.trim() || !customerId}>
              {isSaving ? 'Creating…' : 'Create invoice'}
            </Button>
          </FinanceEditorActions>
        </footer>
      </form>
    </div>
  );
}
