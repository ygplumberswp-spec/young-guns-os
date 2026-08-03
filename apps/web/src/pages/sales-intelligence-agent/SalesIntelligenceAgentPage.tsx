import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type {
  SalesIntelligenceAgentDashboard,
  SalesIntelligenceQuestionAnswer,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  askSalesIntelligenceQuestion,
  createSalesIntelligenceRecommendation,
  decideSalesIntelligenceRecommendation,
  fetchSalesIntelligenceDashboard,
  generateSalesIntelligenceRecommendations,
  refreshSalesIntelligenceInsights,
  refreshSalesIntelligenceSignals,
  registerSalesIntelligenceAgent,
  SalesIntelligenceAgentApiClientError,
} from '../../lib/sales-intelligence-agent-api-client';

type Tab =
  | 'dashboard'
  | 'hunting'
  | 'qualification'
  | 'pipeline'
  | 'recommendations'
  | 'insights'
  | 'ask'
  | 'aura';

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  if (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner'
  ) {
    return true;
  }
  return (
    permissions.includes('*') ||
    permissions.includes('sales:read') ||
    permissions.includes('sales:write') ||
    permissions.includes('sales_intelligence:read') ||
    permissions.includes('sales_intelligence:write') ||
    permissions.includes('sales_intelligence:manage') ||
    permissions.includes('leads:read') ||
    permissions.includes('leads:write') ||
    permissions.includes('agents:read')
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  if (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner'
  ) {
    return true;
  }
  return (
    permissions.includes('*') ||
    permissions.includes('sales:write') ||
    permissions.includes('sales_intelligence:write') ||
    permissions.includes('sales_intelligence:manage') ||
    permissions.includes('leads:write') ||
    permissions.includes('agents:write')
  );
}

function canApprove(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  if (permissions.includes('*')) return true;
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner'
  );
}

export function SalesIntelligenceAgentPage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<SalesIntelligenceAgentDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<SalesIntelligenceQuestionAnswer | null>(null);
  const [recTitle, setRecTitle] = useState('');
  const [recBody, setRecBody] = useState('');

  const canView = useMemo(
    () => (user ? canAccess(user.permissions, user.roleName) : false),
    [user],
  );
  const canManage = useMemo(
    () => (user ? canWrite(user.permissions, user.roleName) : false),
    [user],
  );
  const canOwnerApprove = useMemo(
    () => (user ? canApprove(user.permissions, user.roleName) : false),
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    const data = await fetchSalesIntelligenceDashboard(accessToken);
    setDashboard(data);
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        setError(null);
        await loadPage();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof SalesIntelligenceAgentApiClientError
              ? err.message
              : 'Unable to load Sales Intelligence Agent',
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

  async function handleRegister() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await registerSalesIntelligenceAgent(accessToken);
      setSuccess('Sales agent registered / refreshed in Command Centre registry.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof SalesIntelligenceAgentApiClientError
          ? err.message
          : 'Unable to register Sales agent',
      );
    }
  }

  async function handleGenerateRecommendations() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      const created = await generateSalesIntelligenceRecommendations(accessToken);
      setSuccess(
        created.length === 0
          ? 'No grounded signals for new draft recommendations.'
          : `${created.length} draft recommendation(s) queued for Owner approval — no outreach was sent.`,
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof SalesIntelligenceAgentApiClientError
          ? err.message
          : 'Unable to generate recommendations',
      );
    }
  }

  async function handleCreateRecommendation(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canManage || !recTitle.trim() || !recBody.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      await createSalesIntelligenceRecommendation(accessToken, {
        kind: 'owner_decision',
        title: recTitle.trim(),
        recommendation: recBody.trim(),
      });
      setRecTitle('');
      setRecBody('');
      setSuccess('Recommendation queued for Owner approval — not auto-sent.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof SalesIntelligenceAgentApiClientError
          ? err.message
          : 'Unable to create recommendation',
      );
    }
  }

  async function handleDecideRec(id: string, decision: 'approve' | 'reject') {
    if (!accessToken || !canOwnerApprove) return;
    setError(null);
    setSuccess(null);
    try {
      await decideSalesIntelligenceRecommendation(accessToken, id, { decision });
      setSuccess(
        decision === 'approve'
          ? 'Recommendation approved (decision recorded only — no outreach sent).'
          : 'Recommendation rejected.',
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof SalesIntelligenceAgentApiClientError
          ? err.message
          : 'Unable to decide recommendation',
      );
    }
  }

  async function handleRefreshInsights() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await refreshSalesIntelligenceInsights(accessToken);
      setSuccess('Insights refreshed from real TITAN CRM / leads / pipeline records.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof SalesIntelligenceAgentApiClientError
          ? err.message
          : 'Unable to refresh insights',
      );
    }
  }

  async function handleRefreshSignals() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await refreshSalesIntelligenceSignals(accessToken);
      setSuccess('Opportunity signals refreshed from real leads/quotes/pipeline only.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof SalesIntelligenceAgentApiClientError
          ? err.message
          : 'Unable to refresh signals',
      );
    }
  }

  async function handleAsk(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canView || !question.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      const result = await askSalesIntelligenceQuestion(accessToken, { question: question.trim() });
      setAnswer(result);
      setSuccess('Answer grounded in real TITAN sales context only — no outreach sent.');
    } catch (err) {
      setError(
        err instanceof SalesIntelligenceAgentApiClientError
          ? err.message
          : 'Unable to answer sales question',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Sales Intelligence Agent"
          description="Owner-gated sales intelligence over real TITAN CRM leads, pipeline, and quotes."
        />
        <EmptyState
          title="Access restricted"
          description="Requires Company/Platform Owner or sales/leads access. Technician and Client roles are denied."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Intelligence Agent"
        description="Lead hunting, qualification, pipeline insights, and draft outreach recommendations grounded in real TITAN data. Owner approval required — never auto-sends outreach."
      />

      <p className="text-sm text-zinc-400">
        <Link href="/sales-intelligence" className="text-cyan-300 hover:underline">
          Sales Intelligence
        </Link>
        {' · '}
        <Link href="/leads" className="text-cyan-300 hover:underline">
          Leads
        </Link>
        {' · '}
        <Link href="/sales" className="text-cyan-300 hover:underline">
          Sales pipeline
        </Link>
        {' · '}
        <Link href="/finance/quotes" className="text-cyan-300 hover:underline">
          Quotes
        </Link>
        {' · '}
        <Link href="/aura/command-centre" className="text-cyan-300 hover:underline">
          Command Centre
        </Link>
      </p>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['dashboard', 'Dashboard'],
            ['hunting', 'Hunting'],
            ['qualification', 'Qualification'],
            ['pipeline', 'Pipeline'],
            ['recommendations', 'Recommendations'],
            ['insights', 'Insights'],
            ['ask', 'Ask'],
            ['aura', 'AURA links'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === key
                ? 'bg-cyan-700/40 text-cyan-100 ring-1 ring-cyan-500/50'
                : 'bg-zinc-900 text-zinc-300 ring-1 ring-zinc-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <Panel title="Error" className="border-rose-500/40 bg-rose-950/30 text-rose-100">
          {error}
        </Panel>
      ) : null}
      {success ? (
        <Panel title="Status" className="border-cyan-500/40 bg-cyan-950/20 text-cyan-100">
          {success}
        </Panel>
      ) : null}

      {isLoading ? (
        <Panel title="Loading">Loading Sales Intelligence Agent…</Panel>
      ) : !dashboard ? (
        <EmptyState
          title="No data"
          description="Unable to load Sales Intelligence Agent dashboard."
        />
      ) : (
        <>
          {tab === 'dashboard' ? (
            <div className="space-y-6">
              <Panel title="Honesty" className="border-zinc-800 bg-zinc-950/80">
                <p className="text-sm text-zinc-300">{dashboard.summary}</p>
                <ul className="mt-3 space-y-1 text-xs text-zinc-400">
                  <li>{dashboard.productClarification.thisLayer}</li>
                  <li>{dashboard.productClarification.existingCrmLeads}</li>
                  <li>
                    Registry: {dashboard.registry.commandCentreStatus} — {dashboard.registry.note}
                  </li>
                </ul>
                <p className="mt-2 text-xs text-cyan-300/80">
                  Auto-outreach: off · Owner approval required · Technician/Client: denied · Spam:
                  prohibited · Fake data: never
                </p>
                {canManage ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" onClick={() => void handleRegister()}>
                      Register / refresh agent identity
                    </Button>
                    <Button type="button" onClick={() => void handleRefreshSignals()}>
                      Refresh opportunity signals
                    </Button>
                  </div>
                ) : null}
              </Panel>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Leads" value={String(dashboard.businessContext.leadCount)} />
                <StatCard
                  label="Open opportunities"
                  value={String(dashboard.businessContext.openOpportunityCount)}
                />
                <StatCard label="Quotes" value={String(dashboard.businessContext.quoteCount)} />
                <StatCard
                  label="Active signals"
                  value={String(dashboard.signals.filter((s) => !s.dismissed).length)}
                />
              </div>

              <Panel title="Business sales context" className="border-zinc-800 bg-zinc-950/80">
                <p className="text-sm text-zinc-300">{dashboard.businessContext.summary}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  Availability: {dashboard.businessContext.availability} · Conversions:{' '}
                  {dashboard.businessContext.conversionCount}
                </p>
              </Panel>
            </div>
          ) : null}

          {tab === 'hunting' ? (
            <div className="space-y-4">
              <Panel title="Lead hunting" className="border-zinc-800 bg-zinc-950/80">
                <p className="text-sm text-zinc-300">
                  {dashboard.businessContext.leadHunting.summary}
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  Availability: {dashboard.businessContext.leadHunting.availability} · Lead sources:{' '}
                  {dashboard.businessContext.leadHunting.leadSourceCount} · High-score leads:{' '}
                  {dashboard.businessContext.leadHunting.highScoreLeadCount} · Unconverted quotes:{' '}
                  {dashboard.businessContext.leadHunting.unconvertedQuoteCount}
                </p>
              </Panel>
              {canManage ? (
                <Panel title="Refresh signals" className="border-zinc-800 bg-zinc-950/80">
                  <p className="mb-3 text-sm text-zinc-400">
                    Rebuilds opportunity signals from stored lead sources, quotes, and pipeline rows
                    only — no invented leads.
                  </p>
                  <Button type="button" onClick={() => void handleRefreshSignals()}>
                    Refresh hunting signals
                  </Button>
                </Panel>
              ) : null}
            </div>
          ) : null}

          {tab === 'qualification' ? (
            <div className="space-y-4">
              {dashboard.businessContext.qualificationSamples.length === 0 ? (
                <EmptyState
                  title="No qualification samples"
                  description="Open leads with scores, needs, or linked quote values will appear here. Scores are not invented when signals are missing."
                />
              ) : (
                dashboard.businessContext.qualificationSamples.map((sample) => (
                  <Panel
                    key={sample.leadId}
                    title={sample.title}
                    className="border-zinc-800 bg-zinc-950/80"
                  >
                    <p className="text-sm text-zinc-300">
                      Status: {sample.status} · Urgency: {sample.urgencyLabel}
                      {sample.score != null ? ` · Score: ${sample.score}` : ''}
                    </p>
                    {sample.needsSummary ? (
                      <p className="mt-2 text-xs text-zinc-400">{sample.needsSummary}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-zinc-500">
                      Availability: {sample.availability}
                      {sample.potentialValueCents != null
                        ? ` · Linked quote value: ${sample.potentialValueCents / 100}`
                        : ''}
                    </p>
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'pipeline' ? (
            <div className="space-y-4">
              <Panel title="Sales pipeline" className="border-zinc-800 bg-zinc-950/80">
                <p className="text-sm text-zinc-300">{dashboard.businessContext.pipeline.summary}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  Availability: {dashboard.businessContext.pipeline.availability} · Stages:{' '}
                  {dashboard.businessContext.pipeline.stageCount} · Follow-ups due:{' '}
                  {dashboard.businessContext.pipeline.followUpDueCount}
                </p>
              </Panel>
            </div>
          ) : null}

          {tab === 'recommendations' ? (
            <div className="space-y-4">
              {canManage ? (
                <>
                  <Panel title="Generate from real signals" className="border-zinc-800 bg-zinc-950/80">
                    <p className="mb-3 text-sm text-zinc-400">
                      Creates draft recommendations from high-score leads, unconverted quotes, and
                      pipeline signals. Owner approval required — no outreach is sent.
                    </p>
                    <Button type="button" onClick={() => void handleGenerateRecommendations()}>
                      Generate draft recommendations
                    </Button>
                  </Panel>
                  <Panel title="Manual Owner decision draft" className="border-zinc-800 bg-zinc-950/80">
                    <form className="space-y-3" onSubmit={handleCreateRecommendation}>
                      <label className="flex flex-col gap-1 text-sm text-zinc-300">
                        Title
                        <Input
                          value={recTitle}
                          onChange={(e) => setRecTitle(e.target.value)}
                          placeholder="Recommendation title"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm text-zinc-300">
                        Detail
                        <Input
                          value={recBody}
                          onChange={(e) => setRecBody(e.target.value)}
                          placeholder="What should the Owner consider?"
                        />
                      </label>
                      <Button type="submit">Queue for Owner approval</Button>
                    </form>
                  </Panel>
                </>
              ) : null}

              {dashboard.recommendations.length === 0 ? (
                <EmptyState
                  title="No recommendations"
                  description="No recommendation drafts yet. Generate from real signals when ready — no demo recommendations are seeded."
                />
              ) : (
                dashboard.recommendations.map((r) => (
                  <Panel key={r.id} title={r.title} className="border-zinc-800 bg-zinc-950/80">
                    <p className="text-sm text-zinc-300">{r.recommendation}</p>
                    {r.draftOutreach ? (
                      <p className="mt-2 text-xs text-zinc-400">Draft outreach: {r.draftOutreach}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-zinc-500">
                      {r.kind} · {r.status} · Auto-sent: never · Outreach sent: never
                    </p>
                    {canOwnerApprove && r.status === 'pending_approval' ? (
                      <div className="mt-3 flex gap-2">
                        <Button type="button" onClick={() => void handleDecideRec(r.id, 'approve')}>
                          Approve
                        </Button>
                        <Button type="button" onClick={() => void handleDecideRec(r.id, 'reject')}>
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'insights' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Refresh insights" className="border-zinc-800 bg-zinc-950/80">
                  <p className="mb-3 text-sm text-zinc-400">
                    Rebuilds insights from current TITAN leads, pipeline, quotes, and conversions
                    only.
                  </p>
                  <Button type="button" onClick={() => void handleRefreshInsights()}>
                    Refresh insights
                  </Button>
                </Panel>
              ) : null}
              {dashboard.insights.length === 0 ? (
                <EmptyState
                  title="No insights stored"
                  description="Refresh insights when CRM/sales records exist. Empty tenants stay honestly unavailable."
                />
              ) : (
                dashboard.insights.map((insight) => (
                  <Panel
                    key={insight.id}
                    title={insight.title}
                    className="border-zinc-800 bg-zinc-950/80"
                  >
                    <p className="text-sm text-zinc-300">{insight.body}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {insight.kind} · leads {insight.sourceLeadCount} · opportunities{' '}
                      {insight.sourceOpportunityCount} · quotes {insight.sourceQuoteCount}
                    </p>
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'ask' ? (
            <div className="space-y-4">
              <Panel title="Owner decision support" className="border-zinc-800 bg-zinc-950/80">
                <form className="space-y-3" onSubmit={handleAsk}>
                  <label className="flex flex-col gap-1 text-sm text-zinc-300">
                    Sales question
                    <Input
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="e.g. What leads are priority? Pipeline status? Best next action?"
                    />
                  </label>
                  <Button type="submit">Ask (read-only — no outreach)</Button>
                </form>
              </Panel>
              {answer ? (
                <Panel title="Answer" className="border-zinc-800 bg-zinc-950/80">
                  <p className="text-sm text-zinc-300">{answer.answer}</p>
                  <p className="mt-2 text-xs text-zinc-500">
                    Availability: {answer.availability} · Grounded in:{' '}
                    {answer.groundedIn.length ? answer.groundedIn.join(', ') : 'none'} · Outreach
                    sent: never
                  </p>
                </Panel>
              ) : null}
            </div>
          ) : null}

          {tab === 'aura' ? (
            <div className="space-y-4">
              <Panel title="Agent identity" className="border-zinc-800 bg-zinc-950/80">
                <p className="text-sm text-zinc-300">{dashboard.identity.name}</p>
                <p className="mt-2 text-xs text-zinc-500">{dashboard.identity.description}</p>
                <p className="mt-2 text-xs text-cyan-300/80">
                  Keys: Command Centre / Agent Network / Global ={' '}
                  {dashboard.identity.registry.commandCentreKey} · Chat ={' '}
                  {dashboard.identity.registry.chatAgentKey}
                </p>
              </Panel>
              {dashboard.auraConnections.map((link) => (
                <Panel key={link.target} title={link.label} className="border-zinc-800 bg-zinc-950/80">
                  <p className="text-sm text-zinc-400">{link.note}</p>
                  <Link href={link.href} className="mt-2 inline-block text-sm text-cyan-300 hover:underline">
                    Open {link.href}
                  </Link>
                </Panel>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
