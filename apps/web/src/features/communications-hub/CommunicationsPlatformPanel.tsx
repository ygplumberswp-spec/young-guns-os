import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import { isPlatformOwnerRole } from '@titan/auth/browser';
import {
  canConnectBusinessGmail,
  canSyncBusinessGmail,
  formatBusinessGmailUserStatus,
  formatCommPlatformCapabilityState,
  formatGmailSyncUserStatus,
  type CommPlatformGmailOAuthStatus,
  type CommPlatformInboxResult,
  type CommPlatformSettingsSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  disconnectBusinessGmail,
  fetchCommunicationsPlatformInbox,
  fetchCommunicationsPlatformSettings,
  fetchGmailOAuthStatus,
  searchCommunicationsPlatformBusiness,
  startGmailOAuth,
  syncGmailMailbox,
  testCommunicationsConnection,
} from '../../lib/communications-platform-api';
import { useAuth } from '../../lib/auth-context';

export type CommunicationsPlatformView = 'inbox' | 'channels';

type CommunicationsPlatformPanelProps = {
  /** Controlled view from Communications Hub primary nav. */
  view?: CommunicationsPlatformView;
};

export function CommunicationsPlatformPanel({
  view = 'inbox',
}: CommunicationsPlatformPanelProps) {
  const { accessToken, user } = useAuth();
  const [inbox, setInbox] = useState<CommPlatformInboxResult | null>(null);
  const [settings, setSettings] = useState<CommPlatformSettingsSummary | null>(null);
  const [gmailOAuth, setGmailOAuth] = useState<CommPlatformGmailOAuthStatus | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [channel, setChannel] = useState<'all' | 'email' | 'whatsapp'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [participantKind, setParticipantKind] = useState<
    'all' | 'customer' | 'supplier' | 'staff' | 'unknown'
  >('all');
  const [includePersonal, setIncludePersonal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [manageGmail, setManageGmail] = useState(false);
  const [manageBusinessWhatsapp, setManageBusinessWhatsapp] = useState(false);

  /** Personal WhatsApp — Platform Owner only (unchanged). */
  const isOwner = useMemo(
    () =>
      user
        ? isPlatformOwnerRole({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );
  /** Business Gmail Connect — Platform Owner and Company Owner. */
  const canManageGmailConnection = useMemo(
    () =>
      user
        ? canConnectBusinessGmail({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );
  /** Sync Now — Owners, Admin, and staff with write (not Technician/Client). */
  const canSyncGmail = useMemo(
    () =>
      user
        ? canSyncBusinessGmail({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );
  const gmailNotConfiguredReason =
    'Business Gmail is not set up on this system yet. Ask your Platform Owner to finish setup, then reload.';

  async function reload() {
    if (!accessToken) return;
    const [settingsResult, oauthResult] = await Promise.allSettled([
      fetchCommunicationsPlatformSettings(accessToken),
      fetchGmailOAuthStatus(accessToken),
    ]);
    if (settingsResult.status === 'fulfilled') {
      setSettings(settingsResult.value);
    } else {
      throw settingsResult.reason;
    }
    if (oauthResult.status === 'fulfilled') {
      setGmailOAuth(oauthResult.value);
    } else {
      setGmailOAuth(null);
    }
    const inboxData = await fetchCommunicationsPlatformInbox(accessToken, {
      channel,
      unread: unreadOnly || undefined,
      urgent: urgentOnly || undefined,
      participantKind,
      includePersonal: isOwner && includePersonal,
      limit: 50,
    });
    setInbox(inboxData);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }
      try {
        const params = new URLSearchParams(window.location.search);
        const gmailOutcome = params.get('gmail');
        const gmailMessage = params.get('message');
        const openChannelSettings = params.get('channelSettings') === '1';
        if (gmailOutcome === 'connected') {
          setSuccess(gmailMessage?.trim() || 'Business Gmail connected via Google OAuth.');
          setManageGmail(true);
        } else if (gmailOutcome === 'error') {
          setError(gmailMessage?.trim() || 'Google OAuth for Business Gmail failed.');
        }
        if (gmailOutcome || openChannelSettings) {
          params.delete('gmail');
          params.delete('message');
          params.delete('channelSettings');
          const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
          window.history.replaceState({}, '', next);
        }
        await reload();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load communications platform',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional initial + filter reload via Apply
  }, [accessToken]);

  async function applyFilters() {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    try {
      const inboxData = await fetchCommunicationsPlatformInbox(accessToken, {
        channel,
        unread: unreadOnly || undefined,
        urgent: urgentOnly || undefined,
        participantKind,
        includePersonal: isOwner && includePersonal,
        limit: 50,
      });
      setInbox(inboxData);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Filter failed');
    } finally {
      setIsWorking(false);
    }
  }

  async function runBusinessSearch() {
    if (!accessToken || !searchQ.trim()) return;
    setIsWorking(true);
    setError(null);
    try {
      const result = await searchCommunicationsPlatformBusiness(accessToken, searchQ.trim());
      setInbox({
        items: result.items,
        total: result.total,
        filtersApplied: { q: searchQ.trim(), includePersonal: false },
        includesPersonal: false,
        emptyReason:
          result.emptyReason === 'empty_query'
            ? 'no_matches'
            : result.emptyReason === 'not_configured'
              ? 'not_configured'
              : result.emptyReason === 'no_matches'
                ? 'no_matches'
                : 'none',
        capabilityNotes: [
          'Business search only — personal WhatsApp is never included.',
        ],
      });
      setSuccess(`Business search: ${result.total} result(s). Personal excluded.`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Search failed');
    } finally {
      setIsWorking(false);
    }
  }

  async function testConnection(
    accountKind: 'business_gmail' | 'business_whatsapp' | 'personal_whatsapp',
  ) {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await testCommunicationsConnection(accessToken, accountKind);
      setSuccess(result.message);
      const settingsData = await fetchCommunicationsPlatformSettings(accessToken);
      setSettings(settingsData);
      if (accountKind === 'business_gmail') {
        setGmailOAuth(await fetchGmailOAuthStatus(accessToken));
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Connection test failed');
    } finally {
      setIsWorking(false);
    }
  }

  async function connectGmail() {
    if (!accessToken) return;
    if (!canManageGmailConnection) {
      setError('Only Platform Owner or Company Owner can connect Business Gmail');
      return;
    }
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const oauthReady = Boolean(
        gmailOAuth?.oauthConfigured ?? settings?.businessGmail.oauthConfigured,
      );
      if (!oauthReady) {
        setError(gmailNotConfiguredReason);
        return;
      }
      const url = await startGmailOAuth(accessToken, '/communications-hub');
      window.location.assign(url);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to start Google OAuth for Business Gmail',
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function syncGmail() {
    if (!accessToken) return;
    if (!canSyncGmail) {
      setError('You do not have permission to sync Business Gmail');
      return;
    }
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    if (settings) {
      setSettings({
        ...settings,
        businessGmail: {
          ...settings.businessGmail,
          lastSyncStatus: 'syncing',
        },
      });
    }
    try {
      const result = await syncGmailMailbox(accessToken, { folder: 'inbox', maxMessages: 40 });
      setSuccess(
        result.synced > 0
          ? `Sync completed — ${result.synced} new message(s) added.`
          : result.note || 'Sync completed — mailbox is up to date.',
      );
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Gmail sync failed');
      try {
        await reload();
      } catch {
        // Keep the sync failure message; settings may still show Failed.
      }
    } finally {
      setIsWorking(false);
    }
  }

  function formatInboxDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  function formatLastSynced(iso: string | null | undefined): string {
    if (!iso) return 'Never';
    return formatInboxDate(iso);
  }

  function inboxItemStatus(item: {
    unread: boolean;
    urgent: boolean;
    folder: string;
  }): string {
    const parts: string[] = [];
    parts.push(item.unread ? 'Unread' : 'Read');
    if (item.urgent) parts.push('Urgent');
    if (item.folder && item.folder !== 'inbox') {
      parts.push(item.folder.charAt(0).toUpperCase() + item.folder.slice(1));
    }
    return parts.join(' · ');
  }

  async function disconnectGmail() {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await disconnectBusinessGmail(accessToken);
      setManageGmail(false);
      setSuccess('Business Gmail disconnected.');
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Disconnect failed');
    } finally {
      setIsWorking(false);
    }
  }

  const gmailConnected = Boolean(settings?.businessGmail.connected);
  const gmailOauthReady = Boolean(
    gmailOAuth?.oauthConfigured ?? settings?.businessGmail.oauthConfigured,
  );
  const gmailStatusLabel = settings
    ? formatBusinessGmailUserStatus({
        oauthConfigured: gmailOauthReady,
        status: settings.businessGmail.status,
      })
    : 'Disconnected';
  const gmailSyncStatusLabel = settings
    ? formatGmailSyncUserStatus({
        connected: settings.businessGmail.connected,
        lastSyncStatus: settings.businessGmail.lastSyncStatus,
      })
    : 'Disconnected';

  if (isLoading) {
    return <Panel title="Communications Platform">Loading platform…</Panel>;
  }

  return (
    <div className="stack-gap">
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {view === 'inbox' ? (
        <>
          <Panel title="Search & filters">
            <div className="form-grid">
              <label>
                Channel
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as typeof channel)}
                >
                  <option value="all">All business</option>
                  <option value="email">Business email</option>
                  <option value="whatsapp">Business WhatsApp</option>
                </select>
              </label>
              <label>
                From
                <select
                  value={participantKind}
                  onChange={(e) =>
                    setParticipantKind(e.target.value as typeof participantKind)
                  }
                >
                  <option value="all">Customers / suppliers / staff</option>
                  <option value="customer">Customers</option>
                  <option value="supplier">Suppliers</option>
                  <option value="staff">Staff</option>
                  <option value="unknown">Unknown</option>
                </select>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={unreadOnly}
                  onChange={(e) => setUnreadOnly(e.target.checked)}
                />
                Unread
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={urgentOnly}
                  onChange={(e) => setUrgentOnly(e.target.checked)}
                />
                Urgent
              </label>
              {isOwner ? (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={includePersonal}
                    onChange={(e) => setIncludePersonal(e.target.checked)}
                  />
                  Include Personal WhatsApp (Owner only)
                </label>
              ) : null}
            </div>
            <div className="page-header-actions" style={{ marginTop: '0.75rem' }}>
              <Button variant="secondary" disabled={isWorking} onClick={() => void applyFilters()}>
                Apply filters
              </Button>
              <Input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search sender, subject, or message…"
              />
              <Button
                variant="secondary"
                disabled={isWorking || !searchQ.trim()}
                onClick={() => void runBusinessSearch()}
              >
                Search history
              </Button>
            </div>
          </Panel>

          <Panel
            title={
              inbox && inbox.total > 0
                ? `Inbox (${inbox.total})`
                : 'Inbox'
            }
          >
            {gmailConnected && canSyncGmail ? (
              <div className="page-header-actions" style={{ marginBottom: '0.75rem' }}>
                <Button
                  variant="secondary"
                  disabled={isWorking || gmailSyncStatusLabel === 'Syncing'}
                  onClick={() => void syncGmail()}
                >
                  {gmailSyncStatusLabel === 'Syncing' ? 'Syncing…' : 'Sync Now'}
                </Button>
                <span className="muted">
                  Sync: {gmailSyncStatusLabel}
                  {' · '}
                  Last synced: {formatLastSynced(settings?.businessGmail.lastSyncAt)}
                </span>
              </div>
            ) : null}
            {!inbox || inbox.items.length === 0 ? (
              <EmptyState
                title={
                  inbox?.emptyReason === 'not_configured'
                    ? 'Connect a business channel'
                    : inbox?.emptyReason === 'role_filtered'
                      ? 'No assigned conversations'
                      : gmailConnected
                        ? 'No messages yet'
                        : 'No messages yet'
                }
                description={
                  gmailConnected
                    ? 'Your inbox is ready. Use Sync Now to pull messages from Business Gmail.'
                    : 'Connect Business Gmail or Business WhatsApp under Business Channels. Messages appear here after they sync.'
                }
              />
            ) : (
              <div className="data-list">
                {inbox.items.map((item) => (
                  <div key={item.id} className="data-list-item">
                    <strong>{item.subject?.trim() || '(No subject)'}</strong>
                    <span className="status-pill">{inboxItemStatus(item)}</span>
                    <p>
                      <strong>From:</strong> {item.participantLabel?.trim() || 'Unknown'}
                      {' · '}
                      <strong>Date:</strong> {formatInboxDate(item.occurredAt)}
                    </p>
                    <p>
                      {item.preview?.trim() || 'No preview'}
                      {item.attachmentCount > 0
                        ? ` · ${item.attachmentCount} attachment(s)`
                        : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      ) : null}

      {view === 'channels' && settings ? (
        <>
          <div className="stat-grid">
            <StatCard label="Business Gmail" value={gmailStatusLabel} />
            <StatCard
              label="Gmail sync"
              value={gmailConnected ? gmailSyncStatusLabel : '—'}
            />
            <StatCard
              label="Indexed messages"
              value={String(inbox?.total ?? 0)}
            />
            <StatCard
              label="Business WhatsApp"
              value={formatCommPlatformCapabilityState(settings.businessWhatsapp.status)}
            />
            {settings.personalWhatsapp ? (
              <StatCard
                label="Personal WhatsApp (Owner only)"
                value={formatCommPlatformCapabilityState(settings.personalWhatsapp.status)}
              />
            ) : (
              <StatCard label="Personal WhatsApp (Owner only)" value="Owner only" />
            )}
          </div>

          <Panel title="Business Gmail">
            {!gmailOauthReady ? (
              <EmptyState
                title="Not Configured"
                description="Business Gmail setup is not finished on this system yet. Ask your Platform Owner to complete setup. TITAN will not show Connected until Google sign-in works."
              />
            ) : gmailConnected ? (
              <dl className="integrations-detail-list">
                <div>
                  <dt>Connection</dt>
                  <dd>{gmailStatusLabel}</dd>
                </div>
                <div>
                  <dt>Account</dt>
                  <dd>{settings.businessGmail.emailAddress || 'Connected'}</dd>
                </div>
                <div>
                  <dt>Sync status</dt>
                  <dd>{gmailSyncStatusLabel}</dd>
                </div>
                <div>
                  <dt>Last synced</dt>
                  <dd>{formatLastSynced(settings.businessGmail.lastSyncAt)}</dd>
                </div>
              </dl>
            ) : (
              <EmptyState
                title="Disconnected"
                description="Connect Business Gmail to bring real email into the Communications Hub. Inbox stays empty until you sync."
              />
            )}
            <div className="page-header-actions" style={{ marginTop: '0.75rem' }}>
              {canManageGmailConnection ? (
                gmailConnected ? (
                  <Button
                    disabled={isWorking}
                    onClick={() => setManageGmail((open) => !open)}
                  >
                    {manageGmail ? 'Close' : 'Manage'}
                  </Button>
                ) : (
                  <Button
                    disabled={isWorking || !gmailOauthReady}
                    onClick={() => void connectGmail()}
                    title={!gmailOauthReady ? gmailNotConfiguredReason : undefined}
                  >
                    Connect
                  </Button>
                )
              ) : null}
              {gmailConnected && canSyncGmail ? (
                <Button
                  variant="secondary"
                  disabled={isWorking || gmailSyncStatusLabel === 'Syncing'}
                  onClick={() => void syncGmail()}
                >
                  {gmailSyncStatusLabel === 'Syncing' ? 'Syncing…' : 'Sync Now'}
                </Button>
              ) : null}
            </div>
            {!gmailOauthReady && canManageGmailConnection ? (
              <p className="form-error" style={{ marginTop: '0.5rem' }}>
                {gmailNotConfiguredReason}
              </p>
            ) : null}
            {gmailConnected && manageGmail && canManageGmailConnection ? (
              <div className="page-header-actions" style={{ marginTop: '0.75rem' }}>
                <Button
                  variant="secondary"
                  disabled={isWorking || !gmailOauthReady}
                  onClick={() => void connectGmail()}
                >
                  Reconnect
                </Button>
                <Button
                  variant="secondary"
                  disabled={isWorking || !settings.businessGmail.hasCredentials}
                  onClick={() => void disconnectGmail()}
                >
                  Disconnect
                </Button>
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() => void testConnection('business_gmail')}
                >
                  Test Connection
                </Button>
                <Link href="/integrations">
                  <Button variant="secondary">Advanced diagnostics</Button>
                </Link>
              </div>
            ) : null}
            {!canManageGmailConnection ? (
              <p className="muted" style={{ marginTop: '0.75rem' }}>
                Connection is managed by Platform Owner or Company Owner.
                {canSyncGmail && gmailConnected
                  ? ' You can sync mail into the inbox when connected.'
                  : ' Authorized business users can use the inbox when connected.'}
              </p>
            ) : (
              <p className="muted" style={{ marginTop: '0.75rem' }}>
                Messages never send on their own — drafts need approval before send. Personal
                WhatsApp stays private and separate.
              </p>
            )}
            {canManageGmailConnection && manageGmail ? (
              <p className="muted" style={{ marginTop: '0.5rem' }}>
                Advanced: Google sign-in stores encrypted tokens for this company and refreshes
                them automatically. Integration diagnostics are available under Advanced settings.
              </p>
            ) : null}
          </Panel>

          <Panel title="Business WhatsApp">
            {settings.businessWhatsapp.connected ? (
              <>
                <dl className="integrations-detail-list">
                  <div>
                    <dt>Status</dt>
                    <dd>Connected</dd>
                  </div>
                  <div>
                    <dt>Message Health</dt>
                    <dd>{settings.businessWhatsapp.status}</dd>
                  </div>
                </dl>
                <p className="muted" style={{ marginTop: '0.5rem' }}>
                  Customer messaging, notifications and AI communications via Meta WhatsApp Business.
                </p>
                <div className="page-header-actions" style={{ marginTop: '0.75rem' }}>
                  <Button
                    disabled={isWorking}
                    onClick={() => setManageBusinessWhatsapp((open) => !open)}
                  >
                    {manageBusinessWhatsapp ? 'Close' : 'Manage'}
                  </Button>
                </div>
                {manageBusinessWhatsapp ? (
                  <div className="page-header-actions" style={{ marginTop: '0.75rem' }}>
                    <Link href="/integrations/whatsapp">
                      <Button variant="secondary">Reconnect</Button>
                    </Link>
                    <Link href="/integrations/whatsapp">
                      <Button variant="secondary">Disconnect</Button>
                    </Link>
                    <Button
                      variant="secondary"
                      disabled
                      title="Permissions view is not built yet"
                    >
                      Permissions
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={isWorking}
                      onClick={() => void testConnection('business_whatsapp')}
                    >
                      Webhook Status
                    </Button>
                    <Link href="/integrations/whatsapp">
                      <Button variant="secondary">Diagnostics</Button>
                    </Link>
                    <Button
                      variant="secondary"
                      disabled
                      title="Sync history is not available yet"
                    >
                      Sync History
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <dl className="integrations-detail-list">
                  <div>
                    <dt>Status</dt>
                    <dd>Not Connected</dd>
                  </div>
                </dl>
                <p style={{ marginTop: '0.5rem' }}>
                  Connect your Meta WhatsApp Business account for customer messaging, notifications
                  and AI communications.
                </p>
                <div className="page-header-actions" style={{ marginTop: '0.75rem' }}>
                  <Link href="/integrations/whatsapp">
                    <Button>Connect</Button>
                  </Link>
                </div>
              </>
            )}
          </Panel>

          <Panel title="Personal WhatsApp (Owner only)">
            {settings.personalWhatsapp ? (
              <>
                <dl className="integrations-detail-list">
                  <div>
                    <dt>Status</dt>
                    <dd>{settings.personalWhatsapp.connected ? 'Connected' : 'Not Connected'}</dd>
                  </div>
                </dl>
                <p style={{ marginTop: '0.5rem' }}>
                  Separate from Business WhatsApp. Private by default, never in business search, never
                  auto-imported. Sync: {settings.personalWhatsapp.syncEnabled ? 'On' : 'Off'}.
                </p>
                <p className="muted">{settings.personalWhatsapp.emptyStateMessage}</p>
                <div className="page-header-actions" style={{ marginTop: '0.75rem' }}>
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() => void testConnection('personal_whatsapp')}
                  >
                    Test Connection
                  </Button>
                </div>
              </>
            ) : (
              <EmptyState
                title="Owner Only"
                description="Personal WhatsApp (Owner only) is hidden for Clients and Technicians. It stays private by default and is never mixed with Business WhatsApp."
              />
            )}
            <p className="muted" style={{ marginTop: '0.75rem' }}>
              Privacy: {settings.privacy.personalPrivateByDefault ? 'private default' : 'n/a'} ·
              Business search exclusion: {settings.privacy.personalNeverInBusinessSearch ? 'yes' : 'no'}{' '}
              · Auto-import: {settings.privacy.personalNeverAutoImport ? 'disabled' : 'enabled'} ·
              Send approval: {settings.privacy.requireApprovalToSend ? 'required' : 'not required'}
            </p>
          </Panel>

          <Panel title="Health">
            <p>{settings.healthSummary}</p>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
