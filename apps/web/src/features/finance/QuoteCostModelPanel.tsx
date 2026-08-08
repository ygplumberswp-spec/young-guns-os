import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button, Input, Panel } from '@titan/ui';
import {
  formatMoney,
  QUOTE_COST_COMPONENT_LABELS,
  type QuoteCostComponentType,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  addQuoteCostComponent,
  fetchQuoteCostModel,
  snapshotQuoteCostModel,
  type QuoteCostModelDto,
} from '../../lib/finance-api';
import { newFinanceClientActionId } from './utils';

type Props = {
  accessToken: string;
  quoteId: string;
  currency: string;
  canWrite: boolean;
  onChanged?: () => void;
};

function money(cents: number | null | undefined, currency: string): string {
  if (cents == null) return '—';
  return formatMoney(cents, currency);
}

function formatBps(bps: number | null | undefined): string {
  if (bps == null) return '—';
  return `${(bps / 100).toFixed(1)}%`;
}

export function QuoteCostModelPanel({
  accessToken,
  quoteId,
  currency,
  canWrite,
  onChanged,
}: Props) {
  const [model, setModel] = useState<QuoteCostModelDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [componentType, setComponentType] = useState<QuoteCostComponentType>('MATERIAL');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCostRand, setUnitCostRand] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchQuoteCostModel(accessToken, quoteId);
      setModel(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load cost model');
    }
  }, [accessToken, quoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!canWrite || !model?.editable) return;
    setBusy(true);
    setError(null);
    try {
      const unitCostCents =
        unitCostRand.trim() === ''
          ? null
          : Math.round(Number(unitCostRand) * 100);
      await addQuoteCostComponent(accessToken, quoteId, {
        componentType,
        description,
        quantity: Number(quantity),
        unit: 'each',
        unitCostCents: Number.isFinite(unitCostCents as number) ? unitCostCents : null,
        vatBasis: unitCostCents == null ? 'UNKNOWN' : 'VAT_EXCLUSIVE',
        provenance:
          unitCostCents == null ? 'COST_SOURCE_MISSING' : 'APPROVED_MANUAL_COST',
        clientActionId: newFinanceClientActionId('cost-add'),
      });
      setDescription('');
      setUnitCostRand('');
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to add cost component');
    } finally {
      setBusy(false);
    }
  }

  async function onSnapshot() {
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    try {
      await snapshotQuoteCostModel(
        accessToken,
        quoteId,
        newFinanceClientActionId('cost-snap'),
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to snapshot cost baseline');
    } finally {
      setBusy(false);
    }
  }

  if (!model && !error) {
    return (
      <Panel title="Internal Cost Model" description="Loading structured cost estimate…">
        <p className="page-muted">Loading…</p>
      </Panel>
    );
  }

  const summary = model?.summary;

  return (
    <Panel
      title="Internal Cost Model"
      description="Estimated cost before issue. Never shown to the customer. Separate from sell price."
    >
      {error ? <p className="finance-badge--danger">{error}</p> : null}
      {summary ? (
        <dl className="finance-detail-list">
          <div>
            <dt>Materials</dt>
            <dd className="tabular-nums">{money(summary.materialsCostCents, currency)}</dd>
          </div>
          <div>
            <dt>Labour</dt>
            <dd className="tabular-nums">{money(summary.labourCostCents, currency)}</dd>
          </div>
          <div>
            <dt>Wastage</dt>
            <dd className="tabular-nums">{money(summary.wastageCostCents, currency)}</dd>
          </div>
          <div>
            <dt>Travel Cost</dt>
            <dd className="tabular-nums">{money(summary.travelCostCents, currency)}</dd>
          </div>
          <div>
            <dt>Call-Out Internal Cost</dt>
            <dd className="tabular-nums">{money(summary.callOutCostCents, currency)}</dd>
          </div>
          <div>
            <dt>Equipment</dt>
            <dd className="tabular-nums">{money(summary.equipmentCostCents, currency)}</dd>
          </div>
          <div>
            <dt>Subcontractors</dt>
            <dd className="tabular-nums">{money(summary.subcontractorCostCents, currency)}</dd>
          </div>
          <div>
            <dt>Preliminaries</dt>
            <dd className="tabular-nums">{money(summary.preliminariesCostCents, currency)}</dd>
          </div>
          <div>
            <dt>Estimated Direct Cost</dt>
            <dd className="tabular-nums">{money(summary.estimatedDirectCostCents, currency)}</dd>
          </div>
          <div>
            <dt>Overhead</dt>
            <dd className="tabular-nums">{money(summary.overheadCostCents, currency)}</dd>
          </div>
          <div>
            <dt>Contingency</dt>
            <dd className="tabular-nums">{money(summary.contingencyCostCents, currency)}</dd>
          </div>
          <div>
            <dt>Warranty Provision</dt>
            <dd className="tabular-nums">{money(summary.warrantyProvisionCents, currency)}</dd>
          </div>
          <div>
            <dt>Total Estimated Cost</dt>
            <dd className="tabular-nums">{money(summary.totalEstimatedCostCents, currency)}</dd>
          </div>
          <div>
            <dt>Sell Ex VAT</dt>
            <dd className="tabular-nums">{money(summary.sellExVatCents, currency)}</dd>
          </div>
          <div>
            <dt>Multiplier (Sell / Cost)</dt>
            <dd className="tabular-nums">
              {summary.multiplier != null ? summary.multiplier.toFixed(3) : '—'}
            </dd>
          </div>
          <div>
            <dt>Markup</dt>
            <dd>{formatBps(summary.markupBps)}</dd>
          </div>
          <div>
            <dt>Gross Margin</dt>
            <dd>{formatBps(summary.grossMarginBps)}</dd>
          </div>
          <div>
            <dt>Estimated Gross Profit</dt>
            <dd className="tabular-nums">{money(summary.estimatedGrossProfitCents, currency)}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>{summary.confidence.replaceAll('_', ' ')}</dd>
          </div>
        </dl>
      ) : null}

      {summary?.costEstimateIncomplete ? (
        <p className="finance-badge--danger" style={{ marginTop: '0.75rem' }}>
          Cost Estimate Incomplete — missing provenance or unit costs. Missing stays missing.
        </p>
      ) : null}

      {summary?.warnings?.length ? (
        <ul className="page-muted" style={{ marginTop: '0.75rem' }}>
          {summary.warnings.map((w) => (
            <li key={w}>{w.replaceAll('_', ' ')}</li>
          ))}
        </ul>
      ) : null}

      {model?.components?.length ? (
        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit Cost</th>
                <th>Total</th>
                <th>Provenance</th>
              </tr>
            </thead>
            <tbody>
              {model.components.map((c) => (
                <tr key={c.id}>
                  <td>
                    {QUOTE_COST_COMPONENT_LABELS[c.componentType as QuoteCostComponentType] ??
                      c.componentType}
                  </td>
                  <td>{c.description}</td>
                  <td className="tabular-nums">{c.quantity}</td>
                  <td className="tabular-nums">{money(c.unitCostCents, currency)}</td>
                  <td className="tabular-nums">{money(c.totalCostCents, currency)}</td>
                  <td>{c.provenance.replaceAll('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="page-muted" style={{ marginTop: '0.75rem' }}>
          No structured cost components yet. Line-level unit costs still feed legacy estimated cost.
        </p>
      )}

      {model?.latestSnapshot ? (
        <p className="page-muted" style={{ marginTop: '0.75rem' }}>
          Baseline snapshot v{model.latestSnapshot.snapshotVersion} (
          {new Date(model.latestSnapshot.createdAt).toLocaleString()}) —{' '}
          {money(model.latestSnapshot.totalEstimatedCostCents, currency)}
        </p>
      ) : null}

      {canWrite && model?.editable ? (
        <form onSubmit={onAdd} className="finance-form-grid" style={{ marginTop: '1rem' }}>
          <label>
            Cost Type
            <select
              value={componentType}
              onChange={(e) => setComponentType(e.target.value as QuoteCostComponentType)}
            >
              {(Object.keys(QUOTE_COST_COMPONENT_LABELS) as QuoteCostComponentType[]).map(
                (key) => (
                  <option key={key} value={key}>
                    {QUOTE_COST_COMPONENT_LABELS[key]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Description
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </label>
          <label>
            Quantity
            <Input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal"
              required
            />
          </label>
          <label>
            Unit Cost (ZAR, leave blank if unknown)
            <Input
              value={unitCostRand}
              onChange={(e) => setUnitCostRand(e.target.value)}
              inputMode="decimal"
              placeholder="Unknown → Cost Source Missing"
            />
          </label>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button type="submit" disabled={busy}>
              Add Cost Component
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void onSnapshot()}>
              Snapshot Cost Baseline
            </Button>
          </div>
        </form>
      ) : (
        <p className="page-muted" style={{ marginTop: '0.75rem' }}>
          {model && !model.editable
            ? 'Issued/sent quotes protect the historical cost baseline from silent rewrite.'
            : null}
        </p>
      )}
    </Panel>
  );
}
