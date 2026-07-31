import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, Input, PageHeader, Panel } from '@titan/ui';
import type { InventoryItemSummary, InventoryLocationSummary, JobSummary, SupplierSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { createPurchaseOrder, newClientActionId } from '../../lib/procurement-api';
import { fetchInventoryItems, fetchInventoryLocations } from '../../lib/inventory-api';
import { fetchSuppliers } from '../../lib/procurement-api';
import { fetchJobs } from '../../lib/jobs-api';
import { useAuth } from '../../lib/auth-context';
import { canManageProcurement } from '../../features/procurement/utils';

type DraftLine = {
  inventoryItemId: string;
  description: string;
  quantity: string;
  unitCostCents: string;
};

function emptyLine(): DraftLine {
  return { inventoryItemId: '', description: '', quantity: '1', unitCostCents: '0' };
}

export function PurchaseOrderCreatePage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const canWrite = useMemo(() => (user ? canManageProcurement(user.permissions) : false), [user]);

  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [items, setItems] = useState<InventoryItemSummary[]>([]);
  const [locations, setLocations] = useState<InventoryLocationSummary[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState('');
  const [jobId, setJobId] = useState('');
  const [jobReference, setJobReference] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  useEffect(() => {
    if (user && !canWrite) navigate('/procurement');
  }, [canWrite, navigate, user]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }
      try {
        const [supplierData, itemData, locationData, jobData] = await Promise.all([
          fetchSuppliers(accessToken),
          fetchInventoryItems(accessToken),
          fetchInventoryLocations(accessToken),
          fetchJobs(accessToken),
        ]);
        if (cancelled) return;
        setSuppliers(supplierData);
        setItems(itemData);
        setLocations(locationData);
        setJobs(jobData);
        setSupplierId(supplierData[0]?.id ?? '');
        setDestinationLocationId(locationData.find((l) => l.isDefault)?.id ?? locationData[0]?.id ?? '');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load form data');
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

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  const totalCents = lines.reduce((sum, line) => {
    const quantity = Number.parseInt(line.quantity, 10) || 0;
    const unitCostCents = Number.parseInt(line.unitCostCents, 10) || 0;
    return sum + quantity * unitCostCents;
  }, 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !supplierId) return;

    const parsedLines = lines.map((line) => ({
      inventoryItemId: line.inventoryItemId || null,
      description: line.description.trim(),
      quantity: Number.parseInt(line.quantity, 10) || 0,
      unitCostCents: Number.parseInt(line.unitCostCents, 10) || 0,
    }));

    if (parsedLines.some((line) => !line.description || line.quantity <= 0)) {
      setError('Every line needs a description and a quantity of at least 1');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const purchaseOrder = await createPurchaseOrder(accessToken, {
        supplierId,
        notes: notes.trim() || null,
        items: parsedLines,
        jobId: jobId || null,
        jobReference: jobReference.trim() || null,
        destinationLocationId: destinationLocationId || null,
        clientActionId: newClientActionId('po'),
      });
      navigate(`/procurement/purchase-orders/${purchaseOrder.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create purchase order');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading…</p>;

  return (
    <div className="inventory-page">
      <PageHeader
        title="New purchase order"
        description="Order stock from a supplier and receive it against a location."
        actions={
          <Link href="/procurement">
            <Button variant="secondary">Back to purchase orders</Button>
          </Link>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}

      {suppliers.length === 0 ? (
        <p className="page-muted">
          <Link href="/procurement/suppliers" className="inventory-link">
            Create a supplier
          </Link>{' '}
          before creating a purchase order.
        </p>
      ) : (
        <form className="inventory-form" style={{ maxWidth: '60rem' }} onSubmit={(event) => void handleSubmit(event)}>
          <label className="titan-input-group">
            <span className="titan-input-label">Supplier</span>
            <select
              className="titan-input"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              required
            >
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>

          <label className="titan-input-group">
            <span className="titan-input-label">Destination location</span>
            <select
              className="titan-input"
              value={destinationLocationId}
              onChange={(e) => setDestinationLocationId(e.target.value)}
            >
              <option value="">No default location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                  {location.code ? ` (${location.code})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="titan-input-group">
            <span className="titan-input-label">Link to job (optional)</span>
            <select className="titan-input" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">No job</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.jobNumber ?? job.title}
                </option>
              ))}
            </select>
          </label>

          <Input
            label="Job reference (optional)"
            value={jobReference}
            onChange={(e) => setJobReference(e.target.value)}
          />

          <label className="titan-input-group">
            <span className="titan-input-label">Notes</span>
            <textarea
              className="titan-input inventory-textarea"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <Panel title="Line items">
            <div className="inventory-table-wrap">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Inventory item (optional)</th>
                    <th>Description</th>
                    <th>Quantity</th>
                    <th>Unit cost (cents)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={index}>
                      <td>
                        <select
                          className="titan-input"
                          value={line.inventoryItemId}
                          onChange={(e) => updateLine(index, { inventoryItemId: e.target.value })}
                        >
                          <option value="">Non-stock item</option>
                          {items.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.sku} — {item.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="titan-input"
                          value={line.description}
                          onChange={(e) => updateLine(index, { description: e.target.value })}
                          required
                        />
                      </td>
                      <td>
                        <input
                          className="titan-input"
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) => updateLine(index, { quantity: e.target.value })}
                          required
                        />
                      </td>
                      <td>
                        <input
                          className="titan-input"
                          type="number"
                          min="0"
                          value={line.unitCostCents}
                          onChange={(e) => updateLine(index, { unitCostCents: e.target.value })}
                          required
                        />
                      </td>
                      <td>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLine(index)}
                          disabled={lines.length === 1}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="button" variant="secondary" onClick={addLine} style={{ marginTop: '0.75rem' }}>
              Add line
            </Button>
            <p className="page-muted" style={{ marginTop: '0.75rem' }}>
              Total: R {(totalCents / 100).toFixed(2)}
            </p>
          </Panel>

          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Creating…' : 'Create purchase order'}
          </Button>
        </form>
      )}
    </div>
  );
}
