import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Input, PageHeader, Panel, StatCard } from '@titan/ui';
import type { PersonalCommExecutiveDashboard } from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import {
  PersonalCommunicationsApiClientError,
  createPersonalCommAction,
  detectLeadSignals,
  fetchConversations,
  fetchFollowUps,
  fetchLeadSignals,
  fetchPersonalCommActions,
  fetchPersonalCommDashboard,
  generateFollowUps,
  syncConversations,
} from '../../lib/personal-communications-intelligence-api-client';

type Tab = 'dashboard' | 'conversations' | 'followups' | 'leads' | 'actions';

function canAccess(permissions: string[]) {
  return (
    permissions.includes('personal_communications:read') ||
    permissions.includes('personal_communications:write') ||
    permissions.includes('communications_intelligence:read') ||
    permissions.includes('communications:read') ||
    permissions.includes('agents:read') ||
    permissions.includes('*')
  );
}

function canWrite(permissions: string[]) {
  return (
    permissions.includes('personal_communications:write') ||
    permissions.includes('communications_intelligence:write') ||
    permissions.includes('communications:write') ||
    permissions.includes('*')
  );
}

export function PersonalCommunicationsIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<PersonalCommExecutiveDashboard | null>(null);
  const [conversations, setConversations] = useState<
    Awaited<ReturnType<typeof fetchConversations>>
  >([]);
  const [followUps, setFollowUps] = useState<Awaited<ReturnType<typeof fetchFollowUps>>>([]);
  const [signals, setSignals] = useState<Awaited<ReturnType<typeof fetchLeadSignals>>>([]);
  const [actions, setActions] = useState<Awaited<ReturnType<typeof fetchPersonalCommActions>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionSubject, setActionSubject] = useState('');
  const [actionRecommendation, setActionRecommendation] = useState('');

  const canView = useMemo(() => (user ? canAccess(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canWrite(user.permissions) : false), [user]);

  async function loadPage() {
    if (!accessToken) return;
    const [dashboardData, conversationRows, followUpRows, signalRows, actionRows] =
      await Promise.all([
        fetchPersonalCommDashboard(accessToken),
        fetchConversations(accessToken),
        fetchFollowUps(accessToken),
        fetchLeadSignals(accessToken),
        fetchPersonalCommActions(accessToken),
      ]);
    setDashboard(dashboardData);
    setConversations(conversationRows);
    setFollowUps(followUpRows);
    setSignals(signalRows);
    setActions(actionRows);
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
            err instanceof PersonalCommunicationsApiClientError
              ? err.message
              : 'Unable to load personal communications intelligence',
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

  async function handleSync() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await syncConversations(accessToken);
      setSuccess('WhatsApp conversations indexed from real tenant messages.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof PersonalCommunicationsApiClientError
          ? err.message
          : 'Unable to sync conversations',
      );
    }
  }

  async function handleGenerateFollowUps() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await generateFollowUps(accessToken);
      setSuccess('Follow-up queue generated.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof PersonalCommunicationsApiClientError
          ? err.message
          : 'Unable to generate follow-ups',
      );
    }
  }

  async function handleDetectLeads() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await detectLeadSignals(accessToken);
      setSuccess('Lead signals detected from real conversations.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof PersonalCommunicationsApiClientError
          ? err.message
          : 'Unable to detect lead signals',
      );
    }
  }

  async function handleCreateAction(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await createPersonalCommAction(accessToken, {
        actionType: 'business_action',
        subject: actionSubject,
        recommendation: actionRecommendation,
      });
      setActionSubject('');
      setActionRecommendation('');
      setSuccess('Business action drafted for approval.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof PersonalCommunicationsApiClientError
          ? err.message
          : 'Unable to create action',
      );
    }
  }

  if (!canView) {
    return (
      <div className="page">
        <PageHeader
          title="Personal Communications"
          description="WhatsApp business assistant and communication intelligence."
        />
        <EmptyState
          title="Access restricted"
          description="You do not have permission to view personal communications intelligence."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'conversations', label: 'Conversations' },
    { id: 'followups', label: 'Follow-ups' },
    { id: 'leads', label: 'Lead Signals' },
    { id: 'actions', label: 'Actions' },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Personal Communications Intelligence"
        description="WhatsApp business assistant with classification, privacy boundaries, and approval-gated actions."
      />
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
      {!isLoading && activeTab === 'dashboard' && dashboard ? (
        <div className="stack">
          {canManage ? (
            <Panel title="Sync WhatsApp conversations">
              <p>
                Index real WhatsApp messages into business conversations. No messages are sent
                automatically.
              </p>
              <Button onClick={() => void handleSync()}>Sync conversations</Button>
            </Panel>
          ) : null}
          <div className="stat-grid">
            <StatCard
              label="Business conversations"
              value={String(dashboard.totalBusinessConversations)}
            />
            <StatCard
              label="Personal conversations"
              value={String(dashboard.totalPersonalConversations)}
            />
            <StatCard label="New leads" value={String(dashboard.newLeadsDetected)} />
            <StatCard label="Follow-ups" value={String(dashboard.pendingFollowUpCount)} />
            <StatCard label="Pending actions" value={String(dashboard.pendingActionCount)} />
            <StatCard label="Voice notes processed" value={String(dashboard.voiceNotesProcessed)} />
            <StatCard label="Documents analysed" value={String(dashboard.documentsAnalysed)} />
            <StatCard
              label="WhatsApp"
              value={dashboard.whatsappConnected ? 'Connected' : 'Disconnected'}
            />
          </div>
          <Panel title="Executive summary">
            <p>{dashboard.summary}</p>
          </Panel>
        </div>
      ) : null}
      {!isLoading && activeTab === 'conversations' ? (
        <Panel title="Business conversations">
          {conversations.length === 0 ? (
            <EmptyState
              title="No conversations indexed"
              description="Sync WhatsApp messages to index conversations."
            />
          ) : (
            <ul className="list">
              {conversations.map((row) => (
                <li key={row.id}>
                  {row.customerName ?? row.contactName ?? row.threadKey} · {row.classification} (
                  {row.classificationConfidence}%) · {row.messageCount} messages
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
      {!isLoading && activeTab === 'followups' ? (
        <div className="stack">
          {canManage ? (
            <Panel title="Generate follow-up queue">
              <Button onClick={() => void handleGenerateFollowUps()}>Generate follow-ups</Button>
            </Panel>
          ) : null}
          <Panel title="Follow-up queue">
            {followUps.length === 0 ? (
              <EmptyState
                title="No follow-ups"
                description="Generate follow-ups from real communication data."
              />
            ) : (
              <ul className="list">
                {followUps.map((item) => (
                  <li key={item.id}>
                    {item.subject} · {item.followUpType} · {item.recommendation}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}
      {!isLoading && activeTab === 'leads' ? (
        <div className="stack">
          {canManage ? (
            <Panel title="Detect lead signals">
              <Button onClick={() => void handleDetectLeads()}>Detect lead signals</Button>
            </Panel>
          ) : null}
          <Panel title="Lead & customer intelligence">
            {signals.length === 0 ? (
              <EmptyState
                title="No lead signals"
                description="Run detection after conversations are indexed."
              />
            ) : (
              <ul className="list">
                {signals.map((signal) => (
                  <li key={signal.id}>
                    <strong>{signal.subject}</strong> — {signal.recommendation}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}
      {!isLoading && activeTab === 'actions' ? (
        <div className="stack">
          {canManage ? (
            <Panel title="Draft business action">
              <form className="stack" onSubmit={handleCreateAction}>
                <Input
                  label="Subject"
                  value={actionSubject}
                  onChange={(e) => setActionSubject(e.target.value)}
                />
                <Input
                  label="Recommendation"
                  value={actionRecommendation}
                  onChange={(e) => setActionRecommendation(e.target.value)}
                />
                <Button type="submit">Draft for approval</Button>
              </form>
            </Panel>
          ) : null}
          <Panel title="Pending actions">
            {actions.length === 0 ? (
              <EmptyState
                title="No actions"
                description="Draft replies and business actions require approval before execution."
              />
            ) : (
              <ul className="list">
                {actions.map((action) => (
                  <li key={action.id}>
                    {action.subject} · {action.status} · {action.recommendation}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
