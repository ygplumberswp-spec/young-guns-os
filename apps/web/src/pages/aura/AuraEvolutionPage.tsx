import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  AuraEvolutionDashboard,
  AuraEvolutionKnowledgeKind,
} from '@titan/shared';
import {
  AURA_EVOLUTION_KNOWLEDGE_KINDS,
  canAccessAuraEvolution,
  canControlAuraEvolution,
  canWriteAuraEvolution,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { AuraSectionNav } from '../../features/aura/AuraSectionNav';
import { useAuth } from '../../lib/auth-context';
import {
  AuraEvolutionApiClientError,
  createAuraEvolutionKnowledge,
  decideAuraEvolutionInsight,
  fetchAuraEvolutionOverview,
  removeAuraEvolutionLearningItem,
  syncAuraEvolutionLearning,
  updateAuraEvolutionSettings,
} from '../../lib/aura-evolution-api-client';

type Tab = 'insights' | 'patterns' | 'scores' | 'decisions' | 'knowledge' | 'history' | 'controls';

function formatWhen(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return 'Unavailable';
  return `${Math.round(value * 100)}%`;
}

export function AuraEvolutionPage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('insights');
  const [overview, setOverview] = useState<AuraEvolutionDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [knowledgeKind, setKnowledgeKind] = useState<AuraEvolutionKnowledgeKind>('preference');
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [knowledgeContent, setKnowledgeContent] = useState('');

  const canView = useMemo(
    () =>
      canAccessAuraEvolution({
        roleName: user?.roleName,
        permissions: user?.permissions,
      }),
    [user],
  );
  const canWrite = useMemo(
    () =>
      canWriteAuraEvolution({
        roleName: user?.roleName,
        permissions: user?.permissions,
      }),
    [user],
  );
  const canControl = useMemo(
    () =>
      canControlAuraEvolution({
        roleName: user?.roleName,
        permissions: user?.permissions,
      }),
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    const data = await fetchAuraEvolutionOverview(accessToken);
    setOverview(data);
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
            err instanceof AuraEvolutionApiClientError
              ? err.message
              : 'Unable to load AURA Evolution',
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

  async function withFeedback(action: () => Promise<unknown>, okMessage: string) {
    if (!accessToken) return;
    try {
      setIsWorking(true);
      setError(null);
      setSuccess(null);
      await action();
      setSuccess(okMessage);
      await loadPage();
    } catch (err) {
      setError(
        err instanceof AuraEvolutionApiClientError ? err.message : 'Action failed',
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function onCreateKnowledge(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canControl) return;
    await withFeedback(
      () =>
        createAuraEvolutionKnowledge(accessToken, {
          kind: knowledgeKind,
          title: knowledgeTitle,
          content: knowledgeContent,
        }),
      'Knowledge entry saved (links Command Centre / AURA memory when provided).',
    );
    setKnowledgeTitle('');
    setKnowledgeContent('');
  }

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="AURA Evolution"
          description="You do not have permission to view the AURA Evolution learning agent."
        />
        <AuraSectionNav />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'insights', label: 'Insights' },
    { id: 'patterns', label: 'Patterns' },
    { id: 'scores', label: 'Accuracy' },
    { id: 'decisions', label: 'Decisions' },
    { id: 'knowledge', label: 'Knowledge' },
    { id: 'history', label: 'History' },
    { id: 'controls', label: 'Controls' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="AURA Evolution"
        description="Learning agent over Owner-approved decisions and real workflow outcomes. No demo insights. No automatic business, finance, or customer actions."
        actions={
          <div className="flex flex-wrap gap-2">
            {canWrite ? (
              <Button
                variant="secondary"
                disabled={isWorking || !overview?.learningEnabled}
                onClick={() =>
                  void withFeedback(
                    () => syncAuraEvolutionLearning(accessToken!),
                    'Learning sync completed from real signals only.',
                  )
                }
              >
                Sync learning
              </Button>
            ) : null}
            {canControl ? (
              <Button
                disabled={isWorking}
                onClick={() =>
                  void withFeedback(
                    () =>
                      updateAuraEvolutionSettings(accessToken!, {
                        learningEnabled: !overview?.learningEnabled,
                      }),
                    overview?.learningEnabled ? 'Learning disabled.' : 'Learning enabled.',
                  )
                }
              >
                {overview?.learningEnabled ? 'Disable learning' : 'Enable learning'}
              </Button>
            ) : null}
          </div>
        }
      />
      <AuraSectionNav />

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {success ? <p className="text-sm text-cyan-200">{success}</p> : null}
      {isLoading ? <p className="text-sm text-slate-400">Loading AURA Evolution…</p> : null}

      {overview ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Learning" value={overview.learningEnabled ? 'Enabled' : 'Disabled'} />
            <StatCard label="Decisions" value={String(overview.decisionCount)} />
            <StatCard
              label="Available patterns"
              value={String(overview.availablePatternCount)}
            />
            <StatCard
              label="Rec. accuracy"
              value={pct(overview.averageRecommendationSuccessRate)}
            />
          </div>

          <p className="text-sm text-slate-300">{overview.summary}</p>

          <div className="flex flex-wrap gap-2">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={
                  tab === entry.id
                    ? 'rounded border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200'
                    : 'rounded border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-300'
                }
              >
                {entry.label}
              </button>
            ))}
          </div>

          {tab === 'insights' ? (
            <Panel title="Learned insights" className="space-y-3 border border-cyan-500/20 bg-slate-950/70 p-4">
              {overview.insights.length === 0 ? (
                <EmptyState
                  title="No insights yet"
                  description="Enable learning and sync from real approvals. Insights never auto-apply."
                />
              ) : (
                overview.insights.map((insight) => (
                  <div
                    key={insight.id}
                    className="rounded border border-cyan-500/20 bg-slate-950/70 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm text-slate-100">{insight.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{insight.summary}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          {insight.status} · confidence {pct(insight.confidence)} · approval
                          required · autoExecuted false
                        </p>
                      </div>
                      {canControl && insight.status === 'pending_approval' ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={isWorking}
                            onClick={() =>
                              void withFeedback(
                                () =>
                                  decideAuraEvolutionInsight(accessToken!, insight.id, {
                                    decision: 'approve',
                                  }),
                                'Insight approved (not auto-executed).',
                              )
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={isWorking}
                            onClick={() =>
                              void withFeedback(
                                () =>
                                  decideAuraEvolutionInsight(accessToken!, insight.id, {
                                    decision: 'reject',
                                  }),
                                'Insight rejected.',
                              )
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </Panel>
          ) : null}

          {tab === 'patterns' ? (
            <Panel title="Business patterns" className="space-y-3 border border-cyan-500/20 bg-slate-950/70 p-4">
              {overview.patterns.length === 0 ? (
                <EmptyState
                  title="No patterns"
                  description="Patterns appear after a learning sync when real tenant data exists."
                />
              ) : (
                overview.patterns.map((pattern) => (
                  <div
                    key={pattern.id}
                    className="rounded border border-cyan-500/20 bg-slate-950/70 p-3"
                  >
                    <p className="text-sm text-slate-100">{pattern.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{pattern.summary}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {pattern.kind} · {pattern.availability} · sample {pattern.sampleSize} ·
                      confidence {pct(pattern.confidence)}
                    </p>
                    {pattern.honestGap ? (
                      <p className="mt-1 text-xs text-amber-200/80">{pattern.honestGap}</p>
                    ) : null}
                  </div>
                ))
              )}
            </Panel>
          ) : null}

          {tab === 'scores' ? (
            <Panel title="Recommendation accuracy" className="space-y-3 border border-cyan-500/20 bg-slate-950/70 p-4">
              {overview.recommendationScores.length === 0 ? (
                <EmptyState
                  title="Accuracy unavailable"
                  description="Accept/reject outcomes from real recommendations are required."
                />
              ) : (
                overview.recommendationScores.map((score) => (
                  <div
                    key={score.id}
                    className="rounded border border-cyan-500/20 bg-slate-950/70 p-3"
                  >
                    <p className="text-sm text-slate-100">{score.title}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {score.sourceModule} · proposed {score.timesProposed} · accepted{' '}
                      {score.timesAccepted} · rejected {score.timesRejected}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      success {pct(score.successRate)} · confidence {pct(score.confidence)}
                    </p>
                    {score.improvementSuggestion ? (
                      <p className="mt-2 text-xs text-cyan-200/90">{score.improvementSuggestion}</p>
                    ) : null}
                  </div>
                ))
              )}
            </Panel>
          ) : null}

          {tab === 'decisions' ? (
            <Panel title="Decision history" className="space-y-3 border border-cyan-500/20 bg-slate-950/70 p-4">
              {overview.recentDecisions.length === 0 ? (
                <EmptyState
                  title="No decisions captured"
                  description="Owner-approved Command Centre / workflow decisions appear after sync."
                />
              ) : (
                overview.recentDecisions.map((decision) => (
                  <div
                    key={decision.id}
                    className="rounded border border-cyan-500/20 bg-slate-950/70 p-3"
                  >
                    <p className="text-sm text-slate-100">{decision.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{decision.reasoningContext}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {decision.sourceType} · {decision.outcome} ·{' '}
                      {formatWhen(decision.decidedAt)}
                    </p>
                    {decision.improvementOpportunity ? (
                      <p className="mt-1 text-xs text-cyan-200/90">
                        {decision.improvementOpportunity}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </Panel>
          ) : null}

          {tab === 'knowledge' ? (
            <Panel title="AURA knowledge memory" className="space-y-3 border border-cyan-500/20 bg-slate-950/70 p-4">
              <p className="text-xs text-slate-400">
                Extends Command Centre / permanent AURA memory. Does not invent parallel private
                stores and never sources Personal WhatsApp private data.
              </p>
              {canControl ? (
                <form onSubmit={onCreateKnowledge} className="space-y-2 rounded border border-slate-700 p-3">
                  <select
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
                    value={knowledgeKind}
                    onChange={(e) =>
                      setKnowledgeKind(e.target.value as AuraEvolutionKnowledgeKind)
                    }
                  >
                    {AURA_EVOLUTION_KNOWLEDGE_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                  <input
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
                    placeholder="Title"
                    value={knowledgeTitle}
                    onChange={(e) => setKnowledgeTitle(e.target.value)}
                    required
                  />
                  <textarea
                    className="min-h-24 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
                    placeholder="Content"
                    value={knowledgeContent}
                    onChange={(e) => setKnowledgeContent(e.target.value)}
                    required
                  />
                  <Button type="submit" disabled={isWorking}>
                    Save knowledge
                  </Button>
                </form>
              ) : null}
              {overview.knowledgeMemory.length === 0 ? (
                <EmptyState
                  title="No knowledge entries"
                  description="Owner-controlled preferences, processes, and operating rules appear here."
                />
              ) : (
                overview.knowledgeMemory.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded border border-cyan-500/20 bg-slate-950/70 p-3"
                  >
                    <p className="text-sm text-slate-100">{entry.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{entry.content}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {entry.kind}
                      {entry.commandMemoryId ? ' · linked command memory' : ''}
                      {entry.auraMemoryId ? ' · linked aura memory' : ''}
                    </p>
                  </div>
                ))
              )}
            </Panel>
          ) : null}

          {tab === 'history' ? (
            <Panel title="Learning history" className="space-y-3 border border-cyan-500/20 bg-slate-950/70 p-4">
              {overview.learningHistory.length === 0 ? (
                <EmptyState
                  title="No learning history"
                  description="Captured decisions, patterns, and insights are listed after sync."
                />
              ) : (
                overview.learningHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded border border-cyan-500/20 bg-slate-950/70 p-3"
                  >
                    <div>
                      <p className="text-sm text-slate-100">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.summary}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {item.kind} · {formatWhen(item.createdAt)}
                      </p>
                    </div>
                    {canControl ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isWorking}
                        onClick={() =>
                          void withFeedback(
                            () => removeAuraEvolutionLearningItem(accessToken!, item.id),
                            'Learning item removed.',
                          )
                        }
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </Panel>
          ) : null}

          {tab === 'controls' ? (
            <Panel title="Learning controls" className="space-y-3 border border-cyan-500/20 bg-slate-950/70 p-4">
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-400">
                <li>Owner must enable learning before sync captures signals.</li>
                <li>Owner must approve learning insights — never auto-applied.</li>
                <li>Owner can review and remove stored learning items.</li>
                <li>No automatic business rule changes.</li>
                <li>No automatic financial actions.</li>
                <li>No automatic customer communication.</li>
                <li>Personal WhatsApp private data is never sourced.</li>
              </ul>
              {overview.honestGaps.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-amber-200/90">Honest gaps</p>
                  {overview.honestGaps.map((gap) => (
                    <p key={gap} className="text-xs text-slate-400">
                      {gap}
                    </p>
                  ))}
                </div>
              ) : null}
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
