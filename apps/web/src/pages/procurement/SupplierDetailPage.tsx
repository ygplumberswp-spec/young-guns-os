import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRoute } from 'wouter';
import { Button, Input, Panel } from '@titan/ui';
import type { SupplierActivitySummary, SupplierStatus, SupplierSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  createSupplierActivity,
  fetchSupplierActivities,
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

  const canWrite = useMemo(() => (user ? canManageProcurement(user.permissions) : false), [user]);

  async function loadSupplier() {
    if (!accessToken || !supplierId) return;

    const [suppliers, activityData] = await Promise.all([
      fetchSuppliers(accessToken),
      fetchSupplierActivities(accessToken, supplierId),
    ]);
    const found = suppliers.find((s) => s.id === supplierId) ?? null;
    setSupplier(found);
    setActivities(activityData);
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

  if (isLoading) return <p className="page-muted">Loading supplier…</p>;

  if (!supplier) {
    return (
      <div className="inventory-page">
        <PageHeader title="Supplier not found" description="This supplier may have been removed." />
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
        <Panel title="Edit supplier">
          <form className="inventory-form" onSubmit={(event) => void handleSubmit(event)}>
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input
              label="Contact name"
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
        <Panel title="Supplier details">
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

      <Panel title="Activity log" description="Notes, communications and performance history.">
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
