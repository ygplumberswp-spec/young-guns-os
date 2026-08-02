import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, Input, PageHeader, PageLoadState, Panel } from '@titan/ui';
import type { InventoryItemSummary, InventoryLocationSummary, JobMaterialLineSummary } from '@titan/shared';
import { formatMoney } from '@titan/shared';
import {
  authorizeJobMaterialLine,
  fetchPendingMaterialRequests,
  newJobsClientActionId,
} from '../../lib/jobs-api';
import { fetchInventoryItems, fetchInventoryLocations } from '../../lib/inventory-api';
import { ApiClientError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { ProcurementNav } from '../../features/procurement/ProcurementNav';
import { canAuthorizeMaterials, materialLineStatusPillClass } from '../../features/procurement/utils';

type StockSelection = {
  inventoryItemId: string;
  locationId: string;
};

function isStockSource(source: JobMaterialLineSummary['materialSource']) {
  return source === 'vehicle_stock' || source === 'warehouse_stock';
}

export function PartsRequestsPage() {
  const { accessToken, user } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [stockSelections, setStockSelections] = useState<Record<string, StockSelection>>({});
  const [items, setItems] = useState<InventoryItemSummary[]>([]);
  const [locations, setLocations] = useState<InventoryLocationSummary[]>([]);

  const canManage = useMemo(() => (user ? canAuthorizeMaterials(user.permissions) : false), [user]);

  const {
    data: materialLines,
    error: loadError,
    isLoading,
    refetch,
  } = useCachedQuery({
    queryKey: 'jobs/materials/pending',
    accessToken,
    enabled: Boolean(accessToken),
    staleTimeMs: 10_000,
    fetcher: async () => fetchPendingMaterialRequests(accessToken!),
  });

  useEffect(() => {
    if (!accessToken || !canManage) return;
    let cancelled = false;
    void (async () => {
      try {
        const [itemData, locationData] = await Promise.all([
          fetchInventoryItems(accessToken),
          fetchInventoryLocations(accessToken),
        ]);
        if (!cancelled) {
          setItems(itemData);
          setLocations(locationData);
        }
      } catch {
        // Authorization still works when catalog load fails; approve will surface validation.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canManage]);

  useEffect(() => {
    if (!materialLines?.length) return;
    setStockSelections((prev) => {
      const next = { ...prev };
      for (const line of materialLines) {
        if (next[line.id]) continue;
        next[line.id] = {
          inventoryItemId: line.inventoryItemId ?? '',
          locationId: line.locationId ?? '',
        };
      }
      return next;
    });
  }, [materialLines]);

  function updateStockSelection(lineId: string, patch: Partial<StockSelection>) {
    setStockSelections((prev) => ({
      ...prev,
      [lineId]: {
        inventoryItemId: prev[lineId]?.inventoryItemId ?? '',
        locationId: prev[lineId]?.locationId ?? '',
        ...patch,
      },
    }));
  }

  async function handleAuthorize(
    jobId: string,
    line: JobMaterialLineSummary,
    decision: 'approve' | 'reject',
  ) {
    if (!accessToken || busyId) return;
    if (decision === 'reject' && !rejectReasons[line.id]?.trim()) {
      setError('A rejection reason is required');
      return;
    }

    const selection = stockSelections[line.id] ?? {
      inventoryItemId: line.inventoryItemId ?? '',
      locationId: line.locationId ?? '',
    };

    if (
      decision === 'approve' &&
      isStockSource(line.materialSource) &&
      (!selection.inventoryItemId || !selection.locationId)
    ) {
      setError('Select an inventory item and location before approving stock use');
      return;
    }

    setBusyId(line.id);
    setError(null);
    setSuccess(null);
    try {
      await authorizeJobMaterialLine(accessToken, jobId, line.id, {
        decision,
        reason: decision === 'reject' ? rejectReasons[line.id]?.trim() : null,
        clientActionId: newJobsClientActionId(decision),
        inventoryItemId: selection.inventoryItemId || null,
        locationId: selection.locationId || null,
      });
      setSuccess(
        decision === 'approve'
          ? 'Material request approved — stock decremented when linked to inventory.'
          : 'Material request rejected.',
      );
      await refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update material request');
    } finally {
      setBusyId(null);
    }
  }

  if (!canManage) {
    return (
      <div className="inventory-page">
        <PageHeader
          title="Parts requests"
          description="You do not have permission to authorize material requests."
        />
      </div>
    );
  }

  return (
    <div className="inventory-page">
      <PageHeader
        title="Procurement"
        description="Suppliers, purchase orders and parts requests."
      />
      <ProcurementNav />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <PageLoadState
        isLoading={isLoading}
        error={loadError}
        isEmpty={(materialLines?.length ?? 0) === 0}
        emptyTitle="No pending parts requests"
        emptyDescription="Technician material requests awaiting office approval will appear here."
        loadingLabel="Loading parts requests…"
      >
        <Panel title="Pending requests">
          <div className="inventory-table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Source</th>
                  <th>Stock link</th>
                  <th>Cost</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {materialLines?.map((line) => {
                  const selection = stockSelections[line.id] ?? {
                    inventoryItemId: line.inventoryItemId ?? '',
                    locationId: line.locationId ?? '',
                  };
                  return (
                    <tr key={line.id}>
                      <td>
                        <Link href={`/jobs/${line.jobId}`} className="inventory-link">
                          {line.jobNumber ?? 'Job'}
                        </Link>
                      </td>
                      <td>
                        {line.description}
                        {line.inventoryItemName ? (
                          <span className="page-muted"> ({line.inventoryItemName})</span>
                        ) : null}
                      </td>
                      <td>
                        {line.quotedQuantity ?? line.quantity} {line.unit}
                      </td>
                      <td>{line.materialSource.replace(/_/g, ' ')}</td>
                      <td>
                        {isStockSource(line.materialSource) ? (
                          <div className="jobs-form__actions">
                            <label className="titan-input-group">
                              <span className="titan-input-label">Item</span>
                              <select
                                className="titan-input"
                                value={selection.inventoryItemId}
                                onChange={(e) =>
                                  updateStockSelection(line.id, { inventoryItemId: e.target.value })
                                }
                              >
                                <option value="">Select item</option>
                                {items.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.sku} — {item.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="titan-input-group">
                              <span className="titan-input-label">Location</span>
                              <select
                                className="titan-input"
                                value={selection.locationId}
                                onChange={(e) =>
                                  updateStockSelection(line.id, { locationId: e.target.value })
                                }
                              >
                                <option value="">Select location</option>
                                {locations.map((location) => (
                                  <option key={location.id} value={location.id}>
                                    {location.name} ({location.locationType})
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{line.lineTotalCents != null ? formatMoney(line.lineTotalCents) : '—'}</td>
                      <td>
                        <span className={materialLineStatusPillClass(line.status)}>{line.status}</span>
                      </td>
                      <td>
                        <div className="jobs-form__actions">
                          <Button
                            size="sm"
                            disabled={busyId === line.id}
                            onClick={() => void handleAuthorize(line.jobId, line, 'approve')}
                          >
                            Approve
                          </Button>
                          <Input
                            label="Reject reason"
                            value={rejectReasons[line.id] ?? ''}
                            onChange={(e) =>
                              setRejectReasons((prev) => ({ ...prev, [line.id]: e.target.value }))
                            }
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busyId === line.id}
                            onClick={() => void handleAuthorize(line.jobId, line, 'reject')}
                          >
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </PageLoadState>
    </div>
  );
}
