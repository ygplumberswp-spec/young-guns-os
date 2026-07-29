import type { EnterpriseEvolutionDashboard } from './enterprise-evolution.js';

export type BevPlatformConfigSummary = {
  learningGovernance: Record<string, unknown>;
  experimentSafetyDefaults: Record<string, unknown>;
  evaluationTemplates: Record<string, unknown>;
  aggregationThresholds: Record<string, unknown>;
  crossTenantPrivacyRules: Record<string, unknown>;
  agentImprovementStandards: Record<string, unknown>;
  autonomousAllowlist: Record<string, unknown>;
  rollbackRequirements: Record<string, unknown>;
  auditRetentionDays: number;
  recommendationThresholds: Record<string, unknown>;
  learningScope: Record<string, unknown>;
  dataSources: Record<string, unknown>;
};

export type BevObservationSummary = {
  id: string;
  observationKey: string;
  sourceModule: string | null;
  observationType: string;
  title: string;
  description: string | null;
  learningStage: string;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  observedAt: string;
  createdAt: string;
};

export type BevPatternSummary = {
  id: string;
  patternKey: string;
  title: string;
  description: string | null;
  supportingSourceRecords: string[];
  timePeriod: { start: string | null; end: string | null };
  confidence: string | null;
  frequency: number;
  businessImpact: string | null;
  affectedModules: string[];
  possibleCauses: string[];
  limitations: string[];
  dataFreshnessAt: string | null;
  learningStage: string;
  createdAt: string;
};

export type BevHypothesisSummary = {
  id: string;
  hypothesisKey: string;
  title: string;
  problemStatement: string | null;
  proposedChange: string | null;
  expectedOutcome: string | null;
  riskLevel: string;
  measurementMethod: string | null;
  successCriteria: string | null;
  rollbackPlan: string | null;
  learningStage: string;
  patternId: string | null;
  createdAt: string;
};

export type BevRecommendationSummary = {
  id: string;
  recommendationKey: string;
  category: string;
  title: string;
  description: string | null;
  expectedBenefit: string | null;
  expectedCost: string | null;
  confidenceScore: string | null;
  requiredEffort: string | null;
  riskLevel: string;
  recommendedOwnerUserId: string | null;
  approvalRequired: boolean;
  measurementPlan: string | null;
  rollbackPlan: string | null;
  workflowStatus: string;
  hypothesisId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BevRecommendationEventSummary = {
  id: string;
  recommendationId: string;
  eventType: string;
  decisionReason: string | null;
  reviewingUserId: string | null;
  implementationOwnerUserId: string | null;
  expectedOutcome: string | null;
  actualOutcome: string | null;
  variance: string | null;
  lessonsLearned: string | null;
  createdAt: string;
};

export type BevExperimentSummary = {
  id: string;
  experimentKey: string;
  title: string;
  description: string | null;
  experimentType: string;
  workflowStatus: string;
  riskLevel: string;
  spendingLimitCents: number | null;
  hasControlGroup: boolean;
  hasTestGroup: boolean;
  hasEligibleRecords: boolean;
  hasExclusions: boolean;
  hasSuccessMetrics: boolean;
  hasFailureThresholds: boolean;
  hasStopConditions: boolean;
  hasSafetyControls: boolean;
  hypothesisId: string | null;
  recommendationId: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type BevOutcomeSummary = {
  id: string;
  experimentId: string | null;
  recommendationId: string | null;
  title: string;
  operationalImpact: string | null;
  financialImpactCents: number | null;
  customerImpact: string | null;
  workforceImpact: string | null;
  complianceImpact: string | null;
  statisticalConfidence: string | null;
  learningStage: string;
  measuredAt: string;
  createdAt: string;
};

export type BevUserFeedbackSummary = {
  id: string;
  targetType: string;
  targetId: string;
  feedbackRating: string;
  feedbackText: string | null;
  submittedByUserId: string | null;
  createdAt: string;
};

export type BevAgentPerformanceSnapshotSummary = {
  id: string;
  agentKey: string;
  taskVolume: number;
  successRate: string | null;
  failureRate: string | null;
  approvalRate: string | null;
  rejectionRate: string | null;
  correctionRate: string | null;
  avgLatencyMs: number | null;
  toolFailureCount: number;
  policyViolationCount: number;
  costCents: number;
  providerKey: string | null;
  capturedAt: string;
};

export type BevAgentImprovementSummary = {
  id: string;
  agentKey: string;
  improvementType: string;
  title: string;
  description: string | null;
  workflowStatus: string;
  versionLabel: string | null;
  changeReason: string | null;
  securityReviewRequired: boolean;
  stagingTestRequired: boolean;
  rollbackVersionLabel: string | null;
  createdAt: string;
};

export type BevPromptPolicyVersionSummary = {
  id: string;
  policyType: string;
  policyKey: string;
  versionLabel: string;
  changeReason: string | null;
  approvedByUserId: string | null;
  effectiveAt: string | null;
  rollbackVersionLabel: string | null;
  workflowStatus: string;
  createdAt: string;
};

export type BevAiEvaluationSummary = {
  id: string;
  evaluationKey: string;
  evaluationType: string;
  datasetRef: string | null;
  workflowStatus: string;
  summary: string | null;
  evaluatedAt: string | null;
  createdAt: string;
};

export type BevKnowledgeReinforcementSummary = {
  id: string;
  lessonTitle: string;
  knowledgeNodeRef: string | null;
  learningStage: string;
  validatedAt: string | null;
  validatedByUserId: string | null;
  sourceOutcomeId: string | null;
  createdAt: string;
};

export type BevProcessMiningResultSummary = {
  id: string;
  processKey: string;
  title: string;
  capturedAt: string;
};

export type BevStrategicRoadmapItemSummary = {
  id: string;
  themeKey: string;
  title: string;
  description: string | null;
  priority: string;
  workflowStatus: string;
  ownerUserId: string | null;
  budgetCents: number | null;
  progressPercent: string | null;
  benefitRealizedCents: number | null;
  createdAt: string;
};

export type BevMaturityAssessmentSummary = {
  id: string;
  frameworkKey: string;
  domain: string;
  score: string | null;
  scoringMethod: string | null;
  reviewerUserId: string | null;
  confidenceScore: string | null;
  assessedAt: string;
  createdAt: string;
};

export type BevContinuousImprovementItemSummary = {
  id: string;
  itemKey: string;
  sourceType: string;
  title: string;
  description: string | null;
  priority: string;
  workflowStatus: string;
  ownerUserId: string | null;
  expectedBenefit: string | null;
  createdAt: string;
};

export type BevAutonomousOptimizationSummary = {
  id: string;
  optimizationKey: string;
  allowlistKey: string | null;
  title: string;
  description: string | null;
  workflowStatus: string;
  riskLevel: string;
  rollbackPlan: string | null;
  verified: boolean;
  executedAt: string | null;
  createdAt: string;
};

export type BevEvolutionAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  sourceModule: string | null;
  incidentId: string | null;
  createdAt: string;
};

export type BevActionDraftSummary = {
  id: string;
  draftType: string;
  title: string;
  content: string;
  aiGenerated: boolean;
  workflowStatus: string;
  createdAt: string;
};

export type BevAnalyticsSummary = {
  observationCount: number;
  patternCount: number;
  hypothesisCount: number;
  openRecommendationCount: number;
  activeExperimentCount: number;
  openAlertCount: number;
  continuousImprovementCount: number;
  maturityAssessmentCount: number;
  validatedLessonCount: number;
  overallLearningConfidence: string;
  capturedAt: string;
};

export type BevAuditLogSummary = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type BevEvolutionMonitoringSummary = {
  openAlertCount: number;
  activeExperimentCount: number;
  pendingRecommendationCount: number;
  validatedLessonCount: number;
  alerts: string[];
};

export type EnterpriseBusinessEvolutionDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  platformConfig: BevPlatformConfigSummary;
  legacyEvolution: EnterpriseEvolutionDashboard | null;
  observationCount: number;
  patternCount: number;
  hypothesisCount: number;
  openRecommendationCount: number;
  activeExperimentCount: number;
  openAlertCount: number;
  continuousImprovementCount: number;
  maturityAssessmentCount: number;
  overallLearningConfidence: string;
  evolutionMonitoring: BevEvolutionMonitoringSummary;
  analytics: BevAnalyticsSummary | null;
  recentObservations: BevObservationSummary[];
  recentPatterns: BevPatternSummary[];
  recentHypotheses: BevHypothesisSummary[];
  recentRecommendations: BevRecommendationSummary[];
  recentExperiments: BevExperimentSummary[];
  recentOutcomes: BevOutcomeSummary[];
  recentAlerts: BevEvolutionAlertSummary[];
  recentImprovementItems: BevContinuousImprovementItemSummary[];
};

export type EnterpriseBusinessEvolutionAuraContext = {
  summary: string;
  observationCount: number;
  patternCount: number;
  hypothesisCount: number;
  openRecommendationCount: number;
  activeExperimentCount: number;
  openAlertCount: number;
  continuousImprovementCount: number;
  maturityAssessmentCount: number;
  overallLearningConfidence: string;
};

export type UpdateBevPlatformConfigRequest = {
  learningGovernance?: Record<string, unknown>;
  experimentSafetyDefaults?: Record<string, unknown>;
  evaluationTemplates?: Record<string, unknown>;
  aggregationThresholds?: Record<string, unknown>;
  crossTenantPrivacyRules?: Record<string, unknown>;
  agentImprovementStandards?: Record<string, unknown>;
  autonomousAllowlist?: Record<string, unknown>;
  rollbackRequirements?: Record<string, unknown>;
  auditRetentionDays?: number;
  recommendationThresholds?: Record<string, unknown>;
  learningScope?: Record<string, unknown>;
  dataSources?: Record<string, unknown>;
};

export type CreateBevObservationRequest = {
  observationKey: string;
  sourceModule?: string;
  observationType: string;
  title: string;
  description?: string;
  learningStage?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  evidence?: Record<string, unknown>;
  config?: Record<string, unknown>;
  observedAt?: string;
};

export type CreateBevHypothesisRequest = {
  hypothesisKey: string;
  title: string;
  problemStatement?: string;
  proposedChange?: string;
  expectedOutcome?: string;
  supportingEvidence?: Record<string, unknown>;
  riskLevel?: string;
  affectedUsers?: Record<string, unknown>;
  requiredApprovals?: Record<string, unknown>;
  measurementMethod?: string;
  successCriteria?: string;
  rollbackPlan?: string;
  patternId?: string;
};

export type CreateBevRecommendationRequest = {
  recommendationKey: string;
  category: string;
  title: string;
  description?: string;
  expectedBenefit?: string;
  expectedCost?: string;
  confidenceScore?: number;
  requiredEffort?: string;
  riskLevel?: string;
  dependencies?: Record<string, unknown>;
  supportingEvidence?: Record<string, unknown>;
  recommendedOwnerUserId?: string;
  approvalRequired?: boolean;
  measurementPlan?: string;
  rollbackPlan?: string;
  hypothesisId?: string;
};

export type CreateBevExperimentRequest = {
  experimentKey: string;
  title: string;
  description?: string;
  experimentType: string;
  riskLevel?: string;
  controlGroup?: Record<string, unknown>;
  testGroup?: Record<string, unknown>;
  eligibleRecords?: Record<string, unknown>;
  exclusions?: Record<string, unknown>;
  successMetrics?: Record<string, unknown>;
  failureThresholds?: Record<string, unknown>;
  stopConditions?: Record<string, unknown>;
  spendingLimitCents?: number;
  safetyControls?: Record<string, unknown>;
  hypothesisId?: string;
  recommendationId?: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
};

export type CreateBevOutcomeRequest = {
  experimentId?: string;
  recommendationId?: string;
  title: string;
  baselineMetrics?: Record<string, unknown>;
  afterMetrics?: Record<string, unknown>;
  controlMetrics?: Record<string, unknown>;
  operationalImpact?: string;
  financialImpactCents?: number;
  customerImpact?: string;
  workforceImpact?: string;
  complianceImpact?: string;
  sideEffects?: Record<string, unknown>;
  statisticalConfidence?: number;
  learningStage?: string;
  measuredAt?: string;
};

export type CreateBevUserFeedbackRequest = {
  targetType: string;
  targetId: string;
  feedbackRating: string;
  feedbackText?: string;
  metadata?: Record<string, unknown>;
};

export type CreateBevContinuousImprovementItemRequest = {
  itemKey: string;
  sourceType: string;
  title: string;
  description?: string;
  priority?: string;
  ownerUserId?: string;
  expectedBenefit?: string;
  evidence?: Record<string, unknown>;
};

export type CreateBevEvolutionActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};

export type UpdateBevRecommendationRequest = Partial<CreateBevRecommendationRequest> & {
  workflowStatus?: string;
};

export type UpdateBevExperimentRequest = Partial<CreateBevExperimentRequest> & {
  workflowStatus?: string;
  startedAt?: string;
  completedAt?: string;
};

export type UpdateBevHypothesisRequest = Partial<CreateBevHypothesisRequest> & {
  learningStage?: string;
};

export type ExecuteBevSafeOptimizationRequest = {
  optimizationKey: string;
  input?: Record<string, unknown>;
};
