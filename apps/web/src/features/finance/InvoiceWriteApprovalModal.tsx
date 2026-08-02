import { useState } from 'react';
import { Button } from '@titan/ui';
import type { InvoiceSummary, InvoiceWriteApprovalSummary } from '@titan/shared';
import { formatMoney } from '@titan/shared';
import {
  approveInvoiceWriteApproval,
  createInvoiceWriteApproval,
  executeInvoiceWriteApproval,
} from '../../lib/invoice-write-approval-api';
import { newFinanceClientActionId } from './utils';

type InvoiceWriteApprovalModalProps = {
  open: boolean;
  invoice: InvoiceSummary;
  operation: 'invoice_void' | 'credit_note_create';
  accessToken: string;
  isOwner: boolean;
  onClose: () => void;
  onComplete: () => void;
};

const VOID_GUIDANCE =
  'Void when an issued invoice was raised in error, duplicated, or must be cancelled before payment. ' +
  'This requires owner approval and a Xero write — TITAN will not silently edit issued invoices.';

const CREDIT_GUIDANCE =
  'Create a credit note when correcting line items, applying a partial credit, or reversing charges on an issued invoice. ' +
  'Credit amount cannot exceed outstanding balance. Xero remains the source of truth.';

export function InvoiceWriteApprovalModal({
  open,
  invoice,
  operation,
  accessToken,
  isOwner,
  onClose,
  onComplete,
}: InvoiceWriteApprovalModalProps) {
  const [reason, setReason] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approval, setApproval] = useState<InvoiceWriteApprovalSummary | null>(null);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);

  if (!open) return null;

  const title = operation === 'invoice_void' ? 'Void invoice' : 'Create credit note';
  const guidance = operation === 'invoice_void' ? VOID_GUIDANCE : CREDIT_GUIDANCE;

  async function handleSubmitRequest() {
    setPending(true);
    setError(null);
    try {
      const clientActionId = newFinanceClientActionId('write-approval');
      const creditAmountCents =
        operation === 'credit_note_create' && creditAmount.trim()
          ? Math.round(Number.parseFloat(creditAmount.replace(/[^0-9.-]/g, '')) * 100)
          : undefined;

      const created = await createInvoiceWriteApproval(accessToken, invoice.id, {
        operation,
        reason: reason.trim(),
        clientActionId,
        creditAmountCents,
      });
      setApproval(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit request');
    } finally {
      setPending(false);
    }
  }

  async function handleApprove() {
    if (!approval) return;
    setPending(true);
    setError(null);
    try {
      const updated = await approveInvoiceWriteApproval(accessToken, approval.id);
      setApproval(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to approve');
    } finally {
      setPending(false);
    }
  }

  async function handleExecute() {
    if (!approval) return;
    setPending(true);
    setError(null);
    try {
      const result = await executeInvoiceWriteApproval(
        accessToken,
        approval.id,
        newFinanceClientActionId('write-exec'),
      );
      setApproval(result.approval);
      setExecutionMessage(result.message);
      if (result.executionStatus === 'executed') {
        onComplete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to execute');
    } finally {
      setPending(false);
    }
  }

  function handleClose() {
    setReason('');
    setCreditAmount('');
    setApproval(null);
    setError(null);
    setExecutionMessage(null);
    onClose();
  }

  const status = approval?.status ?? 'draft';
  const canRequest = !approval && reason.trim().length >= 3;
  const canApprove = approval?.status === 'pending' && isOwner;
  const canExecute =
    approval?.status === 'approved' ||
    approval?.status === 'approved_awaiting_provider_write';

  return (
    <div className="ux-confirm-backdrop" role="presentation" onClick={pending ? undefined : handleClose}>
      <div
        className="ux-confirm-dialog ux-confirm-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-write-approval-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="invoice-write-approval-title" className="ux-confirm-dialog__title">
          {title}
        </h2>
        <p className="ux-confirm-dialog__body">{guidance}</p>

        <div className="ux-approval-card__meta" style={{ marginBottom: '1rem' }}>
          <p>
            <strong>{invoice.displayInvoiceNumber}</strong> — {invoice.title}
          </p>
          <p>
            Status: {invoice.status} · Total: {formatMoney(invoice.totalCents, invoice.currency)} ·
            Outstanding: {formatMoney(invoice.outstandingCents, invoice.currency)}
          </p>
          {approval ? (
            <p>
              Expected effect: {approval.expectedEffect}
            </p>
          ) : null}
        </div>

        {!approval ? (
          <>
            <label className="titan-field">
              <span className="titan-field__label">Reason (required)</span>
              <textarea
                className="titan-input"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this action is appropriate…"
                disabled={pending}
              />
            </label>
            {operation === 'credit_note_create' ? (
              <label className="titan-field">
                <span className="titan-field__label">Credit amount (optional — defaults to outstanding)</span>
                <input
                  className="titan-input"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder={formatMoney(invoice.outstandingCents, invoice.currency)}
                  disabled={pending}
                />
              </label>
            ) : null}
          </>
        ) : (
          <div className="ux-approval-card__meta">
            <p>
              Status: <strong>{approval.status}</strong>
            </p>
            {approval.providerWriteBlocked ? (
              <p className="finance-badge--overdue">{approval.providerWriteMessage}</p>
            ) : null}
            {executionMessage ? <p>{executionMessage}</p> : null}
          </div>
        )}

        {error ? <p className="form-error">{error}</p> : null}

        <div className="ux-confirm-dialog__actions">
          <Button variant="ghost" type="button" disabled={pending} onClick={handleClose}>
            Close
          </Button>
          {!approval ? (
            <Button variant="primary" type="button" disabled={pending || !canRequest} onClick={handleSubmitRequest}>
              {pending ? 'Submitting…' : 'Submit for approval'}
            </Button>
          ) : null}
          {canApprove ? (
            <Button variant="primary" type="button" disabled={pending} onClick={handleApprove}>
              {pending ? 'Approving…' : 'Approve'}
            </Button>
          ) : null}
          {canExecute && isOwner ? (
            <Button variant="secondary" type="button" disabled={pending} onClick={handleExecute}>
              {pending ? 'Executing…' : 'Execute (Xero-gated)'}
            </Button>
          ) : null}
          {approval && !isOwner && status === 'pending' ? (
            <p className="ux-confirm-dialog__body">Awaiting Company Owner approval.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
