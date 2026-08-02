import { useEffect, useMemo, useState } from 'react';
import { Button, PageHeader, Panel } from '@titan/ui';
import type { GmailConnectionSummary, GmailLabelSummary, GmailStats } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  connectGmail,
  disconnectGmail,
  fetchGmailConnection,
  syncGmailMessages,
} from '../../lib/gmail-api-client';
import { useAuth } from '../../lib/auth-context';
import { IntegrationsNav } from '../../features/integrations/IntegrationsNav';
import {
  canAccessIntegrations,
  canManageIntegrations,
} from '../../features/integrations/utils';
import { formatConnectionStatus } from '../../features/integrations/formatters';

export function GmailSettingsPage() {
  const { accessToken, user } = useAuth();
  const [connection, setConnection] = useState<GmailConnectionSummary | null>(null);
  const [stats, setStats] = useState<GmailStats | null>(null);
  const [labels, setLabels] = useState<GmailLabelSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canManageIntegrations(user.permissions) : false), [user]);

  async function loadPageData() {
    if (!accessToken || !canView) return;
    const data = await fetchGmailConnection(accessToken);
    setConnection(data.connection);
    setStats(data.stats);
    setLabels(data.labels);
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
          setError(err instanceof ApiClientError ? err.message : 'Unable to load Gmail settings');
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

    setError(null);
    setSuccess(null);

    try {
      const clientId = prompt('Enter your Google Client ID:');
      if (!clientId) return;

      const redirectUri = `${window.location.origin}/integrations/gmail/callback`;
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent('https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send')}` +
        `&access_type=offline` +
        `&prompt=consent`;

      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to initiate Gmail connection');
    }
  }

  async function handleDisconnect() {
    if (!accessToken || !canManage) return;
    if (!confirm('Are you sure you want to disconnect Gmail?')) return;

    setIsDisconnecting(true);
    setError(null);
    setSuccess(null);

    try {
      await disconnectGmail(accessToken);
      setSuccess('Gmail disconnected successfully.');
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to disconnect Gmail');
    } finally {
      setIsDisconnecting(false);
    }
  }

  async function handleSync() {
    if (!accessToken || !canManage) return;

    setIsSyncing(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await syncGmailMessages(accessToken);
      setSuccess(
        `Sync completed: ${result.messagesImported} messages imported, ${result.labelsSynced} labels synced.`,
      );
      await loadPageData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to sync Gmail');
    } finally {
      setIsSyncing(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code && accessToken && canManage) {
      const redirectUri = `${window.location.origin}/integrations/gmail/callback`;
      
      connectGmail(accessToken, { code, redirectUri })
        .then(() => {
          setSuccess('Gmail connected successfully!');
          window.history.replaceState({}, '', '/integrations/gmail');
          void loadPageData();
        })
        .catch((err) => {
          setError(err instanceof ApiClientError ? err.message : 'Unable to complete Gmail connection');
          window.history.replaceState({}, '', '/integrations/gmail');
        });
    }
  }, [accessToken, canManage]);

  if (isLoading) {
    return (
      <div className="page">
        <IntegrationsNav />
        <PageHeader title="Business Gmail" description="Loading..." />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="page">
        <IntegrationsNav />
        <PageHeader
          title="Business Gmail"
          description="You do not have permission to view integration settings."
        />
      </div>
    );
  }

  const isConnected = connection?.status === 'connected';

  return (
    <div className="page">
      <IntegrationsNav />
      <PageHeader
        title="Business Gmail"
        description="Business Gmail via official Google OAuth — Inbox, Sent, Drafts, Labels, sync, and approved sends."
      />

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
          {success}
        </div>
      )}

      <Panel title="Connection Status">
        {!connection && <p>Loading connection status...</p>}

        {connection && (
          <>
            <div className="field-group">
              <div className="field">
                <strong>Status:</strong> {formatConnectionStatus(connection.status)}
              </div>
              {connection.email && (
                <div className="field">
                  <strong>Email:</strong> {connection.email}
                </div>
              )}
              {connection.connectedAt && (
                <div className="field">
                  <strong>Connected:</strong>{' '}
                  {new Date(connection.connectedAt).toLocaleString()}
                </div>
              )}
              {connection.lastSyncAt && (
                <div className="field">
                  <strong>Last Sync:</strong>{' '}
                  {new Date(connection.lastSyncAt).toLocaleString()}
                </div>
              )}
              {connection.lastError && (
                <div className="field">
                  <strong>Last Error:</strong>{' '}
                  <span style={{ color: 'red' }}>{connection.lastError}</span>
                </div>
              )}
            </div>

            {!isConnected && (
              <div style={{ marginTop: '1rem' }}>
                <p>
                  Not configured — set <code>GOOGLE_CLIENT_ID</code> and{' '}
                  <code>GOOGLE_CLIENT_SECRET</code> on the API.
                </p>
                {canManage && (
                  <Button onClick={handleConnect} variant="primary">
                    Connect
                  </Button>
                )}
              </div>
            )}

            {isConnected && (
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                {canManage && (
                  <>
                    <Button onClick={handleSync} disabled={isSyncing} variant="primary">
                      {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </Button>
                    <Button
                      onClick={handleDisconnect}
                      disabled={isDisconnecting}
                      variant="secondary"
                    >
                      {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                    </Button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </Panel>

      {isConnected && stats && (
        <Panel title="Statistics" style={{ marginTop: '1rem' }}>
          <div className="field-group">
            <div className="field">
              <strong>Total Messages:</strong> {stats.totalMessages}
            </div>
            <div className="field">
              <strong>Inbox Messages:</strong> {stats.inboxMessages}
            </div>
            <div className="field">
              <strong>Sent Messages:</strong> {stats.sentMessages}
            </div>
            <div className="field">
              <strong>Draft Messages:</strong> {stats.draftMessages}
            </div>
            <div className="field">
              <strong>Labels:</strong> {stats.totalLabels}
            </div>
          </div>
        </Panel>
      )}

      {isConnected && labels.length > 0 && (
        <Panel title="Labels" style={{ marginTop: '1rem' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Total Messages</th>
                <th>Unread Messages</th>
              </tr>
            </thead>
            <tbody>
              {labels.slice(0, 10).map((label) => (
                <tr key={label.id}>
                  <td>{label.name}</td>
                  <td>{label.type}</td>
                  <td>{label.messagesTotal ?? 0}</td>
                  <td>{label.messagesUnread ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {labels.length > 10 && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
              Showing 10 of {labels.length} labels
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}
