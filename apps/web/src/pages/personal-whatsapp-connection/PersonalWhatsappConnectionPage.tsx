import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import {
  formatPersonalWaConnectionStatus,
  type PersonalWaConnectionDashboard,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  checkPersonalWaSessionHealth,
  connectPersonalWa,
  disconnectPersonalWaConnection,
  fetchPersonalWaConnectionDashboard,
  linkPersonalWaNumber,
  PersonalWhatsappConnectionApiClientError,
  reconnectPersonalWaConnection,
  updatePersonalWaConnectionPrivacy,
  updatePersonalWaConnectionSettings,
} from '../../lib/personal-whatsapp-connection-api-client';

type Tab = 'connection' | 'privacy' | 'testing';

function isPlatformOwner(roleName: string | undefined) {
  return roleName === 'Platform Owner';
}

export function PersonalWhatsappConnectionPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('connection');
  const [dashboard, setDashboard] = useState<PersonalWaConnectionDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [phoneNumber, setPhoneNumber] = useState('');
  const [label, setLabel] = useState('Personal WhatsApp');
  const [accessTokenValue, setAccessTokenValue] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [retentionDays, setRetentionDays] = useState('');

  const canView = useMemo(() => isPlatformOwner(user?.roleName), [user?.roleName]);

  async function loadPage() {
    if (!accessToken) return;
    const data = await fetchPersonalWaConnectionDashboard(accessToken);
    setDashboard(data);
    setPhoneNumber(data.connection.linkedPhoneE164 ?? '');
    setLabel(data.connection.displayLabel || 'Personal WhatsApp');
    setSyncEnabled(data.privacy.syncEnabled);
    setRetentionDays(
      data.privacy.retentionDays != null ? String(data.privacy.retentionDays) : '',
    );
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        await loadPage();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof PersonalWhatsappConnectionApiClientError
              ? err.message
              : 'Unable to load Personal WhatsApp Connection Layer',
          );
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

  async function withWork(action: () => Promise<void>) {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await loadPage();
    } catch (err) {
      setError(
        err instanceof PersonalWhatsappConnectionApiClientError
          ? err.message
          : 'Personal WhatsApp Connection action failed',
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function handleLink(event: FormEvent) {
    event.preventDefault();
    await withWork(async () => {
      await linkPersonalWaNumber(accessToken!, {
        phoneNumber,
        label,
        accessToken: accessTokenValue.trim() || undefined,
        phoneNumberId: phoneNumberId.trim() || undefined,
        syncEnabled,
      });
      setAccessTokenValue('');
      setSuccess('Owner WhatsApp number linked. Credentials encrypt at rest when provided.');
    });
  }

  async function handleConnect() {
    await withWork(async () => {
      await connectPersonalWa(accessToken!, {
        phoneNumber: phoneNumber.trim() || undefined,
        label,
        accessToken: accessTokenValue.trim() || undefined,
        phoneNumberId: phoneNumberId.trim() || undefined,
        syncEnabled,
      });
      setAccessTokenValue('');
      setSuccess(
        'Connection recorded. Live Meta/device verification is not available yet — outbound still requires Owner approval and never auto-sends.',
      );
    });
  }

  async function handleDisconnect() {
    await withWork(async () => {
      await disconnectPersonalWaConnection(accessToken!);
      setSuccess('Disconnected. Encrypted credentials cleared.');
    });
  }

  async function handleReconnect() {
    await withWork(async () => {
      await reconnectPersonalWaConnection(accessToken!);
      setSuccess('Reconnect requested. Complete Connect with a fresh token if needed.');
    });
  }

  async function handleHealthCheck() {
    await withWork(async () => {
      const result = await checkPersonalWaSessionHealth(accessToken!);
      setSuccess(result.message);
    });
  }

  async function handlePrivacy(event: FormEvent) {
    event.preventDefault();
    await withWork(async () => {
      await updatePersonalWaConnectionPrivacy(accessToken!, {
        syncEnabled,
        retentionDays: retentionDays.trim() ? Number(retentionDays) : null,
      });
      setSuccess(
        'Privacy settings saved. Private-by-default, no auto-import, and send approval remain enforced.',
      );
    });
  }

  async function handleSettings(event: FormEvent) {
    event.preventDefault();
    await withWork(async () => {
      await updatePersonalWaConnectionSettings(accessToken!, {
        label,
        phoneNumber: phoneNumber.trim() || undefined,
        syncEnabled,
        retentionDays: retentionDays.trim() ? Number(retentionDays) : null,
      });
      setSuccess('Owner settings saved.');
    });
  }

  if (!canView) {
    return (
      <div className="page">
        <PageHeader
          title="Personal WhatsApp Connection"
          description="Platform Owner only — secure owner WhatsApp pairing and session health."
        />
        <EmptyState
          title="Access Restricted"
          description="Personal WhatsApp Connection Layer uses the same Platform Owner gate as Personal WhatsApp Assistant. Staff should use Business WhatsApp under Communications Hub."
        />
        <p className="page-muted">
          <Link href="/communications-hub">Open Communications Hub</Link>
        </p>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'connection', label: 'Connection' },
    { id: 'privacy', label: 'Privacy & Settings' },
    { id: 'testing', label: 'Real-world Testing' },
  ];

  const statusLabel = dashboard
    ? formatPersonalWaConnectionStatus(dashboard.connection.status)
    : '—';

  return (
    <div className="page">
      <PageHeader
        title="Personal WhatsApp Connection"
        description="Link your owner WhatsApp number, manage secure credential pairing, session health, reconnect, and privacy permissions. Private by default — never auto-imported, never auto-sent."
      />

      <Panel title="Product boundaries">
        <ul className="list">
          <li>
            <strong>Personal Communications Intelligence</strong> — Business WhatsApp analysis.{' '}
            <Link href="/personal-communications-intelligence">Open PCI</Link>
          </li>
          <li>
            <strong>Personal WhatsApp Assistant</strong> — credential path on Communications
            Platform.{' '}
            <Link href="/communications-hub">Open Communications Hub</Link>
          </li>
          <li>
            <strong>Personal WhatsApp Intelligence</strong> — classify/approve personal threads.{' '}
            <Link href="/personal-whatsapp-intelligence">Open Intelligence</Link>
          </li>
          <li>
            <strong>This layer</strong> — owner pairing, connection status, reconnect, session
            health, and privacy. Extends `personal_whatsapp`; does not replace Business WhatsApp.
          </li>
        </ul>
      </Panel>

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="tab-row">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'primary' : 'secondary'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {isLoading ? <p>Loading…</p> : null}

      {!isLoading && dashboard ? (
        <>
          <div className="stat-grid">
            <StatCard label="Status" value={statusLabel} />
            <StatCard
              label="Linked number"
              value={dashboard.connection.linkedPhoneE164 || 'Not linked'}
            />
            <StatCard
              label="Credentials"
              value={dashboard.sessionHealth.hasCredentials ? 'Stored (encrypted)' : 'None'}
            />
            <StatCard
              label="Session health"
              value={dashboard.sessionHealth.healthy ? 'Healthy (local)' : 'Not healthy'}
            />
          </div>

          {activeTab === 'connection' ? (
            <div className="stack-gap">
              <Panel title="Connection status">
                <dl className="integrations-detail-list">
                  <div>
                    <dt>Status</dt>
                    <dd>{statusLabel}</dd>
                  </div>
                  <div>
                    <dt>Pairing mode</dt>
                    <dd>{dashboard.connection.pairingMode}</dd>
                  </div>
                  <div>
                    <dt>Last connected</dt>
                    <dd>{dashboard.connection.lastConnectedAt || '—'}</dd>
                  </div>
                  <div>
                    <dt>Reconnect attempts</dt>
                    <dd>{String(dashboard.sessionHealth.reconnectAttempts)}</dd>
                  </div>
                  <div>
                    <dt>Live provider verified</dt>
                    <dd>No</dd>
                  </div>
                </dl>
                <p className="muted" style={{ marginTop: '0.75rem' }}>
                  {dashboard.summary}
                </p>
                <div className="page-header-actions" style={{ marginTop: '0.75rem' }}>
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() => void handleHealthCheck()}
                  >
                    Check Session Health
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={isWorking || !dashboard.connection.linkedPhoneE164}
                    onClick={() => void handleReconnect()}
                  >
                    Reconnect
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() => void handleDisconnect()}
                  >
                    Disconnect
                  </Button>
                </div>
              </Panel>

              <Panel title="Link owner number / pair credentials">
                <form className="form-grid" onSubmit={(e) => void handleLink(e)}>
                  <label>
                    Owner WhatsApp number
                    <Input
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+27821234567"
                      required
                    />
                  </label>
                  <label>
                    Label
                    <Input value={label} onChange={(e) => setLabel(e.target.value)} />
                  </label>
                  <label>
                    Access token (optional — encrypted at rest)
                    <Input
                      type="password"
                      value={accessTokenValue}
                      onChange={(e) => setAccessTokenValue(e.target.value)}
                      placeholder="Paste token only when ready to store"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    Phone number ID (optional)
                    <Input
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      placeholder="Meta phone_number_id if using credential path"
                    />
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={syncEnabled}
                      onChange={(e) => setSyncEnabled(e.target.checked)}
                    />
                    Enable sync when a live provider is available (never auto-imports)
                  </label>
                  <div className="page-header-actions">
                    <Button type="submit" disabled={isWorking}>
                      Link Number
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isWorking}
                      onClick={() => void handleConnect()}
                    >
                      Connect / Complete Pairing
                    </Button>
                  </div>
                </form>
                <p className="muted" style={{ marginTop: '0.75rem' }}>
                  {dashboard.runtimeHonesty.note}
                </p>
              </Panel>
            </div>
          ) : null}

          {activeTab === 'privacy' ? (
            <div className="stack-gap">
              <Panel title="Privacy permissions">
                <dl className="integrations-detail-list">
                  <div>
                    <dt>Private by default</dt>
                    <dd>Yes (enforced)</dd>
                  </div>
                  <div>
                    <dt>Excluded from business search</dt>
                    <dd>Yes (enforced)</dd>
                  </div>
                  <div>
                    <dt>Auto-import</dt>
                    <dd>Disabled (enforced)</dd>
                  </div>
                  <div>
                    <dt>Outbound send</dt>
                    <dd>Owner approval required — never automatic</dd>
                  </div>
                </dl>
                <form className="form-grid" style={{ marginTop: '0.75rem' }} onSubmit={(e) => void handlePrivacy(e)}>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={syncEnabled}
                      onChange={(e) => setSyncEnabled(e.target.checked)}
                    />
                    Sync enabled (when live provider exists)
                  </label>
                  <label>
                    Retention days (optional)
                    <Input
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(e.target.value)}
                      placeholder="e.g. 90"
                      inputMode="numeric"
                    />
                  </label>
                  <Button type="submit" disabled={isWorking}>
                    Save Privacy
                  </Button>
                </form>
              </Panel>

              <Panel title="Owner settings">
                <form className="form-grid" onSubmit={(e) => void handleSettings(e)}>
                  <label>
                    Display label
                    <Input value={label} onChange={(e) => setLabel(e.target.value)} />
                  </label>
                  <label>
                    Linked phone
                    <Input
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+27821234567"
                    />
                  </label>
                  <Button type="submit" disabled={isWorking}>
                    Save Settings
                  </Button>
                </form>
              </Panel>
            </div>
          ) : null}

          {activeTab === 'testing' ? (
            <Panel title="Real-world testing support">
              <p className="muted">{dashboard.runtimeHonesty.note}</p>
              <div className="data-list" style={{ marginTop: '0.75rem' }}>
                {dashboard.testingSupport.map((item) => (
                  <div key={item.id} className="data-list-item">
                    <strong>{item.label}</strong>
                    <span className="status-pill">
                      {item.availableWithoutMeta
                        ? 'Testable without Meta'
                        : item.requiresLiveMetaOrDeviceLink
                          ? 'Needs Meta / device link'
                          : 'Blocked'}
                    </span>
                    <p>{item.note}</p>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
