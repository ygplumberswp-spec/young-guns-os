import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { AGENT_REGISTRY, AI_NAME, type AgentKey, type AgentTaskSummary } from '@titan/shared';
import { hasAnyPermission } from '@titan/auth/browser';
import { useSearch } from 'wouter';
import { EmptyState, LoadingState } from '@titan/ui';
import { useAuth } from '../../lib/auth-context';
import {
  getCachedAgentRegistry,
  getCachedAiProviderConfigured,
  setCachedAgentRegistry,
  setCachedAiProviderConfigured,
} from '../../lib/aura-page-cache';
import { fetchAgentRegistry } from '../../lib/agents-api';
import { fetchAiProviders } from '../../lib/ai-orchestration-api-client';
import { AuraBusinessDashboard } from '../../features/aura/AuraBusinessDashboard';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraConversationList } from '../../features/aura/AuraConversationList';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';

export function AuraPage() {
  const { user, accessToken } = useAuth();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const customerId = searchParams.get('customerId') ?? undefined;
  const jobId = searchParams.get('jobId') ?? undefined;
  const vehicleId = searchParams.get('vehicleId') ?? undefined;
  const schedulingView = searchParams.get('scheduling') === '1';
  const [conversationMode, setConversationMode] = useState<'aura' | 'agent'>('agent');
  const [selectedAgentKey, setSelectedAgentKey] = useState<AgentKey>('executive');
  const [registry, setRegistry] = useState(() =>
    accessToken ? (getCachedAgentRegistry(accessToken) ?? AGENT_REGISTRY) : AGENT_REGISTRY,
  );
  const [aiProviderConfigured, setAiProviderConfigured] = useState<boolean | null>(() =>
    accessToken ? getCachedAiProviderConfigured(accessToken) : null,
  );

  const pageContext =
    customerId || jobId || vehicleId || schedulingView
      ? { customerId, jobId, vehicleId, schedulingView }
      : undefined;

  const {
    conversations,
    activeConversation,
    messages,
    agentMessages,
    pendingTasks,
    lastRunTools,
    isLoading,
    isSending,
    error,
    startConversation,
    selectConversation,
    sendMessage,
    sendAgentMessage,
    updateTask,
    removeConversation,
  } = useAuraChat(pageContext);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    void fetchAgentRegistry(accessToken)
      .then((nextRegistry) => {
        if (cancelled) {
          return;
        }

        setRegistry(nextRegistry);
        setCachedAgentRegistry(accessToken, nextRegistry);
      })
      .catch(() => {
        if (!cancelled) {
          setRegistry(AGENT_REGISTRY);
        }
      });

    void fetchAiProviders(accessToken)
      .then((providers) => {
        if (cancelled) {
          return;
        }

        const configured = providers.some(
          (provider) => provider.isConfigured && provider.credentialsConfigured,
        );
        setAiProviderConfigured(configured);
        setCachedAiProviderConfigured(accessToken, configured);
      })
      .catch(() => {
        if (!cancelled) {
          setAiProviderConfigured(false);
          setCachedAiProviderConfigured(accessToken, false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const contextLabel = schedulingView
    ? 'Scheduling context active'
    : vehicleId
      ? 'Vehicle context active'
      : jobId
        ? 'Job context active'
        : customerId
          ? 'Customer context active'
          : '';

  const activeAgent = useMemo(
    () => registry.find((entry) => entry.agentKey === selectedAgentKey) ?? registry[0],
    [registry, selectedAgentKey],
  );

  const canWriteMemory = useMemo(
    () => (user ? hasAnyPermission(user.permissions, ['intelligence:write']) : false),
    [user],
  );

  const canViewIntelligence = useMemo(
    () =>
      user
        ? hasAnyPermission(user.permissions, [
            'intelligence:read',
            'intelligence:write',
            'agents:read',
          ])
        : false,
    [user],
  );

  function handleTaskUpdated(task: AgentTaskSummary) {
    updateTask(task);
  }

  if (!user) {
    return null;
  }

  return (
    <div className="aura-page">
      <header className="aura-page__header">
        <div>
          <p className="aura-page__eyebrow">{AI_NAME} Intelligence</p>
          <h1 className="aura-page__title">Business Command Centre</h1>
          <p className="aura-page__subtitle">
            {user.companyName} · {user.firstName} {user.lastName}
            {contextLabel ? ` · ${contextLabel}` : ''}
          </p>
        </div>
        <div className="aura-page__controls">
          <label className="aura-mode-toggle">
            <span>Mode</span>
            <select
              className="titan-input"
              value={conversationMode}
              onChange={(event) => setConversationMode(event.target.value as 'aura' | 'agent')}
            >
              <option value="agent">Operational agent</option>
              <option value="aura">General conversation</option>
            </select>
          </label>
          {conversationMode === 'agent' ? (
            <label className="aura-mode-toggle">
              <span>Agent</span>
              <select
                className="titan-input"
                value={selectedAgentKey}
                onChange={(event) => setSelectedAgentKey(event.target.value as AgentKey)}
              >
                {registry.map((entry) => (
                  <option key={entry.agentKey} value={entry.agentKey}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </header>

      {canViewIntelligence && accessToken ? (
        <AuraBusinessDashboard accessToken={accessToken} canWriteMemory={canWriteMemory} />
      ) : null}

      {aiProviderConfigured === false ? (
        <EmptyState
          title="AI provider not configured"
          description="Configure an AI provider with valid credentials before sending messages to AURA."
          action={
            <Link href="/integrations">
              <button type="button" className="titan-button titan-button--secondary">
                Integration settings
              </button>
            </Link>
          }
        />
      ) : null}

      <div className="aura-layout">
        <AuraConversationList
          conversations={conversations}
          activeConversationId={activeConversation?.id ?? null}
          onSelect={(id) => void selectConversation(id)}
          onCreate={() => void startConversation()}
          onDelete={(id) => void removeConversation(id)}
        />

        <section className="aura-chat">
          {conversationMode === 'agent' && activeAgent ? (
            <div className="aura-agent-banner">
              <strong>{activeAgent.name}</strong>
              <span>{activeAgent.description}</span>
            </div>
          ) : null}

          {error ? <p className="aura-chat__error">{error}</p> : null}

          {isLoading ? (
            <LoadingState label="Loading AURA conversations" />
          ) : conversationMode === 'agent' ? (
            <>
              <AuraMessageList messages={agentMessages} isSending={isSending} />
              {lastRunTools.length > 0 ? (
                <div className="aura-tool-activity">
                  <p className="aura-tool-activity__title">Tool activity</p>
                  <ul>
                    {lastRunTools.map((tool) => (
                      <li key={tool}>{tool}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {pendingTasks.length > 0 ? (
                <div className="aura-task-list">
                  <p className="aura-task-list__title">Pending approvals</p>
                  {pendingTasks.map((task) => (
                    <AuraTaskApprovalCard
                      key={task.id}
                      task={task}
                      accessToken={accessToken ?? ''}
                      onUpdated={handleTaskUpdated}
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <AuraMessageList messages={messages} isSending={isSending} />
          )}

          {conversationMode === 'agent' ? (
            <AuraComposer
              onSend={(content) => void sendAgentMessage(content, selectedAgentKey)}
              disabled={isSending || aiProviderConfigured === false}
              placeholder={
                aiProviderConfigured === false
                  ? 'Configure an AI provider to send messages'
                  : `Ask the ${activeAgent?.name ?? 'agent'}…`
              }
            />
          ) : (
            <AuraComposer
              onSend={sendMessage}
              disabled={isSending || aiProviderConfigured === false}
              placeholder={
                aiProviderConfigured === false
                  ? 'Configure an AI provider to send messages'
                  : undefined
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}
