import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import { isPlatformOwnerRole } from '@titan/auth/browser';
import type {
  CommPlatformGmailOAuthStatus,
  CommPlatformHubDashboard,
  CommPlatformInboxResult,
  CommPlatformSettingsSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  disconnectBusinessGmail,
  fetchCommunicationsPlatformHub,
  fetchCommunicationsPlatformInbox,
  fetchCommunicationsPlatformSettings,
  fetchGmailOAuthStatus,
  searchCommunicationsPlatformBusiness,
  startGmailOAuth,
  syncGmailMailbox,
  testCommunicationsConnection,
} from '../../lib/communications-platform-api';
import { useAuth } from '../../lib/auth-context';

type PlatformTab = 'unified' | 'settings';

export function CommunicationsPlatformPanel() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<PlatformTab>('unified');
  const [dashboard, setDashboard] = useState<CommPlatformHubDashboard | null>(null);
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

  const isOwner = useMemo(
    () =>
      user
        ? isPlatformOwnerRole({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );

  async function reload() {
    if (!accessToken) return;
    const [hubResult, settingsResult, oauthResult] = await Promise.allSettled([
      fetchCommunicationsPlatformHub(accessToken),
      fetchCommunicationsPlatformSettings(accessToken),
      fetchGmailOAuthStatus(accessToken),
    ]);
    if (hubResult.status === 'fulfilled') setDashboard(hubResult.value);
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
          setTab('settings');
          setManageGmail(true);
        } else if (gmailOutcome === 'error') {
          setError(gmailMessage?.trim() || 'Google OAuth for Business Gmail failed.');
          setTab('settings');
        } else if (openChannelSettings) {
          setTab('settings');
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
    if (!isOwner) {
      setError('Only Platform Owner can connect Business Gmail');
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
        setError(
          'Not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the API, then reload.',
        );
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
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await syncGmailMailbox(accessToken, { folder: 'inbox', maxMessages: 40 });
      setSuccess(result.note);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Gmail sync failed');
    } finally {
      setIsWorking(false);
    }
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
  const gmailNotConfiguredReason =
    'Not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the API, then reload.';

  if (isLoading) {
    return <Panel title="Communications Platform">Loading platform…</Panel>;
  }

  return (
    <div className="stack-gap">
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {dashboard ? (
        <Panel title="Send policy">
          <p>{dashboard.summary}</p>
          <p>
            Auto-send: <strong>disabled</strong> · Approval required:{' '}
            <strong>yes</strong> · Pattern: draft → approve → execute
          </p>
        </Panel>
      ) : null}

      <div className="tab-row">
        <button
          type="button"
          className={tab === 'unified' ? 'tab-button active' : 'tab-button'}
          onClick={() => setTab('unified')}
        >
          Unified Inbox
        </button>
        <button
          type="button"
          className={tab === 'settings' ? 'tab-button active' : 'tab-button'}
          onClick={() => setTab('settings')}
        >
          Channel Settings
        </button>
      </div>

      {tab === 'unified' ? (
        <>
          <Panel title="Filters & business search">
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
                Participant
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
                  Include Personal WhatsApp (Owner only — not business search)
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
                placeholder="Search business channels only…"
              />
              <Button
                variant="secondary"
                disabled={isWorking || !searchQ.trim()}
                onClick={() => void runBusinessSearch()}
              >
                Business search
              </Button>
            </div>
          </Panel>

          <Panel title="Unified inbox (real indexed traffic)">
            {!inbox || inbox.items.length === 0 ? (
              <EmptyState
                title={
                  inbox?.emptyReason === 'not_configured'
                    ? 'Channels not configured'
                    : inbox?.emptyReason === 'role_filtered'
                      ? 'No assigned conversations'
                      : 'No messages yet'
                }
                description={
                  inbox?.capabilityNotes?.join(' ') ??
                  'Honest empty state — no fake messages. Connect Business Gmail or Business WhatsApp, then real traffic will appear here.'
                }
              />
            ) : (
              <div className="data-list">
                {inbox.items.map((item) => (
                  <div key={item.id} className="data-list-item">
                    <strong>{item.subject ?? item.participantLabel ?? 'Conversation'}</strong>
                    <span className="status-pill">
                      {item.accountKind}
                      {item.isPersonal ? ' · personal' : ''}
                      {item.unread ? ' · unread' : ''}
                      {item.urgent ? ' · urgent' : ''}
                    </span>
                    <p>
                      {item.preview ?? 'No preview'} · {item.occurredAt}
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

      {tab === 'settings' && settings ? (
        <>
          <div className="stat-grid">
            <StatCard label="Business Gmail" value={settings.businessGmail.status} />
            <StatCard label="Business WhatsApp" value={settings.businessWhatsapp.status} />
            {settings.personalWhatsapp ? (
              <StatCard
                label="Personal WhatsApp (Owner only)"
                value={settings.personalWhatsapp.status}
              />
            ) : (
              <StatCard label="Personal WhatsApp (Owner only)" value="Owner only" />
            )}
          </div>

          <Panel title="Business Gmail">
            {!gmailOauthReady ? (
              <EmptyState
                title="Not Configured"
                description="Google OAuth client credentials are missing on the API. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and optional GOOGLE_REDIRECT_URI. TITAN will not show a fake connected state."
              />
            ) : gmailConnected ? (
              <p>
                Connected
                {settings.businessGmail.emailAddress
                  ? ` · Connected Account: ${settings.businessGmail.emailAddress}`
                  : ''}
                {settings.businessGmail.lastSyncAt
                  ? ` · Last Sync: ${settings.businessGmail.lastSyncAt}`
                  : ' · Last Sync: never'}
              </p>
            ) : (
              <p>{settings.businessGmail.emptyStateMessage}</p>
            )}
            <p>
              Status: {!gmailOauthReady ? 'Not Configured' : settings.businessGmail.status}
              {' · '}
              Credentials:{' '}
              {settings.businessGmail.hasCredentials ? 'stored (encrypted)' : 'none'}
            </p>
            {isOwner ? (
              <>
                <div className="page-header-actions">
                  {gmailConnected ? (
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
                  )}
                </div>
                {!gmailOauthReady ? (
                  <p className="form-error" style={{ marginTop: '0.5rem' }}>
                    {gmailNotConfiguredReason}
                  </p>
                ) : null}
                {gmailConnected && manageGmail ? (
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
                    <Button
                      variant="secondary"
                      disabled={isWorking || !gmailOauthReady}
                      onClick={() => void syncGmail()}
                    >
                      Sync History
                    </Button>
                    <Button
                      variant="secondary"
                      disabled
                      title="Permissions view is not built yet"
                    >
                      Permissions
                    </Button>
                    <Link href="/integrations">
                      <Button variant="secondary">Diagnostics</Button>
                    </Link>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted">
                Connection is managed by Platform Owner. Authorized business users can use the
                inbox when connected.
              </p>
            )}
            <p className="muted" style={{ marginTop: '0.75rem' }}>
              Official Google OAuth 2.0. Tokens encrypt with INTEGRATIONS_ENCRYPTION_KEY and
              refresh automatically. AURA may summarize/draft only — send requires approve →
              execute. Personal WhatsApp (Owner only) stays private and separate.
            </p>
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
