import { Link } from 'wouter';
import { Panel } from '@titan/ui';
import type { JobCostingSummary } from '@titan/shared';
import { formatMoney } from '@titan/shared';

type JobCostingPanelProps = {
  jobId: string;
  costing: JobCostingSummary | null;
  showProfit: boolean;
};

function formatVariance(cents: number | null, currency: string): string {
  if (cents == null) return '—';
  const prefix = cents > 0 ? '+' : '';
  return `${prefix}${formatMoney(cents, currency)}`;
}

export function JobCostingPanel({ jobId, costing, showProfit }: JobCostingPanelProps) {
  if (!costing) {
    return (
      <Panel title="Job costing" description="Materials, procurement and margin for this job.">
        <p className="page-muted">Costing summary unavailable.</p>
      </Panel>
    );
  }

  const hasData =
    costing.quotedTotalCents > 0 ||
    costing.materialsUsedCents > 0 ||
    costing.materialsPurchasedCents > 0 ||
    costing.invoicedCents > 0;

  return (
    <Panel
      title="Job costing"
      description="Quoted vs used materials, purchase orders and revenue on this job."
    >
      {!hasData ? (
        <p className="page-muted">
          No quoted, material or invoice costs recorded yet. Link a quote, approve materials, or create
          a purchase order to build the costing chain.
        </p>
      ) : (
        <dl className="jobs-detail-list">
          <div>
            <dt>Quoted (materials)</dt>
            <dd>
              {costing.primaryQuoteId ? (
                <Link href={`/finance/quotes/${costing.primaryQuoteId}`} className="jobs-link">
                  {formatMoney(costing.quotedMaterialsCents, costing.currency)}
                </Link>
              ) : (
                formatMoney(costing.quotedMaterialsCents, costing.currency)
              )}
            </dd>
          </div>
          <div>
            <dt>Quoted (labour cost)</dt>
            <dd>{formatMoney(costing.quotedLabourCents, costing.currency)}</dd>
          </div>
          <div>
            <dt>Materials used</dt>
            <dd>{formatMoney(costing.materialsUsedCents, costing.currency)}</dd>
          </div>
          <div>
            <dt>Materials variance</dt>
            <dd>{formatVariance(costing.varianceMaterialsCents, costing.currency)}</dd>
          </div>
          <div>
            <dt>Purchased (POs)</dt>
            <dd>{formatMoney(costing.materialsPurchasedCents, costing.currency)}</dd>
          </div>
          {costing.materialsReturnedCents > 0 ? (
            <div>
              <dt>Returned to stock</dt>
              <dd>{formatMoney(costing.materialsReturnedCents, costing.currency)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Actual cost (used + PO)</dt>
            <dd>{formatMoney(costing.actualCostCents, costing.currency)}</dd>
          </div>
          <div>
            <dt>Labour recorded</dt>
            <dd>
              {costing.labourMinutes > 0
                ? `${costing.labourMinutes} min (${Math.round(costing.labourMinutes / 60)}h)`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Invoiced</dt>
            <dd>{formatMoney(costing.invoicedCents, costing.currency)}</dd>
          </div>
          <div>
            <dt>Paid</dt>
            <dd>{formatMoney(costing.paidCents, costing.currency)}</dd>
          </div>
          {showProfit && costing.grossProfitCents != null ? (
            <div>
              <dt>Gross profit (est.)</dt>
              <dd>{formatMoney(costing.grossProfitCents, costing.currency)}</dd>
            </div>
          ) : null}
        </dl>
      )}

      {(costing.byMaterialSource.vehicleStock > 0 ||
        costing.byMaterialSource.warehouseStock > 0 ||
        costing.byMaterialSource.supplierPurchase > 0 ||
        costing.byMaterialSource.customerSupplied > 0) && (
        <div className="inventory-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Material source</th>
                <th>Used cost</th>
              </tr>
            </thead>
            <tbody>
              {costing.byMaterialSource.vehicleStock > 0 ? (
                <tr>
                  <td>Vehicle stock</td>
                  <td>{formatMoney(costing.byMaterialSource.vehicleStock, costing.currency)}</td>
                </tr>
              ) : null}
              {costing.byMaterialSource.warehouseStock > 0 ? (
                <tr>
                  <td>Warehouse stock</td>
                  <td>{formatMoney(costing.byMaterialSource.warehouseStock, costing.currency)}</td>
                </tr>
              ) : null}
              {costing.byMaterialSource.supplierPurchase > 0 ? (
                <tr>
                  <td>Supplier purchase</td>
                  <td>{formatMoney(costing.byMaterialSource.supplierPurchase, costing.currency)}</td>
                </tr>
              ) : null}
              {costing.byMaterialSource.customerSupplied > 0 ? (
                <tr>
                  <td>Customer supplied</td>
                  <td>{formatMoney(costing.byMaterialSource.customerSupplied, costing.currency)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <div className="jobs-form__actions" style={{ marginTop: '0.75rem' }}>
        {costing.stockMovementCount > 0 ? (
          <Link href={`/inventory/movements?jobId=${jobId}`}>
            <span className="jobs-link">View {costing.stockMovementCount} stock movement(s)</span>
          </Link>
        ) : null}
        {costing.purchaseOrderCount > 0 ? (
          <Link href="/procurement">
            <span className="jobs-link">{costing.purchaseOrderCount} linked PO(s)</span>
          </Link>
        ) : null}
      </div>
    </Panel>
  );
}
