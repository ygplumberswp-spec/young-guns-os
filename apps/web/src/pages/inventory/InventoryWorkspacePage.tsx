import { PageHeader } from '../../components/ux';
import { useMemo } from 'react';
import { Link } from 'wouter';
import { EmptyState, PageLoadState, Panel } from '@titan/ui';
import { formatMoney, type InventoryWorkspaceRow } from '@titan/shared';
import { fetchInventoryWorkspace } from '../../lib/inventory-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { InventoryNav } from '../../features/inventory/InventoryNav';
import { canAccessInventory } from '../../features/inventory/utils';

function stockStatusLabel(row: InventoryWorkspaceRow): string {
  if (row.isOutOfStock) return 'Out of stock';
  if (row.isLowStock) return 'Low stock';
  return 'OK';
}

function stockStatusClass(row: InventoryWorkspaceRow): string {
  if (row.isOutOfStock) return 'status-pill status-pill--error';
  if (row.isLowStock) return 'status-pill status-pill--attention';
  return 'status-pill status-pill--active';
}

function priceChangeLabel(direction: InventoryWorkspaceRow['priceChangeDirection']): string {
  if (direction === 'up') return '↑';
  if (direction === 'down') return '↓';
  if (direction === 'stable') return '—';
  return 'HOLD';
}

export function InventoryWorkspacePage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(() => (user ? canAccessInventory(user.permissions) : false), [user]);

  const { data: rows, error, isLoading } = useCachedQuery({
    queryKey: 'inventory/workspace',
    accessToken,
    enabled: canView,
    staleTimeMs: 20_000,
    fetcher: async () => fetchInventoryWorkspace(accessToken!),
  });

  if (!canView) {
    return (
      <div className="inventory-page">
        <PageHeader title="Inventory workspace" description="You do not have permission to view inventory." />
      </div>
    );
  }

  const purchaseRequiredCount = rows?.filter((row) => row.purchaseRequired).length ?? 0;
  const unmatchedTotal = rows?.reduce((sum, row) => sum + row.unmatchedUsageCount, 0) ?? 0;

  return (
    <div className="inventory-page">
      <PageHeader
        title="Inventory"
        description="Warehouse and van stock, reservations, usage and reorder signals from live API data."
      />
      <InventoryNav />

      <div className="inventory-workspace-stats">
        <span className="inventory-workspace-stat">
          {rows?.length ?? 0} product(s)
        </span>
        <span className="inventory-workspace-stat">
          {purchaseRequiredCount} purchase required
        </span>
        <span className="inventory-workspace-stat">
          {unmatchedTotal} unmatched usage line(s)
        </span>
      </div>

      <PageLoadState
        isLoading={isLoading}
        error={error}
        isEmpty={(rows?.length ?? 0) === 0}
        emptyTitle="No inventory products yet"
        emptyDescription="Create products and set stock levels to populate the owner workspace."
        loadingLabel="Loading inventory workspace…"
      >
        <Panel title="Inventory workspace">
          <div className="inventory-table-wrap">
            <table className="inventory-table inventory-workspace-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Warehouse</th>
                  <th>Van</th>
                  <th>Reserved</th>
                  <th>Used</th>
                  <th>Stock status</th>
                  <th>Reorder amt</th>
                  <th>Supplier</th>
                  <th>Latest price</th>
                  <th>Price Δ</th>
                  <th>Purchase req.</th>
                  <th>Unmatched</th>
                </tr>
              </thead>
              <tbody>
                {rows?.map((row) => (
                  <tr key={row.itemId}>
                    <td>{row.sku}</td>
                    <td>{row.name}</td>
                    <td>{row.warehouseStock}</td>
                    <td>{row.vanStock}</td>
                    <td>{row.reservedQuantity}</td>
                    <td>{row.usedQuantity}</td>
                    <td>
                      <span className={stockStatusClass(row)}>{stockStatusLabel(row)}</span>
                    </td>
                    <td>{row.reorderAmount > 0 ? row.reorderAmount : '—'}</td>
                    <td>
                      {row.preferredSupplierId ? (
                        <Link href={`/procurement/suppliers/${row.preferredSupplierId}`} className="inventory-link">
                          {row.preferredSupplierName}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{row.latestPriceCents != null ? formatMoney(row.latestPriceCents) : '—'}</td>
                    <td>{priceChangeLabel(row.priceChangeDirection)}</td>
                    <td>{row.purchaseRequired ? 'Yes' : '—'}</td>
                    <td>{row.unmatchedUsageCount > 0 ? row.unmatchedUsageCount : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </PageLoadState>

      {!isLoading && !error && (rows?.length ?? 0) === 0 ? (
        <EmptyState
          title="Workspace empty"
          description="Honest empty state — no demo stock rows. Add products via Products tab."
        />
      ) : null}
    </div>
  );
}
