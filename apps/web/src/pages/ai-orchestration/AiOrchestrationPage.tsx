import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Input, PageHeader, Panel, StatCard } from '@titan/ui';
import type { AiExecutiveDashboard, AiProviderSummary, CreateAiProviderRequest } from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import {
  AiOrchestrationApiClientError,
  createAiConfigurationAction,
  createAiPromptTemplate,
  createAiProvider,
  fetchAiConfigurationActions,
  fetchAiModels,
  fetchAiOrchestrationDashboard,
  fetchAiPromptTemplates,
  fetchAiPromptVersions,
  fetchAiProviders,
  fetchAiRouting,
} from '../../lib/ai-orchestration-api-client';

type AiTab = 'dashboard' | 'providers' | 'routing' | 'prompts' | 'costs' | 'quality' | 'actions';

function canAccess(permissions: string[]) {
  return (
    permissions.includes('ai_orchestration:read') ||
    permissions.includes('ai_orchestration:write') ||
    permissions.includes('agents:read') ||
    permissions.includes('executive:read') ||
    permissions.includes('*')
  );
}

function canWrite(permissions: string[]) {
  return (
    permissions.includes('ai_orchestration:write') ||
    permissions.includes('agents:write') ||
    permissions.includes('*')
  );
}

export function AiOrchestrationPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<AiTab>('dashboard');
  const [dashboard, setDashboard] = useState<AiExecutiveDashboard | null>(null);
  const [providers, setProviders] = useState<AiProviderSummary[]>([]);
  const [models, setModels] = useState<Awaited<ReturnType<typeof fetchAiModels>>>([]);
  const [routingRules, setRoutingRules] = useState<Awaited<ReturnType<typeof fetchAiRouting>>>([]);
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof fetchAiPromptTemplates>>>([]);
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof fetchAiPromptVersions>>>([]);
  const [actions, setActions] = useState<Awaited<ReturnType<typeof fetchAiConfigurationActions>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [providerKey, setProviderKey] = useState('openai');
  const [promptName, setPromptName] = useState('');
  const [promptContent, setPromptContent] = useState('');
  const [actionSubject, setActionSubject] = useState('');
  const [actionRecommendation, setActionRecommendation] = useState('');

  const canView = useMemo(() => (user ? canAccess(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canWrite(user.permissions) : false), [user]);

  async function loadPage() {
    if (!accessToken) return;
    const [
      dashboardData,
      providerRows,
      modelRows,
      routingRows,
      templateRows,
      versionRows,
      actionRows,
    ] = await Promise.all([
      fetchAiOrchestrationDashboard(accessToken),
      fetchAiProviders(accessToken),
      fetchAiModels(accessToken),
      fetchAiRouting(accessToken),
      fetchAiPromptTemplates(accessToken),
      fetchAiPromptVersions(accessToken),
      fetchAiConfigurationActions(accessToken),
    ]);
    setDashboard(dashboardData);
    setProviders(providerRows);
    setModels(modelRows);
    setRoutingRules(routingRows);
    setTemplates(templateRows);
    setVersions(versionRows);
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
          setError(err instanceof AiOrchestrationApiClientError ? err.message : 'Unable to load AI orchestration data');
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

  async function handleCreateProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage) return;

    try {
      setError(null);
      await createAiProvider(accessToken, { providerKey: providerKey as CreateAiProviderRequest['providerKey'] });
      setSuccess('Provider configuration saved. Enable and configure credentials to activate.');
      await loadPage();
    } catch (err) {
      setError(err instanceof AiOrchestrationApiClientError ? err.message : 'Unable to create provider');
    }
  }

  async function handleCreatePrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage || !promptName.trim() || !promptContent.trim()) return;

    try {
      setError(null);
      await createAiPromptTemplate(accessToken, {
        templateKey: promptName.trim().toLowerCase().replace(/\s+/g, '_'),
        category: 'agent',
        name: promptName.trim(),
        content: promptContent.trim(),
      });
      setSuccess('Prompt version created and pending approval.');
      setPromptName('');
      setPromptContent('');
      await loadPage();
    } catch (err) {
      setError(err instanceof AiOrchestrationApiClientError ? err.message : 'Unable to create prompt');
    }
  }

  async function handleCreateAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canManage || !actionSubject.trim() || !actionRecommendation.trim()) return;

    try {
      setError(null);
      await createAiConfigurationAction(accessToken, {
        actionType: 'provider_configuration',
        subject: actionSubject.trim(),
        recommendation: actionRecommendation.trim(),
      });
      setSuccess('Configuration action submitted for approval.');
      setActionSubject('');
      setActionRecommendation('');
      await loadPage();
    } catch (err) {
      setError(err instanceof AiOrchestrationApiClientError ? err.message : 'Unable to create action');
    }
  }

  if (!canView) {
    return (
      <EmptyState
        title="AI orchestration unavailable"
        description="You do not have permission to view AI orchestration."
      />
    );
  }

  const tabs: Array<{ id: AiTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'providers', label: 'Providers' },
    { id: 'routing', label: 'Routing' },
    { id: 'prompts', label: 'Prompts' },
    { id: 'costs', label: 'Costs' },
    { id: 'quality', label: 'Quality' },
    { id: 'actions', label: 'Actions' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Orchestration"
        description="Multi-model provider registry, routing, prompt management, cost intelligence, and quality analytics."
      />

      {error ? <Panel title="Error" className="border-red-200 bg-red-50 text-red-700">{error}</Panel> : null}
      {success ? <Panel title="Success" className="border-green-200 bg-green-50 text-green-700">{success}</Panel> : null}

      <div className="flex flex-wrap gap-2">
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

      {isLoading ? <Panel title="Loading">Loading AI orchestration data…</Panel> : null}

      {!isLoading && activeTab === 'dashboard' && dashboard ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Providers" value={String(dashboard.providerCount)} />
            <StatCard label="Healthy" value={String(dashboard.healthyProviderCount)} />
            <StatCard label="Pending actions" value={String(dashboard.pendingActionCount)} />
            <StatCard label="Total tokens" value={String(dashboard.costAnalytics.totalTokens)} />
          </div>
          <Panel title="Executive summary">
            <p className="text-sm text-slate-600">{dashboard.summary}</p>
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'providers' ? (
        <div className="space-y-4">
          {canManage ? (
            <Panel title="Register provider">
              <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateProvider}>
                <label className="text-sm">
                  Provider
                  <select
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    value={providerKey}
                    onChange={(event) => setProviderKey(event.target.value)}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="google_gemini">Google Gemini</option>
                    <option value="anthropic_claude">Anthropic Claude</option>
                    <option value="ollama">Ollama</option>
                    <option value="azure_openai">Azure OpenAI</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <Button type="submit">Save provider configuration</Button>
                </div>
              </form>
            </Panel>
          ) : null}

          <Panel title="Provider registry">
            {providers.length === 0 ? (
              <EmptyState title="No providers configured" description="Register a provider to begin multi-model routing." />
            ) : (
              <ul className="divide-y divide-slate-200">
                {providers.map((provider) => (
                  <li key={`${provider.providerKey}-${provider.id ?? 'registry'}`} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{provider.name}</p>
                        <p className="text-sm text-slate-500">
                          {provider.providerKey} · {provider.source} · {provider.healthStatus}
                        </p>
                      </div>
                      <span className="text-sm text-slate-600">
                        {provider.isConfigured ? 'Configured' : 'Not configured'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Model capabilities">
            {models.length === 0 ? (
              <EmptyState title="No models registered" description="Models appear when providers are configured." />
            ) : (
              <ul className="divide-y divide-slate-200">
                {models.map((model) => (
                  <li key={`${model.providerKey}-${model.modelKey}-${model.id ?? 'env'}`} className="py-3">
                    <p className="font-medium">{model.displayName}</p>
                    <p className="text-sm text-slate-500">
                      {model.providerName} · context {model.contextWindow.toLocaleString()} ·{' '}
                      {model.capabilities.join(', ') || 'No capabilities recorded'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'routing' ? (
        <Panel title="Routing rules">
          {routingRules.length === 0 ? (
            <EmptyState title="No routing rules" description="Create routing rules to control model selection by task category." />
          ) : (
            <ul className="divide-y divide-slate-200">
              {routingRules.map((rule) => (
                <li key={rule.id} className="py-3">
                  <p className="font-medium">{rule.category}</p>
                  <p className="text-sm text-slate-500">
                    {rule.routingMode} · priority {rule.priorityOrder} ·{' '}
                    {rule.primaryModelKey ?? 'No primary model selected'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {!isLoading && activeTab === 'prompts' ? (
        <div className="space-y-4">
          {canManage ? (
            <Panel title="Create prompt template">
              <form className="space-y-3" onSubmit={handleCreatePrompt}>
                <Input label="Template name" value={promptName} onChange={(event) => setPromptName(event.target.value)} />
                <label className="block text-sm">
                  Prompt content
                  <textarea
                    className="mt-1 min-h-32 w-full rounded border border-slate-300 px-3 py-2"
                    value={promptContent}
                    onChange={(event) => setPromptContent(event.target.value)}
                  />
                </label>
                <Button type="submit">Submit for approval</Button>
              </form>
            </Panel>
          ) : null}

          <Panel title="Prompt templates">
            {templates.length === 0 ? (
              <EmptyState title="No prompt templates" description="Create centralized prompt templates with approval workflow." />
            ) : (
              <ul className="divide-y divide-slate-200">
                {templates.map((template) => (
                  <li key={template.id} className="py-3">
                    <p className="font-medium">{template.name}</p>
                    <p className="text-sm text-slate-500">
                      {template.templateKey} · {template.category}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Prompt versions">
            {versions.length === 0 ? (
              <EmptyState title="No prompt versions" description="Version history appears after templates are created." />
            ) : (
              <ul className="divide-y divide-slate-200">
                {versions.map((version) => (
                  <li key={version.id} className="py-3">
                    <p className="font-medium">
                      {version.templateName} v{version.versionNumber}
                    </p>
                    <p className="text-sm text-slate-500">{version.status}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'costs' && dashboard ? (
        <Panel title="Cost intelligence">
          <div className="grid gap-4 md:grid-cols-2">
            <StatCard label="Total cost (cents)" value={String(dashboard.costAnalytics.totalCostCents)} />
            <StatCard label="Total tokens" value={String(dashboard.costAnalytics.totalTokens)} />
          </div>
          {dashboard.costAnalytics.recommendations.length > 0 ? (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-600">
              {dashboard.costAnalytics.recommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </Panel>
      ) : null}

      {!isLoading && activeTab === 'quality' && dashboard ? (
        <Panel title="Quality analytics">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Evaluations" value={String(dashboard.qualityAnalytics.evaluationCount)} />
            <StatCard
              label="Success rate"
              value={
                dashboard.qualityAnalytics.successRate !== null
                  ? `${Math.round(dashboard.qualityAnalytics.successRate * 100)}%`
                  : '—'
              }
            />
            <StatCard
              label="Avg response time"
              value={
                dashboard.qualityAnalytics.averageResponseTimeMs !== null
                  ? `${dashboard.qualityAnalytics.averageResponseTimeMs} ms`
                  : '—'
              }
            />
            <StatCard label="Hallucination reports" value={String(dashboard.qualityAnalytics.hallucinationReportCount)} />
          </div>
        </Panel>
      ) : null}

      {!isLoading && activeTab === 'actions' ? (
        <div className="space-y-4">
          {canManage ? (
            <Panel title="Draft configuration action">
              <form className="space-y-3" onSubmit={handleCreateAction}>
                <Input label="Subject" value={actionSubject} onChange={(event) => setActionSubject(event.target.value)} />
                <label className="block text-sm">
                  Recommendation
                  <textarea
                    className="mt-1 min-h-24 w-full rounded border border-slate-300 px-3 py-2"
                    value={actionRecommendation}
                    onChange={(event) => setActionRecommendation(event.target.value)}
                  />
                </label>
                <Button type="submit">Submit for approval</Button>
              </form>
            </Panel>
          ) : null}

          <Panel title="Pending and recent actions">
            {actions.length === 0 ? (
              <EmptyState title="No configuration actions" description="Draft prompt or provider changes require approval before execution." />
            ) : (
              <ul className="divide-y divide-slate-200">
                {actions.map((action) => (
                  <li key={action.id} className="py-3">
                    <p className="font-medium">{action.subject}</p>
                    <p className="text-sm text-slate-500">
                      {action.actionType} · {action.status}
                    </p>
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
