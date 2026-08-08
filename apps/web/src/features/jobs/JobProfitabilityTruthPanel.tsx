import { useState } from 'react';
import { Button, Panel } from '@titan/ui';
import { formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  resolveJobProfitabilityTruth,
  type JobProfitabilityTruthDto,
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

export function JobProfitabilityTruthPanel({ accessToken, jobId, currency = 'ZAR' }: Props) {
  const [truth, setTruth] = useState<JobProfitabilityTruthDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const data = await resolveJobProfitabilityTruth(accessToken, jobId);
      setTruth(data.truth);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load profitability truth');
      setTruth(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel className="jobs-panel" title="Job profitability truth (internal)">
      <p className="page-muted">
        Evidence-backed Job contribution — missing values stay unavailable (not R0). Alerts mean
        TITAN cannot reconcile expected evidence, not that money was stolen.
      </p>
      <div style={{ marginTop: '0.75rem' }}>
        <Button type="button" onClick={() => void run()} disabled={loading}>
          {loading ? 'Resolving…' : 'Refresh profitability truth'}
        </Button>
      </div>
      {error ? <p className="page-error">{error}</p> : null}
      {truth ? (
        <div style={{ marginTop: '1rem' }}>
          <div className="jobs-profitability-grid">
            <div>
              <h4>Actual</h4>
              <p>Revenue: {moneyOrDash(truth.revenueExVatCents, currency)}</p>
              <p>Materials: {moneyOrDash(truth.materialCostCents, currency)}</p>
              <p>Labour: {moneyOrDash(truth.labourCostCents, currency)}</p>
              <p>Other costs: {moneyOrDash(truth.otherJobCostCents, currency)}</p>
              <p>Total cost: {moneyOrDash(truth.totalKnownJobCostCents, currency)}</p>
              <p>GP: {moneyOrDash(truth.grossProfitCents, currency)}</p>
              <p>Margin: {bpsOrDash(truth.grossMarginBps)}</p>
              <p>Job contribution: {moneyOrDash(truth.jobOperatingContributionCents, currency)}</p>
            </div>
            <div>
              <h4>Estimated vs actual</h4>
              <p>Est. revenue: {moneyOrDash(truth.estimatedRevenueExVatCents, currency)}</p>
              <p>Est. direct cost: {moneyOrDash(truth.estimatedDirectCostCents, currency)}</p>
              <p>Est. GP: {moneyOrDash(truth.estimatedGpCents, currency)}</p>
              <p>GP variance: {moneyOrDash(truth.gpVarianceCents, currency)}</p>
              <p>Margin variance: {bpsOrDash(truth.marginVarianceBps)}</p>
            </div>
            <div>
              <h4>Status</h4>
              <p>
                {truth.completeness} · {truth.lifecycleStatus}
              </p>
              <p>
                Labelled P/L:{' '}
                {truth.profitableOrLossLabelled ? 'yes (complete evidence)' : 'no (incomplete)'}
              </p>
              <p>Overhead allocated: {truth.overheadAllocated ? 'yes' : 'no'}</p>
            </div>
          </div>
          {truth.alerts.length > 0 ? (
            <div style={{ marginTop: '1rem' }}>
              <h4>Missing evidence / attention</h4>
              <ul>
                {truth.alerts.map((a) => (
                  <li key={a.code}>
                    <strong>{a.code}</strong> ({a.severity}): {a.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
