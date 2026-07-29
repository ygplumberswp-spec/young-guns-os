import { useEffect, useState } from 'react';
import { EmptyState, PageHeader, Panel } from '@titan/ui';
import type { MobileWorkforceInventoryCentre } from '@titan/shared';
import { MobileApiClientError, fetchMobileInventory } from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';

export function MobileInventoryPage() {
  const { accessToken } = useAuth();
  const [inventory, setInventory] = useState<MobileWorkforceInventoryCentre | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchMobileInventory(accessToken);
        if (!cancelled) setInventory(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof MobileApiClientError ? err.message : 'Unable to load inventory');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (isLoading) return <p className="page-muted">Loading inventory…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (!inventory) return <EmptyState title="No inventory data" description="Inventory centre is empty." />;

  return (
    <div className="portal-page">
      <PageHeader
        title="Inventory centre"
        description={`${inventory.alerts.length} alert(s) · ${inventory.pendingUsageCount} pending usage submission(s)`}
      />

      <Panel title="Low stock alerts">
        {inventory.alerts.length === 0 ? (
          <p className="page-muted">No low-stock alerts.</p>
        ) : (
          <ul className="portal-list">
            {inventory.alerts.map((item) => (
              <li key={item.itemId}>
                <strong>{item.name}</strong>
                <span>
                  {item.sku} · {item.totalQuantityOnHand} on hand (reorder at {item.reorderLevel})
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Recent usage submissions">
        {inventory.recentUsage.length === 0 ? (
          <p className="page-muted">No inventory usage submitted yet.</p>
        ) : (
          <ul className="portal-list">
            {inventory.recentUsage.map((item) => (
              <li key={item.id}>
                <strong>{item.itemName}</strong>
                <span>
                  {item.quantity} × {item.itemSku} · {item.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
