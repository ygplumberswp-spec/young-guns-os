import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { documents } from './documents';
import { users } from './users';

export const knowledgeArticleTypeEnum = pgEnum('knowledge_article_type', [
  'article',
  'procedure',
  'documentation',
  'troubleshooting',
  'technical_reference',
  'internal_note',
  'faq',
]);

export const knowledgeContentStatusEnum = pgEnum('knowledge_content_status', [
  'draft',
  'pending_approval',
  'published',
  'archived',
]);

export const knowledgeEntityTypeEnum = pgEnum('knowledge_entity_type', [
  'article',
  'sop',
  'policy',
]);

export const policyTypeEnum = pgEnum('policy_type', [
  'safety',
  'hr',
  'operational',
  'financial',
  'compliance',
]);

export const trainingContentTypeEnum = pgEnum('training_content_type', [
  'video',
  'pdf',
  'manual',
  'article',
  'other',
]);

export const trainingCourseStatusEnum = pgEnum('training_course_status', [
  'draft',
  'active',
  'archived',
]);

export const trainingRecordStatusEnum = pgEnum('training_record_status', [
  'not_started',
  'in_progress',
  'completed',
  'expired',
]);

export const knowledgeRecommendationTypeEnum = pgEnum('knowledge_recommendation_type', [
  'missing_documentation',
  'outdated_sop',
  'expired_certification',
  'training_requirement',
  'frequently_requested',
]);

export const knowledgeRecommendationStatusEnum = pgEnum('knowledge_recommendation_status', [
  'pending',
  'accepted',
  'dismissed',
  'completed',
]);

export const knowledgeCategories = pgTable('knowledge_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  parentId: uuid('parent_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeArticles = pgTable('knowledge_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => knowledgeCategories.id, {
    onDelete: 'set null',
  }),
  articleType: knowledgeArticleTypeEnum('article_type').notNull().default('article'),
  title: text('title').notNull(),
  content: text('content').notNull(),
  summary: text('summary'),
  keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
  status: knowledgeContentStatusEnum('status').notNull().default('draft'),
  versionNumber: integer('version_number').notNull().default(1),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  relatedArticleIds: jsonb('related_article_ids').$type<string[]>().notNull().default([]),
  requiredPermissions: jsonb('required_permissions').$type<string[]>().notNull().default([]),
  customerVisible: boolean('customer_visible').notNull().default(false),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeVersions = pgTable('knowledge_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityType: knowledgeEntityTypeEnum('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  versionNumber: integer('version_number').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  changeSummary: text('change_summary'),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sopDocuments = pgTable('sop_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => knowledgeCategories.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  summary: text('summary'),
  department: text('department'),
  status: knowledgeContentStatusEnum('status').notNull().default('draft'),
  versionNumber: integer('version_number').notNull().default(1),
  effectiveDate: timestamp('effective_date', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
  requiredPermissions: jsonb('required_permissions').$type<string[]>().notNull().default([]),
  customerVisible: boolean('customer_visible').notNull().default(false),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const trainingCourses = pgTable('training_courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => knowledgeCategories.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  description: text('description'),
  contentType: trainingContentTypeEnum('content_type').notNull().default('article'),
  contentUrl: text('content_url'),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  skillTags: jsonb('skill_tags').$type<string[]>().notNull().default([]),
  certificationRequired: boolean('certification_required').notNull().default(false),
  certificationValidDays: integer('certification_valid_days'),
  status: trainingCourseStatusEnum('status').notNull().default('draft'),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeTrainingRecords = pgTable('knowledge_training_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id')
    .notNull()
    .references(() => trainingCourses.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: trainingRecordStatusEnum('status').notNull().default('not_started'),
  progressPercent: integer('progress_percent').notNull().default(0),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  certificationExpiresAt: timestamp('certification_expires_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const companyPolicies = pgTable('company_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => knowledgeCategories.id, {
    onDelete: 'set null',
  }),
  policyType: policyTypeEnum('policy_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  summary: text('summary'),
  status: knowledgeContentStatusEnum('status').notNull().default('draft'),
  versionNumber: integer('version_number').notNull().default(1),
  effectiveDate: timestamp('effective_date', { withTimezone: true }),
  expiryDate: timestamp('expiry_date', { withTimezone: true }),
  keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
  requiredPermissions: jsonb('required_permissions').$type<string[]>().notNull().default([]),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeRecommendations = pgTable('knowledge_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  recommendationType: knowledgeRecommendationTypeEnum('recommendation_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: knowledgeRecommendationStatusEnum('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type KnowledgeCategory = typeof knowledgeCategories.$inferSelect;
export type KnowledgeArticle = typeof knowledgeArticles.$inferSelect;
export type KnowledgeVersion = typeof knowledgeVersions.$inferSelect;
export type SopDocument = typeof sopDocuments.$inferSelect;
export type TrainingCourse = typeof trainingCourses.$inferSelect;
export type KnowledgeTrainingRecord = typeof knowledgeTrainingRecords.$inferSelect;
export type CompanyPolicy = typeof companyPolicies.$inferSelect;
export type KnowledgeRecommendation = typeof knowledgeRecommendations.$inferSelect;
