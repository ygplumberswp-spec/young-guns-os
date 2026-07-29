import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const knowledgeGraphEntityTypeEnum = pgEnum('knowledge_graph_entity_type', [
  'customer',
  'job',
  'asset',
  'invoice',
  'inventory',
  'vehicle',
  'technician',
  'supplier',
  'document',
  'communication',
  'workflow',
  'ai_agent',
  'integration',
  'quote',
  'payment',
  'analytics_report',
  'digital_twin_snapshot',
  'organizational_memory',
]);

export const knowledgeGraphRelationshipTypeEnum = pgEnum('knowledge_graph_relationship_type', [
  'assigned_to',
  'belongs_to',
  'related_to',
  'depends_on',
  'created_by',
  'linked_document',
  'communicated_with',
  'executed_by',
  'connected_to',
  'parent_of',
  'child_of',
]);

export const organizationalMemoryTypeEnum = pgEnum('organizational_memory_type', [
  'business_decision',
  'sop',
  'policy',
  'customer_history',
  'technician_knowledge',
  'ai_insight',
  'lesson_learned',
  'meeting_summary',
  'project_history',
]);

export const knowledgeClassificationLevelEnum = pgEnum('knowledge_classification_level', [
  'public',
  'internal',
  'confidential',
  'restricted',
]);

export const knowledgeGraphActionTypeEnum = pgEnum('knowledge_graph_action_type', [
  'knowledge_summary',
  'documentation_improvement',
  'relationship_insight',
  'governance_recommendation',
  'executive_knowledge_report',
]);

export const knowledgeGraphActionStatusEnum = pgEnum('knowledge_graph_action_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const knowledgeGraphRecommendationStatusEnum = pgEnum('knowledge_graph_recommendation_status', [
  'pending',
  'accepted',
  'dismissed',
  'completed',
]);

export const knowledgeGraphEntities = pgTable('knowledge_graph_entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityType: knowledgeGraphEntityTypeEnum('entity_type').notNull(),
  sourceEntityId: uuid('source_entity_id').notNull(),
  label: text('label').notNull(),
  summary: text('summary'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  classification: knowledgeClassificationLevelEnum('classification').notNull().default('internal'),
  requiredPermissions: jsonb('required_permissions').$type<string[]>().notNull().default([]),
  indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeGraphRelationships = pgTable('knowledge_graph_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  sourceEntityId: uuid('source_entity_id')
    .notNull()
    .references(() => knowledgeGraphEntities.id, { onDelete: 'cascade' }),
  targetEntityId: uuid('target_entity_id')
    .notNull()
    .references(() => knowledgeGraphEntities.id, { onDelete: 'cascade' }),
  relationshipType: knowledgeGraphRelationshipTypeEnum('relationship_type').notNull(),
  label: text('label'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeGraphRelationshipHistory = pgTable('knowledge_graph_relationship_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  relationshipId: uuid('relationship_id')
    .notNull()
    .references(() => knowledgeGraphRelationships.id, { onDelete: 'cascade' }),
  changeType: text('change_type').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull().default({}),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const organizationalMemoryEntries = pgTable('organizational_memory_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  memoryType: organizationalMemoryTypeEnum('memory_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  summary: text('summary'),
  classification: knowledgeClassificationLevelEnum('classification').notNull().default('internal'),
  requiredPermissions: jsonb('required_permissions').$type<string[]>().notNull().default([]),
  relatedEntityIds: jsonb('related_entity_ids').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  versionNumber: integer('version_number').notNull().default(1),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeSemanticIndex = pgTable('knowledge_semantic_index', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityType: knowledgeGraphEntityTypeEnum('entity_type').notNull(),
  sourceEntityId: uuid('source_entity_id').notNull(),
  graphEntityId: uuid('graph_entity_id').references(() => knowledgeGraphEntities.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  searchableText: text('searchable_text').notNull(),
  keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
  embeddingHint: jsonb('embedding_hint').$type<Record<string, unknown>>().notNull().default({}),
  classification: knowledgeClassificationLevelEnum('classification').notNull().default('internal'),
  requiredPermissions: jsonb('required_permissions').$type<string[]>().notNull().default([]),
  indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeSavedSearches = pgTable('knowledge_saved_searches', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  query: text('query').notNull(),
  filters: jsonb('filters').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeSearchAudit = pgTable('knowledge_search_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  query: text('query').notNull(),
  resultCount: integer('result_count').notNull().default(0),
  searchMode: text('search_mode').notNull().default('hybrid'),
  searchedAt: timestamp('searched_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeGovernancePolicies = pgTable('knowledge_governance_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  classification: knowledgeClassificationLevelEnum('classification').notNull(),
  retentionDays: integer('retention_days'),
  requiredPermissions: jsonb('required_permissions').$type<string[]>().notNull().default([]),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeGraphAccessAudit = pgTable('knowledge_graph_access_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeGraphRecommendations = pgTable('knowledge_graph_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  recommendation: text('recommendation').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: knowledgeGraphRecommendationStatusEnum('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeGraphPlatformActions = pgTable('knowledge_graph_platform_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: knowledgeGraphActionTypeEnum('action_type').notNull(),
  status: knowledgeGraphActionStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type KnowledgeGraphEntityRow = typeof knowledgeGraphEntities.$inferSelect;
export type KnowledgeGraphRelationshipRow = typeof knowledgeGraphRelationships.$inferSelect;
export type OrganizationalMemoryEntryRow = typeof organizationalMemoryEntries.$inferSelect;
export type KnowledgeSemanticIndexRow = typeof knowledgeSemanticIndex.$inferSelect;
