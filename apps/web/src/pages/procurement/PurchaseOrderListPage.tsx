import { useMemo } from 'react';
import { Link } from 'wouter';
import { Button, PageHeader, PageLoadState, Panel } from '@titan/ui';
import { formatMoney } from '@titan/shared';
import { fetchPurchaseOrders } from '../../lib/procurement-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { ProcurementNav } from '../../features/procurement/ProcurementNav';
import {
  canAccessProcurement,
  canManageProcurement,
  formatPurchaseOrderStatus,
  purchaseOrderStatusPillClass,
} from '../../features/procurement/utils';

export function PurchaseOrderListPage() {
  const { accessToken, user } = useAuth();

  const canView = useMemo(() => (user ? canAccessProcurement(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageProcurement(user.permissions) : false), [user]);

  const {
    data: purchaseOrders,
    error,
    isLoading,
  } = useCachedQuery({
    queryKey: 'procurement/purchase-orders',
    accessToken,
    enabled: canView,
    staleTimeMs: 15_000,
    fetcher: async () => fetchPurchaseOrders(accessToken!),
  });

  if (!canView) {
    return (
      <div className="inventory-page">
        <PageHeader
          title="Purchase orders"
          description="You do not have permission to view purchase orders."
        />
      </div>
    );
  }

  return (
    <div className="inventory-page">
      <PageHeader
        title="Procurement"
        description="Suppliers, purchase orders and parts requests."
        actions={
          canWrite ? (
            <Link href="/procurement/purchase-orders/new">
              <Button>New purchase order</Button>
            </Link>
          ) : undefined
        }
      />
      <ProcurementNav />

      <PageLoadState
        isLoading={isLoading}
        error={error}
        isEmpty={(purchaseOrders?.length ?? 0) === 0}
        emptyTitle="No purchase orders yet"
        emptyDescription="Create a purchase order to start tracking supplier deliveries."
        loadingLabel="Loading purchase orders…"
      >
        <Panel title="Purchase orders">
          <div className="inventory-table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Supplier</th>
                  <th>Job</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Delivery</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders?.map((po) => (
                  <tr key={po.id}>
                    <td>
                      <Link
                        href={`/procurement/purchase-orders/${po.id}`}
                        className="inventory-link"
                      >
                        {po.referenceNumber}
                      </Link>
                    </td>
                    <td>{po.supplierName}</td>
                    <td>
                      {po.jobId ? (
                        <Link href={`/jobs/${po.jobId}`} className="inventory-link">
                          {po.jobNumber ?? po.jobReference ?? 'Job'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{formatMoney(po.totalCostCents)}</td>
                    <td>
                      <span className={purchaseOrderStatusPillClass(po.status)}>
                        {formatPurchaseOrderStatus(po.status)}
                      </span>
                    </td>
                    <td>{po.deliveryStatus.replace(/_/g, ' ')}</td>
                    <td>{new Date(po.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </PageLoadState>
    </div>
  );
}
