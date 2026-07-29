import { request, ApiClientError } from './api-client';
import type {
  BevAgentImprovementSummary,
  BevAgentPerformanceSnapshotSummary,
  BevAiEvaluationSummary,
  BevAuditLogSummary,
  BevContinuousImprovementItemSummary,
  BevEvolutionAlertSummary,
  BevExperimentSummary,
  BevHypothesisSummary,
  BevKnowledgeReinforcementSummary,
  BevMaturityAssessmentSummary,
  BevObservationSummary,
  BevOutcomeSummary,
  BevPatternSummary,
  BevProcessMiningResultSummary,
  BevPromptPolicyVersionSummary,
  BevRecommendationSummary,
  BevStrategicRoadmapItemSummary,
  BevUserFeedbackSummary,
  EnterpriseBusinessEvolutionDashboard,
  UpdateBevPlatformConfigRequest,
} from '@titan/shared';

export { ApiClientError as EnterpriseBusinessEvolutionApiClientError };

export async function fetchBusinessEvolutionDashboard(accessToken: string) {
  const data = await request<{ dashboard: EnterpriseBusinessEvolutionDashboard }>(
    '/enterprise-business-evolution/dashboard',
    { accessToken },
  );
  return data.dashboard;
}

export async function captureBevAnalytics(accessToken: string) {
  const data = await request<{ analytics: unknown }>('/enterprise-business-evolution/analytics/capture', {
    method: 'POST',
    accessToken,
  });
  return data.analytics;
}

export async function syncBevObservations(accessToken: string) {
  const data = await request<{ observations: BevObservationSummary[] }>(
    '/enterprise-business-evolution/observations/sync',
    { method: 'POST', accessToken },
  );
  return data.observations;
}

export async function detectBevPatterns(accessToken: string) {
  const data = await request<{ patterns: BevPatternSummary[] }>(
    '/enterprise-business-evolution/patterns/detect',
    { method: 'POST', accessToken },
  );
  return data.patterns;
}

export async function syncBevEvolutionAlerts(accessToken: string) {
  const data = await request<{ evolutionAlerts: BevEvolutionAlertSummary[] }>(
    '/enterprise-business-evolution/evolution-alerts/sync',
    { method: 'POST', accessToken },
  );
  return data.evolutionAlerts;
}

export async function captureBevAgentPerformance(accessToken: string) {
  const data = await request<{ snapshots: BevAgentPerformanceSnapshotSummary[] }>(
    '/enterprise-business-evolution/agent-performance/capture',
    { method: 'POST', accessToken },
  );
  return data.snapshots;
}

export async function syncBevProcessMining(accessToken: string) {
  const data = await request<{ results: BevProcessMiningResultSummary[] }>(
    '/enterprise-business-evolution/process-mining/sync',
    { method: 'POST', accessToken },
  );
  return data.results;
}

export async function fetchBevObservations(accessToken: string) {
  const data = await request<{ observations: BevObservationSummary[] }>(
    '/enterprise-business-evolution/observations',
    { accessToken },
  );
  return data.observations;
}

export async function fetchBevPatterns(accessToken: string) {
  const data = await request<{ patterns: BevPatternSummary[] }>('/enterprise-business-evolution/patterns', {
    accessToken,
  });
  return data.patterns;
}

export async function fetchBevHypotheses(accessToken: string) {
  const data = await request<{ hypotheses: BevHypothesisSummary[] }>(
    '/enterprise-business-evolution/hypotheses',
    { accessToken },
  );
  return data.hypotheses;
}

export async function fetchBevRecommendations(accessToken: string) {
  const data = await request<{ recommendations: BevRecommendationSummary[] }>(
    '/enterprise-business-evolution/recommendations',
    { accessToken },
  );
  return data.recommendations;
}

export async function fetchBevExperiments(accessToken: string) {
  const data = await request<{ experiments: BevExperimentSummary[] }>(
    '/enterprise-business-evolution/experiments',
    { accessToken },
  );
  return data.experiments;
}

export async function fetchBevOutcomes(accessToken: string) {
  const data = await request<{ outcomes: BevOutcomeSummary[] }>('/enterprise-business-evolution/outcomes', {
    accessToken,
  });
  return data.outcomes;
}

export async function fetchBevContinuousImprovementItems(accessToken: string) {
  const data = await request<{ items: BevContinuousImprovementItemSummary[] }>(
    '/enterprise-business-evolution/continuous-improvement-items',
    { accessToken },
  );
  return data.items;
}

export async function fetchBevStrategicRoadmapItems(accessToken: string) {
  const data = await request<{ items: BevStrategicRoadmapItemSummary[] }>(
    '/enterprise-business-evolution/strategic-roadmap-items',
    { accessToken },
  );
  return data.items;
}

export async function fetchBevMaturityAssessments(accessToken: string) {
  const data = await request<{ assessments: BevMaturityAssessmentSummary[] }>(
    '/enterprise-business-evolution/maturity-assessments',
    { accessToken },
  );
  return data.assessments;
}

export async function fetchBevAgentPerformanceSnapshots(accessToken: string) {
  const data = await request<{ snapshots: BevAgentPerformanceSnapshotSummary[] }>(
    '/enterprise-business-evolution/agent-performance-snapshots',
    { accessToken },
  );
  return data.snapshots;
}

export async function fetchBevAgentImprovements(accessToken: string) {
  const data = await request<{ improvements: BevAgentImprovementSummary[] }>(
    '/enterprise-business-evolution/agent-improvements',
    { accessToken },
  );
  return data.improvements;
}

export async function fetchBevPromptPolicyVersions(accessToken: string) {
  const data = await request<{ versions: BevPromptPolicyVersionSummary[] }>(
    '/enterprise-business-evolution/prompt-policy-versions',
    { accessToken },
  );
  return data.versions;
}

export async function fetchBevAiEvaluations(accessToken: string) {
  const data = await request<{ evaluations: BevAiEvaluationSummary[] }>(
    '/enterprise-business-evolution/ai-evaluations',
    { accessToken },
  );
  return data.evaluations;
}

export async function fetchBevKnowledgeReinforcements(accessToken: string) {
  const data = await request<{ reinforcements: BevKnowledgeReinforcementSummary[] }>(
    '/enterprise-business-evolution/knowledge-reinforcements',
    { accessToken },
  );
  return data.reinforcements;
}

export async function fetchBevProcessMiningResults(accessToken: string) {
  const data = await request<{ results: BevProcessMiningResultSummary[] }>(
    '/enterprise-business-evolution/process-mining-results',
    { accessToken },
  );
  return data.results;
}

export async function fetchBevEvolutionAlerts(accessToken: string) {
  const data = await request<{ evolutionAlerts: BevEvolutionAlertSummary[] }>(
    '/enterprise-business-evolution/evolution-alerts',
    { accessToken },
  );
  return data.evolutionAlerts;
}

export async function fetchBevUserFeedback(accessToken: string) {
  const data = await request<{ feedback: BevUserFeedbackSummary[] }>(
    '/enterprise-business-evolution/user-feedback',
    { accessToken },
  );
  return data.feedback;
}

export async function fetchBevAuditLogs(accessToken: string) {
  const data = await request<{ auditLogs: BevAuditLogSummary[] }>(
    '/enterprise-business-evolution/audit-logs',
    { accessToken },
  );
  return data.auditLogs;
}

export async function updateBevPlatformConfig(accessToken: string, body: UpdateBevPlatformConfigRequest) {
  const data = await request<{ platformConfig: unknown }>('/enterprise-business-evolution/platform-config', {
    method: 'PUT',
    accessToken,
    body,
  });
  return data.platformConfig;
}
