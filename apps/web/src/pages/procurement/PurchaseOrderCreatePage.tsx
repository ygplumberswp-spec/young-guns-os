import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { Button, Input, PageHeader, Panel } from '@titan/ui';
import {
  PURCHASE_ORDER_DRAFT_KIND,
  type InventoryItemSummary,
  type InventoryLocationSummary,
  type JobSummary,
  type SupplierSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { createPurchaseOrder, newClientActionId } from '../../lib/procurement-api';
import { fetchInventoryItems, fetchInventoryLocations } from '../../lib/inventory-api';
import { fetchSuppliers } from '../../lib/procurement-api';
import { fetchJobs } from '../../lib/jobs-api';
import { fetchDraft } from '../../lib/drafts-api';
import { useAuth } from '../../lib/auth-context';
import { canManageProcurement } from '../../features/procurement/utils';
import { AutosaveIndicator } from '../../components/ux/AutosaveIndicator';
import { DraftRestoreBanner } from '../../components/ux/DraftRestoreBanner';
import { useFormDraftShell } from '../../hooks/useFormDraftShell';

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
  const search = useSearch();
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
  const [pendingDraft, setPendingDraft] = useState<{
    id: string;
    title: string | null;
    lastEditedAt: string;
    payload: Record<string, unknown>;
  } | null>(null);

  const supplierName = suppliers.find((supplier) => supplier.id === supplierId)?.name;
  const draftShell = useFormDraftShell({
    accessToken,
    userId: user?.id,
    recordType: 'other',
    enabled: canWrite,
    getPayload: () => ({
      draftKind: PURCHASE_ORDER_DRAFT_KIND,
      supplierId,
      jobId,
      jobReference,
      destinationLocationId,
      notes,
      lines: lines.map(({ inventoryItemId, description, quantity, unitCostCents }) => ({
        inventoryItemId,
        description,
        quantity,
        unitCostCents,
      })),
    }),
    getMeta: () => ({ title: `PO draft: ${supplierName || 'New'}` }),
  });

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
        setDestinationLocationId(
          locationData.find((l) => l.isDefault)?.id ?? locationData[0]?.id ?? '',
        );
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

  useEffect(() => {
    let cancelled = false;
    async function loadDraft() {
      if (!accessToken) return;
      const draftId = new URLSearchParams(search).get('draftId');
      if (!draftId) return;
      try {
        const draft = await fetchDraft(accessToken, draftId);
        if (
          cancelled ||
          draft.recordType !== 'other' ||
          draft.payload.draftKind !== PURCHASE_ORDER_DRAFT_KIND
        )
          return;
        setPendingDraft({
          id: draft.id,
          title: draft.title,
          lastEditedAt: draft.lastEditedAt,
          payload: draft.payload,
        });
      } catch {
        /* Ignore unavailable drafts. */
      }
    }
    void loadDraft();
    return () => {
      cancelled = true;
    };
  }, [accessToken, search]);

  function applyDraftPayload(payload: Record<string, unknown>) {
    if (typeof payload.supplierId === 'string') setSupplierId(payload.supplierId);
    if (typeof payload.jobId === 'string') setJobId(payload.jobId);
    if (typeof payload.jobReference === 'string') setJobReference(payload.jobReference);
    if (typeof payload.destinationLocationId === 'string')
      setDestinationLocationId(payload.destinationLocationId);
    if (typeof payload.notes === 'string') setNotes(payload.notes);
    if (Array.isArray(payload.lines)) {
      const restoredLines = payload.lines.flatMap((line) => {
        if (!line || typeof line !== 'object' || Array.isArray(line)) return [];
        const value = line as Record<string, unknown>;
        return [
          {
            inventoryItemId: typeof value.inventoryItemId === 'string' ? value.inventoryItemId : '',
            description: typeof value.description === 'string' ? value.description : '',
            quantity: typeof value.quantity === 'string' ? value.quantity : '1',
            unitCostCents: typeof value.unitCostCents === 'string' ? value.unitCostCents : '0',
          },
        ];
      });
      if (restoredLines.length) setLines(restoredLines);
    }
    draftShell.touchField();
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
    draftShell.touchField();
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
    draftShell.touchField();
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
    draftShell.touchField();
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
      draftShell.markSubmitted();
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
        title="New Purchase Order"
        description="Order stock from a supplier and receive it against a location."
        actions={
          <Button
            variant="secondary"
            onClick={() => draftShell.guard.guardNavigation(() => navigate('/procurement'))}
          >
            Back to purchase orders
          </Button>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      <AutosaveIndicator
        status={draftShell.autosave.status}
        lastSavedAt={draftShell.autosave.lastSavedAt}
      />
      {draftShell.guard.unsavedChangesModal}
      {pendingDraft ? (
        <DraftRestoreBanner
          title={pendingDraft.title}
          lastEditedAt={pendingDraft.lastEditedAt}
          onRestore={() => {
            applyDraftPayload(pendingDraft.payload);
            setPendingDraft(null);
          }}
          onDismiss={() => setPendingDraft(null)}
        />
      ) : null}

      {suppliers.length === 0 ? (
        <p className="page-muted">
          <Link href="/procurement/suppliers" className="inventory-link">
            Create a supplier
          </Link>{' '}
          before creating a purchase order.
        </p>
      ) : (
        <form
          className="inventory-form"
          style={{ maxWidth: '60rem' }}
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label className="titan-input-group">
            <span className="titan-input-label">Supplier</span>
            <select
              className="titan-input"
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                draftShell.touchField();
              }}
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
              onChange={(e) => {
                setDestinationLocationId(e.target.value);
                draftShell.touchField();
              }}
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
            <select
              className="titan-input"
              value={jobId}
              onChange={(e) => {
                setJobId(e.target.value);
                draftShell.touchField();
              }}
            >
              <option value="">No job</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.jobNumber ?? job.title}
                </option>
              ))}
            </select>
          </label>

          <Input
            label="Job Reference (Optional)"
            value={jobReference}
            onChange={(e) => {
              setJobReference(e.target.value);
              draftShell.touchField();
            }}
          />

          <label className="titan-input-group">
            <span className="titan-input-label">Notes</span>
            <textarea
              className="titan-input inventory-textarea"
              rows={2}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                draftShell.touchField();
              }}
            />
          </label>

          <Panel title="Line Items">
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
            <Button
              type="button"
              variant="secondary"
              onClick={addLine}
              style={{ marginTop: '0.75rem' }}
            >
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
