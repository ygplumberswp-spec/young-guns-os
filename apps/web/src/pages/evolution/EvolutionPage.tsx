import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, PageHeader, Panel, StatCard } from '@titan/ui';
import type { EnterpriseEvolutionDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  approveEvolutionLearning,
  detectEvolutionPatterns,
  fetchEvolutionDashboard,
  generateEvolutionRecommendations,
  syncEvolutionLearning,
  syncEvolutionTimeline,
} from '../../lib/evolution-api-client';
import { useAuth } from '../../lib/auth-context';
import {
  canAccessEvolution,
  canManageEvolution,
  formatCategory,
  formatSourceType,
  formatStatus,
} from '../../features/evolution/utils';

type EvolutionTab =
  'dashboard' | 'learning' | 'patterns' | 'recommendations' | 'optimizations' | 'timeline';

export function EvolutionPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<EvolutionTab>('dashboard');
  const [dashboard, setDashboard] = useState<EnterpriseEvolutionDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessEvolution(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageEvolution(user.permissions) : false), [user]);

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchEvolutionDashboard(accessToken);
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
        await loadDashboard();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load evolution dashboard',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

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
          title="Evolution"
          description="You do not have permission to view the evolution platform."
        />
      </div>
    );
  }

  const tabs: Array<{ id: EvolutionTab; label: string }> = [
    { id: 'dashboard', label: 'AI Evolution Dashboard' },
    { id: 'learning', label: 'Continuous Learning' },
    { id: 'patterns', label: 'Pattern Recognition' },
    { id: 'recommendations', label: 'Recommendations' },
    { id: 'optimizations', label: 'Optimization Studio' },
    { id: 'timeline', label: 'Evolution Timeline' },
  ];

  return (
    <div className="automation-page">
      <PageHeader
        title="Evolution"
        description="Autonomous optimization and continuous learning — recommendations only, no autonomous business changes."
        actions={
          canWrite ? (
            <div className="page-header-actions">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => syncEvolutionLearning(accessToken!),
                    'Learning synced from real module data.',
                  )
                }
              >
                Sync Learning
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => generateEvolutionRecommendations(accessToken!),
                    'Recommendations generated from real operational signals.',
                  )
                }
              >
                Generate Recommendations
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
        <Panel title="Loading">Loading evolution dashboard…</Panel>
      ) : !dashboard ? (
        <EmptyState title="No data" description="Evolution dashboard is unavailable." />
      ) : (
        <>
          {activeTab === 'dashboard' ? (
            <>
              <div className="stat-grid">
                <StatCard
                  label="Optimization Score"
                  value={String(dashboard.optimizationScore ?? '—')}
                />
                <StatCard
                  label="Learning Progress"
                  value={`${dashboard.learningProgressPercent ?? 0}%`}
                />
                <StatCard
                  label="AI Confidence"
                  value={String(dashboard.aiConfidenceScore ?? '—')}
                />
                <StatCard
                  label="Acceptance Rate"
                  value={
                    dashboard.recommendationAcceptanceRate != null
                      ? `${dashboard.recommendationAcceptanceRate}%`
                      : '—'
                  }
                />
                <StatCard label="Learning Events" value={String(dashboard.learningEventCount)} />
                <StatCard label="Patterns" value={String(dashboard.patternCount)} />
              </div>

              <Panel title="Evolution Summary">
                <p>{dashboard.summary}</p>
              </Panel>

              <Panel title="Model Versions">
                {dashboard.modelVersions.length === 0 ? (
                  <EmptyState
                    title="No versions"
                    description="Model versions are created when learning events are approved."
                  />
                ) : (
                  <div className="data-list">
                    {dashboard.modelVersions.map((version) => (
                      <div key={version.id} className="data-list-item">
                        <strong>{version.versionLabel}</strong>
                        {version.isActive ? (
                          <span className="status-pill status-healthy">Active</span>
                        ) : null}
                        <p>{version.description}</p>
                        <span>{version.learningEventCount} event(s)</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </>
          ) : null}

          {activeTab === 'learning' ? (
            <Panel title="Continuous Learning Engine">
              {dashboard.recentLearningEvents.length === 0 ? (
                <EmptyState
                  title="No learning events"
                  description="Sync learning from approvals, jobs, workflows, and AI quality data."
                />
              ) : (
                <div className="data-list">
                  {dashboard.recentLearningEvents.map((event) => (
                    <div key={event.id} className="data-list-item">
                      <strong>{event.title}</strong>
                      <span className="status-pill">{formatSourceType(event.sourceType)}</span>
                      <span className="status-pill">{formatStatus(event.status)}</span>
                      <p>{event.summary}</p>
                      {canWrite && event.status === 'pending_approval' ? (
                        <Button
                          variant="secondary"
                          disabled={isWorking}
                          onClick={() =>
                            void runAction(async () => {
                              await approveEvolutionLearning(accessToken!, event.id);
                            }, 'Learning event approved.')
                          }
                        >
                          Approve Learning
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'patterns' ? (
            <Panel title="Pattern Recognition">
              {canWrite ? (
                <div className="panel-actions">
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() =>
                      void runAction(
                        () => detectEvolutionPatterns(accessToken!),
                        'Patterns detected from real module data.',
                      )
                    }
                  >
                    Detect Patterns
                  </Button>
                </div>
              ) : null}
              {dashboard.patterns.length === 0 ? (
                <EmptyState
                  title="No patterns"
                  description="Run pattern detection from live operational data."
                />
              ) : (
                <div className="data-list">
                  {dashboard.patterns.map((pattern) => (
                    <div key={pattern.id} className="data-list-item">
                      <strong>{pattern.title}</strong>
                      <span className="status-pill">{formatCategory(pattern.patternType)}</span>
                      <p>{pattern.description}</p>
                      {pattern.confidenceScore != null ? (
                        <span>Confidence: {(pattern.confidenceScore * 100).toFixed(0)}%</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'recommendations' ? (
            <Panel title="Optimization Recommendations">
              {dashboard.recommendations.length === 0 ? (
                <EmptyState
                  title="No recommendations"
                  description="Generate recommendations from detected patterns and cross-module signals."
                />
              ) : (
                <div className="data-list">
                  {dashboard.recommendations.map((rec) => (
                    <div key={rec.id} className="data-list-item">
                      <strong>{rec.title}</strong>
                      <span className="status-pill">{formatCategory(rec.category)}</span>
                      <span className="status-pill">{formatStatus(rec.status)}</span>
                      <p>{rec.recommendation}</p>
                      {rec.estimatedImpact ? <small>{rec.estimatedImpact}</small> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'optimizations' ? (
            <Panel title="Optimization Studio">
              {dashboard.optimizations.length === 0 ? (
                <EmptyState
                  title="No optimizations"
                  description="Optimization proposals follow Draft → Approval → Execution. None are auto-deployed."
                />
              ) : (
                <div className="data-list">
                  {dashboard.optimizations.map((opt) => (
                    <div key={opt.id} className="data-list-item">
                      <strong>{opt.title}</strong>
                      <span className="status-pill">{formatStatus(opt.status)}</span>
                      <p>{opt.description}</p>
                      {opt.estimatedImpact ? <small>Impact: {opt.estimatedImpact}</small> : null}
                      {opt.riskAssessment ? <small>Risk: {opt.riskAssessment}</small> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'timeline' ? (
            <Panel title="Business Evolution Timeline">
              {canWrite ? (
                <div className="panel-actions">
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() =>
                      void runAction(
                        () => syncEvolutionTimeline(accessToken!),
                        'Evolution timeline synced from live module events.',
                      )
                    }
                  >
                    Sync Timeline
                  </Button>
                </div>
              ) : null}
              {dashboard.timelineEvents.length === 0 ? (
                <EmptyState
                  title="No timeline events"
                  description="Sync the business evolution timeline from real data."
                />
              ) : (
                <div className="data-list">
                  {dashboard.timelineEvents.map((event) => (
                    <div key={event.id} className="data-list-item">
                      <strong>{event.title}</strong>
                      <span className="status-pill">{formatCategory(event.eventType)}</span>
                      {event.description ? <p>{event.description}</p> : null}
                      {event.impactSummary ? <small>{event.impactSummary}</small> : null}
                      <small>{new Date(event.eventAt).toLocaleString()}</small>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
