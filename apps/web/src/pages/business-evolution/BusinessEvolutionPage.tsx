import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel, StatCard } from '@titan/ui';
import type {
  BevAgentImprovementSummary,
  BevAgentPerformanceSnapshotSummary,
  BevAiEvaluationSummary,
  BevAuditLogSummary,
  BevContinuousImprovementItemSummary,
  BevEvolutionAlertSummary,
  BevKnowledgeReinforcementSummary,
  BevMaturityAssessmentSummary,
  BevOutcomeSummary,
  BevProcessMiningResultSummary,
  BevStrategicRoadmapItemSummary,
  BevUserFeedbackSummary,
  EnterpriseBusinessEvolutionDashboard,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  captureBevAnalytics,
  detectBevPatterns,
  fetchBevAgentImprovements,
  fetchBevAgentPerformanceSnapshots,
  fetchBevAiEvaluations,
  fetchBevAuditLogs,
  fetchBevEvolutionAlerts,
  fetchBevKnowledgeReinforcements,
  fetchBevMaturityAssessments,
  fetchBevOutcomes,
  fetchBevProcessMiningResults,
  fetchBevStrategicRoadmapItems,
  fetchBevUserFeedback,
  fetchBusinessEvolutionDashboard,
  syncBevEvolutionAlerts,
  syncBevObservations,
} from '../../lib/enterprise-business-evolution-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessBusinessEvolution,
  canManageBusinessEvolution,
  formatLearningStage,
  formatSeverity,
  formatWorkflowStatus,
} from '../../features/business-evolution/utils';

type BusinessEvolutionTab =
  | 'overview'
  | 'observations'
  | 'patterns'
  | 'hypotheses'
  | 'recommendations'
  | 'experiments'
  | 'outcomes'
  | 'continuous-improvement'
  | 'process-mining'
  | 'workflow-optimization'
  | 'agent-performance'
  | 'agent-improvement'
  | 'evaluations'
  | 'knowledge'
  | 'digital-twin'
  | 'financial-impact'
  | 'customer-impact'
  | 'workforce-impact'
  | 'it-operations-learning'
  | 'strategic-roadmap'
  | 'maturity'
  | 'feedback'
  | 'alerts'
  | 'audit'
  | 'settings'
  | 'assistant';

type SupplementaryData = {
  outcomes: BevOutcomeSummary[];
  processMiningResults: BevProcessMiningResultSummary[];
  agentPerformanceSnapshots: BevAgentPerformanceSnapshotSummary[];
  agentImprovements: BevAgentImprovementSummary[];
  aiEvaluations: BevAiEvaluationSummary[];
  knowledgeReinforcements: BevKnowledgeReinforcementSummary[];
  strategicRoadmapItems: BevStrategicRoadmapItemSummary[];
  maturityAssessments: BevMaturityAssessmentSummary[];
  userFeedback: BevUserFeedbackSummary[];
  evolutionAlerts: BevEvolutionAlertSummary[];
  auditLogs: BevAuditLogSummary[];
};

const emptySupplementary: SupplementaryData = {
  outcomes: [],
  processMiningResults: [],
  agentPerformanceSnapshots: [],
  agentImprovements: [],
  aiEvaluations: [],
  knowledgeReinforcements: [],
  strategicRoadmapItems: [],
  maturityAssessments: [],
  userFeedback: [],
  evolutionAlerts: [],
  auditLogs: [],
};

function formatCurrency(cents: number | null): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function BusinessEvolutionPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<BusinessEvolutionTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseBusinessEvolutionDashboard | null>(null);
  const [supplementary, setSupplementary] = useState<SupplementaryData>(emptySupplementary);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupplementaryLoading, setIsSupplementaryLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { agentMessages, isSending, pendingTasks, sendAgentMessage, updateTask, error: assistantError } =
    useAuraChat();

  const canView = useMemo(() => (user ? canAccessBusinessEvolution(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageBusinessEvolution(user.permissions) : false), [user]);

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchBusinessEvolutionDashboard(accessToken);
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
        const data = await fetchBusinessEvolutionDashboard(accessToken);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load business evolution dashboard');
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

  useEffect(() => {
    if (!accessToken || !canView) return;

    const loaders: Partial<Record<BusinessEvolutionTab, () => Promise<void>>> = {
      'process-mining': async () => {
        const processMiningResults = await fetchBevProcessMiningResults(accessToken);
        setSupplementary((prev) => ({ ...prev, processMiningResults }));
      },
      'agent-performance': async () => {
        const agentPerformanceSnapshots = await fetchBevAgentPerformanceSnapshots(accessToken);
        setSupplementary((prev) => ({ ...prev, agentPerformanceSnapshots }));
      },
      'agent-improvement': async () => {
        const agentImprovements = await fetchBevAgentImprovements(accessToken);
        setSupplementary((prev) => ({ ...prev, agentImprovements }));
      },
      evaluations: async () => {
        const aiEvaluations = await fetchBevAiEvaluations(accessToken);
        setSupplementary((prev) => ({ ...prev, aiEvaluations }));
      },
      knowledge: async () => {
        const knowledgeReinforcements = await fetchBevKnowledgeReinforcements(accessToken);
        setSupplementary((prev) => ({ ...prev, knowledgeReinforcements }));
      },
      'financial-impact': async () => {
        const outcomes = await fetchBevOutcomes(accessToken);
        setSupplementary((prev) => ({ ...prev, outcomes }));
      },
      'customer-impact': async () => {
        const outcomes = await fetchBevOutcomes(accessToken);
        setSupplementary((prev) => ({ ...prev, outcomes }));
      },
      'workforce-impact': async () => {
        const outcomes = await fetchBevOutcomes(accessToken);
        setSupplementary((prev) => ({ ...prev, outcomes }));
      },
      'strategic-roadmap': async () => {
        const strategicRoadmapItems = await fetchBevStrategicRoadmapItems(accessToken);
        setSupplementary((prev) => ({ ...prev, strategicRoadmapItems }));
      },
      maturity: async () => {
        const maturityAssessments = await fetchBevMaturityAssessments(accessToken);
        setSupplementary((prev) => ({ ...prev, maturityAssessments }));
      },
      feedback: async () => {
        const userFeedback = await fetchBevUserFeedback(accessToken);
        setSupplementary((prev) => ({ ...prev, userFeedback }));
      },
      alerts: async () => {
        const evolutionAlerts = await fetchBevEvolutionAlerts(accessToken);
        setSupplementary((prev) => ({ ...prev, evolutionAlerts }));
      },
      audit: async () => {
        const auditLogs = await fetchBevAuditLogs(accessToken);
        setSupplementary((prev) => ({ ...prev, auditLogs }));
      },
    };

    const loader = loaders[activeTab];
    if (!loader) return;

    let cancelled = false;
    setIsSupplementaryLoading(true);
    void loader()
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load tab data');
        }
      })
      .finally(() => {
        if (!cancelled) setIsSupplementaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeTab, canView]);

  async function runAction(action: () => Promise<unknown>, message: string) {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await loadDashboard();
      setSuccess(message);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setIsWorking(false);
    }
  }

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader title="Business Evolution" description="You do not have permission to view business evolution." />
      </div>
    );
  }

  const tabs: Array<{ id: BusinessEvolutionTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'observations', label: 'Observations' },
    { id: 'patterns', label: 'Patterns' },
    { id: 'hypotheses', label: 'Hypotheses' },
    { id: 'recommendations', label: 'Recommendations' },
    { id: 'experiments', label: 'Experiments' },
    { id: 'outcomes', label: 'Outcomes' },
    { id: 'continuous-improvement', label: 'Continuous Improvement' },
    { id: 'process-mining', label: 'Process Mining' },
    { id: 'workflow-optimization', label: 'Workflow Optimization' },
    { id: 'agent-performance', label: 'Agent Performance' },
    { id: 'agent-improvement', label: 'Agent Improvement' },
    { id: 'evaluations', label: 'Evaluations' },
    { id: 'knowledge', label: 'Knowledge' },
    { id: 'digital-twin', label: 'Digital Twin' },
    { id: 'financial-impact', label: 'Financial Impact' },
    { id: 'customer-impact', label: 'Customer Impact' },
    { id: 'workforce-impact', label: 'Workforce Impact' },
    { id: 'it-operations-learning', label: 'IT Operations Learning' },
    { id: 'strategic-roadmap', label: 'Strategic Roadmap' },
    { id: 'maturity', label: 'Maturity' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'audit', label: 'Audit' },
    { id: 'settings', label: 'Settings' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  const impactOutcomes =
    supplementary.outcomes.length > 0 ? supplementary.outcomes : (dashboard?.recentOutcomes ?? []);

  const financialOutcomes = impactOutcomes.filter((o) => o.financialImpactCents != null);
  const customerOutcomes = impactOutcomes.filter((o) => o.customerImpact);
  const workforceOutcomes = impactOutcomes.filter((o) => o.workforceImpact);

  const itObservations =
    dashboard?.recentObservations.filter(
      (o) =>
        o.sourceModule === 'it_operations' ||
        o.sourceModule === 'enterprise_it_operations' ||
        o.observationType.includes('it_'),
    ) ?? [];

  return (
    <div className="automation-page">
      <PageHeader
        title="Business Evolution"
        description="Enterprise learning loop — observations, patterns, hypotheses, experiments, and governed continuous improvement from real platform data."
        actions={
          <div className="page-header-actions">
            <Link href="/evolution">
              <Button variant="secondary">Legacy Evolution</Button>
            </Link>
            <Link href="/mission-control">
              <Button variant="secondary">Mission Control</Button>
            </Link>
          </div>
        }
      />

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

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}
      {isLoading ? <p>Loading business evolution...</p> : null}

      {dashboard && activeTab === 'overview' ? (
        <>
          <div className="stat-grid">
            <StatCard label="Observations" value={String(dashboard.observationCount)} />
            <StatCard label="Patterns" value={String(dashboard.patternCount)} />
            <StatCard label="Hypotheses" value={String(dashboard.hypothesisCount)} />
            <StatCard label="Open Recommendations" value={String(dashboard.openRecommendationCount)} />
            <StatCard label="Active Experiments" value={String(dashboard.activeExperimentCount)} />
            <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
            <StatCard label="Learning Confidence" value={dashboard.overallLearningConfidence} />
            <StatCard label="Improvement Items" value={String(dashboard.continuousImprovementCount)} />
          </div>
          <Panel
            title="Evolution Monitoring"
            description={dashboard.evolutionMonitoring.alerts.join(' · ') || 'No active evolution signals'}
          >
            <p>{dashboard.summary}</p>
            <ul className="simple-list">
              <li>Pending recommendations: {dashboard.evolutionMonitoring.pendingRecommendationCount}</li>
              <li>Active experiments: {dashboard.evolutionMonitoring.activeExperimentCount}</li>
              <li>Validated lessons: {dashboard.evolutionMonitoring.validatedLessonCount}</li>
              <li>Maturity assessments: {dashboard.maturityAssessmentCount}</li>
            </ul>
            {canWrite ? (
              <div className="panel-actions">
                <Button
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(() => syncBevObservations(accessToken!), 'Observations synced from real platform data.')
                  }
                >
                  Sync Observations
                </Button>
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(() => detectBevPatterns(accessToken!), 'Patterns detected from observation data.')
                  }
                >
                  Detect Patterns
                </Button>
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(() => syncBevEvolutionAlerts(accessToken!), 'Evolution alerts synced from platform signals.')
                  }
                >
                  Sync Alerts
                </Button>
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(() => captureBevAnalytics(accessToken!), 'Analytics captured from real learning data.')
                  }
                >
                  Capture Analytics
                </Button>
              </div>
            ) : null}
          </Panel>
          {dashboard.analytics ? (
            <Panel title="Latest Analytics Snapshot" description={`Captured ${dashboard.analytics.capturedAt}`}>
              <ul className="simple-list">
                <li>Observations: {dashboard.analytics.observationCount}</li>
                <li>Patterns: {dashboard.analytics.patternCount}</li>
                <li>Open recommendations: {dashboard.analytics.openRecommendationCount}</li>
                <li>Active experiments: {dashboard.analytics.activeExperimentCount}</li>
                <li>Validated lessons: {dashboard.analytics.validatedLessonCount}</li>
                <li>Learning confidence: {dashboard.analytics.overallLearningConfidence}</li>
              </ul>
            </Panel>
          ) : null}
        </>
      ) : null}

      {dashboard && activeTab === 'observations' ? (
        <Panel title="Observations" description="Raw learning signals captured from platform modules">
          {dashboard.recentObservations.length === 0 ? (
            <EmptyState title="No observations" description="Sync observations from real platform activity." />
          ) : (
            <div className="data-list">
              {dashboard.recentObservations.map((observation) => (
                <div key={observation.id} className="data-list-item">
                  <strong>{observation.title}</strong>
                  <span className="status-pill">{formatLearningStage(observation.learningStage)}</span>
                  <p>
                    {observation.observationType}
                    {observation.sourceModule ? ` · ${observation.sourceModule}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'patterns' ? (
        <Panel title="Patterns" description="Detected trends from aggregated observations">
          {dashboard.recentPatterns.length === 0 ? (
            <EmptyState title="No patterns" description="Run pattern detection after syncing observations." />
          ) : (
            <div className="data-list">
              {dashboard.recentPatterns.map((pattern) => (
                <div key={pattern.id} className="data-list-item">
                  <strong>{pattern.title}</strong>
                  <span className="status-pill">{formatLearningStage(pattern.learningStage)}</span>
                  <p>
                    Frequency: {pattern.frequency}
                    {pattern.confidence ? ` · Confidence: ${pattern.confidence}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'hypotheses' ? (
        <Panel title="Hypotheses" description="Proposed changes derived from detected patterns">
          {dashboard.recentHypotheses.length === 0 ? (
            <EmptyState title="No hypotheses" description="Hypotheses are created from validated patterns." />
          ) : (
            <div className="data-list">
              {dashboard.recentHypotheses.map((hypothesis) => (
                <div key={hypothesis.id} className="data-list-item">
                  <strong>{hypothesis.title}</strong>
                  <span className="status-pill">{formatLearningStage(hypothesis.learningStage)}</span>
                  <p>Risk: {hypothesis.riskLevel}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'recommendations' ? (
        <Panel title="Recommendations" description="Governed improvement proposals requiring approval">
          {dashboard.recentRecommendations.length === 0 ? (
            <EmptyState title="No recommendations" description="Recommendations appear after hypothesis review." />
          ) : (
            <div className="data-list">
              {dashboard.recentRecommendations.map((recommendation) => (
                <div key={recommendation.id} className="data-list-item">
                  <strong>{recommendation.title}</strong>
                  <span className="status-pill">{formatWorkflowStatus(recommendation.workflowStatus)}</span>
                  <p>
                    {recommendation.category} · Risk: {recommendation.riskLevel}
                    {recommendation.approvalRequired ? ' · approval required' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'experiments' ? (
        <Panel title="Experiments" description="Controlled tests with safety controls and spending limits">
          {dashboard.recentExperiments.length === 0 ? (
            <EmptyState title="No experiments" description="Experiments are scheduled from approved recommendations." />
          ) : (
            <div className="data-list">
              {dashboard.recentExperiments.map((experiment) => (
                <div key={experiment.id} className="data-list-item">
                  <strong>{experiment.title}</strong>
                  <span className="status-pill">{formatWorkflowStatus(experiment.workflowStatus)}</span>
                  <p>
                    {experiment.experimentType} · Risk: {experiment.riskLevel}
                    {experiment.hasSafetyControls ? ' · safety controls' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'outcomes' ? (
        <Panel title="Outcomes" description="Measured results from experiments and implemented recommendations">
          {dashboard.recentOutcomes.length === 0 ? (
            <EmptyState title="No outcomes" description="Outcomes are recorded after experiment completion." />
          ) : (
            <div className="data-list">
              {dashboard.recentOutcomes.map((outcome) => (
                <div key={outcome.id} className="data-list-item">
                  <strong>{outcome.title}</strong>
                  <span className="status-pill">{formatLearningStage(outcome.learningStage)}</span>
                  <p>
                    {outcome.operationalImpact ?? '—'}
                    {outcome.financialImpactCents != null ? ` · ${formatCurrency(outcome.financialImpactCents)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'continuous-improvement' ? (
        <Panel title="Continuous Improvement" description="Tracked improvement items from outcomes and feedback">
          {dashboard.recentImprovementItems.length === 0 ? (
            <EmptyState title="No improvement items" description="Improvement items are created from validated outcomes." />
          ) : (
            <div className="data-list">
              {dashboard.recentImprovementItems.map((item: BevContinuousImprovementItemSummary) => (
                <div key={item.id} className="data-list-item">
                  <strong>{item.title}</strong>
                  <span className="status-pill">{formatWorkflowStatus(item.workflowStatus)}</span>
                  <p>
                    {item.sourceType} · Priority: {item.priority}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'process-mining' ? (
        <Panel title="Process Mining" description="Discovered process flows from operational event data">
          {isSupplementaryLoading ? <p>Loading process mining results...</p> : null}
          {supplementary.processMiningResults.length === 0 ? (
            <EmptyState title="No process mining results" description="Sync process mining to discover workflow patterns." />
          ) : (
            <div className="data-list">
              {supplementary.processMiningResults.map((result) => (
                <div key={result.id} className="data-list-item">
                  <strong>{result.title}</strong>
                  <p>
                    {result.processKey} · Captured {result.capturedAt}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'workflow-optimization' ? (
        <Panel title="Workflow Optimization" description="Optimization proposals from the legacy evolution engine">
          {dashboard.legacyEvolution && dashboard.legacyEvolution.optimizations.length > 0 ? (
            <div className="data-list">
              {dashboard.legacyEvolution.optimizations.map((optimization) => (
                <div key={optimization.id} className="data-list-item">
                  <strong>{optimization.title}</strong>
                  <span className="status-pill">{formatWorkflowStatus(optimization.status)}</span>
                  <p>{optimization.estimatedImpact ?? optimization.description}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No workflow optimizations" description="Optimizations appear from the legacy evolution platform." />
          )}
          <Link href="/evolution">
            <Button variant="secondary">Open Legacy Evolution</Button>
          </Link>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'agent-performance' ? (
        <Panel title="Agent Performance" description="Task volume, success rates, and cost from real agent telemetry">
          {isSupplementaryLoading ? <p>Loading agent performance...</p> : null}
          {supplementary.agentPerformanceSnapshots.length === 0 ? (
            <EmptyState title="No agent performance snapshots" description="Capture agent performance from live agent runs." />
          ) : (
            <div className="data-list">
              {supplementary.agentPerformanceSnapshots.map((snapshot) => (
                <div key={snapshot.id} className="data-list-item">
                  <strong>{snapshot.agentKey}</strong>
                  <span className="status-pill">{snapshot.taskVolume} tasks</span>
                  <p>
                    Success: {snapshot.successRate ?? '—'}
                    {snapshot.avgLatencyMs != null ? ` · ${snapshot.avgLatencyMs}ms avg` : ''}
                    {snapshot.costCents > 0 ? ` · ${formatCurrency(snapshot.costCents)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'agent-improvement' ? (
        <Panel title="Agent Improvement" description="Prompt, policy, and capability improvements with rollback plans">
          {isSupplementaryLoading ? <p>Loading agent improvements...</p> : null}
          {supplementary.agentImprovements.length === 0 ? (
            <EmptyState title="No agent improvements" description="Agent improvements are proposed from performance analysis." />
          ) : (
            <div className="data-list">
              {supplementary.agentImprovements.map((improvement) => (
                <div key={improvement.id} className="data-list-item">
                  <strong>{improvement.title}</strong>
                  <span className="status-pill">{formatWorkflowStatus(improvement.workflowStatus)}</span>
                  <p>
                    {improvement.agentKey} · {improvement.improvementType}
                    {improvement.securityReviewRequired ? ' · security review required' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'evaluations' ? (
        <Panel title="AI Evaluations" description="Structured evaluation runs against real datasets">
          {isSupplementaryLoading ? <p>Loading evaluations...</p> : null}
          {supplementary.aiEvaluations.length === 0 ? (
            <EmptyState title="No AI evaluations" description="Evaluations are scheduled from the evaluation templates." />
          ) : (
            <div className="data-list">
              {supplementary.aiEvaluations.map((evaluation) => (
                <div key={evaluation.id} className="data-list-item">
                  <strong>{evaluation.evaluationKey}</strong>
                  <span className="status-pill">{formatWorkflowStatus(evaluation.workflowStatus)}</span>
                  <p>
                    {evaluation.evaluationType}
                    {evaluation.evaluatedAt ? ` · ${evaluation.evaluatedAt}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'knowledge' ? (
        <Panel title="Knowledge Reinforcement" description="Validated lessons linked to the knowledge graph">
          {isSupplementaryLoading ? <p>Loading knowledge reinforcements...</p> : null}
          {supplementary.knowledgeReinforcements.length === 0 ? (
            <EmptyState title="No knowledge reinforcements" description="Validated outcomes reinforce the knowledge graph." />
          ) : (
            <div className="data-list">
              {supplementary.knowledgeReinforcements.map((lesson) => (
                <div key={lesson.id} className="data-list-item">
                  <strong>{lesson.lessonTitle}</strong>
                  <span className="status-pill">{formatLearningStage(lesson.learningStage)}</span>
                  <p>{lesson.knowledgeNodeRef ?? 'No knowledge node linked'}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'digital-twin' ? (
        <Panel title="Digital Twin" description="Simulation and scenario modeling for business evolution decisions">
          <p>Explore process and operational simulations in the Digital Twin platform.</p>
          <Link href="/digital-twin">
            <Button variant="secondary">Open Digital Twin</Button>
          </Link>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'financial-impact' ? (
        <Panel title="Financial Impact" description="Measured financial outcomes from experiments and recommendations">
          {isSupplementaryLoading ? <p>Loading financial impact data...</p> : null}
          {financialOutcomes.length === 0 ? (
            <EmptyState title="No financial impact data" description="Financial impact is recorded when outcomes are measured." />
          ) : (
            <div className="data-list">
              {financialOutcomes.map((outcome) => (
                <div key={outcome.id} className="data-list-item">
                  <strong>{outcome.title}</strong>
                  <span className="status-pill">{formatCurrency(outcome.financialImpactCents)}</span>
                  <p>{formatLearningStage(outcome.learningStage)} · {outcome.measuredAt}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'customer-impact' ? (
        <Panel title="Customer Impact" description="Customer-facing outcomes from improvement initiatives">
          {isSupplementaryLoading ? <p>Loading customer impact data...</p> : null}
          {customerOutcomes.length === 0 ? (
            <EmptyState title="No customer impact data" description="Customer impact is recorded in outcome measurements." />
          ) : (
            <div className="data-list">
              {customerOutcomes.map((outcome) => (
                <div key={outcome.id} className="data-list-item">
                  <strong>{outcome.title}</strong>
                  <p>{outcome.customerImpact}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'workforce-impact' ? (
        <Panel title="Workforce Impact" description="Workforce outcomes from operational improvements">
          {isSupplementaryLoading ? <p>Loading workforce impact data...</p> : null}
          {workforceOutcomes.length === 0 ? (
            <EmptyState title="No workforce impact data" description="Workforce impact is recorded in outcome measurements." />
          ) : (
            <div className="data-list">
              {workforceOutcomes.map((outcome) => (
                <div key={outcome.id} className="data-list-item">
                  <strong>{outcome.title}</strong>
                  <p>{outcome.workforceImpact}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'it-operations-learning' ? (
        <Panel title="IT Operations Learning" description="Observations and learning signals from IT operations modules">
          {itObservations.length === 0 ? (
            <EmptyState title="No IT operations learning data" description="IT learning signals appear when IT operations modules emit observations." />
          ) : (
            <div className="data-list">
              {itObservations.map((observation) => (
                <div key={observation.id} className="data-list-item">
                  <strong>{observation.title}</strong>
                  <span className="status-pill">{formatLearningStage(observation.learningStage)}</span>
                  <p>{observation.observationType}</p>
                </div>
              ))}
            </div>
          )}
          <Link href="/it-operations">
            <Button variant="secondary">Open IT Operations</Button>
          </Link>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'strategic-roadmap' ? (
        <Panel title="Strategic Roadmap" description="Long-term improvement themes and budget tracking">
          {isSupplementaryLoading ? <p>Loading strategic roadmap...</p> : null}
          {supplementary.strategicRoadmapItems.length === 0 ? (
            <EmptyState title="No roadmap items" description="Strategic roadmap items are created from validated recommendations." />
          ) : (
            <div className="data-list">
              {supplementary.strategicRoadmapItems.map((item) => (
                <div key={item.id} className="data-list-item">
                  <strong>{item.title}</strong>
                  <span className="status-pill">{formatWorkflowStatus(item.workflowStatus)}</span>
                  <p>
                    {item.themeKey} · Priority: {item.priority}
                    {item.budgetCents != null ? ` · Budget ${formatCurrency(item.budgetCents)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'maturity' ? (
        <Panel title="Maturity Assessments" description="Domain maturity scores and reviewer confidence">
          {isSupplementaryLoading ? <p>Loading maturity assessments...</p> : null}
          {supplementary.maturityAssessments.length === 0 ? (
            <EmptyState title="No maturity assessments" description="Maturity assessments track learning capability by domain." />
          ) : (
            <div className="data-list">
              {supplementary.maturityAssessments.map((assessment) => (
                <div key={assessment.id} className="data-list-item">
                  <strong>{assessment.domain}</strong>
                  <span className="status-pill">{assessment.score ?? '—'}</span>
                  <p>
                    {assessment.frameworkKey}
                    {assessment.confidenceScore ? ` · Confidence: ${assessment.confidenceScore}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'feedback' ? (
        <Panel title="User Feedback" description="Ratings and comments on recommendations, experiments, and outcomes">
          {isSupplementaryLoading ? <p>Loading feedback...</p> : null}
          {supplementary.userFeedback.length === 0 ? (
            <EmptyState title="No user feedback" description="Feedback is collected on evolution artifacts." />
          ) : (
            <div className="data-list">
              {supplementary.userFeedback.map((item) => (
                <div key={item.id} className="data-list-item">
                  <strong>{item.targetType}</strong>
                  <span className="status-pill">{item.feedbackRating}</span>
                  <p>{item.feedbackText ?? 'No comment'}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'alerts' ? (
        <Panel title="Evolution Alerts" description="Open alerts from learning pipeline and platform modules">
          {isSupplementaryLoading && supplementary.evolutionAlerts.length === 0 ? (
            <p>Loading alerts...</p>
          ) : null}
          {(supplementary.evolutionAlerts.length > 0 ? supplementary.evolutionAlerts : dashboard.recentAlerts).length ===
          0 ? (
            <EmptyState title="No evolution alerts" description="Sync alerts from platform learning signals." />
          ) : (
            <div className="data-list">
              {(supplementary.evolutionAlerts.length > 0 ? supplementary.evolutionAlerts : dashboard.recentAlerts).map(
                (alert) => (
                  <div key={alert.id} className="data-list-item">
                    <strong>{alert.title}</strong>
                    <span className="status-pill">{formatSeverity(alert.severity)}</span>
                    <p>
                      {alert.alertType} · {alert.status}
                      {alert.sourceModule ? ` · ${alert.sourceModule}` : ''}
                    </p>
                  </div>
                ),
              )}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'audit' ? (
        <Panel title="Audit Trail" description="Complete history of business evolution actions and changes">
          {isSupplementaryLoading ? <p>Loading audit logs...</p> : null}
          {supplementary.auditLogs.length === 0 ? (
            <EmptyState title="No audit logs" description="Audit entries are recorded for every business evolution action." />
          ) : (
            <div className="data-list">
              {supplementary.auditLogs.map((log) => (
                <div key={log.id} className="data-list-item">
                  <strong>{log.actionType}</strong>
                  <p>
                    {log.entityType ?? '—'}
                    {log.entityId ? ` · ${log.entityId}` : ''} · {log.createdAt}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'settings' ? (
        <Panel title="Platform Configuration" description="Learning governance, safety defaults, and data source settings">
          <ul className="simple-list">
            <li>Audit retention: {dashboard.platformConfig.auditRetentionDays} days</li>
            <li>Learning governance keys: {Object.keys(dashboard.platformConfig.learningGovernance).length}</li>
            <li>Experiment safety defaults: {Object.keys(dashboard.platformConfig.experimentSafetyDefaults).length}</li>
            <li>Evaluation templates: {Object.keys(dashboard.platformConfig.evaluationTemplates).length}</li>
            <li>Aggregation thresholds: {Object.keys(dashboard.platformConfig.aggregationThresholds).length}</li>
            <li>Cross-tenant privacy rules: {Object.keys(dashboard.platformConfig.crossTenantPrivacyRules).length}</li>
            <li>Agent improvement standards: {Object.keys(dashboard.platformConfig.agentImprovementStandards).length}</li>
            <li>Autonomous allowlist: {Object.keys(dashboard.platformConfig.autonomousAllowlist).length}</li>
            <li>Rollback requirements: {Object.keys(dashboard.platformConfig.rollbackRequirements).length}</li>
            <li>Recommendation thresholds: {Object.keys(dashboard.platformConfig.recommendationThresholds).length}</li>
            <li>Learning scope: {Object.keys(dashboard.platformConfig.learningScope).length}</li>
            <li>Data sources: {Object.keys(dashboard.platformConfig.dataSources).length}</li>
          </ul>
          {dashboard.isPlatformOwner ? (
            <p>Platform owner tenant — full configuration management available via API.</p>
          ) : null}
        </Panel>
      ) : null}

      {activeTab === 'assistant' ? (
        <Panel
          title="AURA Business Evolution Agent"
          description="Learning loop guidance, pattern analysis, and governed improvement drafts — no autonomous changes without approval"
        >
          {assistantError ? <p className="form-error">{assistantError}</p> : null}
          <AuraMessageList messages={agentMessages} isSending={isSending} />
          {pendingTasks.map((task) => (
            <AuraTaskApprovalCard key={task.id} task={task} accessToken={accessToken ?? ''} onUpdated={updateTask} />
          ))}
          <AuraComposer
            disabled={isSending}
            onSend={(content) =>
              void sendAgentMessage(content, 'business_evolution' as import('@titan/shared').AgentKey)
            }
            placeholder="Ask about observations, patterns, experiments, recommendations, or learning governance…"
          />
        </Panel>
      ) : null}
    </div>
  );
}
