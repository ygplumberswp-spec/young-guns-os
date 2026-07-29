import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Input, PageHeader, Panel } from '@titan/ui';
import type {
  XeroConnectionSummary,
  XeroSyncLogSummary,
  XeroSyncStatusResponse,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  disconnectXero,
  fetchXeroConnection,
  fetchXeroSyncLogs,
  fetchXeroSyncStatus,
  retryXeroSyncJob,
  saveXeroConnection,
  syncXero,
  syncXeroCustomers,
  syncXeroInvoices,
  syncXeroPayments,
  syncXeroQuotes,
} from '../../lib/integrations-api';
import { useAuth } from '../../lib/auth-context';
import { IntegrationsNav } from '../../features/integrations/IntegrationsNav';
import {
  canAccessIntegrations,
  canManageIntegrations,
} from '../../features/integrations/utils';
import { formatConnectionStatus } from '../../features/integrations/formatters';

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function SyncEntityPanel({
  title,
  stats,
  onSync,
  isSyncing,
  canManage,
}: {
  title: string;
  stats: XeroSyncStatusResponse['customers'];
  onSync: () => void;
  isSyncing: boolean;
  canManage: boolean;
}) {
  return (
    <article className="integrations-provider-card">
      <div className="integrations-provider-card__header">
        <h3>{title}</h3>
      </div>
      <dl className="integrations-provider-card__meta">
        <div>
          <dt>Synced</dt>
          <dd>{stats.syncedCount}</dd>
        </div>
        <div>
          <dt>Failed</dt>
          <dd>{stats.failedCount}</dd>
        </div>
        <div>
          <dt>Pending</dt>
          <dd>{stats.pendingCount}</dd>
        </div>
        <div>
          <dt>Last sync</dt>
          <dd>{stats.lastSyncAt ? new Date(stats.lastSyncAt).toLocaleString() : 'Never'}</dd>
        </div>
      </dl>
      {stats.lastError ? <p className="form-error">{stats.lastError}</p> : null}
      {canManage ? (
        <div className="integrations-provider-card__actions">
          <Button size="sm" onClick={onSync} disabled={isSyncing}>
            {isSyncing ? 'Syncing…' : `Sync ${title.toLowerCase()}`}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

export function XeroSettingsPage() {
  const { accessToken, user } = useAuth();
  const [connection, setConnection] = useState<XeroConnectionSummary | null>(null);
  const [syncStatus, setSyncStatus] = useState<XeroSyncStatusResponse | null>(null);
  const [logs, setLogs] = useState<XeroSyncLogSummary[]>([]);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSyncScope, setActiveSyncScope] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageIntegrations(user.permissions) : false), [user]);

  async function loadPageData() {
    if (!accessToken || !canView) return;

    const [connectionData, statusData, logData] = await Promise.all([
      fetchXeroConnection(accessToken),
      fetchXeroSyncStatus(accessToken),
      fetchXeroSyncLogs(accessToken),
    ]);

    setConnection(connectionData);
    setSyncStatus(statusData);
    setLogs(logData);

    if (connectionData.tenantId) setTenantId(connectionData.tenantId);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        await loadPageData();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load Xero settings');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => { cancelled = true; };
  }, [accessToken, canView]);

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await saveXeroConnection(accessToken, { clientId, clientSecret, tenantId });
      setClientSecret('');
      setSuccess('Xero connected successfully.');
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to connect Xero');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!accessToken || !canManage) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await disconnectXero(accessToken);
      setClientId('');
      setClientSecret('');
      setTenantId('');
      setSuccess('Xero disconnected.');
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to disconnect Xero');
    } finally {
      setIsSaving(false);
    }
  }

  async function runSync(
    scope: string,
    action: () => Promise<{ failedCount?: number; syncedAt: string }>,
  ) {
    if (!accessToken || !canManage) return;

    setActiveSyncScope(scope);
    setError(null);
    setSuccess(null);

    try {
      const result = await action();
      setSuccess(
        `${scope} sync complete at ${new Date(result.syncedAt).toLocaleString()}${(result.failedCount ?? 0) > 0 ? ` (${result.failedCount} failed)` : ''}.`,
      );
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : `Unable to sync ${scope}`);
    } finally {
      setActiveSyncScope(null);
    }
  }

  if (!canView) {
    return (
      <div className="integrations-page">
        <PageHeader title="Xero" description="You do not have permission to view integrations." />
      </div>
    );
  }

  return (
    <div className="integrations-page">
      <PageHeader
        title="Xero"
        description="Connect Xero and synchronise customers, quotes, invoices, and payments with your TITAN records."
      />
      <IntegrationsNav />

      {isLoading ? <p className="page-muted">Loading Xero settings…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {!isLoading && connection && syncStatus ? (
        <>
          <Panel title="Connection status">
            <dl className="integration-status-list">
              <div>
                <dt>Status</dt>
                <dd>{formatConnectionStatus(connection.status)}</dd>
              </div>
              <div>
                <dt>Organisation</dt>
                <dd>{connection.organisationName ?? 'Not synced yet'}</dd>
              </div>
              <div>
                <dt>Outstanding</dt>
                <dd>{formatMoney(syncStatus.outstandingAmountCents, syncStatus.currency)}</dd>
              </div>
              <div>
                <dt>Unpaid invoices</dt>
                <dd>{syncStatus.unpaidInvoiceCount}</dd>
              </div>
              <div>
                <dt>Customers owing</dt>
                <dd>{syncStatus.customersWithOutstandingCount}</dd>
              </div>
              <div>
                <dt>Last sync</dt>
                <dd>{connection.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleString() : 'Never'}</dd>
              </div>
            </dl>
          </Panel>

          {connection.status === 'connected' ? (
            <>
              <section className="integrations-section">
                <h2>Sync dashboard</h2>
                <div className="integrations-provider-grid">
                  <SyncEntityPanel
                    title="Customers"
                    stats={syncStatus.customers}
                    canManage={canManage}
                    isSyncing={activeSyncScope === 'customers'}
                    onSync={() => {
                      if (!accessToken) return;
                      void runSync('customers', () => syncXeroCustomers(accessToken));
                    }}
                  />
                  <SyncEntityPanel
                    title="Quotes"
                    stats={syncStatus.quotes}
                    canManage={canManage}
                    isSyncing={activeSyncScope === 'quotes'}
                    onSync={() => {
                      if (!accessToken) return;
                      void runSync('quotes', () => syncXeroQuotes(accessToken));
                    }}
                  />
                  <SyncEntityPanel
                    title="Invoices"
                    stats={syncStatus.invoices}
                    canManage={canManage}
                    isSyncing={activeSyncScope === 'invoices'}
                    onSync={() => {
                      if (!accessToken) return;
                      void runSync('invoices', () => syncXeroInvoices(accessToken));
                    }}
                  />
                  <SyncEntityPanel
                    title="Payments"
                    stats={syncStatus.payments}
                    canManage={canManage}
                    isSyncing={activeSyncScope === 'payments'}
                    onSync={() => {
                      if (!accessToken) return;
                      void runSync('payments', () => syncXeroPayments(accessToken));
                    }}
                  />
                </div>
              </section>

              {canManage ? (
                <Panel title="Organisation verification">
                  <p className="page-muted">
                    Re-verify the Xero organisation connection against the live API.
                  </p>
                  <Button
                    onClick={() => {
                      if (!accessToken) return;
                      void runSync('organisation', () => syncXero(accessToken));
                    }}
                    disabled={activeSyncScope === 'organisation'}
                  >
                    {activeSyncScope === 'organisation' ? 'Verifying…' : 'Verify organisation'}
                  </Button>
                </Panel>
              ) : null}

              <Panel title="Recent sync logs">
                {logs.length === 0 ? (
                  <p className="page-muted">No Xero sync logs recorded yet.</p>
                ) : (
                  <div className="integrations-table-wrap">
                    <table className="integrations-table">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Entity</th>
                          <th>Action</th>
                          <th>Status</th>
                          <th>Message</th>
                          <th>Retry</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((log) => (
                          <tr key={log.id}>
                            <td>{new Date(log.createdAt).toLocaleString()}</td>
                            <td>{log.entityType}</td>
                            <td>{log.action}</td>
                            <td>{log.status}</td>
                            <td>{log.message ?? '—'}</td>
                            <td>
                              {canManage && log.status === 'failed' && log.syncJobId && accessToken ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    void runSync('retry', () =>
                                      retryXeroSyncJob(accessToken, log.syncJobId!),
                                    )
                                  }
                                >
                                  Retry job
                                </Button>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </>
          ) : null}

          {canManage ? (
            <Panel title="Credentials">
              <form className="integrations-form" onSubmit={(event) => void handleConnect(event)}>
                <Input label="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} required />
                <Input
                  label="Client secret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  required
                />
                <Input label="Tenant ID" value={tenantId} onChange={(e) => setTenantId(e.target.value)} required />
                <div className="integrations-form__actions">
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? 'Connecting…' : 'Save & connect'}
                  </Button>
                  {connection.hasCredentials ? (
                    <Button type="button" variant="ghost" disabled={isSaving} onClick={() => void handleDisconnect()}>
                      Disconnect
                    </Button>
                  ) : null}
                </div>
              </form>
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
