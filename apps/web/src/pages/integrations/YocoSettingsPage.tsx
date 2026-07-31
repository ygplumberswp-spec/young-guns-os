import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Input, PageHeader, Panel } from '@titan/ui';
import type { YocoConnectionSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  disconnectYoco,
  fetchYocoConnection,
  saveYocoConnection,
  syncYoco,
} from '../../lib/integrations-api';
import { useAuth } from '../../lib/auth-context';
import { IntegrationsNav } from '../../features/integrations/IntegrationsNav';
import { canAccessIntegrations, canManageIntegrations } from '../../features/integrations/utils';
import { formatConnectionStatus } from '../../features/integrations/formatters';

export function YocoSettingsPage() {
  const { accessToken, user } = useAuth();
  const [connection, setConnection] = useState<YocoConnectionSummary | null>(null);
  const [secretKey, setSecretKey] = useState('');
  const [environment, setEnvironment] = useState<'test' | 'live'>('test');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageIntegrations(user.permissions) : false), [user]);

  async function loadPageData() {
    if (!accessToken || !canView) return;
    const data = await fetchYocoConnection(accessToken);
    setConnection(data);
    setEnvironment(data.environment);
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
          setError(err instanceof ApiClientError ? err.message : 'Unable to load Yoco settings');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await saveYocoConnection(accessToken, { secretKey, environment });
      setConnection(updated);
      setSecretKey('');
      setSuccess('Yoco connected successfully.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to connect Yoco');
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
      const updated = await disconnectYoco(accessToken);
      setConnection(updated);
      setSecretKey('');
      setEnvironment('test');
      setSuccess('Yoco disconnected.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to disconnect Yoco');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSync() {
    if (!accessToken || !canManage) return;

    setIsSyncing(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await syncYoco(accessToken);
      setSuccess(`Sync complete: ${result.businessName} (${result.businessId}).`);
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to sync Yoco');
    } finally {
      setIsSyncing(false);
    }
  }

  if (!canView) {
    return (
      <div className="integrations-page">
        <PageHeader title="Yoco" description="You do not have permission to view integrations." />
      </div>
    );
  }

  return (
    <div className="integrations-page">
      <PageHeader
        title="Yoco"
        description="Connect Yoco using your secret key. Business profile is verified against the live Yoco API."
      />
      <IntegrationsNav />

      {isLoading ? <p className="page-muted">Loading Yoco settings…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {!isLoading && connection ? (
        <>
          <Panel title="Connection status">
            <dl className="integration-status-list">
              <div>
                <dt>Status</dt>
                <dd>{formatConnectionStatus(connection.status)}</dd>
              </div>
              <div>
                <dt>Environment</dt>
                <dd>{connection.environment}</dd>
              </div>
              <div>
                <dt>Secret key</dt>
                <dd>{connection.secretKeyHint ?? 'Not configured'}</dd>
              </div>
              <div>
                <dt>Business</dt>
                <dd>{connection.businessName ?? 'Not synced yet'}</dd>
              </div>
              <div>
                <dt>Business ID</dt>
                <dd>{connection.businessId ?? '—'}</dd>
              </div>
              <div>
                <dt>Last sync</dt>
                <dd>
                  {connection.lastSyncAt
                    ? new Date(connection.lastSyncAt).toLocaleString()
                    : 'Never'}
                </dd>
              </div>
            </dl>
          </Panel>

          {canManage ? (
            <>
              <Panel title="Credentials">
                <form className="integrations-form" onSubmit={(event) => void handleConnect(event)}>
                  <label>
                    Environment
                    <select
                      className="integrations-select"
                      value={environment}
                      onChange={(e) => setEnvironment(e.target.value as 'test' | 'live')}
                    >
                      <option value="test">Test</option>
                      <option value="live">Live</option>
                    </select>
                  </label>
                  <Input
                    label="Secret key"
                    type="password"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    required
                  />
                  <div className="integrations-form__actions">
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? 'Connecting…' : 'Save & connect'}
                    </Button>
                    {connection.hasCredentials ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={isSaving}
                        onClick={() => void handleDisconnect()}
                      >
                        Disconnect
                      </Button>
                    ) : null}
                  </div>
                </form>
              </Panel>

              {connection.status === 'connected' ? (
                <Panel title="Sync">
                  <p className="page-muted">
                    Sync refreshes the Yoco business profile from the live API.
                  </p>
                  <Button onClick={() => void handleSync()} disabled={isSyncing}>
                    {isSyncing ? 'Syncing…' : 'Run sync'}
                  </Button>
                </Panel>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
