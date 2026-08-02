import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { EnterpriseUnifiedCommunicationsDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  captureCommunicationsAnalytics,
  createCommunicationProvider,
  createOutboundCallCampaign,
  fetchUnifiedCommunicationsDashboard,
  syncCommunicationTimeline,
} from '../../lib/enterprise-communications-api-client';
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

type CommsHubTab =
  | 'platform'
  | 'overview'
  | 'providers'
  | 'voice'
  | 'timeline'
  | 'outbound'
  | 'dispatch'
  | 'analytics'
  | 'assistant';

export function CommunicationsHubPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<CommsHubTab>('platform');
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

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchUnifiedCommunicationsDashboard(accessToken);
    setDashboard(data);
  }

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

  const tabs: Array<{ id: CommsHubTab; label: string }> = [
    { id: 'platform', label: 'Inbox & Channels' },
    { id: 'overview', label: 'Overview' },
    { id: 'providers', label: 'Providers' },
    { id: 'voice', label: 'AI Voice' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'outbound', label: 'Outbound Calling' },
    { id: 'dispatch', label: 'Dispatch Comms' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  return (
    <div className="automation-page">
      <PageHeader
        title="Communications Hub"
        description="Business Gmail, Business WhatsApp, and optional Personal Assistant — real data only; send requires approval."
        actions={
          <div className="page-header-actions">
            <Link href="/communications-intelligence">
              <Button variant="secondary">Comms Intelligence</Button>
            </Link>
            <Link href="/integrations/whatsapp">
              <Button variant="secondary">WhatsApp</Button>
            </Link>
            <Link href="/portal/communications">
              <Button variant="secondary">Customer Center</Button>
            </Link>
            {canWrite ? (
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
            ) : null}
          </div>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="tab-row">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'tab-button active' : 'tab-button'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'platform' ? <CommunicationsPlatformPanel /> : null}

      {activeTab !== 'platform' && isLoading ? (
        <Panel title="Loading">Loading communications hub…</Panel>
      ) : activeTab !== 'platform' && !dashboard ? (
        <EmptyState title="No data" description="Communications hub is unavailable." />
      ) : activeTab !== 'platform' && dashboard ? (
        <>
          <Panel title="Platform Summary">
            <p>{dashboard.summary}</p>
            {dashboard.isPlatformOwner ? (
              <span className="status-pill status-healthy">
                Platform Owner — global communication visibility
              </span>
            ) : null}
          </Panel>

          {activeTab === 'overview' ? (
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
                label="WhatsApp"
                value={dashboard.whatsappConnected ? 'Connected' : 'Not connected'}
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
                  {dashboard.providerAdapters.map((provider) => (
                    <div key={provider.id} className="data-list-item">
                      <strong>{provider.name}</strong>
                      <span className="status-pill">{formatProviderStatus(provider.status)}</span>
                      <p>
                        {formatProviderChannel(provider.channel)} · {provider.providerKey} ·{' '}
                        {provider.lastTestStatus ?? 'not tested'}
                      </p>
                    </div>
                  ))}
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
                tracking provider.
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

          {activeTab === 'assistant' ? (
            <Panel title="AURA Communications Agent">
              <p>
                Ask about communication history, draft replies, call summaries, and customer
                updates. Recommendations only — business channels; personal data not exposed.
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
        </>
      ) : null}
    </div>
  );
}
