import { useMemo, useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, Panel } from '@titan/ui';
import type { InvoiceStage, JobExecutionSummary, JobFinanceSummary } from '@titan/shared';
import {
  INVOICE_STAGE_OPTIONS,
  buildPaymentRecordHref,
  canInvoiceFromAcceptedQuote,
  deriveJobCashChainSteps,
  findAcceptedQuoteForInvoicing,
  suggestNextInvoiceStage,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { createInvoiceFromJob } from '../../lib/finance-api';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { buildJobFinanceActionHref } from './build-job-finance-action-href';
import { newFinanceClientActionId } from './utils';

type JobCompletionFinancePanelProps = {
  accessToken: string;
  jobId: string;
  customerId: string;
  jobStatus: string;
  jobNumber: string | null;
  financeSummary: JobFinanceSummary | null;
  execution: JobExecutionSummary | null;
  canManageFinance: boolean;
  onFinanceUpdated: () => Promise<void>;
};

export function JobCompletionFinancePanel({
  accessToken,
  jobId,
  customerId,
  jobStatus,
  jobNumber,
  financeSummary,
  execution,
  canManageFinance,
  onFinanceUpdated,
}: JobCompletionFinancePanelProps) {
  const [, navigate] = useLocation();
  const { invalidateInvoices, invalidateQuotes } = useStaffMutationInvalidation();
  const [invoiceStage, setInvoiceStage] = useState<InvoiceStage>('standard');
  const [isInvoicing, setIsInvoicing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const acceptedQuote = useMemo(
    () => findAcceptedQuoteForInvoicing(financeSummary?.quotes ?? []),
    [financeSummary?.quotes],
  );
  const canInvoiceFromJob = canInvoiceFromAcceptedQuote(financeSummary?.quotes ?? []);

  const chainSteps = useMemo(
    () =>
      deriveJobCashChainSteps({
        jobStatus,
        hasCompletionSnapshot: execution?.completionSnapshot != null,
        financeSummary,
      }),
    [execution?.completionSnapshot, financeSummary, jobStatus],
  );

  const suggestedStage = useMemo(
    () => suggestNextInvoiceStage(financeSummary?.invoices ?? []),
    [financeSummary?.invoices],
  );

  useEffect(() => {
    setInvoiceStage(suggestedStage);
  }, [suggestedStage]);

  const outstandingInvoice = financeSummary?.invoices.find(
    (invoice) => invoice.outstandingCents > 0,
  );

  const prefill = { jobId, customerId, from: 'job-detail' };
  const chips = financeSummary?.chips ?? [];

  async function handleInvoiceFromJob() {
    setIsInvoicing(true);
    setError(null);
    setSuccess(null);
    try {
      const invoice = await createInvoiceFromJob(accessToken, jobId, {
        clientActionId: newFinanceClientActionId('invoice-from-job'),
        stage: invoiceStage,
      });
      invalidateInvoices();
      invalidateQuotes();
      await onFinanceUpdated();
      setSuccess(`Invoice ${invoice.displayInvoiceNumber} created from accepted quote.`);
      navigate(`/finance/invoices/${invoice.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create invoice from job');
    } finally {
      setIsInvoicing(false);
    }
  }

  return (
    <Panel
      title="Completion & Billing"
      description="Booked → Completed → Invoiced → Paid. Gated mobile completion is the Completed source of truth. Internal invoice numbers stay pending until Xero sync."
    >
      <ol className="finance-chain-list">
        {chainSteps.map((step) => (
          <li
            key={step.id}
            className={step.done ? 'finance-chain-step finance-chain-step--done' : 'finance-chain-step'}
          >
            <strong>{step.label}</strong>
            <span className="page-muted">{step.detail}</span>
          </li>
        ))}
      </ol>

      {execution?.completionSnapshot ? (
        <dl className="finance-detail-list" style={{ marginTop: '0.75rem' }}>
          <div>
            <dt>Completion snapshot</dt>
            <dd>
              Recorded {new Date(execution.completionSnapshot.createdAt).toLocaleString()}
              {jobNumber ? ` · job # ${jobNumber}` : ''}
            </dd>
          </div>
        </dl>
      ) : jobStatus === 'completed' ? (
        <p className="page-muted" style={{ marginTop: '0.75rem' }}>
          Office job status is completed, but there is no gated mobile completion snapshot. Billing
          can continue; field evidence package is missing.
        </p>
      ) : (
        <p className="page-muted" style={{ marginTop: '0.75rem' }}>
          Field completion snapshot will appear here after gated mobile completion. Office status
          alone does not create the snapshot.
        </p>
      )}

      {financeSummary == null ? (
        <p className="page-muted" style={{ marginTop: '0.75rem' }}>
          Finance summary unavailable for this job right now.
        </p>
      ) : chips.length > 0 ? (
        <div className="finance-chip-row" style={{ marginTop: '0.75rem' }}>
          {chips.map((chip, index) =>
            chip.href ? (
              <Link key={`${chip.kind}-${index}`} href={chip.href} className="finance-chip">
                <span>{chip.label}</span>
                <strong>{chip.value}</strong>
              </Link>
            ) : (
              <span key={`${chip.kind}-${index}`} className="finance-chip">
                <span>{chip.label}</span>
                <strong>{chip.value}</strong>
              </span>
            ),
          )}
        </div>
      ) : (
        <p className="page-muted" style={{ marginTop: '0.75rem' }}>
          No quotes, invoices, or payments linked to this job yet. Totals stay empty until finance
          records exist — nothing is invented here.
        </p>
      )}

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {canManageFinance ? (
        <div className="finance-panel-actions">
          <Link href={buildJobFinanceActionHref('quote', prefill)}>
            <Button variant="secondary" size="sm">
              Create quote
            </Button>
          </Link>

          {canInvoiceFromJob ? (
            <>
              <label className="titan-input-group" style={{ minWidth: '10rem' }}>
                <span className="titan-input-label">Invoice stage</span>
                <select
                  className="titan-input"
                  value={invoiceStage}
                  onChange={(event) => setInvoiceStage(event.target.value as InvoiceStage)}
                >
                  {INVOICE_STAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="secondary"
                size="sm"
                disabled={isInvoicing}
                onClick={() => void handleInvoiceFromJob()}
              >
                {isInvoicing
                  ? 'Creating…'
                  : `Invoice from ${acceptedQuote?.quoteNumber ?? 'accepted quote'}`}
              </Button>
            </>
          ) : (
            <Link href={buildJobFinanceActionHref('invoice', prefill)}>
              <Button variant="secondary" size="sm">
                Create invoice
              </Button>
            </Link>
          )}

          <Link
            href={buildPaymentRecordHref({
              invoiceId: outstandingInvoice?.id,
              jobId,
            })}
          >
            <Button variant="ghost" size="sm">
              Record payment
            </Button>
          </Link>
        </div>
      ) : null}
    </Panel>
  );
}
