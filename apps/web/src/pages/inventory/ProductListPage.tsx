import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel } from '@titan/ui';
import { INVENTORY_ITEM_STATUS_OPTIONS, type InventoryItemSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchInventoryItems } from '../../lib/inventory-api';
import { useAuth } from '../../lib/auth-context';
import { InventoryNav } from '../../features/inventory/InventoryNav';
import { canAccessInventory, canManageInventory } from '../../features/inventory/utils';

function formatStatus(status: InventoryItemSummary['status']): string {
  return INVENTORY_ITEM_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function ProductListPage() {
  const { accessToken, user } = useAuth();
  const [items, setItems] = useState<InventoryItemSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessInventory(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageInventory(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchInventoryItems(accessToken);
        if (!cancelled) setItems(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load products');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadItems();
    return () => { cancelled = true; };
  }, [accessToken, canView]);

  if (!canView) {
    return (
      <div className="inventory-page">
        <PageHeader title="Products" description="You do not have permission to view inventory." />
      </div>
    );
  }

  return (
    <div className="inventory-page">
      <PageHeader
        title="Inventory"
        description="Products, stock levels, and warehouse locations for your company."
        actions={
          canWrite ? (
            <Link href="/inventory/products/new">
              <Button>New product</Button>
            </Link>
          ) : undefined
        }
      />
      <InventoryNav />

      {isLoading ? <p className="page-muted">Loading products…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error ? (
        items.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="Create your first product to start tracking inventory."
            action={
              canWrite ? (
                <Link href="/inventory/products/new">
                  <Button>New product</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Panel title="Products">
            <div className="inventory-table-wrap">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name</th>
                    <th>Unit</th>
                    <th>On hand</th>
                    <th>Reorder level</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.sku}</td>
                      <td>{item.name}</td>
                      <td>{item.unit}</td>
                      <td>
                        <span className={item.isLowStock ? 'inventory-low-stock' : undefined}>
                          {item.totalQuantityOnHand}
                        </span>
                      </td>
                      <td>{item.reorderLevel}</td>
                      <td>
                        <span className={`inventory-status inventory-status--${item.status}`}>
                          {formatStatus(item.status)}
                        </span>
                      </td>
                      <td>{new Date(item.updatedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )
      ) : null}
    </div>
  );
}
