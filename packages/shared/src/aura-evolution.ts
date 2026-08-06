/**
 * TITAN AURA Ecosystem — AURA Evolution / Learning Agent (Department 2.3)
 *
 * Learns from Owner-approved decisions, recommendation outcomes, and workflow
 * signals already stored in TITAN (including Command Centre business memory).
 * Extends — does not replace — aura_memory / aura_command_memory or M58/M73
 * enterprise evolution platforms.
 *
 * Guarantees:
 * - No demo / fake insights, patterns, or recommendation accuracy
 * - Tenant isolation on every row
 * - Owner enables learning; Owner approves learning changes; Owner may remove items
 * - No automatic business rule changes, financial actions, or customer communication
 * - Never sources Personal WhatsApp private data
 */

export const AURA_EVOLUTION_GUARANTEES = {
  noDemoData: true,
  noFakeInsights: true,
  noFakePatterns: true,
  tenantIsolated: true,
  ownerMustEnableLearning: true,
  ownerMustApproveLearningChanges: true,
  ownerCanRemoveLearningItems: true,
  noAutoBusinessRuleChanges: true,
  noAutoFinancialActions: true,
  noAutoCustomerCommunication: true,
  autoExecuted: false as const,
  neverSourcesPersonalWhatsappPrivate: true,
  extendsCommandCentreMemory: true,
  extendsExistingAuraFoundations: true,
} as const;

export type AuraEvolutionDecisionSource =
  | 'command_centre_memory'
  | 'command_centre_action'
  | 'command_centre_handoff'
  | 'agent_task'
  | 'workflow_aura_suggestion'
  | 'maintenance_aura_suggestion'
  | 'evolution_recommendation'
  | 'network_approval';

export type AuraEvolutionDecisionOutcome =
  | 'approved'
  | 'rejected'
  | 'accepted'
  | 'dismissed'
  | 'completed'
  | 'unknown';

export type AuraEvolutionPatternKind =
  | 'busy_period'
  | 'customer_behaviour'
  | 'revenue_trend'
  | 'job_trend'
  | 'maintenance_opportunity'
  | 'operational_bottleneck'
  | 'communication_pattern';

export type AuraEvolutionPatternAvailability =
  | 'available'
  | 'insufficient_data'
  | 'unavailable';

export type AuraEvolutionInsightStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'removed';

export type AuraEvolutionLearningItemKind =
  | 'decision'
  | 'pattern'
  | 'insight'
  | 'recommendation_score'
  | 'knowledge_link';

export type AuraEvolutionKnowledgeKind =
  | 'preference'
  | 'approved_process'
  | 'operating_rule'
  | 'important_context';

export type AuraEvolutionDecisionRecord = {
  id: string;
  sourceType: AuraEvolutionDecisionSource;
  sourceEntityId: string | null;
  title: string;
  reasoningContext: string;
  outcome: AuraEvolutionDecisionOutcome;
  outcomeNotes: string | null;
  improvementOpportunity: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export type AuraEvolutionPatternRecord = {
  id: string;
  kind: AuraEvolutionPatternKind;
  title: string;
  summary: string;
  availability: AuraEvolutionPatternAvailability;
  confidence: number | null;
  sampleSize: number;
  evidence: Record<string, unknown>;
  honestGap: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuraEvolutionRecommendationScore = {
  id: string;
  sourceModule: string;
  recommendationKey: string;
  title: string;
  timesProposed: number;
  timesAccepted: number;
  timesRejected: number;
  successRate: number | null;
  confidence: number | null;
  improvementSuggestion: string | null;
  lastOutcomeAt: string | null;
  updatedAt: string;
};

export type AuraEvolutionInsight = {
  id: string;
  title: string;
  summary: string;
  category: string;
  status: AuraEvolutionInsightStatus;
  confidence: number | null;
  evidence: Record<string, unknown>;
  requiresApproval: true;
  autoExecuted: false;
  decidedAt: string | null;
  decisionNotes: string | null;
  createdAt: string;
};

export type AuraEvolutionLearningItem = {
  id: string;
  kind: AuraEvolutionLearningItemKind;
  title: string;
  summary: string;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  removed: boolean;
  createdAt: string;
  removedAt: string | null;
};

export type AuraEvolutionKnowledgeEntry = {
  id: string;
  kind: AuraEvolutionKnowledgeKind;
  title: string;
  content: string;
  commandMemoryId: string | null;
  auraMemoryId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AuraEvolutionSettings = {
  learningEnabled: boolean;
  updatedAt: string | null;
  updatedByUserId: string | null;
  guarantees: typeof AURA_EVOLUTION_GUARANTEES;
};

export type AuraEvolutionDashboard = {
  settings: AuraEvolutionSettings;
  summary: string;
  learningEnabled: boolean;
  decisionCount: number;
  patternCount: number;
  availablePatternCount: number;
  insufficientPatternCount: number;
  insightPendingCount: number;
  insightApprovedCount: number;
  recommendationScoreCount: number;
  averageRecommendationSuccessRate: number | null;
  recentDecisions: AuraEvolutionDecisionRecord[];
  patterns: AuraEvolutionPatternRecord[];
  insights: AuraEvolutionInsight[];
  recommendationScores: AuraEvolutionRecommendationScore[];
  learningHistory: AuraEvolutionLearningItem[];
  knowledgeMemory: AuraEvolutionKnowledgeEntry[];
  honestGaps: string[];
  guarantees: typeof AURA_EVOLUTION_GUARANTEES;
};

export type UpdateAuraEvolutionSettingsRequest = {
  learningEnabled: boolean;
};

export type DecideAuraEvolutionInsightRequest = {
  decision: 'approve' | 'reject';
  notes?: string;
};

export type CreateAuraEvolutionKnowledgeRequest = {
  kind: AuraEvolutionKnowledgeKind;
  title: string;
  content: string;
  commandMemoryId?: string | null;
  auraMemoryId?: string | null;
};

export function canAccessAuraEvolution(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*')) return true;
  if (permissions.includes('agents:read') || permissions.includes('intelligence:read')) return true;
  if (permissions.includes('agents:write') || permissions.includes('intelligence:write')) return true;
  const role = identity.roleName ?? '';
  return role === 'Platform Owner' || role === 'Company Owner' || role === 'Owner';
}

export function canWriteAuraEvolution(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  if (!canAccessAuraEvolution(identity)) return false;
  const role = identity.roleName ?? '';
  if (role === 'Platform Owner' || role === 'Company Owner' || role === 'Owner') return true;
  const permissions = identity.permissions ?? [];
  return (
    permissions.includes('*') ||
    permissions.includes('agents:write') ||
    permissions.includes('intelligence:write')
  );
}

/** Enable/disable learning, approve insights, remove items — Owner / Platform Owner only. */
export function canControlAuraEvolution(identity: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = identity.roleName ?? '';
  if (role === 'Platform Owner' || role === 'Company Owner' || role === 'Owner') return true;
  const permissions = identity.permissions ?? [];
  return permissions.includes('*');
}

export function computeRecommendationSuccessRate(
  timesAccepted: number,
  timesRejected: number,
): number | null {
  const decided = timesAccepted + timesRejected;
  if (decided <= 0) return null;
  return Math.round((timesAccepted / decided) * 1000) / 1000;
}

export function computeRecommendationConfidence(
  timesProposed: number,
  timesAccepted: number,
  timesRejected: number,
): number | null {
  const decided = timesAccepted + timesRejected;
  if (timesProposed < 3 || decided < 2) return null;
  const rate = timesAccepted / decided;
  const volumeFactor = Math.min(1, decided / 10);
  return Math.round(rate * volumeFactor * 1000) / 1000;
}

export function patternAvailabilityForSampleSize(
  sampleSize: number,
  minimumSamples: number,
): AuraEvolutionPatternAvailability {
  if (sampleSize <= 0) return 'unavailable';
  if (sampleSize < minimumSamples) return 'insufficient_data';
  return 'available';
}

export const AURA_EVOLUTION_PATTERN_KINDS: AuraEvolutionPatternKind[] = [
  'busy_period',
  'customer_behaviour',
  'revenue_trend',
  'job_trend',
  'maintenance_opportunity',
  'operational_bottleneck',
  'communication_pattern',
];

export const AURA_EVOLUTION_KNOWLEDGE_KINDS: AuraEvolutionKnowledgeKind[] = [
  'preference',
  'approved_process',
  'operating_rule',
  'important_context',
];
