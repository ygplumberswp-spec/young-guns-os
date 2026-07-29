import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Input, PageHeader, Panel } from '@titan/ui';
import type { EmailConnectionSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  disconnectEmail,
  fetchEmailConnection,
  saveEmailConnection,
  syncEmail,
} from '../../lib/integrations-api';
import { useAuth } from '../../lib/auth-context';
import { IntegrationsNav } from '../../features/integrations/IntegrationsNav';
import {
  canAccessIntegrations,
  canManageIntegrations,
} from '../../features/integrations/utils';
import { formatConnectionStatus } from '../../features/integrations/formatters';

export function EmailSettingsPage() {
  const { accessToken, user } = useAuth();
  const [connection, setConnection] = useState<EmailConnectionSummary | null>(null);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageIntegrations(user.permissions) : false), [user]);

  async function loadPageData() {
    if (!accessToken || !canView) return;
    const data = await fetchEmailConnection(accessToken);
    setConnection(data);
    if (data.host) setHost(data.host);
    if (data.port) setPort(String(data.port));
    setSecure(data.secure);
    if (data.fromEmail) setFromEmail(data.fromEmail);
    if (data.fromName) setFromName(data.fromName);
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
          setError(err instanceof ApiClientError ? err.message : 'Unable to load email settings');
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
      const updated = await saveEmailConnection(accessToken, {
        host,
        port: Number.parseInt(port, 10),
        secure,
        username,
        password,
        fromEmail,
        fromName: fromName.trim() || null,
      });
      setConnection(updated);
      setPassword('');
      setSuccess('Email provider connected successfully.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to connect email provider');
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
      const updated = await disconnectEmail(accessToken);
      setConnection(updated);
      setHost('');
      setPort('587');
      setSecure(false);
      setUsername('');
      setPassword('');
      setFromEmail('');
      setFromName('');
      setSuccess('Email provider disconnected.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to disconnect email provider');
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
      const result = await syncEmail(accessToken);
      setSuccess(`SMTP verified for ${result.fromEmail} via ${result.host}.`);
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to verify SMTP connection');
    } finally {
      setIsSyncing(false);
    }
  }

  if (!canView) {
    return (
      <div className="integrations-page">
        <PageHeader title="Email" description="You do not have permission to view integrations." />
      </div>
    );
  }

  return (
    <div className="integrations-page">
      <PageHeader
        title="Email (SMTP)"
        description="Connect your SMTP provider for transactional email. Credentials are verified against the live server."
      />
      <IntegrationsNav />

      {isLoading ? <p className="page-muted">Loading email settings…</p> : null}
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
                <dt>Host</dt>
                <dd>{connection.host ?? 'Not configured'}</dd>
              </div>
              <div>
                <dt>Port</dt>
                <dd>{connection.port ?? '—'}</dd>
              </div>
              <div>
                <dt>TLS</dt>
                <dd>{connection.secure ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt>From email</dt>
                <dd>{connection.fromEmail ?? 'Not configured'}</dd>
              </div>
              <div>
                <dt>Last sync</dt>
                <dd>{connection.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleString() : 'Never'}</dd>
              </div>
            </dl>
          </Panel>

          {canManage ? (
            <>
              <Panel title="SMTP credentials">
                <form className="integrations-form" onSubmit={(event) => void handleConnect(event)}>
                  <Input label="SMTP host" value={host} onChange={(e) => setHost(e.target.value)} required />
                  <Input label="SMTP port" value={port} onChange={(e) => setPort(e.target.value)} required />
                  <label className="integrations-checkbox">
                    <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
                    Use TLS (typically port 465)
                  </label>
                  <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                  <Input
                    label="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <Input
                    label="From email"
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    required
                  />
                  <Input label="From name" value={fromName} onChange={(e) => setFromName(e.target.value)} />
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

              {connection.status === 'connected' ? (
                <Panel title="Verify connection">
                  <p className="page-muted">
                    Sync re-authenticates against your SMTP server and records the verification result.
                  </p>
                  <Button onClick={() => void handleSync()} disabled={isSyncing}>
                    {isSyncing ? 'Verifying…' : 'Verify SMTP'}
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
