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
import { auraMemory } from './aura-memory';
import { auraCommandMemory } from './aura-command-centre';
import { companies } from './companies';
import { users } from './users';

/**
 * AURA Evolution / Learning Agent — Department 2.3.
 * Learns from real approval/workflow signals; extends Command Centre memory.
 * No demo rows. No automatic business rule / finance / customer mutations.
 */

export const auraEvolutionDecisionSourceEnum = pgEnum('aura_evolution_decision_source', [
  'command_centre_memory',
  'command_centre_action',
  'command_centre_handoff',
  'agent_task',
  'workflow_aura_suggestion',
  'maintenance_aura_suggestion',
  'evolution_recommendation',
  'network_approval',
]);

export const auraEvolutionDecisionOutcomeEnum = pgEnum('aura_evolution_decision_outcome', [
  'approved',
  'rejected',
  'accepted',
  'dismissed',
  'completed',
  'unknown',
]);

export const auraEvolutionPatternKindEnum = pgEnum('aura_evolution_pattern_kind', [
  'busy_period',
  'customer_behaviour',
  'revenue_trend',
  'job_trend',
  'maintenance_opportunity',
  'operational_bottleneck',
  'communication_pattern',
]);

export const auraEvolutionPatternAvailabilityEnum = pgEnum('aura_evolution_pattern_availability', [
  'available',
  'insufficient_data',
  'unavailable',
]);

export const auraEvolutionInsightStatusEnum = pgEnum('aura_evolution_insight_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'removed',
]);

export const auraEvolutionLearningItemKindEnum = pgEnum('aura_evolution_learning_item_kind', [
  'decision',
  'pattern',
  'insight',
  'recommendation_score',
  'knowledge_link',
]);

export const auraEvolutionKnowledgeKindEnum = pgEnum('aura_evolution_knowledge_kind', [
  'preference',
  'approved_process',
  'operating_rule',
  'important_context',
]);

export const auraEvolutionSettings = pgTable('aura_evolution_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' })
    .unique(),
  learningEnabled: boolean('learning_enabled').notNull().default(false),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auraEvolutionDecisions = pgTable('aura_evolution_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  sourceType: auraEvolutionDecisionSourceEnum('source_type').notNull(),
  sourceEntityId: uuid('source_entity_id'),
  title: text('title').notNull(),
  reasoningContext: text('reasoning_context').notNull(),
  outcome: auraEvolutionDecisionOutcomeEnum('outcome').notNull().default('unknown'),
  outcomeNotes: text('outcome_notes'),
  improvementOpportunity: text('improvement_opportunity'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auraEvolutionPatterns = pgTable('aura_evolution_patterns', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: auraEvolutionPatternKindEnum('kind').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  availability: auraEvolutionPatternAvailabilityEnum('availability')
    .notNull()
    .default('unavailable'),
  confidence: doublePrecision('confidence'),
  sampleSize: integer('sample_size').notNull().default(0),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  honestGap: text('honest_gap'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auraEvolutionRecommendationScores = pgTable('aura_evolution_recommendation_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  sourceModule: text('source_module').notNull(),
  recommendationKey: text('recommendation_key').notNull(),
  title: text('title').notNull(),
  timesProposed: integer('times_proposed').notNull().default(0),
  timesAccepted: integer('times_accepted').notNull().default(0),
  timesRejected: integer('times_rejected').notNull().default(0),
  successRate: doublePrecision('success_rate'),
  confidence: doublePrecision('confidence'),
  improvementSuggestion: text('improvement_suggestion'),
  lastOutcomeAt: timestamp('last_outcome_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auraEvolutionInsights = pgTable('aura_evolution_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  category: text('category').notNull().default('improvement'),
  status: auraEvolutionInsightStatusEnum('status').notNull().default('pending_approval'),
  confidence: doublePrecision('confidence'),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  requiresApproval: boolean('requires_approval').notNull().default(true),
  autoExecuted: boolean('auto_executed').notNull().default(false),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auraEvolutionLearningItems = pgTable('aura_evolution_learning_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: auraEvolutionLearningItemKindEnum('kind').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  linkedEntityType: text('linked_entity_type'),
  linkedEntityId: uuid('linked_entity_id'),
  removed: boolean('removed').notNull().default(false),
  removedByUserId: uuid('removed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  removedAt: timestamp('removed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auraEvolutionKnowledge = pgTable('aura_evolution_knowledge', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: auraEvolutionKnowledgeKindEnum('kind').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  commandMemoryId: uuid('command_memory_id').references(() => auraCommandMemory.id, {
    onDelete: 'set null',
  }),
  auraMemoryId: uuid('aura_memory_id').references(() => auraMemory.id, { onDelete: 'set null' }),
  enabled: boolean('enabled').notNull().default(true),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AuraEvolutionSettingsRow = typeof auraEvolutionSettings.$inferSelect;
export type AuraEvolutionDecisionRow = typeof auraEvolutionDecisions.$inferSelect;
export type AuraEvolutionPatternRow = typeof auraEvolutionPatterns.$inferSelect;
export type AuraEvolutionRecommendationScoreRow =
  typeof auraEvolutionRecommendationScores.$inferSelect;
export type AuraEvolutionInsightRow = typeof auraEvolutionInsights.$inferSelect;
export type AuraEvolutionLearningItemRow = typeof auraEvolutionLearningItems.$inferSelect;
export type AuraEvolutionKnowledgeRow = typeof auraEvolutionKnowledge.$inferSelect;
