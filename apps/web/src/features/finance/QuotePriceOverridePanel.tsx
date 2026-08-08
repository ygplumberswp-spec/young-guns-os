import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Input, Panel } from '@titan/ui';
import { formatMoney, type QuoteDetail } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  approveQuotePriceOverride,
  executeQuotePriceOverride,
  fetchQuotePriceOverrides,
  proposeQuotePriceOverride,
  type QuotePriceOverrideDto,
  type QuotePriceOverridePreviewDto,
} from '../../lib/finance-api';

type Props = {
  accessToken: string;
  quote: QuoteDetail;
  canWrite: boolean;
  isOwner: boolean;
  onExecuted: () => void;
};

export function QuotePriceOverridePanel({
  accessToken,
  quote,
  canWrite,
  isOwner,
  onExecuted,
}: Props) {
  const editable = canWrite && !quote.isImmutable && ['draft', 'internal_review', 'approved_for_sending'].includes(quote.status);
  const customerLines = useMemo(
    () => quote.lineItems.filter((l) => l.customerVisible !== false),
    [quote.lineItems],
  );

  const [lineId, setLineId] = useState(customerLines[0]?.id ?? '');
  const [targetRand, setTargetRand] = useState('');
  const [reason, setReason] = useState('');
  const [overrides, setOverrides] = useState<QuotePriceOverrideDto[]>([]);
  const [preview, setPreview] = useState<QuotePriceOverridePreviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!customerLines.some((l) => l.id === lineId)) {
      setLineId(customerLines[0]?.id ?? '');
    }
  }, [customerLines, lineId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchQuotePriceOverrides(accessToken, quote.id);
        if (!cancelled) setOverrides(data.overrides);
      } catch {
        /* list is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, quote.id, quote.updatedAt]);

  const open = overrides.find((o) => o.status === 'DRAFT_PROPOSAL' || o.status === 'OWNER_APPROVED');

  async function onPropose(e: FormEvent) {
    e.preventDefault();
    if (!editable || !lineId) return;
    setBusy(true);
    setError(null);
    try {
      const cents = Math.round(Number(targetRand) * 100);
      if (!Number.isFinite(cents) || cents < 0) throw new Error('Enter a valid target sell price');
      const data = await proposeQuotePriceOverride(accessToken, quote.id, {
        reason,
        lines: [{ lineId, targetSellPriceCents: cents }],
      });
      setPreview(data.preview);
      setOverrides((prev) => [data.override, ...prev]);
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : 'Propose failed');
    } finally {
      setBusy(false);
    }
  }

  async function onApprove() {
    if (!open || !isOwner) return;
    setBusy(true);
    setError(null);
    try {
      const data = await approveQuotePriceOverride(accessToken, open.id);
      setOverrides((prev) => prev.map((o) => (o.id === data.override.id ? data.override : o)));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Approve failed');
    } finally {
      setBusy(false);
    }
  }

  async function onExecute() {
    if (!open || !isOwner || open.status !== 'OWNER_APPROVED') return;
    setBusy(true);
    setError(null);
    try {
      const data = await executeQuotePriceOverride(accessToken, open.id);
      setOverrides((prev) => prev.map((o) => (o.id === data.override.id ? data.override : o)));
      onExecuted();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Execute failed');
    } finally {
      setBusy(false);
    }
  }

  if (!editable && !open && overrides.length === 0) {
    return null;
  }

  return (
    <Panel title="One-off price override (Owner-approved)">
      <p className="page-muted">
        Quote-specific only. Does not change the global pricebook or Row 92 tier rules. Global
        automatic pricing remains OFF.
      </p>

      {open ? (
        <div>
          <p>
            Status: <strong>{open.status}</strong> · Preview hash: {open.previewHash}
          </p>
          <p className="page-muted">Reason (internal): {open.reason}</p>
          <p>
            Totals: {formatMoney(open.beforeTotalCents, quote.currency)} →{' '}
            {formatMoney(open.afterTotalCents, quote.currency)}
          </p>
          {isOwner && open.status === 'DRAFT_PROPOSAL' ? (
            <Button type="button" disabled={busy} onClick={() => void onApprove()}>
              Owner approve
            </Button>
          ) : null}
          {isOwner && open.status === 'OWNER_APPROVED' ? (
            <Button type="button" disabled={busy} onClick={() => void onExecute()}>
              Execute override
            </Button>
          ) : null}
        </div>
      ) : editable ? (
        <form onSubmit={onPropose}>
          <label>
            Line
            <select value={lineId} onChange={(e) => setLineId(e.target.value)}>
              {customerLines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.description} ({formatMoney(line.unitPriceCents, quote.currency)})
                </option>
              ))}
            </select>
          </label>
          <label>
            Target sell (R, ex VAT)
            <Input value={targetRand} onChange={(e) => setTargetRand(e.target.value)} />
          </label>
          <label>
            Reason (required, internal)
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <Button type="submit" disabled={busy || !reason.trim()}>
            Propose override
          </Button>
        </form>
      ) : null}

      {preview ? (
        <div className="page-muted">
          Preview: before {formatMoney(preview.beforeTotalCents, quote.currency)} → after{' '}
          {formatMoney(preview.afterTotalCents, quote.currency)}
          {preview.hasBelowKnownCostWarning ? ' · WARNING: OVERRIDE_BELOW_KNOWN_COST' : ''}
        </div>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
    </Panel>
  );
}
