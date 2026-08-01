import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Button, Input } from '@titan/ui';
import {
  INVENTORY_ITEM_STATUS_OPTIONS,
  INVENTORY_UNIT_OPTIONS,
  type InventoryItemStatus,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { createInventoryItem } from '../../lib/inventory-api';
import { useAuth } from '../../lib/auth-context';
import { InventoryNav } from '../../features/inventory/InventoryNav';
import { canManageInventory } from '../../features/inventory/utils';

export function ProductCreatePage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('each');
  const [reorderLevel, setReorderLevel] = useState('0');
  const [status, setStatus] = useState<InventoryItemStatus>('active');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageInventory(user.permissions) : false;

  useEffect(() => {
    if (user && !canWrite) navigate('/inventory/products');
  }, [canWrite, navigate, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite) return;

    const parsedReorderLevel = Number.parseInt(reorderLevel, 10);
    if (Number.isNaN(parsedReorderLevel) || parsedReorderLevel < 0) {
      setError('Enter a valid reorder level of zero or greater');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await createInventoryItem(accessToken, {
        sku,
        name,
        description: description.trim() || null,
        unit,
        reorderLevel: parsedReorderLevel,
        status,
      });
      navigate('/inventory/products');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create product');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="inventory-page">
      <PageHeader
        title="New product"
        description="Add a product to your inventory catalog."
      />
      <InventoryNav />
      {error ? <p className="form-error">{error}</p> : null}

      <form className="inventory-form" onSubmit={(event) => void handleSubmit(event)}>
        <Input label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} required />
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <label className="titan-input-group">
          <span className="titan-input-label">Description</span>
          <textarea
            className="titan-input inventory-textarea"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="titan-input-group">
          <span className="titan-input-label">Unit</span>
          <select className="titan-input" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {INVENTORY_UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Reorder level"
          type="number"
          min="0"
          value={reorderLevel}
          onChange={(e) => setReorderLevel(e.target.value)}
          required
        />
        <label className="titan-input-group">
          <span className="titan-input-label">Status</span>
          <select
            className="titan-input"
            value={status}
            onChange={(e) => setStatus(e.target.value as InventoryItemStatus)}
          >
            {INVENTORY_ITEM_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={isSaving || !sku.trim() || !name.trim()}>
          {isSaving ? 'Creating…' : 'Create product'}
        </Button>
      </form>
    </div>
  );
}
