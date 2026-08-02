import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import { isPlatformOwnerRole } from '@titan/auth/browser';
import type {
  CommPlatformHubDashboard,
  CommPlatformInboxResult,
  CommPlatformSettingsSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchCommunicationsPlatformHub,
  fetchCommunicationsPlatformInbox,
  fetchCommunicationsPlatformSettings,
  searchCommunicationsPlatformBusiness,
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

  const isOwner = useMemo(
    () =>
      user
        ? isPlatformOwnerRole({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );

  async function reload() {
    if (!accessToken) return;
    const [hub, settingsData] = await Promise.all([
      fetchCommunicationsPlatformHub(accessToken),
      fetchCommunicationsPlatformSettings(accessToken),
    ]);
    setDashboard(hub);
    setSettings(settingsData);
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
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Connection test failed');
    } finally {
      setIsWorking(false);
    }
  }

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
                  Include personal assistant (owner only — not business search)
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
              <StatCard label="Personal WhatsApp" value={settings.personalWhatsapp.status} />
            ) : (
              <StatCard label="Personal WhatsApp" value="owner only" />
            )}
          </div>

          <Panel title="Business Gmail">
            <p>{settings.businessGmail.emptyStateMessage}</p>
            <p>
              Privacy: business · Sync: {settings.businessGmail.syncEnabled ? 'on' : 'off'} ·
              Credentials: {settings.businessGmail.hasCredentials ? 'stored (encrypted)' : 'none'}
            </p>
            <div className="page-header-actions">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() => void testConnection('business_gmail')}
              >
                Test Gmail connection
              </Button>
              <Link href="/integrations">
                <Button variant="secondary">Integration Hub</Button>
              </Link>
            </div>
            <p className="muted">
              OAuth setup required (Google Cloud / Workspace). Tokens encrypt with
              INTEGRATIONS_ENCRYPTION_KEY. Drafts only until approve → execute.
            </p>
          </Panel>

          <Panel title="Business WhatsApp (Young Guns)">
            <p>{settings.businessWhatsapp.emptyStateMessage}</p>
            <p>
              Status: {settings.businessWhatsapp.status} · Connected:{' '}
              {settings.businessWhatsapp.connected ? 'yes' : 'no'}
            </p>
            <div className="page-header-actions">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() => void testConnection('business_whatsapp')}
              >
                Test Business WA
              </Button>
              <Link href="/integrations/whatsapp">
                <Button variant="secondary">WhatsApp settings</Button>
              </Link>
            </div>
          </Panel>

          <Panel title="Optional Personal WhatsApp Assistant">
            {settings.personalWhatsapp ? (
              <>
                <p>{settings.personalWhatsapp.emptyStateMessage}</p>
                <p>
                  Private by default · Never in business search · Never auto-import · Sync:{' '}
                  {settings.personalWhatsapp.syncEnabled ? 'on' : 'off'}
                </p>
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() => void testConnection('personal_whatsapp')}
                >
                  Test Personal WA
                </Button>
              </>
            ) : (
              <EmptyState
                title="Platform Owner only"
                description="Personal WhatsApp Assistant is hidden for your role. It stays private by default and is never imported into business indexes automatically."
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
