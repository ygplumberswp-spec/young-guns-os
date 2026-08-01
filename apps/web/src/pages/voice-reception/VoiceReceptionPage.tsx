import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { EnterpriseVoiceReceptionDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  captureVoiceAnalytics,
  captureVoiceQuality,
  fetchVoiceAuditLogs,
  fetchVoiceReceptionDashboard,
  syncVoiceAlerts,
  updateAiReceptionistConfig,
} from '../../lib/enterprise-voice-reception-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessVoiceReception,
  canManageVoiceReception,
  formatDuration,
  formatPercent,
  formatSeverity,
  formatStatus,
} from '../../features/voice-reception/utils';

type VoiceReceptionTab =
  | 'overview'
  | 'live-calls'
  | 'call-queue'
  | 'call-history'
  | 'recordings'
  | 'transcripts'
  | 'ai-receptionist'
  | 'routing'
  | 'business-hours'
  | 'analytics'
  | 'quality'
  | 'settings'
  | 'assistant';

export function VoiceReceptionPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<VoiceReceptionTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseVoiceReceptionDashboard | null>(null);
  const [auditLogs, setAuditLogs] = useState<Awaited<ReturnType<typeof fetchVoiceAuditLogs>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupplementaryLoading, setIsSupplementaryLoading] = useState(false);
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

  const canView = useMemo(() => (user ? canAccessVoiceReception(user.permissions) : false), [user]);
  const canWrite = useMemo(
    () => (user ? canManageVoiceReception(user.permissions) : false),
    [user],
  );

  const tabs: Array<{ id: VoiceReceptionTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'live-calls', label: 'Live Calls' },
    { id: 'call-queue', label: 'Call Queue' },
    { id: 'call-history', label: 'Call History' },
    { id: 'recordings', label: 'Recordings' },
    { id: 'transcripts', label: 'Transcripts' },
    { id: 'ai-receptionist', label: 'AI Receptionist' },
    { id: 'routing', label: 'Routing' },
    { id: 'business-hours', label: 'Business Hours' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'quality', label: 'Quality' },
    { id: 'settings', label: 'Settings' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchVoiceReceptionDashboard(accessToken);
    setDashboard(data);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        await loadDashboard();
        if (!cancelled) setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load voice reception dashboard',
          );
          setIsLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  useEffect(() => {
    if (!accessToken || !canView || isLoading || activeTab !== 'settings') return;
    let cancelled = false;
    async function loadTabData() {
      setIsSupplementaryLoading(true);
      try {
        const logs = await fetchVoiceAuditLogs(accessToken!);
        if (!cancelled) setAuditLogs(logs);
      } catch {
        if (!cancelled) setAuditLogs([]);
      } finally {
        if (!cancelled) setIsSupplementaryLoading(false);
      }
    }
    void loadTabData();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, activeTab, isLoading]);

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    if (!accessToken || !canWrite) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await loadDashboard();
      setSuccess(successMessage);
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
          title="Voice Reception"
          description="You do not have permission to view voice reception."
        />
      </div>
    );
  }

  return (
    <div className="automation-page">
      <PageHeader
        title="Voice Reception"
        description="Enterprise AI voice receptionist, call intelligence, and unified telephony — built on existing voice and communications services. No fake calls or demo data."
        actions={
          canWrite ? (
            <div className="page-header-actions">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(() => syncVoiceAlerts(accessToken!), 'Voice alerts synced.')
                }
              >
                Sync Alerts
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(async () => {
                    await captureVoiceAnalytics(accessToken!);
                    await captureVoiceQuality(accessToken!);
                  }, 'Analytics and quality metrics captured.')
                }
              >
                Capture Metrics
              </Button>
            </div>
          ) : undefined
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

      {isLoading ? (
        <Panel title="Loading">Loading voice reception dashboard…</Panel>
      ) : !dashboard ? (
        <EmptyState title="No data" description="Voice reception dashboard is unavailable." />
      ) : (
        <>
          {activeTab === 'overview' ? (
            <>
              <div className="stat-grid">
                <StatCard label="Active Calls" value={String(dashboard.activeCallCount)} />
                <StatCard label="Missed Calls" value={String(dashboard.missedCallCount)} />
                <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
                <StatCard
                  label="Telephony Providers"
                  value={String(dashboard.activeProviderCount)}
                />
                <StatCard
                  label="Voice Health"
                  value={formatStatus(dashboard.overallVoiceHealthStatus)}
                />
                <StatCard
                  label="AI Receptionist"
                  value={dashboard.aiReceptionist.enabled ? 'Enabled' : 'Disabled'}
                />
              </div>
              <Panel title="Summary">
                <p>{dashboard.summary}</p>
              </Panel>
              {dashboard.recentAlerts.length > 0 ? (
                <Panel title="Recent Alerts">
                  <div className="data-list">
                    {dashboard.recentAlerts.map((alert) => (
                      <div key={alert.id} className="data-list-item">
                        <strong>{alert.title}</strong>
                        <span>
                          {formatSeverity(alert.severity)} · {formatStatus(alert.status)}
                        </span>
                        {alert.description ? <p>{alert.description}</p> : null}
                      </div>
                    ))}
                  </div>
                </Panel>
              ) : null}
            </>
          ) : null}

          {activeTab === 'live-calls' ? (
            <Panel title="Live Calls">
              {dashboard.liveCalls.length === 0 ? (
                <EmptyState
                  title="No live calls"
                  description="Active voice sessions appear here from real call activity."
                />
              ) : (
                <div className="data-list">
                  {dashboard.liveCalls.map((call) => (
                    <div key={call.id} className="data-list-item">
                      <strong>{call.callerName ?? call.callerPhone ?? 'Unknown'}</strong>
                      <span>
                        {formatStatus(call.status)} · {formatStatus(call.enquiryType)}
                      </span>
                      <span>{formatDuration(call.durationSeconds)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'call-queue' ? (
            <Panel title="Call Queues">
              {dashboard.callQueues.length === 0 ? (
                <EmptyState
                  title="No call queues configured"
                  description="Configure call queues in Routing settings."
                />
              ) : (
                <div className="data-list">
                  {dashboard.callQueues.map((queue) => (
                    <div key={queue.id} className="data-list-item">
                      <strong>{queue.name}</strong>
                      <span>{queue.queueKey}</span>
                      {queue.maxWaitSeconds != null ? (
                        <span>Max wait {queue.maxWaitSeconds}s</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'call-history' ? (
            <Panel title="Call History">
              {dashboard.callHistory.length === 0 ? (
                <EmptyState
                  title="No call history"
                  description="Completed voice sessions appear here from real call activity."
                />
              ) : (
                <div className="data-list">
                  {dashboard.callHistory.map((call) => (
                    <div key={call.id} className="data-list-item">
                      <strong>{call.callerName ?? call.callerPhone ?? 'Unknown'}</strong>
                      <span>
                        {formatStatus(call.status)} · {formatStatus(call.enquiryType)}
                      </span>
                      <span>{new Date(call.startedAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'recordings' ? (
            <Panel title="Recordings">
              {dashboard.recordings.length === 0 ? (
                <EmptyState
                  title="No recordings"
                  description="Call recordings appear here when captured with proper consent."
                />
              ) : (
                <div className="data-list">
                  {dashboard.recordings.map((recording) => (
                    <div key={recording.id} className="data-list-item">
                      <strong>Recording {recording.id.slice(0, 8)}</strong>
                      <span>Consent: {formatStatus(recording.consentStatus)}</span>
                      <span>Status: {formatStatus(recording.recordingStatus)}</span>
                      {recording.storageReference ? (
                        <span>{recording.storageReference}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'transcripts' ? (
            <Panel title="Transcripts">
              {dashboard.recordings.filter((r) => r.transcriptReference || r.aiSummary).length ===
              0 ? (
                <EmptyState
                  title="No transcripts"
                  description="Transcripts appear here when generated from real recordings."
                />
              ) : (
                <div className="data-list">
                  {dashboard.recordings
                    .filter((r) => r.transcriptReference || r.aiSummary)
                    .map((recording) => (
                      <div key={recording.id} className="data-list-item">
                        <strong>Transcript {recording.id.slice(0, 8)}</strong>
                        <span>{formatStatus(recording.transcriptionStatus)}</span>
                        {recording.aiSummary ? <p>{recording.aiSummary}</p> : null}
                      </div>
                    ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'ai-receptionist' ? (
            <Panel title="AI Receptionist">
              <p>
                {dashboard.aiReceptionist.enabled ? 'Enabled' : 'Disabled'} · Confidence threshold{' '}
                {dashboard.aiReceptionist.confidenceThreshold}%
              </p>
              {dashboard.aiReceptionist.welcomeMessage ? (
                <p>Welcome: {dashboard.aiReceptionist.welcomeMessage}</p>
              ) : null}
              {canWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () =>
                        updateAiReceptionistConfig(accessToken!, {
                          enabled: !dashboard.aiReceptionist.enabled,
                        }),
                      `AI receptionist ${dashboard.aiReceptionist.enabled ? 'disabled' : 'enabled'}.`,
                    )
                  }
                >
                  {dashboard.aiReceptionist.enabled
                    ? 'Disable AI Receptionist'
                    : 'Enable AI Receptionist'}
                </Button>
              ) : null}
              {dashboard.conversationDrafts.length > 0 ? (
                <div className="data-list">
                  {dashboard.conversationDrafts.map((draft) => (
                    <div key={draft.id} className="data-list-item">
                      <strong>{draft.title}</strong>
                      <span>{formatStatus(draft.draftType)} · Requires approval</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </Panel>
          ) : null}

          {activeTab === 'routing' ? (
            <>
              <Panel title={`Routing Rules (${dashboard.routingRules.length})`}>
                {dashboard.routingRules.length === 0 ? (
                  <p>No routing rules configured.</p>
                ) : (
                  <div className="data-list">
                    {dashboard.routingRules.map((rule) => (
                      <div key={rule.id} className="data-list-item">
                        <strong>{rule.name}</strong>
                        <span>
                          Priority {rule.priority} → {rule.destinationType}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
              <Panel title={`Emergency Rules (${dashboard.emergencyRules.length})`}>
                {dashboard.emergencyRules.length === 0 ? (
                  <p>No emergency routing rules configured.</p>
                ) : (
                  <div className="data-list">
                    {dashboard.emergencyRules.map((rule) => (
                      <div key={rule.id} className="data-list-item">
                        <strong>{rule.name}</strong>
                        <span>{rule.triggerKeywords.join(', ') || 'No keywords'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </>
          ) : null}

          {activeTab === 'business-hours' ? (
            <Panel title="Business Hours">
              {dashboard.businessHours.length === 0 ? (
                <EmptyState
                  title="No business hours configured"
                  description="Configure schedules for routing and AI receptionist."
                />
              ) : (
                <div className="data-list">
                  {dashboard.businessHours.map((schedule) => (
                    <div key={schedule.id} className="data-list-item">
                      <strong>{schedule.name}</strong>
                      <span>{schedule.timezone}</span>
                      {schedule.afterHoursDestination ? (
                        <span>After hours → {schedule.afterHoursDestination}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'analytics' ? (
            <Panel title="Analytics">
              <div className="stat-grid">
                <StatCard
                  label="Total Sessions"
                  value={String(dashboard.voiceStats.totalSessionCount)}
                />
                <StatCard
                  label="Completed"
                  value={String(dashboard.voiceStats.completedSessionCount)}
                />
                <StatCard
                  label="Follow-ups Required"
                  value={String(dashboard.voiceStats.followUpRequiredCount)}
                />
                <StatCard
                  label="Appointment Requests"
                  value={String(dashboard.voiceStats.appointmentRequestCount)}
                />
              </div>
              {dashboard.analytics ? (
                <pre>{JSON.stringify(dashboard.analytics.metrics, null, 2)}</pre>
              ) : (
                <p>Capture analytics to store a snapshot from real call data.</p>
              )}
            </Panel>
          ) : null}

          {activeTab === 'quality' ? (
            <Panel title="Quality Assurance">
              <div className="stat-grid">
                <StatCard
                  label="Resolution Rate"
                  value={formatPercent(dashboard.quality.resolutionRate)}
                />
                <StatCard
                  label="Escalation Rate"
                  value={formatPercent(dashboard.quality.escalationRate)}
                />
                <StatCard
                  label="Booking Success"
                  value={formatPercent(dashboard.quality.bookingSuccessRate)}
                />
                <StatCard
                  label="Call Quality"
                  value={
                    dashboard.quality.callQualityScore != null
                      ? String(dashboard.quality.callQualityScore)
                      : '—'
                  }
                />
              </div>
            </Panel>
          ) : null}

          {activeTab === 'settings' ? (
            <>
              <Panel title="Telephony & Locations">
                <div className="data-list">
                  {dashboard.telephonyProviders.map((provider) => (
                    <div key={provider.id} className="data-list-item">
                      <strong>{provider.name}</strong>
                      <span>
                        {provider.providerKey} · {provider.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  ))}
                  {dashboard.languageConfigs.map((lang) => (
                    <div key={lang.id} className="data-list-item">
                      <strong>{lang.name}</strong>
                      <span>
                        {lang.languageCode}
                        {lang.isDefault ? ' · Default' : ''}
                      </span>
                    </div>
                  ))}
                  {dashboard.locationConfigs.map((loc) => (
                    <div key={loc.id} className="data-list-item">
                      <strong>{loc.name}</strong>
                      <span>{loc.locationKey}</span>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Audit Log">
                {isSupplementaryLoading ? <p>Loading audit logs…</p> : null}
                {auditLogs.length === 0 ? (
                  <EmptyState
                    title="No audit logs"
                    description="Voice reception actions are recorded for complete auditability."
                  />
                ) : (
                  <div className="data-list">
                    {auditLogs.slice(0, 20).map((log) => (
                      <div key={log.id} className="data-list-item">
                        <strong>{formatStatus(log.actionType)}</strong>
                        <span>{new Date(log.createdAt).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </>
          ) : null}

          {activeTab === 'assistant' ? (
            <Panel title="AURA Voice Reception Agent">
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
                onSend={(content) =>
                  void sendAgentMessage(
                    content,
                    'voice_reception' as import('@titan/shared').AgentKey,
                  )
                }
                placeholder="Ask about call history, schedules, CRM, routing, or draft summaries and follow-ups…"
              />
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
