import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Button, Input, Panel } from '@titan/ui';
import type {
  CreateJobProfitabilityAdjustmentRequest,
  JobProfitabilityAdjustmentKind,
  JobProfitabilityResult,
} from '@titan/shared';
import { formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  createJobCostAdjustment,
  fetchJobProfitability,
  recalculateJobProfitability,
} from '../../lib/jobs-api';

type JobProfitabilityPanelProps = {
  accessToken: string;
  jobId: string;
  canViewMargin: boolean;
  canManageAdjustments: boolean;
};

function formatVariance(cents: number, currency: string): string {
  const prefix = cents > 0 ? '+' : '';
  return `${prefix}${formatMoney(cents, currency)}`;
}

function formatPct(value: number | null): string {
  if (value == null) return '—';
  return `${value.toFixed(1)}%`;
}

function confidenceClass(status: JobProfitabilityResult['profitabilityConfidence']['status']): string {
  switch (status) {
    case 'complete':
      return 'jobs-status jobs-status--completed';
    case 'provisional':
      return 'jobs-status jobs-status--in_progress';
    case 'incomplete':
      return 'jobs-status jobs-status--cancelled';
    default:
      return 'jobs-status';
  }
}

function confidenceLabel(status: JobProfitabilityResult['profitabilityConfidence']['status']): string {
  switch (status) {
    case 'complete':
      return 'Verified';
    case 'provisional':
      return 'Provisional';
    case 'incomplete':
      return 'Incomplete';
    default:
      return status;
  }
}
function statusClass(status: JobProfitabilityResult['summary']['status']): string {
  switch (status) {
    case 'excellent':
      return 'jobs-status jobs-status--completed';
    case 'healthy':
      return 'jobs-status jobs-status--scheduled';
    case 'warning':
      return 'jobs-status jobs-status--in_progress';
    case 'loss':
      return 'jobs-status jobs-status--cancelled';
    default:
      return 'jobs-status';
  }
}

export function JobProfitabilityPanel({
  accessToken,
  jobId,
  canViewMargin,
  canManageAdjustments,
}: JobProfitabilityPanelProps) {
  const [profitability, setProfitability] = useState<JobProfitabilityResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustmentKind, setAdjustmentKind] =
    useState<JobProfitabilityAdjustmentKind>('revenue');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function loadProfitability() {
    setIsLoading(true);
    setError(null);
    try {
      setProfitability(await fetchJobProfitability(accessToken, jobId));
    } catch (err) {
      setProfitability(null);
      setError(err instanceof ApiClientError ? err.message : 'Unable to load profitability');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProfitability();
  }, [accessToken, jobId]);

  async function handleRecalculate() {
    setIsSaving(true);
    setError(null);
    try {
      setProfitability(await recalculateJobProfitability(accessToken, jobId));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to recalculate profitability');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateAdjustment(event: React.FormEvent) {
    event.preventDefault();
    const amountRands = Number.parseFloat(adjustmentAmount);
    if (!Number.isFinite(amountRands)) {
      setError('Enter a valid adjustment amount');
      return;
    }
    const payload: CreateJobProfitabilityAdjustmentRequest = {
      kind: adjustmentKind,
      amountCents: Math.round(amountRands * 100),
      reason: adjustmentReason.trim(),
    };
    if (!payload.reason) {
      setError('Adjustment reason is required');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await createJobCostAdjustment(accessToken, jobId, payload);
      setAdjustmentAmount('');
      setAdjustmentReason('');
      await loadProfitability();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save adjustment');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <Panel title="Profitability">
        <p className="page-muted">Loading profitability…</p>
      </Panel>
    );
  }

  if (!profitability) {
    return (
      <Panel title="Profitability">
        <p className="form-error">{error ?? 'Profitability unavailable for this job.'}</p>
      </Panel>
    );
  }

  const { summary, expected, variance, cash, completeness, completenessWarnings, leakage, profitabilityConfidence } =
    profitability;
  const currency = summary.currency;

  return (
    <>
      <Panel
        title="Profitability Summary"
        description="Accrual and cash views from real job invoices, costs, time entries and adjustments."
      >
        {error ? <p className="form-error">{error}</p> : null}

        <div style={{ marginBottom: '1rem' }}>
          <span className={confidenceClass(profitabilityConfidence.status)}>
            {confidenceLabel(profitabilityConfidence.status)}
          </span>
          {profitabilityConfidence.issues.length > 0 ? (
            <ul className="portal-list" style={{ marginTop: '0.5rem' }}>
              {profitabilityConfidence.issues
                .filter((issue) => issue.severity !== 'info')
                .slice(0, 4)
                .map((issue) => (
                  <li key={`${issue.type}-${issue.message}`}>{issue.message}</li>
                ))}
            </ul>
          ) : (
            <p className="page-muted" style={{ marginTop: '0.35rem' }}>
              All required source data is authoritative for this calculation.
            </p>
          )}
        </div>

        <dl className="jobs-detail-list">
          <div>
            <dt>Revenue source</dt>
            <dd>{summary.revenueSource.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt>Base revenue</dt>
            <dd>{formatMoney(summary.baseRevenueCents, currency)}</dd>
          </div>
          {summary.revenueAdjustmentCents !== 0 ? (
            <div>
              <dt>Revenue adjustments</dt>
              <dd>{formatMoney(summary.revenueAdjustmentCents, currency)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Job revenue</dt>
            <dd>{formatMoney(summary.jobRevenueCents, currency)}</dd>
          </div>
          {canViewMargin ? (
            <>
              <div>
                <dt>Total cost</dt>
                <dd>{formatMoney(summary.totalDirectCostCents, currency)}</dd>
              </div>
              <div>
                <dt>Gross profit</dt>
                <dd>{formatMoney(summary.grossProfitCents, currency)}</dd>
              </div>
              <div>
                <dt>Gross margin</dt>
                <dd>
                  <span className={statusClass(summary.status)}>
                    {formatPct(summary.grossMarginPct)} · {summary.status}
                  </span>
                </dd>
              </div>
            </>
          ) : (
            <div>
              <dt>Margin</dt>
              <dd>Restricted — finance role required</dd>
            </div>
          )}
          <div>
            <dt>Cash collected</dt>
            <dd>{formatMoney(cash.cashCollectedCents, currency)}</dd>
          </div>
          <div>
            <dt>Cash spent</dt>
            <dd>{formatMoney(cash.cashSpentCents, currency)}</dd>
          </div>
          <div>
            <dt>Realised cash profit</dt>
            <dd>
              {formatMoney(cash.knownRealisedCashProfitCents, currency)}
              {cash.cashSpentCompleteness !== 'complete_boolean' ? (
                <span className="page-muted"> · cash settlement limited</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Uncollected revenue</dt>
            <dd>{formatMoney(cash.uncollectedRevenueCents, currency)}</dd>
          </div>
        </dl>

        {canManageAdjustments ? (
          <div className="jobs-form__actions">
            <Button type="button" variant="secondary" disabled={isSaving} onClick={() => void handleRecalculate()}>
              Recalculate
            </Button>
          </div>
        ) : null}
      </Panel>

      {canViewMargin ? (
        <>
          <Panel title="Cost Breakdown">
            <dl className="jobs-detail-list">
              <div>
                <dt>Materials</dt>
                <dd>
                  {formatMoney(summary.materialCostCents, currency)}
                  {summary.materialPctOfRevenue != null
                    ? ` (${formatPct(summary.materialPctOfRevenue)} of revenue)`
                    : ''}
                </dd>
              </div>
              <div>
                <dt>Labour</dt>
                <dd>
                  {formatMoney(summary.labourCostCents, currency)}
                  {profitability.labourMinutes > 0
                    ? ` · ${profitability.labourMinutes} min`
                    : ''}
                </dd>
              </div>
              <div>
                <dt>Other direct</dt>
                <dd>{formatMoney(summary.otherDirectCostCents, currency)}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Expected vs Actual">
            <div className="inventory-table-wrap">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Expected</th>
                    <th>Actual</th>
                    <th>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Revenue</td>
                    <td>{formatMoney(expected.expectedRevenueCents, currency)}</td>
                    <td>{formatMoney(expected.actualRevenueCents, currency)}</td>
                    <td>{formatVariance(variance.revenueVarianceCents, currency)}</td>
                  </tr>
                  <tr>
                    <td>Material cost</td>
                    <td>{formatMoney(expected.expectedMaterialCostCents, currency)}</td>
                    <td>{formatMoney(expected.actualMaterialCostCents, currency)}</td>
                    <td>{formatVariance(variance.materialCostVarianceCents, currency)}</td>
                  </tr>
                  <tr>
                    <td>Labour cost</td>
                    <td>{formatMoney(expected.expectedLabourCostCents, currency)}</td>
                    <td>{formatMoney(expected.actualLabourCostCents, currency)}</td>
                    <td>{formatVariance(variance.labourCostVarianceCents, currency)}</td>
                  </tr>
                  <tr>
                    <td>Gross profit</td>
                    <td>{formatMoney(expected.expectedGrossProfitCents, currency)}</td>
                    <td>{formatMoney(expected.actualGrossProfitCents, currency)}</td>
                    <td>{formatVariance(variance.profitVarianceCents, currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {profitability.primaryQuoteId ? (
              <p className="page-muted" style={{ marginTop: '0.75rem' }}>
                Expected values from{' '}
                <Link href={`/finance/quotes/${profitability.primaryQuoteId}`} className="jobs-link">
                  linked quote
                </Link>
                .
              </p>
            ) : null}
          </Panel>

          {leakage.length > 0 ? (
            <Panel title="Margin Leakage">
              <ul className="portal-list">
                {leakage.map((flag) => (
                  <li key={`${flag.type}-${flag.message}`}>
                    <strong>{flag.type.replace(/_/g, ' ')}</strong>
                    <span>
                      {flag.message}
                      {flag.variance != null ? ` · ${formatVariance(flag.variance, currency)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel title="Cost Transactions">
            {profitability.costTransactions.length === 0 ? (
              <p className="page-muted">No underlying cost transactions recorded yet.</p>
            ) : (
              <div className="inventory-table-wrap">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Source</th>
                      <th>Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitability.costTransactions.map((row) => (
                      <tr key={row.id}>
                        <td>{row.category}</td>
                        <td>{row.description}</td>
                        <td>{formatMoney(row.amountCents, currency)}</td>
                        <td>{row.source.replace(/_/g, ' ')}</td>
                        <td>{row.isPaid ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : null}

      <Panel title="Data Completeness">
        <p>
          Status: <strong>{completeness.replace(/_/g, ' ')}</strong>
        </p>
        {completenessWarnings.length > 0 ? (
          <ul className="portal-list">
            {completenessWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="page-muted">Financial data appears complete for profitability analysis.</p>
        )}
      </Panel>

      {canManageAdjustments ? (
        <Panel title="Cost Adjustments" description="Audited revenue and cost corrections — never silent edits.">
          <form className="jobs-form" onSubmit={(event) => void handleCreateAdjustment(event)}>
            <label className="titan-input-group">
              <span className="titan-input-label">Adjustment type</span>
              <select
                className="titan-input"
                value={adjustmentKind}
                onChange={(event) =>
                  setAdjustmentKind(event.target.value as JobProfitabilityAdjustmentKind)
                }
              >
                <option value="revenue">Revenue</option>
                <option value="material_cost">Material cost</option>
                <option value="labour_cost">Labour cost</option>
                <option value="other_direct_cost">Other direct cost</option>
                <option value="total_cost">Total cost</option>
              </select>
            </label>
            <Input
              label="Amount (ZAR — negative for credits/reductions)"
              value={adjustmentAmount}
              onChange={(event) => setAdjustmentAmount(event.target.value)}
              required
            />
            <Input
              label="Reason"
              value={adjustmentReason}
              onChange={(event) => setAdjustmentReason(event.target.value)}
              required
            />
            <div className="jobs-form__actions">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Add adjustment'}
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}
    </>
  );
}
