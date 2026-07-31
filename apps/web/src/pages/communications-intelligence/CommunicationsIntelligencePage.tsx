import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Input, PageHeader, Panel, StatCard } from '@titan/ui';
import type {
  CommIntelCallSummary,
  CommIntelDraftActionSummary,
  CommIntelEmailThreadSummary,
  CommIntelSmsRecordSummary,
  CommIntelTimelineEntry,
  CommIntelUnifiedDashboard,
} from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import {
  CommunicationsIntelligenceApiClientError,
  createCommunicationsDraft,
  fetchCommunicationsCallHistory,
  fetchCommunicationsDrafts,
  fetchCommunicationsEmailThreads,
  fetchCommunicationsIntelligenceDashboard,
  fetchCommunicationsSmsRecords,
  fetchCommunicationsTimeline,
} from '../../lib/communications-intelligence-api-client';

type CommsTab = 'dashboard' | 'timeline' | 'calls' | 'email' | 'sms' | 'drafts';

function canAccess(permissions: string[]) {
  return (
    permissions.includes('communications_intelligence:read') ||
    permissions.includes('communications_intelligence:write') ||
    permissions.includes('communications:read') ||
    permissions.includes('voice:read') ||
    permissions.includes('*')
  );
}

function canWrite(permissions: string[]) {
  return (
    permissions.includes('communications_intelligence:write') ||
    permissions.includes('communications:write') ||
    permissions.includes('*')
  );
}

export function CommunicationsIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<CommsTab>('dashboard');
  const [dashboard, setDashboard] = useState<CommIntelUnifiedDashboard | null>(null);
  const [timeline, setTimeline] = useState<CommIntelTimelineEntry[]>([]);
  const [calls, setCalls] = useState<CommIntelCallSummary[]>([]);
  const [emailThreads, setEmailThreads] = useState<CommIntelEmailThreadSummary[]>([]);
  const [smsRecords, setSmsRecords] = useState<CommIntelSmsRecordSummary[]>([]);
  const [drafts, setDrafts] = useState<CommIntelDraftActionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');

  const canView = useMemo(() => (user ? canAccess(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canWrite(user.permissions) : false), [user]);

  async function loadPage() {
    if (!accessToken) return;
    const [dashboardData, timelineData, callData, threadData, smsData, draftData] =
      await Promise.all([
        fetchCommunicationsIntelligenceDashboard(accessToken),
        fetchCommunicationsTimeline(accessToken),
        fetchCommunicationsCallHistory(accessToken),
        fetchCommunicationsEmailThreads(accessToken),
        fetchCommunicationsSmsRecords(accessToken),
        fetchCommunicationsDrafts(accessToken),
      ]);
    setDashboard(dashboardData);
    setTimeline(timelineData);
    setCalls(callData);
    setEmailThreads(threadData);
    setSmsRecords(smsData);
    setDrafts(draftData);
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
            err instanceof CommunicationsIntelligenceApiClientError
              ? err.message
              : 'Unable to load communications intelligence',
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

  async function handleCreateDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage || !draftBody.trim()) return;

    setError(null);
    setSuccess(null);

    try {
      await createCommunicationsDraft(accessToken, {
        draftType: 'customer_reply',
        channel: 'email',
        subject: draftSubject.trim() || undefined,
        body: draftBody.trim(),
      });
      setDraftSubject('');
      setDraftBody('');
      setSuccess('Communication draft created for approval.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof CommunicationsIntelligenceApiClientError
          ? err.message
          : 'Unable to create draft',
      );
    }
  }

  if (!canView) {
    return (
      <EmptyState
        title="Communications access required"
        description="You need communications intelligence permissions to view this centre."
      />
    );
  }

  if (isLoading) return <p className="page-muted">Loading communications centre…</p>;

  const tabs: Array<{ id: CommsTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'calls', label: 'Calls' },
    { id: 'email', label: 'Email' },
    { id: 'sms', label: 'SMS' },
    { id: 'drafts', label: 'Drafts' },
  ];

  const analytics = dashboard?.analytics;

  return (
    <div className="portal-page">
      <PageHeader
        title="Communications Intelligence"
        description="Unified voice, WhatsApp, email, SMS, portal, and support communications — all from real tenant data."
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="tab-row">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'dashboard' && analytics ? (
        <>
          <div className="stat-grid">
            <StatCard label="Total communications" value={String(analytics.totalCommunications)} />
            <StatCard label="Missed calls" value={String(analytics.missedCallCount)} />
            <StatCard label="Pending drafts" value={String(analytics.pendingDraftCount)} />
            <StatCard
              label="Open support"
              value={String(analytics.supportResponsePerformance.openConversationCount)}
            />
            <StatCard label="WhatsApp unread" value={String(analytics.whatsappUnreadCount)} />
            <StatCard
              label="Escalations"
              value={String(analytics.supportResponsePerformance.escalatedCount)}
            />
          </div>

          <div className="portal-grid">
            <Panel title="Channel usage">
              {analytics.channelUsage.length === 0 ? (
                <p className="page-muted">No communication activity recorded yet.</p>
              ) : (
                <ul className="portal-list">
                  {analytics.channelUsage.map((row) => (
                    <li key={row.channel}>
                      <strong>{row.channel}</strong>
                      <span>{row.count} event(s)</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Recent timeline">
              {dashboard.recentTimeline.length === 0 ? (
                <EmptyState
                  title="No communications"
                  description="Timeline populates from real channel data."
                />
              ) : (
                <ul className="portal-list">
                  {dashboard.recentTimeline.slice(0, 8).map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.title}</strong>
                      <span>
                        {entry.channel} · {entry.direction}
                      </span>
                      <span>{entry.preview}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      ) : null}

      {activeTab === 'timeline' ? (
        <Panel title="Customer communication timeline">
          {timeline.length === 0 ? (
            <EmptyState
              title="No timeline events"
              description="Events appear from calls, messages, and support records."
            />
          ) : (
            <ul className="portal-list">
              {timeline.map((entry) => (
                <li key={`${entry.channel}-${entry.id}`}>
                  <strong>{entry.title}</strong>
                  <span>
                    {entry.channel} · {entry.customerName ?? 'Unknown customer'} ·{' '}
                    {entry.occurredAt}
                  </span>
                  <span>{entry.preview}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'calls' ? (
        <Panel title="AI call intelligence">
          {calls.length === 0 ? (
            <EmptyState
              title="No calls"
              description="Call history comes from real voice sessions."
            />
          ) : (
            <ul className="portal-list">
              {calls.map((call) => (
                <li key={call.voiceSessionId}>
                  <strong>{call.callerName ?? call.callerPhone ?? 'Unknown caller'}</strong>
                  <span>
                    {call.callType} · {call.sessionStatus ?? 'unknown'} ·{' '}
                    {call.durationSeconds ?? 0}s
                  </span>
                  <span>{call.sessionSummary ?? call.intent ?? 'No summary'}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'email' ? (
        <Panel title="Email threads">
          {emailThreads.length === 0 ? (
            <EmptyState
              title="No email threads"
              description="Threads are grouped from CRM email communications."
            />
          ) : (
            <ul className="portal-list">
              {emailThreads.map((thread) => (
                <li key={thread.id}>
                  <strong>{thread.subject}</strong>
                  <span>
                    {thread.customerName} · {thread.priority} · {thread.communicationIds.length}{' '}
                    message(s)
                  </span>
                  <span>{thread.aiSummary ?? 'No AI summary'}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'sms' ? (
        <Panel title="SMS intelligence">
          {smsRecords.length === 0 ? (
            <EmptyState
              title="No SMS records"
              description="SMS records appear when logged against real communications."
            />
          ) : (
            <ul className="portal-list">
              {smsRecords.map((record) => (
                <li key={record.id}>
                  <strong>{record.customerName ?? 'Unknown recipient'}</strong>
                  <span>
                    {record.direction} · {record.status}
                    {record.campaignKey ? ` · ${record.campaignKey}` : ''}
                  </span>
                  <span>{record.bodyPreview}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'drafts' ? (
        <>
          {canManage ? (
            <Panel
              title="Draft customer reply"
              description="Draft → Approval → Execution. No automatic sending."
            >
              <form className="form-grid" onSubmit={(event) => void handleCreateDraft(event)}>
                <Input
                  label="Subject"
                  value={draftSubject}
                  onChange={(event) => setDraftSubject(event.target.value)}
                />
                <Input
                  label="Reply body"
                  value={draftBody}
                  onChange={(event) => setDraftBody(event.target.value)}
                  required
                />
                <Button type="submit">Draft reply</Button>
              </form>
            </Panel>
          ) : null}

          <Panel title="Pending and historical drafts">
            {drafts.length === 0 ? (
              <EmptyState
                title="No drafts"
                description="Communication drafts require manager approval."
              />
            ) : (
              <ul className="portal-list">
                {drafts.map((draft) => (
                  <li key={draft.id}>
                    <strong>{draft.subject ?? draft.draftType}</strong>
                    <span>
                      {draft.channel} · {draft.status}
                      {draft.customerName ? ` · ${draft.customerName}` : ''}
                    </span>
                    <span>{draft.body}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
