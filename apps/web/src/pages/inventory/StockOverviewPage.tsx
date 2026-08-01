import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel } from '@titan/ui';
import type {
  InventoryItemSummary,
  InventoryLocationSummary,
  InventoryLocationType,
  InventoryStockLevelSummary,
  VehicleSummary,
} from '@titan/shared';
import { INVENTORY_LOCATION_TYPE_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  createInventoryLocation,
  fetchInventoryItems,
  fetchInventoryLocations,
  fetchInventoryStock,
  setInventoryStock,
} from '../../lib/inventory-api';
import { fetchVehicles } from '../../lib/fleet-api';
import { useAuth } from '../../lib/auth-context';
import { InventoryNav } from '../../features/inventory/InventoryNav';
import { canAccessInventory, canManageInventory } from '../../features/inventory/utils';

export function StockOverviewPage() {
  const { accessToken, user } = useAuth();
  const [stockLevels, setStockLevels] = useState<InventoryStockLevelSummary[]>([]);
  const [items, setItems] = useState<InventoryItemSummary[]>([]);
  const [locations, setLocations] = useState<InventoryLocationSummary[]>([]);
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [showStockForm, setShowStockForm] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [locationCode, setLocationCode] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [locationType, setLocationType] = useState<InventoryLocationType>('warehouse');
  const [vehicleId, setVehicleId] = useState('');
  const [itemId, setItemId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [quantityOnHand, setQuantityOnHand] = useState('0');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessInventory(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageInventory(user.permissions) : false), [user]);
  const canViewVehicles = useMemo(
    () =>
      user
        ? user.permissions.includes('*') ||
          user.permissions.includes('fleet:read') ||
          user.permissions.includes('fleet:write')
        : false,
    [user],
  );

  async function loadData() {
    if (!accessToken || !canView) {
      setIsLoading(false);
      return;
    }

    try {
      const [stockData, itemData, locationData, vehicleData] = await Promise.all([
        fetchInventoryStock(accessToken),
        fetchInventoryItems(accessToken),
        fetchInventoryLocations(accessToken),
        canViewVehicles ? fetchVehicles(accessToken) : Promise.resolve<VehicleSummary[]>([]),
      ]);

      setStockLevels(stockData);
      setItems(itemData);
      setLocations(locationData);
      setVehicles(vehicleData);
      setItemId(itemData[0]?.id ?? '');
      setLocationId(locationData[0]?.id ?? '');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load stock overview');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [accessToken, canView]);

  async function handleCreateLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite) return;

    setIsSaving(true);
    setFormError(null);

    try {
      await createInventoryLocation(accessToken, {
        name: locationName,
        code: locationCode.trim() || null,
        address: locationAddress.trim() || null,
        locationType,
        vehicleId: locationType === 'van' && vehicleId ? vehicleId : null,
        isDefault: locations.length === 0,
      });
      setLocationName('');
      setLocationCode('');
      setLocationAddress('');
      setLocationType('warehouse');
      setVehicleId('');
      setShowLocationForm(false);
      setIsLoading(true);
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Unable to create location');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSetStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !itemId || !locationId) return;

    const parsedQuantity = Number.parseInt(quantityOnHand, 10);
    if (Number.isNaN(parsedQuantity) || parsedQuantity < 0) {
      setFormError('Enter a valid quantity of zero or greater');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      await setInventoryStock(accessToken, {
        itemId,
        locationId,
        quantityOnHand: parsedQuantity,
      });
      setQuantityOnHand('0');
      setShowStockForm(false);
      setIsLoading(true);
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Unable to update stock');
    } finally {
      setIsSaving(false);
    }
  }

  if (!canView) {
    return (
      <div className="inventory-page">
        <PageHeader title="Stock" description="You do not have permission to view inventory." />
      </div>
    );
  }

  return (
    <div className="inventory-page">
      <PageHeader
        title="Inventory"
        description="Stock levels across products and warehouse locations."
        actions={
          canWrite ? (
            <div className="inventory-page__actions">
              <Button variant="secondary" onClick={() => setShowLocationForm((value) => !value)}>
                {showLocationForm ? 'Cancel location' : 'New location'}
              </Button>
              <Button
                onClick={() => setShowStockForm((value) => !value)}
                disabled={items.length === 0 || locations.length === 0}
              >
                {showStockForm ? 'Cancel stock' : 'Set stock'}
              </Button>
            </div>
          ) : undefined
        }
      />
      <InventoryNav />

      {isLoading ? <p className="page-muted">Loading stock…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {formError ? <p className="form-error">{formError}</p> : null}

      {canWrite && showLocationForm ? (
        <Panel title="New location">
          <form className="inventory-form" onSubmit={(event) => void handleCreateLocation(event)}>
            <Input
              label="Location name"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              required
            />
            <Input
              label="Code (optional)"
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value)}
            />
            <Input
              label="Address (optional)"
              value={locationAddress}
              onChange={(e) => setLocationAddress(e.target.value)}
            />
            <label className="titan-input-group">
              <span className="titan-input-label">Location type</span>
              <select
                className="titan-input"
                value={locationType}
                onChange={(e) => setLocationType(e.target.value as InventoryLocationType)}
              >
                {INVENTORY_LOCATION_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {locationType === 'van' ? (
              <label className="titan-input-group">
                <span className="titan-input-label">Vehicle</span>
                <select
                  className="titan-input"
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                >
                  <option value="">No vehicle linked</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.name} ({vehicle.licensePlate})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <Button type="submit" disabled={isSaving || !locationName.trim()}>
              {isSaving ? 'Creating…' : 'Create location'}
            </Button>
          </form>
        </Panel>
      ) : null}

      {canWrite && showStockForm ? (
        <Panel title="Set stock level">
          {items.length === 0 ? (
            <p className="page-muted">
              <Link href="/inventory/products/new" className="inventory-link">
                Create a product
              </Link>{' '}
              before setting stock.
            </p>
          ) : locations.length === 0 ? (
            <p className="page-muted">Create a location before setting stock.</p>
          ) : (
            <form className="inventory-form" onSubmit={(event) => void handleSetStock(event)}>
              <label className="titan-input-group">
                <span className="titan-input-label">Product</span>
                <select
                  className="titan-input"
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  required
                >
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
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
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
              <Input
                label="Quantity on hand"
                type="number"
                min="0"
                value={quantityOnHand}
                onChange={(e) => setQuantityOnHand(e.target.value)}
                required
              />
              <Button type="submit" disabled={isSaving || !itemId || !locationId}>
                {isSaving ? 'Saving…' : 'Save stock level'}
              </Button>
            </form>
          )}
        </Panel>
      ) : null}

      {!isLoading && !error ? (
        <>
          <Panel title="Locations">
            {locations.length === 0 ? (
              <p className="page-muted">No warehouse locations yet.</p>
            ) : (
              <div className="inventory-table-wrap">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Code</th>
                      <th>Type</th>
                      <th>Address</th>
                      <th>Vehicle</th>
                      <th>Default</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map((location) => (
                      <tr key={location.id}>
                        <td>{location.name}</td>
                        <td>{location.code ?? '—'}</td>
                        <td>
                          {INVENTORY_LOCATION_TYPE_OPTIONS.find(
                            (option) => option.value === location.locationType,
                          )?.label ?? location.locationType}
                        </td>
                        <td>{location.address ?? '—'}</td>
                        <td>{location.vehicleLabel ?? '—'}</td>
                        <td>{location.isDefault ? 'Yes' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {stockLevels.length === 0 ? (
            <EmptyState
              title="No stock recorded yet"
              description="Create products and locations, then set stock levels to track inventory."
              action={
                canWrite ? (
                  <Link href="/inventory/products/new">
                    <Button>New product</Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <Panel title="Stock levels">
              <div className="inventory-table-wrap">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Location</th>
                      <th>On hand</th>
                      <th>Unit</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockLevels.map((level) => (
                      <tr key={level.id}>
                        <td>{level.itemName}</td>
                        <td>{level.itemSku}</td>
                        <td>
                          {level.locationName}
                          {level.locationCode ? ` (${level.locationCode})` : ''}
                        </td>
                        <td>
                          <span className={level.isLowStock ? 'inventory-low-stock' : undefined}>
                            {level.quantityOnHand}
                          </span>
                        </td>
                        <td>{level.itemUnit}</td>
                        <td>{new Date(level.updatedAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      ) : null}
    </div>
  );
}
