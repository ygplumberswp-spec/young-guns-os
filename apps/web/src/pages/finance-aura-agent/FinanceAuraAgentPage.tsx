import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { FinanceAuraAgentDashboard, FinanceAuraQuestionAnswer } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  acknowledgeFinanceAuraAlert,
  askFinanceAuraQuestion,
  createFinanceAuraRecommendation,
  decideFinanceAuraRecommendation,
  fetchFinanceAuraDashboard,
  FinanceAuraAgentApiClientError,
  generateFinanceAuraRecommendations,
  refreshFinanceAuraAlerts,
  refreshFinanceAuraInsights,
  registerFinanceAuraAgent,
} from '../../lib/finance-aura-agent-api-client';

type Tab = 'dashboard' | 'recommendations' | 'insights' | 'alerts' | 'ask' | 'aura';

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
    permissions.includes('finance:read') ||
    permissions.includes('finance:write')
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
  return permissions.includes('*') || permissions.includes('finance:write');
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

export function FinanceAuraAgentPage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<FinanceAuraAgentDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<FinanceAuraQuestionAnswer | null>(null);
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
    const data = await fetchFinanceAuraDashboard(accessToken);
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
            err instanceof FinanceAuraAgentApiClientError
              ? err.message
              : 'Unable to load Finance AURA Agent',
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
      await registerFinanceAuraAgent(accessToken);
      setSuccess('Finance agent registered / refreshed in Command Centre registry.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FinanceAuraAgentApiClientError
          ? err.message
          : 'Unable to register Finance agent',
      );
    }
  }

  async function handleGenerateRecommendations() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      const created = await generateFinanceAuraRecommendations(accessToken);
      setSuccess(
        created.length === 0
          ? 'No grounded signals for new draft recommendations.'
          : `${created.length} draft recommendation(s) queued for Owner approval — nothing auto-executed.`,
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FinanceAuraAgentApiClientError
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
      await createFinanceAuraRecommendation(accessToken, {
        kind: 'owner_decision',
        title: recTitle.trim(),
        recommendation: recBody.trim(),
      });
      setRecTitle('');
      setRecBody('');
      setSuccess('Recommendation queued for Owner approval — not auto-executed.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FinanceAuraAgentApiClientError
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
      await decideFinanceAuraRecommendation(accessToken, id, { decision });
      setSuccess(
        decision === 'approve'
          ? 'Recommendation approved (decision recorded only — no financial mutation).'
          : 'Recommendation rejected.',
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FinanceAuraAgentApiClientError
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
      await refreshFinanceAuraInsights(accessToken);
      setSuccess('Insights refreshed from real TITAN finance records.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FinanceAuraAgentApiClientError
          ? err.message
          : 'Unable to refresh insights',
      );
    }
  }

  async function handleRefreshAlerts() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await refreshFinanceAuraAlerts(accessToken);
      setSuccess('Alerts refreshed from real TITAN signals.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FinanceAuraAgentApiClientError ? err.message : 'Unable to refresh alerts',
      );
    }
  }

  async function handleAcknowledge(id: string) {
    if (!accessToken || !canOwnerApprove) return;
    setError(null);
    setSuccess(null);
    try {
      await acknowledgeFinanceAuraAlert(accessToken, id);
      setSuccess('Alert acknowledged by Owner.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FinanceAuraAgentApiClientError
          ? err.message
          : 'Unable to acknowledge alert',
      );
    }
  }

  async function handleAsk(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canView || !question.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      const result = await askFinanceAuraQuestion(accessToken, { question: question.trim() });
      setAnswer(result);
      setSuccess('Answer grounded in real TITAN finance context only.');
    } catch (err) {
      setError(
        err instanceof FinanceAuraAgentApiClientError
          ? err.message
          : 'Unable to answer finance question',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Finance AURA Agent"
          description="Owner-gated finance intelligence over real TITAN invoices and payments."
        />
        <EmptyState
          title="Access restricted"
          description="Requires Company/Platform Owner or finance access. Technician and Client roles are denied."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance AURA Agent"
        description="Recommendations, insights, and alerts grounded in real TITAN finance data. Owner approval required — never auto-executes mutations."
      />

      <p className="text-sm text-slate-400">
        <Link href="/finance/invoices" className="text-cyan-300 hover:underline">
          Invoices
        </Link>
        {' · '}
        <Link href="/finance/payments" className="text-cyan-300 hover:underline">
          Payments
        </Link>
        {' · '}
        <Link href="/integrations/xero" className="text-cyan-300 hover:underline">
          Xero
        </Link>
        {' · '}
        <Link href="/aura/command-centre" className="text-cyan-300 hover:underline">
          Command Centre
        </Link>
        {' · '}
        <Link href="/financial-planning" className="text-cyan-300 hover:underline">
          Financial Planning
        </Link>
      </p>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['dashboard', 'Dashboard'],
            ['recommendations', 'Recommendations'],
            ['insights', 'Insights'],
            ['alerts', 'Alerts'],
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
                : 'bg-slate-900 text-slate-300 ring-1 ring-slate-700'
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
        <Panel title="Loading">Loading Finance AURA Agent…</Panel>
      ) : !dashboard ? (
        <EmptyState
          title="No data"
          description="Unable to load Finance AURA Agent dashboard."
        />
      ) : (
        <>
          {tab === 'dashboard' ? (
            <div className="space-y-6">
              <Panel title="Honesty" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.summary}</p>
                <ul className="mt-3 space-y-1 text-xs text-slate-400">
                  <li>{dashboard.productClarification.thisLayer}</li>
                  <li>{dashboard.productClarification.xeroIntegration}</li>
                  <li>
                    Registry: {dashboard.registry.commandCentreStatus} — {dashboard.registry.note}
                  </li>
                </ul>
                <p className="mt-2 text-xs text-cyan-300/80">
                  Auto-execute: off · Owner approval required · Technician/Client: denied · Fake data:
                  never
                </p>
                {canManage ? (
                  <div className="mt-4">
                    <Button type="button" onClick={() => void handleRegister()}>
                      Register / refresh agent identity
                    </Button>
                  </div>
                ) : null}
              </Panel>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Invoices"
                  value={String(dashboard.businessContext.invoiceCount)}
                />
                <StatCard
                  label="Payments"
                  value={String(dashboard.businessContext.paymentCount)}
                />
                <StatCard
                  label="Overdue"
                  value={String(dashboard.businessContext.overdueInvoiceCount)}
                />
                <StatCard
                  label="Open alerts"
                  value={String(dashboard.alerts.filter((a) => a.status === 'open').length)}
                />
              </div>

              <Panel title="Business financial context" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.businessContext.summary}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Availability: {dashboard.businessContext.availability} · Xero:{' '}
                  {dashboard.businessContext.xero.availability} (
                  {dashboard.businessContext.xero.connectionStatus ?? 'n/a'})
                </p>
              </Panel>
            </div>
          ) : null}

          {tab === 'recommendations' ? (
            <div className="space-y-4">
              {canManage ? (
                <>
                  <Panel title="Generate from real signals" className="border-slate-800 bg-slate-950/80">
                    <p className="mb-3 text-sm text-slate-400">
                      Creates draft recommendations from overdue/outstanding/Xero-link signals. Owner
                      approval required — nothing mutates ledgers.
                    </p>
                    <Button type="button" onClick={() => void handleGenerateRecommendations()}>
                      Generate draft recommendations
                    </Button>
                  </Panel>
                  <Panel title="Manual Owner decision draft" className="border-slate-800 bg-slate-950/80">
                    <form className="space-y-3" onSubmit={handleCreateRecommendation}>
                      <label className="flex flex-col gap-1 text-sm text-slate-300">
                        Title
                        <Input
                          value={recTitle}
                          onChange={(e) => setRecTitle(e.target.value)}
                          placeholder="Recommendation title"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm text-slate-300">
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
                  <Panel key={r.id} title={r.title} className="border-slate-800 bg-slate-950/80">
                    <p className="text-sm text-slate-300">{r.recommendation}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {r.kind} · {r.status} · Auto-executed: never
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
                <Panel title="Refresh insights" className="border-slate-800 bg-slate-950/80">
                  <p className="mb-3 text-sm text-slate-400">
                    Rebuilds insights from current TITAN invoices/payments/Xero markers only.
                  </p>
                  <Button type="button" onClick={() => void handleRefreshInsights()}>
                    Refresh insights
                  </Button>
                </Panel>
              ) : null}
              {dashboard.insights.length === 0 ? (
                <EmptyState
                  title="No insights stored"
                  description="Refresh insights when finance records exist. Empty tenants stay honestly unavailable."
                />
              ) : (
                dashboard.insights.map((insight) => (
                  <Panel
                    key={insight.id}
                    title={insight.title}
                    className="border-slate-800 bg-slate-950/80"
                  >
                    <p className="text-sm text-slate-300">{insight.body}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {insight.kind} · invoices {insight.sourceInvoiceCount} · payments{' '}
                      {insight.sourcePaymentCount}
                    </p>
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'alerts' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Refresh alerts" className="border-slate-800 bg-slate-950/80">
                  <Button type="button" onClick={() => void handleRefreshAlerts()}>
                    Refresh alerts from signals
                  </Button>
                </Panel>
              ) : null}
              {dashboard.alerts.length === 0 ? (
                <EmptyState
                  title="No alerts"
                  description="No finance alerts stored. Refresh when overdue or outstanding signals exist."
                />
              ) : (
                dashboard.alerts.map((alert) => (
                  <Panel
                    key={alert.id}
                    title={`${alert.severity}: ${alert.title}`}
                    className="border-slate-800 bg-slate-950/80"
                  >
                    <p className="text-sm text-slate-300">{alert.detail}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {alert.kind} · {alert.status}
                    </p>
                    {canOwnerApprove && alert.status === 'open' ? (
                      <div className="mt-3">
                        <Button type="button" onClick={() => void handleAcknowledge(alert.id)}>
                          Acknowledge
                        </Button>
                      </div>
                    ) : null}
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'ask' ? (
            <div className="space-y-4">
              <Panel title="Owner decision support" className="border-slate-800 bg-slate-950/80">
                <form className="space-y-3" onSubmit={handleAsk}>
                  <label className="flex flex-col gap-1 text-sm text-slate-300">
                    Financial question
                    <Input
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="e.g. What is overdue? How are payments looking? Xero status?"
                    />
                  </label>
                  <Button type="submit">Ask (read-only)</Button>
                </form>
              </Panel>
              {answer ? (
                <Panel title="Answer" className="border-slate-800 bg-slate-950/80">
                  <p className="text-sm text-slate-300">{answer.answer}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Availability: {answer.availability} · Grounded in:{' '}
                    {answer.groundedIn.length ? answer.groundedIn.join(', ') : 'none'} ·
                    Auto-executed: never
                  </p>
                </Panel>
              ) : null}
            </div>
          ) : null}

          {tab === 'aura' ? (
            <div className="space-y-4">
              <Panel title="Agent identity" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.identity.name}</p>
                <p className="mt-2 text-xs text-slate-500">{dashboard.identity.description}</p>
                <p className="mt-2 text-xs text-cyan-300/80">
                  Keys: Command Centre / Agent Network / Global ={' '}
                  {dashboard.identity.registry.commandCentreKey}
                </p>
              </Panel>
              {dashboard.auraConnections.map((link) => (
                <Panel key={link.target} title={link.label} className="border-slate-800 bg-slate-950/80">
                  <p className="text-sm text-slate-400">{link.note}</p>
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
