import { PageHeader } from '../../components/ux';
import { Panel } from '@titan/ui';
import { fetchMobileInventory } from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';

/**
 * YG-CUTOVER-001E — Parts Used / returns for the signed-in technician.
 * Company low-stock alerts and warehouse intelligence are not shown.
 */
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
        title="Parts Used"
        description="Parts and returns you logged on assigned jobs. Company stock alerts are not shown here."
      />

      <AnalyticsTabPanel
        isLoading={inventoryQuery.isLoading}
        error={inventoryQuery.error}
        hasData={inventory !== undefined}
        isEmpty={inventory !== undefined && inventory.recentUsage.length === 0}
        emptyTitle="No Parts Logged"
        emptyDescription="Parts used and returns from your job cards will appear here."
        loadingLabel="Loading parts…"
        onRetry={() => void inventoryQuery.refetch()}
      >
        {inventory ? (
          <Panel title="Recent Usage Submissions">
            {inventory.recentUsage.length === 0 ? (
              <p className="page-muted">No parts usage submitted yet. Log parts from a job card.</p>
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
        ) : null}
      </AnalyticsTabPanel>
    </div>
  );
}
