import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { EmptyState, PageHeader, Panel } from '@titan/ui';
import type { InventoryStockMovementSummary } from '@titan/shared';
import { formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchInventoryStockMovements } from '../../lib/inventory-api';
import { useAuth } from '../../lib/auth-context';
import { InventoryNav } from '../../features/inventory/InventoryNav';
import { canAccessInventory } from '../../features/inventory/utils';

const MOVEMENT_LABELS: Record<InventoryStockMovementSummary['movementType'], string> = {
  receipt: 'Receipt',
  issue: 'Issue',
  return_to_stock: 'Return to stock',
  adjustment: 'Adjustment',
  correction: 'Correction',
  waste: 'Waste',
};

function useJobIdQueryFilter(): string {
  const [locationPath] = useLocation();
  const [jobId, setJobId] = useState('');

  useEffect(() => {
    setJobId(new URLSearchParams(window.location.search).get('jobId') ?? '');
  }, [locationPath]);

  return jobId;
}

export function StockMovementsPage() {
  const { accessToken, user } = useAuth();
  const jobIdFilter = useJobIdQueryFilter();
  const [movements, setMovements] = useState<InventoryStockMovementSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessInventory(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchInventoryStockMovements(accessToken, {
          jobId: jobIdFilter || undefined,
        });
        if (!cancelled) {
          setMovements(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load stock movements');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, jobIdFilter]);

  if (!canView) {
    return (
      <div className="inventory-page">
        <PageHeader title="Stock movements" description="You do not have permission to view inventory." />
      </div>
    );
  }

  return (
    <div className="inventory-page">
      <PageHeader
        title="Stock movements"
        description={
          jobIdFilter
            ? 'Ledger entries linked to this job.'
            : 'Audit ledger of receipts, issues, returns and adjustments.'
        }
      />
      <InventoryNav />

      {jobIdFilter ? (
        <p className="page-muted">
          Filtered by job ·{' '}
          <Link href="/inventory/movements" className="inventory-link">
            Clear filter
          </Link>{' '}
          ·{' '}
          <Link href={`/jobs/${jobIdFilter}`} className="inventory-link">
            Back to job
          </Link>
        </p>
      ) : null}

      {isLoading ? <p className="page-muted">Loading movements…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error && movements.length === 0 ? (
        <EmptyState
          title="No stock movements yet"
          description="Movements appear when purchase orders are received or materials are approved on jobs."
        />
      ) : null}

      {!isLoading && !error && movements.length > 0 ? (
        <Panel title="Movement ledger">
          <div className="inventory-table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Product</th>
                  <th>Location</th>
                  <th>Delta</th>
                  <th>On hand after</th>
                  <th>Unit cost</th>
                  <th>Job</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{new Date(movement.createdAt).toLocaleString()}</td>
                    <td>{MOVEMENT_LABELS[movement.movementType] ?? movement.movementType}</td>
                    <td>
                      {movement.itemSku ?? '—'}
                      {movement.itemName ? ` · ${movement.itemName}` : ''}
                    </td>
                    <td>{movement.locationName ?? movement.locationId.slice(0, 8)}</td>
                    <td>{movement.quantityDelta > 0 ? `+${movement.quantityDelta}` : movement.quantityDelta}</td>
                    <td>{movement.quantityAfter}</td>
                    <td>{formatMoney(movement.unitCostCents)}</td>
                    <td>
                      {movement.jobId ? (
                        <Link href={`/jobs/${movement.jobId}`} className="inventory-link">
                          View job
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{movement.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
