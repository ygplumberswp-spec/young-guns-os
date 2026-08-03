import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, Panel } from '@titan/ui';
import type { XeroConnectionSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  disconnectXero,
  fetchXeroConnection,
  startXeroOAuth,
  testXeroConnection,
} from '../../lib/integrations-api';
import { useAuth } from '../../lib/auth-context';
import { IntegrationsNav } from '../../features/integrations/IntegrationsNav';
import { XeroSyncPanel } from '../../features/integrations/XeroSyncPanel';
import { canAccessIntegrations, canManageIntegrations } from '../../features/integrations/utils';
import { formatConnectionStatus } from '../../features/integrations/formatters';

function readOAuthMessage(): {
  outcome: string | null;
  message: string | null;
  organisation: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  return {
    outcome: params.get('xero'),
    message: params.get('message'),
    organisation: params.get('organisation'),
  };
}

function clearOAuthQueryParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete('xero');
  url.searchParams.delete('message');
  url.searchParams.delete('organisation');
  window.history.replaceState({}, '', url.toString());
}

export function XeroSettingsPage() {
  const { accessToken, user } = useAuth();
  const [connection, setConnection] = useState<XeroConnectionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<'test' | 'disconnect' | 'connect' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageIntegrations(user.permissions) : false), [user]);

  async function loadConnection() {
    if (!accessToken || !canView) return;
    const connectionData = await fetchXeroConnection(accessToken);
    setConnection(connectionData);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      const oauthResult = readOAuthMessage();

      if (oauthResult.outcome === 'connected') {
        setSuccess(
          oauthResult.organisation
            ? `Xero connected to ${oauthResult.organisation}.`
            : 'Xero connected successfully.',
        );
        clearOAuthQueryParams();
      } else if (oauthResult.outcome === 'error' && oauthResult.message) {
        setError(oauthResult.message);
        clearOAuthQueryParams();
      }

      try {
        await loadConnection();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load Xero settings');
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

  async function handleConnect() {
    if (!accessToken || !canManage) return;

    setIsBusy(true);
    setBusyAction('connect');
    setError(null);
    setSuccess(null);

    try {
      const result = await startXeroOAuth(accessToken, {
        returnPath: '/integrations/xero',
      });
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to start Xero sign-in');
      setIsBusy(false);
      setBusyAction(null);
    }
  }

  async function handleTestConnection() {
    if (!accessToken || !canManage) return;

    setIsBusy(true);
    setBusyAction('test');
    setError(null);
    setSuccess(null);

    try {
      const result = await testXeroConnection(accessToken);
      setSuccess(`Connection verified for ${result.organisationName}.`);
      await loadConnection();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to verify Xero connection');
    } finally {
      setIsBusy(false);
      setBusyAction(null);
    }
  }

  async function handleDisconnect() {
    if (!accessToken || !canManage) return;

    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      return;
    }

    setIsBusy(true);
    setBusyAction('disconnect');
    setError(null);
    setSuccess(null);

    try {
      await disconnectXero(accessToken);
      setConfirmDisconnect(false);
      setSuccess('Xero disconnected.');
      await loadConnection();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to disconnect Xero');
    } finally {
      setIsBusy(false);
      setBusyAction(null);
    }
  }

  if (!canView) {
    return (
      <div className="integrations-page">
        <PageHeader title="Xero" description="You do not have permission to view integrations." />
      </div>
    );
  }

  const showReconnect =
    connection?.reconnectRequired ||
    connection?.status === 'error' ||
    (connection?.hasCredentials && connection.status !== 'connected');
  const isConnectedHealthy = connection?.status === 'connected' && !showReconnect;

  return (
    <div className="integrations-page">
      <PageHeader
        title="Xero"
        description="Connect your Xero organisation to import historical contacts, quotes, invoices, payments, and bank transactions into TITAN. Xero remains the accounting source of truth."
      />
      <IntegrationsNav />
      <p>
        <Link href="/integrations/xero/write-approvals">Open Xero write approval queue</Link>
      </p>

      {isLoading ? <p className="page-muted">Loading Xero settings…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {!isLoading && connection ? (
        <>
          {!isConnectedHealthy ? (
            <>
              <Panel title="Connection Status">
                <dl className="integration-status-list">
                  <div>
                    <dt>Status</dt>
                    <dd>{formatConnectionStatus(connection.status)}</dd>
                  </div>
                  <div>
                    <dt>Organisation</dt>
                    <dd>{connection.organisationName ?? 'Not connected yet'}</dd>
                  </div>
                  <div>
                    <dt>Last verification</dt>
                    <dd>
                      {connection.lastVerifiedAt
                        ? new Date(connection.lastVerifiedAt).toLocaleString()
                        : 'Not verified yet'}
                    </dd>
                  </div>
                  <div>
                    <dt>Last sync</dt>
                    <dd>
                      {connection.lastSyncAt
                        ? new Date(connection.lastSyncAt).toLocaleString()
                        : 'No sync run yet'}
                    </dd>
                  </div>
                </dl>
                {connection.lastError ? <p className="form-error">{connection.lastError}</p> : null}
              </Panel>

              {canManage ? (
                <Panel title="Connect Xero">
                  <p className="page-muted">
                    Sign in with Xero to authorise your organisation. TITAN stores encrypted tokens on
                    the server and never shows your accounting credentials in the browser.
                  </p>

                  {!connection.oauthConfigured ? (
                    <p className="form-error">
                      Xero sign-in is not configured on this server yet. Ask your platform administrator
                      to add the Xero app credentials.
                    </p>
                  ) : null}

                  <div className="integrations-form__actions">
                    {connection.status !== 'connected' || showReconnect ? (
                      <Button
                        onClick={() => void handleConnect()}
                        disabled={isBusy || !connection.oauthConfigured}
                      >
                        {busyAction === 'connect'
                          ? 'Redirecting…'
                          : showReconnect
                            ? 'Reconnect with Xero'
                            : 'Connect with Xero'}
                      </Button>
                    ) : null}

                    {connection.hasCredentials ? (
                      <>
                        <Button
                          variant="ghost"
                          onClick={() => void handleDisconnect()}
                          disabled={isBusy}
                        >
                          {confirmDisconnect ? 'Confirm disconnect' : 'Disconnect'}
                        </Button>
                        {confirmDisconnect ? (
                          <Button
                            variant="ghost"
                            onClick={() => setConfirmDisconnect(false)}
                            disabled={isBusy}
                          >
                            Cancel
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </Panel>
              ) : null}
            </>
          ) : null}

          {accessToken ? (
            <XeroSyncPanel
              accessToken={accessToken}
              connection={connection}
              canManage={canManage}
              onConnectionChange={loadConnection}
              onTestConnection={canManage ? handleTestConnection : undefined}
              onDisconnect={canManage ? handleDisconnect : undefined}
              onCancelDisconnect={() => setConfirmDisconnect(false)}
              confirmDisconnect={confirmDisconnect}
              connectionBusy={isBusy}
              testBusy={busyAction === 'test'}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
