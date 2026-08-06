import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
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
          title="Access Restricted"
          description="You do not have permission to view personal communications intelligence."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'conversations', label: 'Conversations' },
    { id: 'followups', label: 'Follow-Ups' },
    { id: 'leads', label: 'Lead Signals' },
    { id: 'actions', label: 'Actions' },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Personal Communications Intelligence"
        description="Company-scoped intelligence over Business WhatsApp messages (`personal_comm_*`). Distinct from Personal WhatsApp Assistant and Personal WhatsApp Intelligence."
      />
      <Panel title="What this module is (and is not)">
        <p className="page-muted">
          <strong>This page (PCI)</strong> indexes real Business WhatsApp messages for lead/follow-up
          intelligence. It does not ingest Personal WhatsApp sessions.
        </p>
        <p className="page-muted">
          <strong>Personal WhatsApp Assistant</strong> (`personal_whatsapp`) is a separate Platform
          Owner–only credential path on the Communications Hub — private by default, never
          auto-imported, never mixed into Business WhatsApp.
        </p>
        <p className="page-muted">
          <strong>Personal WhatsApp Intelligence</strong> classifies those owner-scoped personal
          threads and queues CRM/timeline links + AURA drafts for explicit Owner approval.{' '}
          <a href="/personal-whatsapp-intelligence">Open Personal WhatsApp Intelligence</a>
        </p>
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
      {!isLoading && activeTab === 'dashboard' && dashboard ? (
        <div className="stack">
          {canManage ? (
            <Panel title="Sync WhatsApp Conversations">
              <p>
                Index real WhatsApp messages into business conversations. No messages are sent
                automatically.
              </p>
              <Button onClick={() => void handleSync()}>Sync Conversations</Button>
            </Panel>
          ) : null}
          <div className="stat-grid">
            <StatCard
              label="Business Conversations"
              value={String(dashboard.totalBusinessConversations)}
            />
            <StatCard
              label="Personal Conversations"
              value={String(dashboard.totalPersonalConversations)}
            />
            <StatCard label="New Leads" value={String(dashboard.newLeadsDetected)} />
            <StatCard label="Follow-Ups" value={String(dashboard.pendingFollowUpCount)} />
            <StatCard label="Pending Actions" value={String(dashboard.pendingActionCount)} />
            <StatCard label="Voice Notes Processed" value={String(dashboard.voiceNotesProcessed)} />
            <StatCard label="Documents Analysed" value={String(dashboard.documentsAnalysed)} />
            <StatCard
              label="WhatsApp"
              value={dashboard.whatsappConnected ? 'Connected' : 'Disconnected'}
            />
          </div>
          <Panel title="Executive Summary">
            <p>{dashboard.summary}</p>
          </Panel>
        </div>
      ) : null}
      {!isLoading && activeTab === 'conversations' ? (
        <Panel title="Business Conversations">
          {conversations.length === 0 ? (
            <EmptyState
              title="No Conversations Indexed"
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
            <Panel title="Generate Follow-Up Queue">
              <Button onClick={() => void handleGenerateFollowUps()}>Generate Follow-Ups</Button>
            </Panel>
          ) : null}
          <Panel title="Follow-Up Queue">
            {followUps.length === 0 ? (
              <EmptyState
                title="No Follow-Ups"
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
            <Panel title="Detect Lead Signals">
              <Button onClick={() => void handleDetectLeads()}>Detect Lead Signals</Button>
            </Panel>
          ) : null}
          <Panel title="Lead & Customer Intelligence">
            {signals.length === 0 ? (
              <EmptyState
                title="No Lead Signals"
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
            <Panel title="Draft Business Action">
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
                <Button type="submit">Draft For Approval</Button>
              </form>
            </Panel>
          ) : null}
          <Panel title="Pending Actions">
            {actions.length === 0 ? (
              <EmptyState
                title="No Actions"
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
