import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import {
  canConnectBusinessGmail,
  type EnterpriseUnifiedCommunicationsDashboard,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  captureCommunicationsAnalytics,
  createCommunicationProvider,
  createOutboundCallCampaign,
  fetchUnifiedCommunicationsDashboard,
  syncCommunicationTimeline,
} from '../../lib/enterprise-communications-api-client';
import { startGmailOAuth } from '../../lib/communications-platform-api';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessCommunicationsHub,
  canManageCommunicationsHub,
  formatProviderChannel,
  formatProviderStatus,
} from '../../features/communications-hub/utils';
import { CommunicationsPlatformPanel } from '../../features/communications-hub/CommunicationsPlatformPanel';

type PrimaryHubTab = 'inbox' | 'channels' | 'assistant';

type AdvancedHubTab =
  | 'providers'
  | 'analytics'
  | 'outbound'
  | 'dispatch'
  | 'voice'
  | 'timeline'
  | 'diagnostics';

type CommsHubTab = PrimaryHubTab | AdvancedHubTab;

const PRIMARY_TABS: Array<{ id: PrimaryHubTab; label: string }> = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'channels', label: 'Business Channels' },
  { id: 'assistant', label: 'AURA Communications' },
];

const ADVANCED_TABS: Array<{ id: AdvancedHubTab; label: string }> = [
  { id: 'providers', label: 'Providers' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'outbound', label: 'Outbound Calling' },
  { id: 'dispatch', label: 'Dispatch Communications' },
  { id: 'voice', label: 'Voice Configuration' },
  { id: 'timeline', label: 'Sync Timeline' },
  { id: 'diagnostics', label: 'Diagnostics' },
];

const ADVANCED_TAB_IDS = new Set<CommsHubTab>(ADVANCED_TABS.map((tab) => tab.id));

function isAdvancedTab(tab: CommsHubTab): tab is AdvancedHubTab {
  return ADVANCED_TAB_IDS.has(tab);
}

function isPlatformTab(tab: CommsHubTab): tab is 'inbox' | 'channels' {
  return tab === 'inbox' || tab === 'channels';
}

export function CommunicationsHubPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<CommsHubTab>('inbox');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dashboard, setDashboard] = useState<EnterpriseUnifiedCommunicationsDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    agentMessages,
    isSending,
    pendingTasks,
    sendAgentMessage,
    updateTask,
    error: assistantError,
  } = useAuraChat();

  const canView = useMemo(
    () => (user ? canAccessCommunicationsHub(user.permissions) : false),
    [user],
  );
  const canWrite = useMemo(
    () => (user ? canManageCommunicationsHub(user.permissions) : false),
    [user],
  );
  const canManageGmailConnection = useMemo(
    () =>
      user
        ? canConnectBusinessGmail({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );

  const showAdvanced = advancedOpen || isAdvancedTab(activeTab);
  const needsEnterpriseDashboard = !isPlatformTab(activeTab) && activeTab !== 'assistant';

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchUnifiedCommunicationsDashboard(accessToken);
    setDashboard(data);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('channelSettings') === '1' || params.get('gmail')) {
      setActiveTab('channels');
      setAdvancedOpen(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        const data = await fetchUnifiedCommunicationsDashboard(accessToken);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load communications hub',
          );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  async function runAction(action: () => Promise<unknown>, message: string) {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await loadDashboard();
      setSuccess(message);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setIsWorking(false);
    }
  }

  async function connectBusinessGmailFromProviders() {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const url = await startGmailOAuth(accessToken, '/communications-hub');
      window.location.assign(url);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to start Google OAuth for Business Gmail',
      );
      setIsWorking(false);
    }
  }

  function selectPrimaryTab(tab: PrimaryHubTab) {
    setActiveTab(tab);
    setAdvancedOpen(false);
  }

  function selectAdvancedTab(tab: AdvancedHubTab) {
    setActiveTab(tab);
    setAdvancedOpen(true);
  }

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader
          title="Communications Hub"
          description="You do not have permission to view the communications hub."
        />
      </div>
    );
  }

  return (
    <div className="automation-page">
      <PageHeader
        title="Communications Hub"
        description="Business Gmail, Business WhatsApp, and optional Personal WhatsApp (Owner only) — real data only; send requires approval."
      />

      <p className="muted">
        <Link href="/email-centre">Email Centre</Link>
        {' · '}
        <Link href="/communication-timeline">Communication Timeline</Link>
      </p>

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="tab-row" role="tablist" aria-label="Communications Hub">
        {PRIMARY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'tab-button active' : 'tab-button'}
            onClick={() => selectPrimaryTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="integrations-advanced">
        <button
          type="button"
          className="integrations-advanced__toggle"
          onClick={() => {
            if (showAdvanced) {
              setAdvancedOpen(false);
              if (isAdvancedTab(activeTab)) {
                setActiveTab('inbox');
              }
            } else {
              setAdvancedOpen(true);
            }
          }}
          aria-expanded={showAdvanced}
        >
          {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
        </button>

        {showAdvanced ? (
          <div className="integrations-advanced__content">
            <div className="tab-row" role="tablist" aria-label="Advanced Settings">
              {ADVANCED_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={activeTab === tab.id ? 'tab-button active' : 'tab-button'}
                  onClick={() => selectAdvancedTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="page-header-actions">
              <Link href="/communications-intelligence">
                <Button variant="secondary">Comms Intelligence</Button>
              </Link>
              <Link href="/integrations/whatsapp">
                <Button variant="secondary">Business WhatsApp</Button>
              </Link>
              <Link href="/portal/communications">
                <Button variant="secondary">Customer Center</Button>
              </Link>
            </div>
          </div>
        ) : null}
      </section>

      {isPlatformTab(activeTab) ? <CommunicationsPlatformPanel view={activeTab} /> : null}

      {activeTab === 'assistant' ? (
        <Panel title="AURA Communications Agent">
          <p>
            Ask about communication history, draft replies, call summaries, and customer updates.
            Recommendations only — business channels; personal data not exposed.
          </p>
          {assistantError ? <p className="form-error">{assistantError}</p> : null}
          <AuraMessageList messages={agentMessages} isSending={isSending} />
          {pendingTasks.map((task) => (
            <AuraTaskApprovalCard
              key={task.id}
              task={task}
              accessToken={accessToken ?? ''}
              onUpdated={updateTask}
            />
          ))}
          <AuraComposer
            disabled={isSending}
            onSend={(content) => void sendAgentMessage(content, 'communications')}
            placeholder="Ask about calls, WhatsApp, SMS, email, or draft a reply…"
          />
        </Panel>
      ) : null}

      {needsEnterpriseDashboard && isLoading ? (
        <Panel title="Loading">Loading communications hub…</Panel>
      ) : needsEnterpriseDashboard && !dashboard ? (
        <EmptyState title="No data" description="Communications hub is unavailable." />
      ) : needsEnterpriseDashboard && dashboard ? (
        <>
          <Panel title="Platform Summary">
            <p>{dashboard.summary}</p>
            {dashboard.isPlatformOwner ? (
              <span className="status-pill status-healthy">
                Platform Owner — global communication visibility
              </span>
            ) : null}
          </Panel>

          {activeTab === 'diagnostics' ? (
            <div className="stat-grid">
              <StatCard label="Active Providers" value={String(dashboard.activeProviderCount)} />
              <StatCard
                label="Total Communications"
                value={String(dashboard.intelligence.analytics.totalCommunications)}
              />
              <StatCard
                label="Missed Calls"
                value={String(dashboard.intelligence.analytics.missedCallCount)}
              />
              <StatCard
                label="Pending Drafts"
                value={String(dashboard.intelligence.pendingDrafts.length)}
              />
              <StatCard
                label="Business WhatsApp"
                value={dashboard.whatsappConnected ? 'Connected' : 'Not Connected'}
              />
              <StatCard
                label="Voice Sessions"
                value={String(dashboard.voiceReceptionist.totalSessionCount)}
              />
              <StatCard
                label="Retention"
                value={`${dashboard.platformConfig.retentionDays} days`}
              />
              <StatCard
                label="Consent Required"
                value={dashboard.platformConfig.consentRequired ? 'Yes' : 'No'}
              />
            </div>
          ) : null}

          {activeTab === 'providers' ? (
            <Panel title="Communication Provider Adapters">
              <p>Vendor-agnostic adapters — no module depends on a single provider.</p>
              {canWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () =>
                        createCommunicationProvider(accessToken!, {
                          channel: 'sms',
                          providerKey: 'custom_sms',
                          name: 'SMS Provider',
                        }),
                      'Provider adapter created (inactive until configured).',
                    )
                  }
                >
                  Add Provider Adapter
                </Button>
              ) : null}
              {dashboard.providerAdapters.length === 0 ? (
                <EmptyState
                  title="No providers configured"
                  description="Add provider adapters for voice, WhatsApp, SMS, email, and other channels."
                />
              ) : (
                <div className="data-list">
                  {dashboard.providerAdapters.map((provider) => {
                    const isGmail = provider.providerKey === 'gmail';
                    const gmailConnected = isGmail && provider.status === 'active';
                    const gmailOauthReady = !isGmail || provider.oauthConfigured !== false;
                    return (
                      <div key={provider.id} className="data-list-item">
                        <strong>{provider.name}</strong>
                        <span className="status-pill">
                          {formatProviderStatus(provider.status)}
                        </span>
                        <p>
                          {formatProviderChannel(provider.channel)} · {provider.providerKey}
                          {provider.emailAddress ? ` · ${provider.emailAddress}` : ''}
                          {provider.lastTestMessage ? ` · ${provider.lastTestMessage}` : ''}
                        </p>
                        {isGmail && canManageGmailConnection ? (
                          <div className="page-header-actions" style={{ marginTop: '0.5rem' }}>
                            {gmailConnected ? (
                              <Button
                                onClick={() => {
                                  const url = new URL(window.location.href);
                                  url.searchParams.set('channelSettings', '1');
                                  window.history.replaceState({}, '', url.toString());
                                  selectPrimaryTab('channels');
                                }}
                              >
                                Manage
                              </Button>
                            ) : (
                              <Button
                                disabled={isWorking || !gmailOauthReady}
                                onClick={() => void connectBusinessGmailFromProviders()}
                                title={
                                  !gmailOauthReady
                                    ? 'Business Gmail is not set up on this system yet. Ask your Platform Owner to finish setup.'
                                    : undefined
                                }
                              >
                                Connect
                              </Button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'voice' ? (
            <Panel title="AI Voice Receptionist">
              <div className="stat-grid">
                <StatCard
                  label="Active Sessions"
                  value={String(dashboard.voiceReceptionist.activeSessionCount)}
                />
                <StatCard
                  label="Total Sessions"
                  value={String(dashboard.voiceReceptionist.totalSessionCount)}
                />
                <StatCard
                  label="Missed Calls"
                  value={String(dashboard.voiceReceptionist.missedCallCount)}
                />
                <StatCard
                  label="Pending Follow-ups"
                  value={String(dashboard.voiceReceptionist.pendingFollowUpCount)}
                />
                <StatCard
                  label="AI Voice"
                  value={dashboard.voiceReceptionist.aiVoiceEnabled ? 'Enabled' : 'Not configured'}
                />
              </div>
              <p>Bookings requiring approval follow Draft → Approval → Execution.</p>
            </Panel>
          ) : null}

          {activeTab === 'timeline' ? (
            <Panel title="Unified Communication Timeline">
              {canWrite ? (
                <div className="page-header-actions" style={{ marginBottom: '0.75rem' }}>
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() =>
                      void runAction(
                        () => syncCommunicationTimeline(accessToken!),
                        'Timeline synced from real modules.',
                      )
                    }
                  >
                    Sync Timeline
                  </Button>
                </div>
              ) : null}
              {dashboard.recentTimeline.length === 0 &&
              dashboard.intelligence.recentTimeline.length === 0 ? (
                <EmptyState
                  title="No timeline entries"
                  description="Sync timeline to index calls, WhatsApp, SMS, email, and chat from real modules."
                />
              ) : (
                <div className="data-list">
                  {(dashboard.recentTimeline.length > 0
                    ? dashboard.recentTimeline
                    : dashboard.intelligence.recentTimeline.map((e) => ({
                        id: e.id,
                        title: e.title,
                        summary: e.preview,
                        entryType: e.channel,
                        occurredAt: e.occurredAt,
                      }))
                  ).map((entry) => (
                    <div key={entry.id} className="data-list-item">
                      <strong>{entry.title}</strong>
                      <span className="status-pill">
                        {('entryType' in entry ? entry.entryType : 'channel') as string}
                      </span>
                      <p>
                        {('summary' in entry ? entry.summary : null) ?? ''} · {entry.occurredAt}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'outbound' ? (
            <Panel title="Outbound AI Calling">
              {canWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () =>
                        createOutboundCallCampaign(accessToken!, {
                          campaignType: 'appointment_confirmation',
                          subject: 'Appointment confirmation campaign',
                        }),
                      'Outbound campaign submitted for approval.',
                    )
                  }
                >
                  Create Outbound Campaign
                </Button>
              ) : null}
              {dashboard.outboundCampaigns.length === 0 ? (
                <EmptyState
                  title="No outbound campaigns"
                  description="Outbound campaigns require approval and tenant consent policies."
                />
              ) : (
                <div className="data-list">
                  {dashboard.outboundCampaigns.map((campaign) => (
                    <div key={campaign.id} className="data-list-item">
                      <strong>{campaign.subject}</strong>
                      <span className="status-pill">{campaign.status}</span>
                      <p>
                        {campaign.campaignType.replace(/_/g, ' ')} · consent{' '}
                        {campaign.consentRequired ? 'required' : 'optional'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'dispatch' ? (
            <Panel title="Dispatch Customer Notifications">
              <p>
                Technician dispatch notifications use configured providers — no assumed SMS or
                tracking provider. Appointment confirmation, technician en route, and job completed
                drafts use draft→approve→queue (UC dispatch-notifications). TITAN never auto-sends.
              </p>
              {dashboard.dispatchNotifications.length === 0 ? (
                <EmptyState
                  title="No dispatch notifications"
                  description="Notifications appear when jobs are dispatched and providers are configured."
                />
              ) : (
                <div className="data-list">
                  {dashboard.dispatchNotifications.map((notification) => (
                    <div key={notification.id} className="data-list-item">
                      <strong>{notification.notificationType.replace(/_/g, ' ')}</strong>
                      <span className="status-pill">{notification.status}</span>
                      <p>
                        {notification.channel ?? 'no channel'} · {notification.createdAt}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'analytics' ? (
            <Panel title="Communication Analytics">
              {canWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => captureCommunicationsAnalytics(accessToken!),
                      'Analytics captured from real data.',
                    )
                  }
                >
                  Capture Analytics
                </Button>
              ) : null}
              {!dashboard.analytics ? (
                <EmptyState
                  title="No analytics snapshot"
                  description="Capture analytics from real call, channel, and satisfaction data."
                />
              ) : (
                <div className="stat-grid">
                  <StatCard
                    label="Calls Answered"
                    value={String(dashboard.analytics.callsAnswered)}
                  />
                  <StatCard label="Calls Missed" value={String(dashboard.analytics.callsMissed)} />
                  <StatCard
                    label="AI Resolution"
                    value={String(dashboard.analytics.aiResolutionRate ?? '—')}
                  />
                  <StatCard
                    label="Satisfaction"
                    value={String(dashboard.analytics.customerSatisfactionScore ?? '—')}
                  />
                </div>
              )}
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
