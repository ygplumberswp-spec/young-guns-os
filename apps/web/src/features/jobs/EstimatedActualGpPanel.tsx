import { useState } from 'react';
import { Button, Panel } from '@titan/ui';
import { formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  compareJobEstimatedActualGp,
  type EstimatedActualGpComparisonDto,
} from '../../lib/finance-api';

type Props = {
  accessToken: string;
  jobId: string;
  currency?: string;
};

function moneyOrDash(cents: number | null | undefined, currency: string): string {
  if (cents == null) return '—';
  return formatMoney(cents, currency);
}

function bpsOrDash(bps: number | null | undefined): string {
  if (bps == null) return '—';
  return `${(bps / 100).toFixed(1)}%`;
}

export function EstimatedActualGpPanel({ accessToken, jobId, currency = 'ZAR' }: Props) {
  const [comparison, setComparison] = useState<EstimatedActualGpComparisonDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runCompare() {
    setLoading(true);
    setError(null);
    try {
      const data = await compareJobEstimatedActualGp(accessToken, jobId);
      setComparison(data.comparison);
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : 'Unable to load estimated vs actual GP';
      setError(message);
      setComparison(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel className="jobs-panel" title="Estimated vs actual GP (internal)">
      <p className="page-muted">
        Gross profit only — estimated direct cost vs authoritative invoice revenue and JPE costs.
        Missing evidence stays unavailable (not R0).
      </p>
      <div style={{ marginTop: '0.75rem' }}>
        <Button type="button" onClick={() => void runCompare()} disabled={loading}>
          {loading ? 'Comparing…' : 'Refresh comparison'}
        </Button>
      </div>
      {error ? <p className="page-error">{error}</p> : null}
      {comparison ? (
        <div className="jobs-profitability-grid" style={{ marginTop: '1rem' }}>
          <div>
            <h4>Estimated</h4>
            <p>Revenue: {moneyOrDash(comparison.estimatedRevenueExVatCents, currency)}</p>
            <p>Direct cost: {moneyOrDash(comparison.estimatedCostExVatCents, currency)}</p>
            <p>GP: {moneyOrDash(comparison.estimatedGpCents, currency)}</p>
            <p>Margin: {bpsOrDash(comparison.estimatedMarginBps)}</p>
          </div>
          <div>
            <h4>Actual</h4>
            <p>Revenue: {moneyOrDash(comparison.actualRevenueExVatCents, currency)}</p>
            <p>Direct cost: {moneyOrDash(comparison.actualDirectCostExVatCents, currency)}</p>
            <p>GP: {moneyOrDash(comparison.actualGpCents, currency)}</p>
            <p>Margin: {bpsOrDash(comparison.actualMarginBps)}</p>
          </div>
          <div>
            <h4>Variance</h4>
            <p>GP: {moneyOrDash(comparison.gpVarianceCents, currency)}</p>
            <p>Margin: {bpsOrDash(comparison.marginVarianceBps)}</p>
            <p>Status: {comparison.status}</p>
            <p>
              Labelled P/L:{' '}
              {comparison.profitableOrLossLabelled ? 'yes (complete evidence)' : 'no (incomplete)'}
            </p>
            {comparison.warnings.length > 0 ? (
              <p className="page-muted">Warnings: {comparison.warnings.join(', ')}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
