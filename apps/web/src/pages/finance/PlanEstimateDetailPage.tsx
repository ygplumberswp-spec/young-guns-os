import { useCallback, useEffect, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { PageHeader } from '../../components/ux';
import { Button, LoadingState, Panel } from '@titan/ui';
import { formatMoney } from '@titan/shared';
import { ApiClientError, request } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canManageFinance, newFinanceClientActionId } from '../../features/finance/utils';

type Detail = {
  estimate: {
    id: string;
    status: string;
    sourceFilename: string | null;
    sourceRevisionLabel: string | null;
    sourceDocumentId?: string | null;
    estimateVersion: number;
    scaleStatus: string;
    proposedSellExVatCents: number | null;
    quoteId: string | null;
    jobId: string | null;
    customerId: string | null;
  };
  items: Array<{
    id: string;
    pointType: string;
    description: string;
    quantity: string;
    confidence: string;
    pageReference: string | null;
  }>;
  summary: {
    materialsCostCents: number | null;
    labourCostCents: number | null;
    siteCostCents: number | null;
    directCostTotalCents: number | null;
    costEstimateIncomplete: boolean;
    proposedSellExVatCents: number | null;
    estimatedGrossProfitCents: number | null;
    estimatedGrossMarginBps: number | null;
    gpIncomplete: boolean;
  };
};

type AiTakeoffList = {
  runs: Array<{
    id: string;
    status: string;
    sourceRevisionLabel: string | null;
    humanReviewRequired: boolean;
    auraNarrativeFacts: string[] | null;
    createdAt: string;
  }>;
  items: Array<{
    id: string;
    takeoffId: string;
    pointType: string;
    description: string;
    quantity: string | null;
    lifecycle: string;
    providerConfidence: string;
    ambiguityFlags: string[] | null;
    supportingText: string | null;
    pageReference: string | null;
    entersCanonicalEstimate: boolean;
    measurementAllowed: boolean;
  }>;
};

export function PlanEstimateDetailPage() {
  const [, params] = useRoute('/finance/plan-estimates/:id');
  const id = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const canWrite = user ? canManageFinance(user.permissions) : false;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [ai, setAi] = useState<AiTakeoffList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    try {
      const data = await request<Detail>(`/finance/plan-estimates/${id}`, { accessToken });
      setDetail(data);
      try {
        const aiData = await request<AiTakeoffList>(`/finance/plan-estimates/${id}/ai-takeoff`, {
          accessToken,
        });
        setAi(aiData);
      } catch {
        setAi({ runs: [], items: [] });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load');
    }
  }, [accessToken, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, body?: unknown) {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await request(`/finance/plan-estimates/${id}/${path}`, {
        accessToken,
        method: 'POST',
        body,
      });
      setSuccess(`${path} ok`);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function generateAiDraft() {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const data = await request<{
        intelligence?: { status?: string; auraNarrativeFacts?: string[] };
        takeoff?: { status?: string };
      }>(`/finance/plan-estimates/${id}/ai-takeoff/generate`, {
        accessToken,
        method: 'POST',
        body: {},
      });
      const status = data.intelligence?.status ?? data.takeoff?.status ?? 'ok';
      setSuccess(`AI draft: ${status}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'AI draft failed');
    } finally {
      setBusy(false);
    }
  }

  async function aiItemAct(itemId: string, action: 'accept' | 'reject') {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await request(`/finance/plan-estimates/${id}/ai-takeoff/items/${itemId}/${action}`, {
        accessToken,
        method: 'POST',
        body: action === 'accept' ? { humanConfirm: true } : undefined,
      });
      setSuccess(`AI item ${action} ok`);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : `AI ${action} failed`);
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return error ? <p className="form-error">{error}</p> : <LoadingState label="Loading…" />;
  }

  const { estimate, items, summary } = detail;
  const latestRun = ai?.runs?.[0] ?? null;
  const openAiItems = (ai?.items ?? []).filter((i) => i.lifecycle !== 'REJECTED');

  return (
    <div className="finance-page">
      <PageHeader
        title={`Plan estimate v${estimate.estimateVersion}`}
        description={`${estimate.sourceFilename ?? 'No filename'} · ${estimate.sourceRevisionLabel ?? '—'} · ${estimate.status}`}
      />
      <FinanceNav />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel title="Source / scale">
        <p>Scale: {estimate.scaleStatus} (no invented lengths)</p>
        <p className="page-muted">
          Source: {estimate.sourceDocumentId ? estimate.sourceDocumentId.slice(0, 8) : 'NOT LINKED'} ·{' '}
          {estimate.sourceRevisionLabel ?? 'no revision'}
        </p>
      </Panel>

      <Panel title="AI Draft Take-Off (Row 98 — advisory)">
        <p className="page-muted">
          DRAFT assistance only. AI cannot invent quantities, lengths, materials, or costs. Human
          review is mandatory before quote send.
        </p>
        {canWrite ? (
          <Button type="button" disabled={busy} onClick={() => void generateAiDraft()}>
            Generate AI Draft Take-Off
          </Button>
        ) : null}
        {latestRun ? (
          <div style={{ marginTop: 12 }}>
            <p>
              Latest run: <strong>{latestRun.status}</strong>
              {latestRun.sourceRevisionLabel ? ` · ${latestRun.sourceRevisionLabel}` : ''}
              {latestRun.humanReviewRequired ? ' · REVIEW REQUIRED' : ''}
            </p>
            {(latestRun.auraNarrativeFacts ?? []).slice(0, 4).map((fact) => (
              <p key={fact} className="page-muted">
                {fact}
              </p>
            ))}
          </div>
        ) : (
          <p className="page-muted">No AI draft run yet.</p>
        )}
        {openAiItems.length > 0 ? (
          <ul style={{ marginTop: 12 }}>
            {openAiItems.map((item) => (
              <li key={item.id} style={{ marginBottom: 8 }}>
                {item.pointType}: {item.description}
                {item.quantity != null ? ` × ${item.quantity}` : ' · QUANTITY UNAVAILABLE'}
                {' · '}
                {item.lifecycle} · conf {item.providerConfidence}
                {(item.ambiguityFlags ?? []).length
                  ? ` · ${(item.ambiguityFlags ?? []).join(', ')}`
                  : ''}
                {item.pageReference ? ` · ${item.pageReference}` : ''}
                {item.supportingText ? (
                  <span className="page-muted"> — {item.supportingText}</span>
                ) : null}
                {canWrite && !item.entersCanonicalEstimate && item.lifecycle !== 'HUMAN_CONFIRMED' ? (
                  <span>
                    {' '}
                    <Button
                      type="button"
                      disabled={busy || item.quantity == null || !item.measurementAllowed}
                      onClick={() => void aiItemAct(item.id, 'accept')}
                    >
                      Accept
                    </Button>{' '}
                    <Button type="button" disabled={busy} onClick={() => void aiItemAct(item.id, 'reject')}>
                      Reject
                    </Button>
                  </span>
                ) : null}
                {item.entersCanonicalEstimate ? (
                  <span className="page-muted"> · in canonical take-off</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel title="Take-off (canonical Row 94)">
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              {item.pointType}: {item.description} × {item.quantity} · {item.confidence}
              {item.pageReference ? ` · ${item.pageReference}` : ''}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Cost / sell / estimated GP (internal)">
        <p>
          Materials:{' '}
          {summary.materialsCostCents != null
            ? formatMoney(summary.materialsCostCents, 'ZAR')
            : 'MISSING'}
        </p>
        <p>
          Labour:{' '}
          {summary.labourCostCents != null ? formatMoney(summary.labourCostCents, 'ZAR') : 'MISSING'}
        </p>
        <p>
          Site: {summary.siteCostCents != null ? formatMoney(summary.siteCostCents, 'ZAR') : 'MISSING'}
        </p>
        <p>
          Direct:{' '}
          {summary.directCostTotalCents != null
            ? formatMoney(summary.directCostTotalCents, 'ZAR')
            : 'COST_ESTIMATE_INCOMPLETE'}
        </p>
        <p>
          Sell:{' '}
          {summary.proposedSellExVatCents != null
            ? formatMoney(summary.proposedSellExVatCents, 'ZAR')
            : 'MISSING'}
        </p>
        <p>
          Estimated GP:{' '}
          {summary.gpIncomplete
            ? 'INCOMPLETE'
            : formatMoney(summary.estimatedGrossProfitCents ?? 0, 'ZAR')}
          {summary.estimatedGrossMarginBps != null
            ? ` (${(summary.estimatedGrossMarginBps / 100).toFixed(1)}%)`
            : ''}
        </p>
      </Panel>

      <Panel title="Actions">
        {canWrite && estimate.status !== 'APPROVED_FOR_QUOTE' && estimate.status !== 'SUPERSEDED' ? (
          <>
            <Button type="button" disabled={busy} onClick={() => void act('review')}>
              Mark reviewed
            </Button>{' '}
            <Button type="button" disabled={busy} onClick={() => void act('approve')}>
              Approve for quote
            </Button>
          </>
        ) : null}
        {canWrite && estimate.status === 'APPROVED_FOR_QUOTE' ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void act('generate-quote', {
                clientActionId: newFinanceClientActionId(),
                customerId: estimate.customerId,
              })
            }
          >
            {estimate.quoteId ? 'Generate quote (idempotent)' : 'Generate draft quote'}
          </Button>
        ) : null}
        {estimate.quoteId ? (
          <p>
            Quote:{' '}
            <Link href={`/finance/quotes/${estimate.quoteId}`}>{estimate.quoteId.slice(0, 8)}</Link>
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
