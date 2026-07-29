import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, PageHeader, Panel } from '@titan/ui';
import type { CustomerSummary, PortalStats, PortalUserSummary } from '@titan/shared';
import type { PortalAccessPermission } from '@titan/shared';
import {
  DEFAULT_PORTAL_ACCESS_PERMISSIONS,
  PORTAL_ACCESS_PERMISSION_OPTIONS,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomers } from '../../lib/crm-api';
import {
  createPortalUser,
  fetchPortalStats,
  fetchPortalUsers,
  updatePortalUser,
} from '../../lib/portal-admin-api';
import { useAuth } from '../../lib/auth-context';
import {
  canAccessPortalSettings,
  canManagePortalSettings,
} from '../../features/portal/utils';

export function PortalSettingsPage() {
  const { accessToken, user } = useAuth();
  const [stats, setStats] = useState<PortalStats | null>(null);
  const [portalUsers, setPortalUsers] = useState<PortalUserSummary[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<PortalAccessPermission[]>([
    ...DEFAULT_PORTAL_ACCESS_PERMISSIONS,
  ]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(
    () => (user ? canAccessPortalSettings(user.permissions) : false),
    [user],
  );
  const canWrite = useMemo(
    () => (user ? canManagePortalSettings(user.permissions) : false),
    [user],
  );

  const linkedCustomerIds = useMemo(
    () => new Set(portalUsers.map((portalUser) => portalUser.customerId)),
    [portalUsers],
  );

  const availableCustomers = customers.filter((customer) => !linkedCustomerIds.has(customer.id));

  async function loadData() {
    if (!accessToken) return;

    const [statsData, usersData, customersData] = await Promise.all([
      fetchPortalStats(accessToken),
      fetchPortalUsers(accessToken),
      fetchCustomers(accessToken),
    ]);

    setStats(statsData);
    setPortalUsers(usersData);
    setCustomers(customersData);
    const linked = new Set(usersData.map((portalUser) => portalUser.customerId));
    const available = customersData.filter((customer) => !linked.has(customer.id));
    setCustomerId(available[0]?.id ?? customersData[0]?.id ?? '');
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        await loadData();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load portal settings');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => { cancelled = true; };
  }, [accessToken, canView]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !customerId) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await createPortalUser(accessToken, {
        customerId,
        email,
        password,
        firstName,
        lastName,
        permissions: selectedPermissions,
      });
      setEmail('');
      setPassword('');
      setFirstName('');
      setLastName('');
      await loadData();
      setSuccess('Portal user created.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create portal user');
    } finally {
      setIsSaving(false);
    }
  }

  async function togglePortalUserActive(portalUser: PortalUserSummary) {
    if (!accessToken || !canWrite) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updatePortalUser(accessToken, portalUser.id, { isActive: !portalUser.isActive });
      await loadData();
      setSuccess(`Portal user ${portalUser.isActive ? 'disabled' : 'enabled'}.`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update portal user');
    } finally {
      setIsSaving(false);
    }
  }

  function togglePermission(permission: PortalAccessPermission) {
    setSelectedPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  }

  if (!canView) {
    return (
      <div className="portal-admin-page">
        <PageHeader title="Customer Portal" description="You do not have permission to manage the portal." />
      </div>
    );
  }

  if (isLoading) return <p className="page-muted">Loading portal settings…</p>;

  return (
    <div className="portal-admin-page">
      <PageHeader
        title="Customer Portal"
        description="Provision portal users linked to customers and manage customer access permissions."
        actions={
          <Link href="/portal/login">
            <Button variant="secondary">Open portal login</Button>
          </Link>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {stats ? (
        <div className="portal-stats-grid">
          <Panel title="Portal users">{stats.portalUserCount}</Panel>
          <Panel title="Active users">{stats.activePortalUserCount}</Panel>
          <Panel title="Linked customers">{stats.linkedCustomerCount}</Panel>
        </div>
      ) : null}

      {canWrite ? (
        <Panel title="Create portal user">
          {customers.length === 0 ? (
            <p className="page-muted">
              <Link href="/crm/new" className="portal-link">
                Add a customer
              </Link>{' '}
              before provisioning portal access.
            </p>
          ) : availableCustomers.length === 0 ? (
            <p className="page-muted">All customers already have portal users.</p>
          ) : (
            <form className="portal-form" onSubmit={(event) => void handleCreate(event)}>
              <label className="titan-input-group">
                <span className="titan-input-label">Customer</span>
                <select
                  className="titan-input"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  required
                >
                  {availableCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>
              <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              <div className="portal-permission-grid">
                {PORTAL_ACCESS_PERMISSION_OPTIONS.map((option) => (
                  <label key={option.value} className="portal-permission-option">
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(option.value)}
                      onChange={() => togglePermission(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <Button type="submit" disabled={isSaving || !customerId}>
                {isSaving ? 'Saving…' : 'Create portal user'}
              </Button>
            </form>
          )}
        </Panel>
      ) : null}

      {portalUsers.length === 0 ? (
        <EmptyState
          title="No portal users yet"
          description="Create a portal user to give a customer access to the portal dashboard."
        />
      ) : (
        <Panel title="Portal users">
          <div className="portal-table-wrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Permissions</th>
                  <th>Last login</th>
                  {canWrite ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {portalUsers.map((portalUser) => (
                  <tr key={portalUser.id}>
                    <td>{portalUser.customerName}</td>
                    <td>
                      {portalUser.firstName} {portalUser.lastName}
                    </td>
                    <td>{portalUser.email}</td>
                    <td>{portalUser.isActive ? 'Active' : 'Inactive'}</td>
                    <td>{portalUser.permissionCount}</td>
                    <td>
                      {portalUser.lastLoginAt
                        ? new Date(portalUser.lastLoginAt).toLocaleString()
                        : '—'}
                    </td>
                    {canWrite ? (
                      <td>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isSaving}
                          onClick={() => void togglePortalUserActive(portalUser)}
                        >
                          {portalUser.isActive ? 'Disable' : 'Enable'}
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
