import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Panel } from '@titan/ui';
import { isCompanyOwnerRole } from '@titan/auth/browser';
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
import { IntegrationConnectionLock } from '../../features/integrations/IntegrationConnectionLock';
import { canAccessIntegrations, canManageIntegrations } from '../../features/integrations/utils';

export function EmailSettingsPage() {
  const { accessToken, user } = useAuth();
  const [connection, setConnection] = useState<EmailConnectionSummary | null>(null);
  const [formValues, setFormValues] = useState({
    host: '',
    port: '587',
    secure: 'false',
    username: '',
    password: '',
    fromEmail: '',
    fromName: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageIntegrations(user.permissions) : false), [user]);
  const isOwner = useMemo(
    () =>
      user
        ? isCompanyOwnerRole({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );

  async function loadPageData() {
    if (!accessToken || !canView) return;
    const data = await fetchEmailConnection(accessToken);
    setConnection(data);
    setFormValues((current) => ({
      host: data.host ?? current.host,
      port: data.port ? String(data.port) : current.port,
      secure: data.secure ? 'true' : 'false',
      username: '',
      password: '',
      fromEmail: data.fromEmail ?? current.fromEmail,
      fromName: data.fromName ?? current.fromName,
    }));
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
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage) return;

    setIsBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await saveEmailConnection(accessToken, {
        host: formValues.host,
        port: Number.parseInt(formValues.port, 10),
        secure: formValues.secure === 'true',
        username: formValues.username,
        password: formValues.password,
        fromEmail: formValues.fromEmail,
        fromName: formValues.fromName.trim() || null,
      });
      setConnection(updated);
      setFormValues((current) => ({ ...current, username: '', password: '' }));
      setSuccess('Email provider connected successfully.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to connect email provider');
      await loadPageData().catch(() => undefined);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReplaceCredentials(event: FormEvent<HTMLFormElement>) {
    await handleConnect(event);
  }

  async function handleDisconnect() {
    if (!accessToken || !canManage) return;
    setIsBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await disconnectEmail(accessToken);
      setConnection(updated);
      setFormValues({
        host: '',
        port: '587',
        secure: 'false',
        username: '',
        password: '',
        fromEmail: '',
        fromName: '',
      });
      setSuccess('Email provider disconnected.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to disconnect email provider');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRecoverySync() {
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
        description="Connect once — incoming mail syncs automatically on schedule. Send and permanent changes require Owner approval."
      />
      <IntegrationsNav />

      {isLoading ? <p className="page-muted">Loading email settings…</p> : null}

      {!isLoading && connection ? (
        <IntegrationConnectionLock
          providerName="Email"
          status={connection.status}
          isConnected={connection.hasCredentials}
          canManage={canManage}
          isOwner={isOwner}
          isBusy={isBusy}
          error={error}
          success={success}
          statusRows={[
            { label: 'Host', value: connection.host ?? 'Not configured' },
            { label: 'Port', value: connection.port != null ? String(connection.port) : '—' },
            { label: 'TLS', value: connection.secure ? 'Yes' : 'No' },
            { label: 'From email', value: connection.fromEmail ?? 'Not configured' },
            {
              label: 'Last sync',
              value: connection.lastSyncAt
                ? new Date(connection.lastSyncAt).toLocaleString()
                : 'Never',
            },
          ]}
          connectFields={[
            { key: 'host', label: 'SMTP host', autoComplete: 'off' },
            { key: 'port', label: 'SMTP port', autoComplete: 'off' },
            { key: 'username', label: 'Username', autoComplete: 'off' },
            {
              key: 'password',
              label: 'Password',
              type: 'password',
              autoComplete: 'new-password',
            },
            { key: 'fromEmail', label: 'From email', type: 'email', autoComplete: 'off' },
            { key: 'fromName', label: 'From name', required: false, autoComplete: 'off' },
          ]}
          connectValues={formValues}
          onConnectValueChange={(key, value) =>
            setFormValues((current) => ({ ...current, [key]: value }))
          }
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onReplaceCredentials={handleReplaceCredentials}
          connectHelpText="SMTP credentials are encrypted at rest, validated before saving, and never returned to the browser."
          recoveryContent={
            connection.status === 'connected' ? (
              <Button variant="ghost" disabled={isSyncing} onClick={() => void handleRecoverySync()}>
                {isSyncing ? 'Verifying…' : 'Run diagnostic SMTP verify (recovery)'}
              </Button>
            ) : null
          }
        />
      ) : null}

      <Panel title="Provider support">
        <p className="page-muted">
          Gmail and Microsoft 365 OAuth connectors remain on the product roadmap. SMTP is supported
          today with the same connect-once lock pattern. AURA may classify incoming mail and draft
          replies — sending requires approval.
        </p>
      </Panel>
    </div>
  );
}
