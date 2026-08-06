import { PageHeader } from '../../components/ux';
import { Panel } from '@titan/ui';
import { fetchMobileInventory } from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';

export function MobileInventoryPage() {
  const { accessToken } = useAuth();

  const inventoryQuery = useStaffCachedQuery({
    queryKey: 'mobile/inventory',
    enabled: Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: async () => fetchMobileInventory(accessToken!),
  });

  const inventory = inventoryQuery.data;

  return (
    <div className="portal-page">
      <PageHeader
        title="Inventory Centre"
        description="Low-stock alerts and recent usage submissions."
      />

      <AnalyticsTabPanel
        isLoading={inventoryQuery.isLoading}
        error={inventoryQuery.error}
        hasData={inventory !== undefined}
        isEmpty={
          inventory !== undefined &&
          inventory.alerts.length === 0 &&
          inventory.recentUsage.length === 0
        }
        emptyTitle="No Inventory Data"
        emptyDescription="Inventory centre is empty."
        loadingLabel="Loading inventory…"
        onRetry={() => void inventoryQuery.refetch()}
      >
        {inventory ? (
          <>
            <Panel title="Low Stock Alerts">
              {inventory.alerts.length === 0 ? (
                <p className="page-muted">No low-stock alerts.</p>
              ) : (
                <ul className="portal-list">
                  {inventory.alerts.map((item) => (
                    <li key={item.itemId}>
                      <strong>{item.name}</strong>
                      <span>
                        {item.sku} · {item.totalQuantityOnHand} on hand (reorder at{' '}
                        {item.reorderLevel})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Recent Usage Submissions">
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
          </>
        ) : null}
      </AnalyticsTabPanel>
    </div>
  );
}
