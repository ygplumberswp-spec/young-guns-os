import { PageHeader } from '../../components/ux';
import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, Input, PageLoadState, Panel } from '@titan/ui';
import { ApiClientError } from '../../lib/api-client';
import { createSupplier, fetchSuppliers } from '../../lib/procurement-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { ProcurementNav } from '../../features/procurement/ProcurementNav';
import { canAccessProcurement, canManageProcurement } from '../../features/procurement/utils';

export function SupplierListPage() {
  const { accessToken, user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessProcurement(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageProcurement(user.permissions) : false), [user]);

  const {
    data: suppliers,
    error,
    isLoading,
    refetch,
  } = useCachedQuery({
    queryKey: 'procurement/suppliers',
    accessToken,
    enabled: canView,
    staleTimeMs: 30_000,
    fetcher: async () => fetchSuppliers(accessToken!),
  });

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite) return;

    setIsSaving(true);
    setFormError(null);
    try {
      await createSupplier(accessToken, {
        name,
        contactName: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
      });
      setName('');
      setContactName('');
      setEmail('');
      setPhone('');
      setShowForm(false);
      await refetch();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Unable to create supplier');
    } finally {
      setIsSaving(false);
    }
  }

  if (!canView) {
    return (
      <div className="inventory-page">
        <PageHeader title="Suppliers" description="You do not have permission to view suppliers." />
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
            <Button variant="secondary" onClick={() => setShowForm((value) => !value)}>
              {showForm ? 'Cancel' : 'New supplier'}
            </Button>
          ) : undefined
        }
      />
      <ProcurementNav />

      {formError ? <p className="form-error">{formError}</p> : null}

      {canWrite && showForm ? (
        <Panel title="New Supplier">
          <form className="inventory-form" onSubmit={(event) => void handleCreate(event)}>
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input
              label="Contact Name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Button type="submit" disabled={isSaving || !name.trim()}>
              {isSaving ? 'Creating…' : 'Create supplier'}
            </Button>
          </form>
        </Panel>
      ) : null}

      <PageLoadState
        isLoading={isLoading}
        error={error}
        isEmpty={(suppliers?.length ?? 0) === 0}
        emptyTitle="No Suppliers Yet"
        emptyDescription="Add a supplier to start creating purchase orders."
        loadingLabel="Loading suppliers…"
      >
        <Panel title="Suppliers">
          <div className="inventory-table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Purchase orders</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {suppliers?.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>
                      <Link href={`/procurement/suppliers/${supplier.id}`} className="inventory-link">
                        {supplier.name}
                      </Link>
                    </td>
                    <td>{supplier.contactName ?? '—'}</td>
                    <td>{supplier.email ?? '—'}</td>
                    <td>{supplier.phone ?? '—'}</td>
                    <td>{supplier.purchaseOrderCount}</td>
                    <td>
                      <span className="inventory-status">{supplier.status}</span>
                    </td>
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
