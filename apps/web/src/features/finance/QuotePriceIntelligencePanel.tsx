import { useCallback, useEffect, useState } from 'react';
import { Panel } from '@titan/ui';
import { formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchQuotePriceIntelligence,
  type QuotePriceIntelligenceDto,
} from '../../lib/finance-api';

type Props = {
  accessToken: string;
  quoteId: string;
  currency: string;
};

function displayMoney(
  cents: number | null | undefined,
  currency: string,
  unavailable: string,
): string {
  if (cents == null) return unavailable;
  return formatMoney(cents, currency);
}

function formatBps(bps: number | null | undefined): string {
  if (bps == null) return '—';
  return `${(bps / 100).toFixed(1)}%`;
}

export function QuotePriceIntelligencePanel({ accessToken, quoteId, currency }: Props) {
  const [data, setData] = useState<QuotePriceIntelligenceDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchQuotePriceIntelligence(accessToken, quoteId);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load price intelligence');
    }
  }, [accessToken, quoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data && !error) {
    return (
      <Panel title="Quote Price Intelligence" description="Loading deterministic AURA guardrail…">
        <p className="page-muted">Loading…</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Quote Price Intelligence"
      description="Internal AURA guardrail over Row 96. Advisory only — never invents prices. Never undercuts an approved floor to win a job."
    >
      {error ? <p className="finance-badge--danger">{error}</p> : null}
      {data ? (
        <>
          <dl className="finance-detail-list">
            <div>
              <dt>Current Sell (Ex VAT)</dt>
              <dd className="tabular-nums">
                {displayMoney(data.currentSellExVatCents, currency, 'MISSING')}
              </dd>
            </div>
            <div>
              <dt>Known Cost Floor</dt>
              <dd className="tabular-nums">
                {displayMoney(
                  data.knownCostFloorCents,
                  currency,
                  data.costFloorStatus === 'COST_FLOOR_INCOMPLETE'
                    ? 'COST_FLOOR_INCOMPLETE'
                    : 'MISSING',
                )}
              </dd>
            </div>
            <div>
              <dt>Approved Profit Floor</dt>
              <dd className="tabular-nums">
                {displayMoney(
                  data.approvedProfitFloorCents,
                  currency,
                  data.profitFloorConfigStatus === 'PROFIT_FLOOR_NOT_CONFIGURED'
                    ? 'PROFIT_FLOOR_NOT_CONFIGURED'
                    : data.costFloorStatus === 'COST_FLOOR_INCOMPLETE'
                      ? 'UNAVAILABLE — COST INCOMPLETE'
                      : 'MISSING',
                )}
              </dd>
            </div>
            <div>
              <dt>Target Profitable Price</dt>
              <dd className="tabular-nums">
                {displayMoney(
                  data.targetProfitablePriceCents,
                  currency,
                  data.targetStatus.replaceAll('_', ' '),
                )}
              </dd>
            </div>
            <div>
              <dt>Target Source</dt>
              <dd>{data.targetSource.replaceAll('_', ' ')}</dd>
            </div>
            <div>
              <dt>Estimated GP</dt>
              <dd className="tabular-nums">
                {displayMoney(data.estimatedGrossProfitCents, currency, 'UNAVAILABLE')}
              </dd>
            </div>
            <div>
              <dt>Estimated Margin</dt>
              <dd>{formatBps(data.estimatedGrossMarginBps)}</dd>
            </div>
            <div>
              <dt>Sell vs Floor</dt>
              <dd>{data.sellVsFloorStatus.replaceAll('_', ' ')}</dd>
            </div>
            <div>
              <dt>Market Evidence</dt>
              <dd>
                {data.marketEvidence.status.replaceAll('_', ' ')}
                {data.marketEvidence.sampleCount > 0
                  ? ` · ${data.marketEvidence.sampleCount} sample(s)`
                  : ''}
                {data.marketEvidence.medianCents != null
                  ? ` · median ${formatMoney(data.marketEvidence.medianCents, currency)}`
                  : ''}
              </dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{data.confidence.replaceAll('_', ' ')}</dd>
            </div>
            <div>
              <dt>Recommendation</dt>
              <dd>{data.recommendationStatus.replaceAll('_', ' ')}</dd>
            </div>
          </dl>

          {data.row92Preview ? (
            <p className="page-muted" style={{ marginTop: '0.75rem' }}>
              Row 92 {data.row92Preview.labelled.replaceAll('_', ' ')} — status{' '}
              {data.row92Preview.status}; automation OFF.
              {data.row92Preview.previewSellExVatCents != null
                ? ` Preview sell ${formatMoney(data.row92Preview.previewSellExVatCents, currency)} (not applied).`
                : ''}
            </p>
          ) : null}

          {data.warnings.length ? (
            <ul style={{ marginTop: '0.75rem' }}>
              {data.warnings.map((w) => (
                <li key={w} className="finance-badge--danger">
                  {w.replaceAll('_', ' ')}
                </li>
              ))}
            </ul>
          ) : null}

          {data.missingInputs.length ? (
            <div style={{ marginTop: '0.75rem' }}>
              <strong>Missing Information</strong>
              <ul className="page-muted">
                {data.missingInputs.map((m) => (
                  <li key={m}>{m.replaceAll('_', ' ')}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div style={{ marginTop: '0.75rem' }}>
            <strong>AURA Explanation</strong>
            <p>{data.recommendationExplanation}</p>
            <ul className="page-muted">
              {data.auraNarrativeFacts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </Panel>
  );
}
