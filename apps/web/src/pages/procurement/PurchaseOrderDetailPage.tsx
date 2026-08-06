import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { Button, Input, Panel } from '@titan/ui';
import type { InventoryLocationSummary, PurchaseOrderDetail, PurchaseOrderStatus } from '@titan/shared';
import { formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchPurchaseOrder,
  newClientActionId,
  receivePurchaseOrder,
  updatePurchaseOrderStatus,
} from '../../lib/procurement-api';
import { fetchInventoryLocations } from '../../lib/inventory-api';
import { useAuth } from '../../lib/auth-context';
import { canManageProcurement } from '../../features/procurement/utils';
import {
  deliveryStatusPillClass,
  formatDeliveryStatus,
  formatPurchaseOrderStatus,
  purchaseOrderStatusPillClass,
} from '../../features/procurement/utils';

const NEXT_STATUS_OPTIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'cancelled'],
  approved: ['ordered', 'cancelled'],
  ordered: ['cancelled'],
  received: ['completed'],
  completed: [],
  cancelled: [],
};

export function PurchaseOrderDetailPage() {
  const [, params] = useRoute('/procurement/purchase-orders/:id');
  const purchaseOrderId = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrderDetail | null>(null);
  const [locations, setLocations] = useState<InventoryLocationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [receiveLocationId, setReceiveLocationId] = useState('');
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});

  const canWrite = useMemo(() => (user ? canManageProcurement(user.permissions) : false), [user]);

  async function loadPurchaseOrder() {
    if (!accessToken || !purchaseOrderId) return;
    const [po, locationData] = await Promise.all([
      fetchPurchaseOrder(accessToken, purchaseOrderId),
      fetchInventoryLocations(accessToken),
    ]);
    setPurchaseOrder(po);
    setLocations(locationData);
    setReceiveLocationId(po.destinationLocationId ?? locationData.find((l) => l.isDefault)?.id ?? '');
    const quantities: Record<string, string> = {};
    for (const item of po.items) {
      const outstanding = item.quantity - item.quantityReceived;
      quantities[item.id] = outstanding > 0 ? String(outstanding) : '0';
    }
    setReceiveQuantities(quantities);
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !purchaseOrderId) {
        setIsLoading(false);
        return;
      }
      try {
        await loadPurchaseOrder();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load purchase order');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, purchaseOrderId]);

  async function handleStatusChange(status: PurchaseOrderStatus) {
    if (!accessToken || !purchaseOrderId || !canWrite) return;
    if (status === 'cancelled' && !cancelReason.trim()) {
      setError('A cancellation reason is required');
      return;
    }
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updatePurchaseOrderStatus(accessToken, purchaseOrderId, {
        status,
        cancelReason: status === 'cancelled' ? cancelReason.trim() : null,
      });
      setCancelReason('');
      await loadPurchaseOrder();
      setSuccess(`Purchase order marked ${formatPurchaseOrderStatus(status).toLowerCase()}.`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update purchase order status');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReceive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !purchaseOrderId || !canWrite || !purchaseOrder || !receiveLocationId) return;

    const lines = purchaseOrder.items
      .map((item) => ({
        purchaseOrderItemId: item.id,
        quantityReceived: Number.parseInt(receiveQuantities[item.id] ?? '0', 10) || 0,
      }))
      .filter((line) => line.quantityReceived > 0);

    if (lines.length === 0) {
      setError('Enter at least one quantity to receive');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await receivePurchaseOrder(accessToken, purchaseOrderId, {
        clientActionId: newClientActionId('receive'),
        destinationLocationId: receiveLocationId,
        lines,
      });
      setShowReceiveForm(false);
      await loadPurchaseOrder();
      setSuccess('Receipt recorded and stock updated.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to record receipt');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="page-shell">
        <PageHeader title="Purchase Order" description="Purchase order detail" />
        <p className="page-muted">Loading purchase order…</p>
      </div>
    );
  }

  if (!purchaseOrder) {
    return (
      <div className="inventory-page">
        <PageHeader title="Purchase Order Not Found" description="This order may have been removed." />
      </div>
    );
  }

  const canReceive =
    canWrite &&
    ['approved', 'ordered', 'received'].includes(purchaseOrder.status) &&
    purchaseOrder.deliveryStatus !== 'delivered';
  const nextStatuses = NEXT_STATUS_OPTIONS[purchaseOrder.status] ?? [];

  return (
    <div className="inventory-page">
      <PageHeader
        title={purchaseOrder.referenceNumber}
        description={`${purchaseOrder.supplierName} · ${formatMoney(purchaseOrder.totalCostCents)}`}
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel title="Order Details">
        <dl className="fleet-detail-list">
          <div>
            <dt>Supplier</dt>
            <dd>
              <Link href={`/procurement/suppliers/${purchaseOrder.supplierId}`} className="inventory-link">
                {purchaseOrder.supplierName}
              </Link>
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className={purchaseOrderStatusPillClass(purchaseOrder.status)}>
                {formatPurchaseOrderStatus(purchaseOrder.status)}
              </span>
            </dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>
              <span className={deliveryStatusPillClass(purchaseOrder.deliveryStatus)}>
                {formatDeliveryStatus(purchaseOrder.deliveryStatus)}
              </span>
            </dd>
          </div>
          <div>
            <dt>Job</dt>
            <dd>
              {purchaseOrder.jobId ? (
                <Link href={`/jobs/${purchaseOrder.jobId}`} className="inventory-link">
                  {purchaseOrder.jobNumber ?? purchaseOrder.jobReference ?? 'Linked job'}
                </Link>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>Destination location</dt>
            <dd>{purchaseOrder.destinationLocationName ?? '—'}</dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{purchaseOrder.notes ?? '—'}</dd>
          </div>
          {purchaseOrder.cancelReason ? (
            <div>
              <dt>Cancellation reason</dt>
              <dd>{purchaseOrder.cancelReason}</dd>
            </div>
          ) : null}
          <div>
            <dt>Created</dt>
            <dd>{new Date(purchaseOrder.createdAt).toLocaleString()}</dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Line Items">
        <div className="inventory-table-wrap">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Quantity</th>
                <th>Received</th>
                <th>Unit cost</th>
                <th>Line total</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrder.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.description}
                    {item.inventoryItemName ? (
                      <span className="page-muted"> ({item.inventoryItemName})</span>
                    ) : null}
                  </td>
                  <td>{item.quantity}</td>
                  <td>{item.quantityReceived}</td>
                  <td>{formatMoney(item.unitCostCents)}</td>
                  <td>{formatMoney(item.lineTotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {canWrite ? (
        <Panel title="Actions">
          <div className="jobs-form__actions" style={{ marginBottom: '0.75rem' }}>
            {nextStatuses.map((status) =>
              status === 'cancelled' ? null : (
                <Button
                  key={status}
                  variant="secondary"
                  disabled={isSaving}
                  onClick={() => void handleStatusChange(status)}
                >
                  Mark {formatPurchaseOrderStatus(status).toLowerCase()}
                </Button>
              ),
            )}
            {canReceive ? (
              <Button variant="secondary" onClick={() => setShowReceiveForm((value) => !value)}>
                {showReceiveForm ? 'Cancel receive' : 'Receive stock'}
              </Button>
            ) : null}
          </div>

          {nextStatuses.includes('cancelled') ? (
            <div className="jobs-form__actions" style={{ marginBottom: '0.75rem' }}>
              <Input
                label="Cancellation Reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
              <Button
                variant="destructive"
                disabled={isSaving}
                onClick={() => void handleStatusChange('cancelled')}
              >
                Cancel order
              </Button>
            </div>
          ) : null}

          {showReceiveForm ? (
            <form className="inventory-form" onSubmit={(event) => void handleReceive(event)}>
              <label className="titan-input-group">
                <span className="titan-input-label">Receiving location</span>
                <select
                  className="titan-input"
                  value={receiveLocationId}
                  onChange={(e) => setReceiveLocationId(e.target.value)}
                  required
                >
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                      {location.code ? ` (${location.code})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div className="inventory-table-wrap">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Ordered</th>
                      <th>Already received</th>
                      <th>Receive now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseOrder.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.description}</td>
                        <td>{item.quantity}</td>
                        <td>{item.quantityReceived}</td>
                        <td>
                          <input
                            className="titan-input"
                            type="number"
                            min="0"
                            max={item.quantity - item.quantityReceived}
                            value={receiveQuantities[item.id] ?? '0'}
                            onChange={(e) =>
                              setReceiveQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Recording…' : 'Confirm receipt'}
              </Button>
            </form>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
