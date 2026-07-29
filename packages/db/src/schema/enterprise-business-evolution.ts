import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const bevWorkflowStatusEnum = pgEnum('bev_workflow_status', [
  'draft',
  'review',
  'pending_approval',
  'approved',
  'executed',
  'cancelled',
  'archived',
]);

export const bevLearningStageEnum = pgEnum('bev_learning_stage', [
  'observed',
  'analyzed',
  'hypothesized',
  'reviewed',
  'approved_for_testing',
  'tested',
  'measured',
  'validated',
  'rejected',
  'published',
  'monitored',
  'retired',
]);

export const bevRiskLevelEnum = pgEnum('bev_risk_level', ['low', 'medium', 'high', 'critical']);

export const bevAlertSeverityEnum = pgEnum('bev_alert_severity', ['info', 'warning', 'critical']);

export const bevAlertStatusEnum = pgEnum('bev_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);

export const bevExperimentStatusEnum = pgEnum('bev_experiment_status', [
  'draft',
  'review',
  'risk_assessment',
  'approved',
  'scheduled',
  'active',
  'paused',
  'completed',
  'measured',
  'validated',
  'rejected',
  'archived',
]);

export const bevRecommendationStatusEnum = pgEnum('bev_recommendation_status', [
  'created',
  'viewed',
  'accepted',
  'rejected',
  'deferred',
  'approved',
  'implemented',
  'failed',
  'rolled_back',
  'measured',
  'validated',
]);

export const bevFeedbackRatingEnum = pgEnum('bev_feedback_rating', [
  'accurate',
  'inaccurate',
  'useful',
  'not_useful',
  'missing_evidence',
  'wrong_priority',
  'wrong_explanation',
  'unsafe',
  'duplicate',
  'needs_correction',
  'custom',
]);

export const bevPlatformConfig = pgTable('bev_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  learningGovernance: jsonb('learning_governance')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  experimentSafetyDefaults: jsonb('experiment_safety_defaults')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  evaluationTemplates: jsonb('evaluation_templates')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  aggregationThresholds: jsonb('aggregation_thresholds')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  crossTenantPrivacyRules: jsonb('cross_tenant_privacy_rules')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  agentImprovementStandards: jsonb('agent_improvement_standards')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  autonomousAllowlist: jsonb('autonomous_allowlist')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  rollbackRequirements: jsonb('rollback_requirements')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  recommendationThresholds: jsonb('recommendation_thresholds')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  learningScope: jsonb('learning_scope').$type<Record<string, unknown>>().notNull().default({}),
  dataSources: jsonb('data_sources').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevObservations = pgTable('bev_observations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  observationKey: text('observation_key').notNull(),
  sourceModule: text('source_module'),
  observationType: text('observation_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  learningStage: bevLearningStageEnum('learning_stage').notNull().default('observed'),
  sourceEntityType: text('source_entity_type'),
  sourceEntityId: uuid('source_entity_id'),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevPatterns = pgTable('bev_patterns', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  patternKey: text('pattern_key').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  learningStage: bevLearningStageEnum('learning_stage').notNull().default('analyzed'),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  frequency: integer('frequency').notNull().default(0),
  businessImpact: text('business_impact'),
  affectedModules: jsonb('affected_modules').$type<Record<string, unknown>>().notNull().default({}),
  possibleCauses: jsonb('possible_causes').$type<Record<string, unknown>>().notNull().default({}),
  limitations: jsonb('limitations').$type<Record<string, unknown>>().notNull().default({}),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  timePeriodStart: timestamp('time_period_start', { withTimezone: true }),
  timePeriodEnd: timestamp('time_period_end', { withTimezone: true }),
  dataFreshnessAt: timestamp('data_freshness_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevHypotheses = pgTable('bev_hypotheses', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  hypothesisKey: text('hypothesis_key').notNull(),
  title: text('title').notNull(),
  problemStatement: text('problem_statement'),
  proposedChange: text('proposed_change'),
  expectedOutcome: text('expected_outcome'),
  supportingEvidence: jsonb('supporting_evidence')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  riskLevel: bevRiskLevelEnum('risk_level').notNull().default('medium'),
  affectedUsers: jsonb('affected_users').$type<Record<string, unknown>>().notNull().default({}),
  requiredApprovals: jsonb('required_approvals')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  measurementMethod: text('measurement_method'),
  successCriteria: text('success_criteria'),
  rollbackPlan: text('rollback_plan'),
  learningStage: bevLearningStageEnum('learning_stage').notNull().default('hypothesized'),
  patternId: uuid('pattern_id').references(() => bevPatterns.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevRecommendations = pgTable('bev_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  recommendationKey: text('recommendation_key').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  expectedBenefit: text('expected_benefit'),
  expectedCost: text('expected_cost'),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  requiredEffort: text('required_effort'),
  riskLevel: bevRiskLevelEnum('risk_level').notNull().default('medium'),
  dependencies: jsonb('dependencies').$type<Record<string, unknown>>().notNull().default({}),
  supportingEvidence: jsonb('supporting_evidence')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  recommendedOwnerUserId: uuid('recommended_owner_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvalRequired: boolean('approval_required').notNull().default(true),
  measurementPlan: text('measurement_plan'),
  rollbackPlan: text('rollback_plan'),
  workflowStatus: bevRecommendationStatusEnum('workflow_status').notNull().default('created'),
  hypothesisId: uuid('hypothesis_id').references(() => bevHypotheses.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevRecommendationEvents = pgTable('bev_recommendation_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  recommendationId: uuid('recommendation_id')
    .notNull()
    .references(() => bevRecommendations.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  decisionReason: text('decision_reason'),
  reviewingUserId: uuid('reviewing_user_id').references(() => users.id, { onDelete: 'set null' }),
  implementationOwnerUserId: uuid('implementation_owner_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  expectedOutcome: text('expected_outcome'),
  actualOutcome: text('actual_outcome'),
  variance: text('variance'),
  lessonsLearned: text('lessons_learned'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevExperiments = pgTable('bev_experiments', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  experimentKey: text('experiment_key').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  experimentType: text('experiment_type').notNull(),
  workflowStatus: bevExperimentStatusEnum('workflow_status').notNull().default('draft'),
  riskLevel: bevRiskLevelEnum('risk_level').notNull().default('medium'),
  controlGroup: jsonb('control_group').$type<Record<string, unknown>>().notNull().default({}),
  testGroup: jsonb('test_group').$type<Record<string, unknown>>().notNull().default({}),
  eligibleRecords: jsonb('eligible_records').$type<Record<string, unknown>>().notNull().default({}),
  exclusions: jsonb('exclusions').$type<Record<string, unknown>>().notNull().default({}),
  successMetrics: jsonb('success_metrics').$type<Record<string, unknown>>().notNull().default({}),
  failureThresholds: jsonb('failure_thresholds')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  stopConditions: jsonb('stop_conditions').$type<Record<string, unknown>>().notNull().default({}),
  spendingLimitCents: integer('spending_limit_cents'),
  safetyControls: jsonb('safety_controls').$type<Record<string, unknown>>().notNull().default({}),
  hypothesisId: uuid('hypothesis_id').references(() => bevHypotheses.id, { onDelete: 'set null' }),
  recommendationId: uuid('recommendation_id').references(() => bevRecommendations.id, {
    onDelete: 'set null',
  }),
  scheduledStartAt: timestamp('scheduled_start_at', { withTimezone: true }),
  scheduledEndAt: timestamp('scheduled_end_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevOutcomes = pgTable('bev_outcomes', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  experimentId: uuid('experiment_id').references(() => bevExperiments.id, { onDelete: 'set null' }),
  recommendationId: uuid('recommendation_id').references(() => bevRecommendations.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  baselineMetrics: jsonb('baseline_metrics').$type<Record<string, unknown>>().notNull().default({}),
  afterMetrics: jsonb('after_metrics').$type<Record<string, unknown>>().notNull().default({}),
  controlMetrics: jsonb('control_metrics').$type<Record<string, unknown>>().notNull().default({}),
  operationalImpact: text('operational_impact'),
  financialImpactCents: integer('financial_impact_cents'),
  customerImpact: text('customer_impact'),
  workforceImpact: text('workforce_impact'),
  complianceImpact: text('compliance_impact'),
  sideEffects: jsonb('side_effects').$type<Record<string, unknown>>().notNull().default({}),
  statisticalConfidence: numeric('statistical_confidence', { precision: 5, scale: 2 }),
  learningStage: bevLearningStageEnum('learning_stage').notNull().default('measured'),
  measuredAt: timestamp('measured_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevUserFeedback = pgTable('bev_user_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  feedbackRating: bevFeedbackRatingEnum('feedback_rating').notNull(),
  feedbackText: text('feedback_text'),
  submittedByUserId: uuid('submitted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevAgentPerformanceSnapshots = pgTable('bev_agent_performance_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agentKey: text('agent_key').notNull(),
  taskVolume: integer('task_volume').notNull().default(0),
  successRate: numeric('success_rate', { precision: 5, scale: 2 }),
  failureRate: numeric('failure_rate', { precision: 5, scale: 2 }),
  approvalRate: numeric('approval_rate', { precision: 5, scale: 2 }),
  rejectionRate: numeric('rejection_rate', { precision: 5, scale: 2 }),
  correctionRate: numeric('correction_rate', { precision: 5, scale: 2 }),
  avgLatencyMs: integer('avg_latency_ms'),
  toolFailureCount: integer('tool_failure_count').notNull().default(0),
  policyViolationCount: integer('policy_violation_count').notNull().default(0),
  costCents: integer('cost_cents').notNull().default(0),
  providerKey: text('provider_key'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevAgentImprovements = pgTable('bev_agent_improvements', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agentKey: text('agent_key').notNull(),
  improvementType: text('improvement_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  workflowStatus: bevWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  versionLabel: text('version_label'),
  changeReason: text('change_reason'),
  securityReviewRequired: boolean('security_review_required').notNull().default(false),
  stagingTestRequired: boolean('staging_test_required').notNull().default(false),
  performanceBefore: jsonb('performance_before')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  performanceAfter: jsonb('performance_after').$type<Record<string, unknown>>().notNull().default({}),
  rollbackVersionLabel: text('rollback_version_label'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevPromptPolicyVersions = pgTable('bev_prompt_policy_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  policyType: text('policy_type').notNull(),
  policyKey: text('policy_key').notNull(),
  versionLabel: text('version_label').notNull(),
  content: text('content').notNull(),
  changeReason: text('change_reason'),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  effectiveAt: timestamp('effective_at', { withTimezone: true }),
  rollbackVersionLabel: text('rollback_version_label'),
  performanceBefore: jsonb('performance_before')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  performanceAfter: jsonb('performance_after').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: bevWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevAiEvaluations = pgTable('bev_ai_evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  evaluationKey: text('evaluation_key').notNull(),
  evaluationType: text('evaluation_type').notNull(),
  datasetRef: text('dataset_ref'),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: bevWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }),
  summary: text('summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevKnowledgeReinforcements = pgTable('bev_knowledge_reinforcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  lessonTitle: text('lesson_title').notNull(),
  lessonContent: text('lesson_content').notNull(),
  knowledgeNodeRef: text('knowledge_node_ref'),
  linkedEntities: jsonb('linked_entities').$type<Record<string, unknown>>().notNull().default({}),
  validatedAt: timestamp('validated_at', { withTimezone: true }),
  validatedByUserId: uuid('validated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  learningStage: bevLearningStageEnum('learning_stage').notNull().default('validated'),
  sourceOutcomeId: uuid('source_outcome_id').references(() => bevOutcomes.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevProcessMiningResults = pgTable('bev_process_mining_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  processKey: text('process_key').notNull(),
  title: text('title').notNull(),
  actualPath: jsonb('actual_path').$type<Record<string, unknown>>().notNull().default({}),
  expectedPath: jsonb('expected_path').$type<Record<string, unknown>>().notNull().default({}),
  bottlenecks: jsonb('bottlenecks').$type<Record<string, unknown>>().notNull().default({}),
  reworkLoops: jsonb('rework_loops').$type<Record<string, unknown>>().notNull().default({}),
  deviations: jsonb('deviations').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevStrategicRoadmapItems = pgTable('bev_strategic_roadmap_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  themeKey: text('theme_key').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority').notNull().default('medium'),
  workflowStatus: bevWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  expectedOutcomes: jsonb('expected_outcomes').$type<Record<string, unknown>>().notNull().default({}),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  dependencies: jsonb('dependencies').$type<Record<string, unknown>>().notNull().default({}),
  budgetCents: integer('budget_cents'),
  milestones: jsonb('milestones').$type<Record<string, unknown>>().notNull().default({}),
  progressPercent: numeric('progress_percent', { precision: 5, scale: 2 }),
  benefitRealizedCents: integer('benefit_realized_cents'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevMaturityAssessments = pgTable('bev_maturity_assessments', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  frameworkKey: text('framework_key').notNull(),
  domain: text('domain').notNull(),
  criteria: jsonb('criteria').$type<Record<string, unknown>>().notNull().default({}),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  score: numeric('score', { precision: 5, scale: 2 }),
  scoringMethod: text('scoring_method'),
  reviewerUserId: uuid('reviewer_user_id').references(() => users.id, { onDelete: 'set null' }),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  gaps: jsonb('gaps').$type<Record<string, unknown>>().notNull().default({}),
  recommendedSteps: jsonb('recommended_steps')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  assessedAt: timestamp('assessed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevContinuousImprovementItems = pgTable('bev_continuous_improvement_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  itemKey: text('item_key').notNull(),
  sourceType: text('source_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority').notNull().default('medium'),
  workflowStatus: bevWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  expectedBenefit: text('expected_benefit'),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevAutonomousOptimizations = pgTable('bev_autonomous_optimizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  optimizationKey: text('optimization_key').notNull(),
  allowlistKey: text('allowlist_key'),
  title: text('title').notNull(),
  description: text('description'),
  workflowStatus: bevWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  riskLevel: bevRiskLevelEnum('risk_level').notNull().default('medium'),
  rollbackPlan: text('rollback_plan'),
  verified: boolean('verified').notNull().default(false),
  output: jsonb('output').$type<Record<string, unknown>>().notNull().default({}),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevEvolutionAlerts = pgTable('bev_evolution_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: bevAlertSeverityEnum('severity').notNull().default('warning'),
  status: bevAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  sourceModule: text('source_module'),
  incidentId: uuid('incident_id'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevActionDrafts = pgTable('bev_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  workflowStatus: bevWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevAnalyticsSnapshots = pgTable('bev_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bevAuditLogs = pgTable('bev_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BevPlatformConfig = typeof bevPlatformConfig.$inferSelect;
export type BevObservation = typeof bevObservations.$inferSelect;
export type BevPattern = typeof bevPatterns.$inferSelect;
export type BevHypothesis = typeof bevHypotheses.$inferSelect;
export type BevRecommendation = typeof bevRecommendations.$inferSelect;
export type BevRecommendationEvent = typeof bevRecommendationEvents.$inferSelect;
export type BevExperiment = typeof bevExperiments.$inferSelect;
export type BevOutcome = typeof bevOutcomes.$inferSelect;
export type BevUserFeedback = typeof bevUserFeedback.$inferSelect;
export type BevAgentPerformanceSnapshot = typeof bevAgentPerformanceSnapshots.$inferSelect;
export type BevAgentImprovement = typeof bevAgentImprovements.$inferSelect;
export type BevPromptPolicyVersion = typeof bevPromptPolicyVersions.$inferSelect;
export type BevAiEvaluation = typeof bevAiEvaluations.$inferSelect;
export type BevKnowledgeReinforcement = typeof bevKnowledgeReinforcements.$inferSelect;
export type BevProcessMiningResult = typeof bevProcessMiningResults.$inferSelect;
export type BevStrategicRoadmapItem = typeof bevStrategicRoadmapItems.$inferSelect;
export type BevMaturityAssessment = typeof bevMaturityAssessments.$inferSelect;
export type BevContinuousImprovementItem = typeof bevContinuousImprovementItems.$inferSelect;
export type BevAutonomousOptimization = typeof bevAutonomousOptimizations.$inferSelect;
export type BevEvolutionAlert = typeof bevEvolutionAlerts.$inferSelect;
export type BevActionDraft = typeof bevActionDrafts.$inferSelect;
export type BevAnalyticsSnapshot = typeof bevAnalyticsSnapshots.$inferSelect;
export type BevAuditLog = typeof bevAuditLogs.$inferSelect;
