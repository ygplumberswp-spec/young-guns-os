import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { Button, LoadingState, PageHeader, Panel } from '@titan/ui';
import type { InvoiceStage, QuoteDetail } from '@titan/shared';
import { formatMoney, INVOICE_STAGE_OPTIONS, QUOTE_STATUS_OPTIONS, canEditQuote, canIssueQuote, nextQuoteApprovalAction } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  createInvoiceFromQuote,
  createQuoteVersion,
  fetchQuote,
  issueQuote,
  updateQuote,
} from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canAccessFinance, canManageFinance, newFinanceClientActionId } from '../../features/finance/utils';
import { useRecordRecentView } from '../../hooks/useRecordRecentView';

function formatStatus(status: QuoteDetail['status']): string {
  return QUOTE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

const DRAFT_STATUSES = new Set(['draft', 'internal_review', 'approved_for_sending']);

export function QuoteDetailPage() {
  const [, params] = useRoute('/finance/quotes/:id');
  const quoteId = params?.id ?? '';
  const [, navigate] = useLocation();
  const { accessToken, user } = useAuth();
  const { invalidateQuotes, invalidateInvoices } = useStaffMutationInvalidation();

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [isIssuing, setIsIssuing] = useState(false);
  const [versionReason, setVersionReason] = useState('');
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);

  const [invoiceStage, setInvoiceStage] = useState<InvoiceStage>('standard');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [isConverting, setIsConverting] = useState(false);

  const [isAdvancing, setIsAdvancing] = useState(false);

  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFinance(user.permissions) : false), [user]);

  useRecordRecentView(
    quote
      ? {
          id: quote.id,
          kind: 'quote',
          title: quote.title,
          href: `/finance/quotes/${quote.id}`,
        }
      : null,
  );

  const loadQuote = useCallback(async () => {
    if (!accessToken || !quoteId) return;
    const data = await fetchQuote(accessToken, quoteId);
    setQuote(data);
  }, [accessToken, quoteId]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !quoteId || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        await loadQuote();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load quote');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, quoteId, canView, loadQuote]);

  if (!canView) {
    return (
      <div className="finance-page">
        <PageHeader title="Quote" description="You do not have permission to view finance." />
      </div>
    );
  }

  if (isLoading) {
    return <LoadingState label="Loading quote…" />;
  }

  if (error && !quote) {
    return (
      <div className="finance-page">
        <PageHeader title="Quote" description="Quote detail" />
        <p className="form-error">{error}</p>
        <Link href="/finance/quotes">
          <Button variant="secondary">Back to quotes</Button>
        </Link>
      </div>
    );
  }

  if (!quote) {
    return null;
  }

  const activeQuote = quote;
  const approvalAction = nextQuoteApprovalAction(activeQuote.status);
  const showEdit = canWrite && canEditQuote(activeQuote);
  const canIssue = canWrite && canIssueQuote(activeQuote);
  const canCreateVersion =
    canWrite && (activeQuote.isImmutable || !DRAFT_STATUSES.has(activeQuote.status));
  const canConvertToInvoice = canWrite && activeQuote.status === 'accepted';

  async function handleAdvanceApproval() {
    if (!accessToken || !approvalAction) return;
    setIsAdvancing(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateQuote(accessToken, activeQuote.id, {
        status: approvalAction.nextStatus,
      });
      setQuote(updated);
      invalidateQuotes();
      setSuccess(`${approvalAction.label} complete.`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to advance quote approval');
    } finally {
      setIsAdvancing(false);
    }
  }

  async function handleIssue() {
    if (!accessToken || !canIssue) return;
    setIsIssuing(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await issueQuote(accessToken, activeQuote.id);
      setQuote(updated);
      invalidateQuotes();
      setSuccess('Quote issued to the customer.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to issue quote');
    } finally {
      setIsIssuing(false);
    }
  }

  async function handleCreateVersion() {
    if (!accessToken || !canCreateVersion) return;
    setIsCreatingVersion(true);
    setError(null);
    setSuccess(null);
    try {
      const nextQuote = await createQuoteVersion(accessToken, activeQuote.id, {
        clientActionId: newFinanceClientActionId('quote-version'),
        reason: versionReason.trim() || null,
      });
      invalidateQuotes();
      navigate(`/finance/quotes/${nextQuote.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create new version');
    } finally {
      setIsCreatingVersion(false);
    }
  }

  async function handleConvertToInvoice() {
    if (!accessToken || !canConvertToInvoice) return;
    setIsConverting(true);
    setError(null);
    setSuccess(null);
    try {
      const invoice = await createInvoiceFromQuote(accessToken, activeQuote.id, {
        clientActionId: newFinanceClientActionId('quote-invoice'),
        stage: invoiceStage,
        dueDate: invoiceDueDate ? new Date(invoiceDueDate).toISOString() : null,
        notes: invoiceNotes.trim() || null,
      });
      invalidateQuotes();
      invalidateInvoices();
      navigate(`/finance/invoices/${invoice.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to convert quote to invoice');
    } finally {
      setIsConverting(false);
    }
  }

  return (
    <div className="finance-page">
      <PageHeader
        title={`${quote.quoteNumber} · ${quote.title}`}
        description={`Version ${quote.versionNumber}${quote.isImmutable ? ' · issued (immutable)' : ' · editable'}`}
        actions={
          <div className="finance-panel-actions">
            {showEdit ? (
              <Link href={`/finance/quotes/${quote.id}/edit`}>
                <Button variant="secondary">Edit quote</Button>
              </Link>
            ) : null}
            <Link href="/finance/quotes">
              <Button variant="ghost">Back to quotes</Button>
            </Link>
          </div>
        }
      />
      <FinanceNav />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="finance-detail">
        <Panel title="Summary">
          <dl className="finance-detail-list">
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`finance-status finance-status--${quote.status}`}>
                  {formatStatus(quote.status)}
                </span>
              </dd>
            </div>
            <div>
              <dt>Customer</dt>
              <dd>
                <Link href={`/crm/${quote.customerId}`} className="finance-link">
                  {quote.customerName}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Job</dt>
              <dd>
                {quote.jobId ? (
                  <Link href={`/jobs/${quote.jobId}`} className="finance-link">
                    {quote.jobTitle}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(quote.subtotalCents, quote.currency)}</dd>
            </div>
            <div>
              <dt>VAT</dt>
              <dd className="tabular-nums">{formatMoney(quote.vatCents, quote.currency)}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(quote.totalCents, quote.currency)}</dd>
            </div>
            <div>
              <dt>Valid until</dt>
              <dd>{quote.validUntil ? new Date(quote.validUntil).toLocaleString() : '—'}</dd>
            </div>
            <div>
              <dt>Issued</dt>
              <dd>{quote.issuedAt ? new Date(quote.issuedAt).toLocaleString() : '—'}</dd>
            </div>
            <div>
              <dt>Accepted</dt>
              <dd>{quote.acceptedAt ? new Date(quote.acceptedAt).toLocaleString() : '—'}</dd>
            </div>
          </dl>

          {canWrite ? (
            <div className="finance-panel-actions">
              {approvalAction ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isAdvancing}
                  onClick={() => void handleAdvanceApproval()}
                >
                  {isAdvancing ? 'Updating…' : approvalAction.label}
                </Button>
              ) : null}
              {canIssue ? (
                <Button type="button" disabled={isIssuing} onClick={() => void handleIssue()}>
                  {isIssuing ? 'Issuing…' : 'Issue quote'}
                </Button>
              ) : null}
              {canConvertToInvoice ? (
                <span className="page-muted">Accepted — ready to convert to invoice below.</span>
              ) : null}
            </div>
          ) : null}
        </Panel>

        {(quote.scopeOfWork || quote.exclusions || quote.paymentTerms) ? (
          <Panel title="Scope & terms">
            <dl className="finance-detail-list">
              {quote.scopeOfWork ? (
                <div>
                  <dt>Scope of work</dt>
                  <dd>{quote.scopeOfWork}</dd>
                </div>
              ) : null}
              {quote.exclusions ? (
                <div>
                  <dt>Exclusions</dt>
                  <dd>{quote.exclusions}</dd>
                </div>
              ) : null}
              {quote.paymentTerms ? (
                <div>
                  <dt>Payment terms</dt>
                  <dd>{quote.paymentTerms}</dd>
                </div>
              ) : null}
            </dl>
          </Panel>
        ) : null}

        <Panel title="Line items">
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  {quote.profit ? <th>Unit cost</th> : null}
                  <th>VAT</th>
                  <th>Total</th>
                  {quote.profit ? <th>Line profit</th> : null}
                </tr>
              </thead>
              <tbody>
                {quote.lineItems.map((line) => (
                  <tr key={line.id}>
                    <td>
                      {line.description}
                      {line.isOptional ? <span className="page-muted"> (optional)</span> : null}
                    </td>
                    <td>{line.quantity}</td>
                    <td className="tabular-nums">{formatMoney(line.unitPriceCents, quote.currency)}</td>
                    {quote.profit ? (
                      <td className="tabular-nums">
                        {line.unitCostCents != null ? formatMoney(line.unitCostCents, quote.currency) : '—'}
                      </td>
                    ) : null}
                    <td className="tabular-nums">{formatMoney(line.lineVatCents, quote.currency)}</td>
                    <td className="tabular-nums">{formatMoney(line.lineTotalCents, quote.currency)}</td>
                    {quote.profit ? (
                      <td className="tabular-nums">
                        {line.lineCostCents != null
                          ? formatMoney(line.lineTotalCents - line.lineVatCents - line.lineCostCents, quote.currency)
                          : '—'}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {quote.profit ? (
          <Panel
            title="Internal profit (not visible to customer)"
            description={quote.profit.missingCostWarning ? 'Cost data is incomplete for this quote.' : undefined}
          >
            <dl className="finance-detail-list">
              <div>
                <dt>Estimated cost</dt>
                <dd className="tabular-nums">{formatMoney(quote.profit.estimatedCostCents, quote.currency)}</dd>
              </div>
              <div>
                <dt>Gross profit</dt>
                <dd className="tabular-nums">{formatMoney(quote.profit.grossProfitCents, quote.currency)}</dd>
              </div>
              <div>
                <dt>Markup</dt>
                <dd>{formatBps(quote.profit.markupBps)}</dd>
              </div>
              <div>
                <dt>Margin</dt>
                <dd>{formatBps(quote.profit.marginBps)}</dd>
              </div>
              <div>
                <dt>Profit floor price</dt>
                <dd className="tabular-nums">{formatMoney(quote.profit.profitFloorCents, quote.currency)}</dd>
              </div>
              <div>
                <dt>Target price</dt>
                <dd className="tabular-nums">{formatMoney(quote.profit.targetPriceCents, quote.currency)}</dd>
              </div>
            </dl>
            {quote.profit.belowFloor ? (
              <p className="finance-badge--danger" style={{ marginTop: '0.75rem' }}>
                Below profit floor{quote.belowFloorOverride ? ' — override authorized' : ''}
                {quote.belowFloorReason ? `: ${quote.belowFloorReason}` : ''}
              </p>
            ) : null}
          </Panel>
        ) : null}

        {quote.acceptance ? (
          <Panel title="Acceptance evidence">
            <dl className="finance-detail-list">
              <div>
                <dt>Decision</dt>
                <dd>{quote.acceptance.decision.replace(/_/g, ' ')}</dd>
              </div>
              <div>
                <dt>Version accepted</dt>
                <dd>{quote.acceptance.acceptedVersionNumber}</dd>
              </div>
              <div>
                <dt>Name</dt>
                <dd>{quote.acceptance.accepterName ?? '—'}</dd>
              </div>
              {quote.acceptance.declineReason ? (
                <div>
                  <dt>Decline reason</dt>
                  <dd>{quote.acceptance.declineReason}</dd>
                </div>
              ) : null}
              {quote.acceptance.changeRequestMessage ? (
                <div>
                  <dt>Change request</dt>
                  <dd>{quote.acceptance.changeRequestMessage}</dd>
                </div>
              ) : null}
              <div>
                <dt>Recorded</dt>
                <dd>{new Date(quote.acceptance.createdAt).toLocaleString()}</dd>
              </div>
            </dl>
          </Panel>
        ) : null}

        {canWrite && canCreateVersion ? (
          <Panel
            title="Create new version"
            description="Issued quotes are immutable. Create a new version to make changes."
          >
            <label className="titan-input-group">
              <span className="titan-input-label">Reason (optional)</span>
              <textarea
                className="titan-input finance-textarea"
                rows={2}
                value={versionReason}
                onChange={(e) => setVersionReason(e.target.value)}
              />
            </label>
            <div className="finance-panel-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={isCreatingVersion}
                onClick={() => void handleCreateVersion()}
              >
                {isCreatingVersion ? 'Creating…' : 'Create new version'}
              </Button>
            </div>
          </Panel>
        ) : null}

        {canConvertToInvoice ? (
          <Panel title="Convert to invoice" description="Create an invoice from this accepted quote.">
            <label className="titan-input-group">
              <span className="titan-input-label">Invoice stage</span>
              <select
                className="titan-input"
                value={invoiceStage}
                onChange={(e) => setInvoiceStage(e.target.value as InvoiceStage)}
              >
                {INVOICE_STAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="titan-input-group">
              <span className="titan-input-label">Due date (optional)</span>
              <input
                type="datetime-local"
                className="titan-input"
                value={invoiceDueDate}
                onChange={(e) => setInvoiceDueDate(e.target.value)}
              />
            </label>
            <label className="titan-input-group">
              <span className="titan-input-label">Notes (optional)</span>
              <textarea
                className="titan-input finance-textarea"
                rows={2}
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
              />
            </label>
            <div className="finance-panel-actions">
              <Button type="button" disabled={isConverting} onClick={() => void handleConvertToInvoice()}>
                {isConverting ? 'Converting…' : 'Create invoice'}
              </Button>
            </div>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
