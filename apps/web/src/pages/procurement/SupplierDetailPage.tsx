import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { Button, Input, PageHeader, Panel } from '@titan/ui';
import type {
  InventoryItemSummary,
  SupplierActivitySummary,
  SupplierProductSummary,
  SupplierStatus,
  SupplierSummary,
} from '@titan/shared';
import { formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchInventoryItems } from '../../lib/inventory-api';
import {
  createSupplierActivity,
  createSupplierProduct,
  fetchSupplierActivities,
  fetchSupplierProducts,
  fetchSuppliers,
  updateSupplier,
} from '../../lib/procurement-api';
import { useAuth } from '../../lib/auth-context';
import { canManageProcurement } from '../../features/procurement/utils';

export function SupplierDetailPage() {
  const [, params] = useRoute('/procurement/suppliers/:id');
  const supplierId = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const [supplier, setSupplier] = useState<SupplierSummary | null>(null);
  const [activities, setActivities] = useState<SupplierActivitySummary[]>([]);
  const [products, setProducts] = useState<SupplierProductSummary[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<SupplierStatus>('active');

  const [activityBody, setActivityBody] = useState('');
  const [productName, setProductName] = useState('');
  const [supplierSku, setSupplierSku] = useState('');
  const [unitCostRands, setUnitCostRands] = useState('0');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [linkedItemId, setLinkedItemId] = useState('');

  const canWrite = useMemo(() => (user ? canManageProcurement(user.permissions) : false), [user]);

  async function loadSupplier() {
    if (!accessToken || !supplierId) return;

    const [suppliers, activityData, productData, items] = await Promise.all([
      fetchSuppliers(accessToken),
      fetchSupplierActivities(accessToken, supplierId),
      fetchSupplierProducts(accessToken),
      fetchInventoryItems(accessToken),
    ]);
    const found = suppliers.find((s) => s.id === supplierId) ?? null;
    setSupplier(found);
    setActivities(activityData);
    setProducts(productData.filter((product) => product.supplierId === supplierId));
    setInventoryItems(items);
    if (found) {
      setName(found.name);
      setContactName(found.contactName ?? '');
      setEmail(found.email ?? '');
      setPhone(found.phone ?? '');
      setAddress(found.address ?? '');
      setNotes(found.notes ?? '');
      setStatus(found.status);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !supplierId) {
        setIsLoading(false);
        return;
      }

      try {
        await loadSupplier();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load supplier');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, supplierId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !supplierId) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateSupplier(accessToken, supplierId, {
        name,
        contactName: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        status,
      });
      await loadSupplier();
      setIsEditing(false);
      setSuccess('Supplier updated.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update supplier');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !supplierId || !activityBody.trim()) return;

    setIsSaving(true);
    setError(null);
    try {
      await createSupplierActivity(accessToken, supplierId, {
        activityType: 'note',
        body: activityBody.trim(),
      });
      setActivityBody('');
      await loadSupplier();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to add activity');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !supplierId || !productName.trim()) return;

    const unitCostCents = Math.round(Number.parseFloat(unitCostRands || '0') * 100);
    if (!Number.isFinite(unitCostCents) || unitCostCents < 0) {
      setError('Enter a valid unit cost');
      return;
    }

    const parsedLead = leadTimeDays.trim() ? Number.parseInt(leadTimeDays, 10) : null;
    if (parsedLead != null && (!Number.isFinite(parsedLead) || parsedLead < 0)) {
      setError('Enter a valid lead time in days');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await createSupplierProduct(accessToken, {
        supplierId,
        productName: productName.trim(),
        supplierSku: supplierSku.trim() || null,
        unitCostCents,
        leadTimeDays: parsedLead,
        inventoryItemId: linkedItemId || null,
      });
      setProductName('');
      setSupplierSku('');
      setUnitCostRands('0');
      setLeadTimeDays('');
      setLinkedItemId('');
      await loadSupplier();
      setSuccess('Supplier product added.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to add supplier product');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="page-shell">
        <PageHeader title="Supplier" description="Supplier record" />
        <p className="page-muted">Loading supplier…</p>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="inventory-page">
        <PageHeader title="Supplier Not Found" description="This supplier may have been removed." />
        <Link href="/procurement/suppliers">
          <Button variant="secondary">Back To Suppliers</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="inventory-page">
      <PageHeader
        title={supplier.name}
        description={`${supplier.purchaseOrderCount} purchase order(s) · ${supplier.status}`}
        actions={
          <div className="fleet-detail__actions">
            <Link href="/procurement/suppliers">
              <Button variant="secondary">Back To Suppliers</Button>
            </Link>
            {canWrite ? (
              <Button variant="secondary" onClick={() => setIsEditing((value) => !value)}>
                {isEditing ? 'Cancel edit' : 'Edit supplier'}
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {isEditing && canWrite ? (
        <Panel title="Edit Supplier">
          <form className="inventory-form" onSubmit={(event) => void handleSubmit(event)}>
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input
              label="Contact Name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
            <label className="titan-input-group">
              <span className="titan-input-label">Notes</span>
              <textarea
                className="titan-input inventory-textarea"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <label className="titan-input-group">
              <span className="titan-input-label">Status</span>
              <select
                className="titan-input"
                value={status}
                onChange={(e) => setStatus(e.target.value as SupplierStatus)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </Panel>
      ) : (
        <Panel title="Supplier Details">
          <dl className="fleet-detail-list">
            <div>
              <dt>Contact</dt>
              <dd>{supplier.contactName ?? '—'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{supplier.email ?? '—'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{supplier.phone ?? '—'}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{supplier.address ?? '—'}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{supplier.notes ?? '—'}</dd>
            </div>
            <div>
              <dt>Completed orders</dt>
              <dd>{supplier.completedOrderCount}</dd>
            </div>
          </dl>
        </Panel>
      )}

      <Panel title="Supplier Products" description="Catalog links used when raising purchase orders.">
        {canWrite ? (
          <form className="inventory-form" onSubmit={(event) => void handleAddProduct(event)}>
            <Input
              label="Product Name"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              required
            />
            <Input
              label="Supplier SKU"
              value={supplierSku}
              onChange={(e) => setSupplierSku(e.target.value)}
            />
            <Input
              label="Unit Cost (R)"
              value={unitCostRands}
              onChange={(e) => setUnitCostRands(e.target.value)}
              required
            />
            <Input
              label="Lead Time (Days)"
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(e.target.value)}
            />
            <label className="titan-input-group">
              <span className="titan-input-label">Linked inventory item</span>
              <select
                className="titan-input"
                value={linkedItemId}
                onChange={(e) => setLinkedItemId(e.target.value)}
              >
                <option value="">None</option>
                {inventoryItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} — {item.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={isSaving || !productName.trim()}>
              Add product
            </Button>
          </form>
        ) : null}
        {products.length === 0 ? (
          <p className="page-muted" style={{ marginTop: '0.75rem' }}>
            No supplier products linked yet.
          </p>
        ) : (
          <div className="inventory-table-wrap" style={{ marginTop: '0.75rem' }}>
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Unit cost</th>
                  <th>Lead time</th>
                  <th>Inventory item</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>{product.productName}</td>
                    <td>{product.supplierSku ?? '—'}</td>
                    <td>{formatMoney(product.unitCostCents)}</td>
                    <td>{product.leadTimeDays != null ? `${product.leadTimeDays}d` : '—'}</td>
                    <td>{product.inventoryItemName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Activity Log" description="Notes, communications and performance history.">
        {canWrite ? (
          <form className="inventory-form" onSubmit={(event) => void handleAddActivity(event)}>
            <label className="titan-input-group">
              <span className="titan-input-label">Add note</span>
              <textarea
                className="titan-input inventory-textarea"
                rows={2}
                value={activityBody}
                onChange={(e) => setActivityBody(e.target.value)}
              />
            </label>
            <Button type="submit" disabled={isSaving || !activityBody.trim()}>
              Add note
            </Button>
          </form>
        ) : null}
        {activities.length === 0 ? (
          <p className="page-muted">No activity recorded yet.</p>
        ) : (
          <ul className="portal-list" style={{ marginTop: '0.75rem' }}>
            {activities.map((activity) => (
              <li key={activity.id}>
                <strong>{activity.subject ?? activity.activityType}</strong>
                <span>
                  {activity.body} · {new Date(activity.occurredAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
