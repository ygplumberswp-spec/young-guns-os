import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const evolutionLearningSourceTypeEnum = pgEnum('evolution_learning_source_type', [
  'user_approval',
  'user_correction',
  'completed_job',
  'customer_feedback',
  'technician_performance',
  'financial_outcome',
  'workflow_history',
  'ai_interaction',
  'business_decision',
]);

export const evolutionLearningStatusEnum = pgEnum('evolution_learning_status', [
  'pending_approval',
  'approved',
  'rejected',
  'rolled_back',
]);

export const evolutionPatternTypeEnum = pgEnum('evolution_pattern_type', [
  'operational_trend',
  'customer_behaviour',
  'technician_strength',
  'inventory_demand',
  'fleet_utilization',
  'seasonal_change',
  'financial_anomaly',
  'business_risk',
]);

export const evolutionRecommendationCategoryEnum = pgEnum('evolution_recommendation_category', [
  'scheduling',
  'dispatch',
  'fleet',
  'inventory',
  'procurement',
  'pricing',
  'marketing',
  'finance',
  'workforce',
  'customer_success',
  'ai_prompts',
  'automation',
]);

export const evolutionRecommendationStatusEnum = pgEnum('evolution_recommendation_status', [
  'pending',
  'accepted',
  'dismissed',
  'completed',
]);

export const evolutionOptimizationStatusEnum = pgEnum('evolution_optimization_status', [
  'suggested',
  'pending_approval',
  'approved',
  'rejected',
  'deployed',
  'rolled_back',
]);

export const evolutionTimelineEventTypeEnum = pgEnum('evolution_timeline_event_type', [
  'system_improvement',
  'ai_learning',
  'workflow_improvement',
  'kpi_improvement',
  'business_growth',
  'optimization_history',
]);

export const evolutionLearningEvents = pgTable('evolution_learning_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  sourceType: evolutionLearningSourceTypeEnum('source_type').notNull(),
  status: evolutionLearningStatusEnum('status').notNull().default('pending_approval'),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  confidenceScore: doublePrecision('confidence_score'),
  sourceModule: text('source_module'),
  sourceEntityType: text('source_entity_type'),
  sourceEntityId: uuid('source_entity_id'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  requiresApproval: boolean('requires_approval').notNull().default(true),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rolledBackAt: timestamp('rolled_back_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const evolutionLearningAudit = pgTable('evolution_learning_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  learningEventId: uuid('learning_event_id').references(() => evolutionLearningEvents.id, {
    onDelete: 'set null',
  }),
  actionType: text('action_type').notNull(),
  description: text('description').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull().default({}),
  performedByUserId: uuid('performed_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  performedAt: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const evolutionModelVersions = pgTable('evolution_model_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  versionLabel: text('version_label').notNull(),
  description: text('description'),
  confidenceScore: doublePrecision('confidence_score'),
  learningEventCount: integer('learning_event_count').notNull().default(0),
  isActive: boolean('is_active').notNull().default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const evolutionPatterns = pgTable('evolution_patterns', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  patternType: evolutionPatternTypeEnum('pattern_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  confidenceScore: doublePrecision('confidence_score'),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const evolutionRecommendations = pgTable('evolution_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  category: evolutionRecommendationCategoryEnum('category').notNull(),
  title: text('title').notNull(),
  recommendation: text('recommendation').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: evolutionRecommendationStatusEnum('status').notNull().default('pending'),
  confidenceScore: doublePrecision('confidence_score'),
  estimatedImpact: text('estimated_impact'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const evolutionOptimizationStudio = pgTable('evolution_optimization_studio', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: evolutionOptimizationStatusEnum('status').notNull().default('suggested'),
  estimatedImpact: text('estimated_impact'),
  riskAssessment: text('risk_assessment'),
  costAnalysis: text('cost_analysis'),
  confidenceScore: doublePrecision('confidence_score'),
  recommendationId: uuid('recommendation_id').references(() => evolutionRecommendations.id, {
    onDelete: 'set null',
  }),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  deployedAt: timestamp('deployed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const evolutionTimelineEvents = pgTable('evolution_timeline_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  eventType: evolutionTimelineEventTypeEnum('event_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  sourceModule: text('source_module'),
  entityId: uuid('entity_id'),
  impactSummary: text('impact_summary'),
  eventAt: timestamp('event_at', { withTimezone: true }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const evolutionSnapshots = pgTable('evolution_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  optimizationScore: integer('optimization_score'),
  learningProgressPercent: doublePrecision('learning_progress_percent'),
  aiConfidenceScore: doublePrecision('ai_confidence_score'),
  recommendationAcceptanceRate: doublePrecision('recommendation_acceptance_rate'),
  learningEventCount: integer('learning_event_count').notNull().default(0),
  patternCount: integer('pattern_count').notNull().default(0),
  pendingRecommendationCount: integer('pending_recommendation_count').notNull().default(0),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const evolutionSafeLearningPolicies = pgTable('evolution_safe_learning_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  sourceType: evolutionLearningSourceTypeEnum('source_type').notNull(),
  requiresApproval: boolean('requires_approval').notNull().default(true),
  allowRollback: boolean('allow_rollback').notNull().default(true),
  minConfidenceScore: doublePrecision('min_confidence_score'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type EvolutionLearningEventRow = typeof evolutionLearningEvents.$inferSelect;
export type EvolutionRecommendationRow = typeof evolutionRecommendations.$inferSelect;
export type EvolutionOptimizationStudioRow = typeof evolutionOptimizationStudio.$inferSelect;
