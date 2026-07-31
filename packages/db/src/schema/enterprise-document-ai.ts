import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { documents } from './documents';
import { users } from './users';

export const dipWorkflowStatusEnum = pgEnum('dip_workflow_status', [
  'draft',
  'review',
  'published',
  'deprecated',
  'archived',
]);

export const dipAlertSeverityEnum = pgEnum('dip_alert_severity', ['info', 'warning', 'critical']);

export const dipAlertStatusEnum = pgEnum('dip_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);

export const dipOcrJobStatusEnum = pgEnum('dip_ocr_job_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);

export const dipReviewStatusEnum = pgEnum('dip_review_status', [
  'pending',
  'in_review',
  'approved',
  'corrected',
  'rejected',
  'reprocess',
]);

export const dipClassificationKeyEnum = pgEnum('dip_classification_key', [
  'customer_document',
  'job_document',
  'quote',
  'invoice',
  'purchase_order',
  'supplier_invoice',
  'delivery_note',
  'compliance_certificate',
  'inspection_report',
  'asset_record',
  'warranty',
  'technical_manual',
  'employment_document',
  'contract',
  'other',
]);

export const dipPlatformConfig = pgTable('dip_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  ocrPolicy: jsonb('ocr_policy').$type<Record<string, unknown>>().notNull().default({}),
  classificationPolicy: jsonb('classification_policy')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  extractionPolicy: jsonb('extraction_policy')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  reviewPolicy: jsonb('review_policy').$type<Record<string, unknown>>().notNull().default({}),
  searchPolicy: jsonb('search_policy').$type<Record<string, unknown>>().notNull().default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipOcrProviderConfigs = pgTable('dip_ocr_provider_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerKey: text('provider_key').notNull(),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: dipWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipSourceConfigs = pgTable('dip_source_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  sourceKey: text('source_key').notNull(),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: dipWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipOcrJobs = pgTable('dip_ocr_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  providerKey: text('provider_key'),
  sourceKey: text('source_key'),
  status: dipOcrJobStatusEnum('status').notNull().default('pending'),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const dipOcrResults = pgTable('dip_ocr_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  ocrJobId: uuid('ocr_job_id')
    .notNull()
    .references(() => dipOcrJobs.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  extractedText: text('extracted_text'),
  confidenceScore: real('confidence_score'),
  pageCount: integer('page_count'),
  languageCode: text('language_code'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipClassificationCatalog = pgTable('dip_classification_catalog', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  classificationKey: dipClassificationKeyEnum('classification_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  isSystemType: boolean('is_system_type').notNull().default(false),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipClassificationRecords = pgTable('dip_classification_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  classificationKey: dipClassificationKeyEnum('classification_key').notNull(),
  confidenceScore: real('confidence_score'),
  manuallyCorrected: boolean('manually_corrected').notNull().default(false),
  correctedByUserId: uuid('corrected_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipExtractionTemplates = pgTable('dip_extraction_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  templateKey: text('template_key').notNull(),
  name: text('name').notNull(),
  classificationKey: dipClassificationKeyEnum('classification_key'),
  fieldSchema: jsonb('field_schema').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: dipWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipExtractionRecords = pgTable('dip_extraction_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id').references(() => dipExtractionTemplates.id, {
    onDelete: 'set null',
  }),
  extractedFields: jsonb('extracted_fields').$type<Record<string, unknown>>().notNull().default({}),
  confidenceScore: real('confidence_score'),
  workflowStatus: dipWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipMatchingRecords = pgTable('dip_matching_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  confidenceScore: real('confidence_score'),
  requiresReview: boolean('requires_review').notNull().default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipReviewQueueItems = pgTable('dip_review_queue_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  reviewType: text('review_type').notNull(),
  status: dipReviewStatusEnum('status').notNull().default('pending'),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipReviewHistory = pgTable('dip_review_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  reviewQueueItemId: uuid('review_queue_item_id')
    .notNull()
    .references(() => dipReviewQueueItems.id, { onDelete: 'cascade' }),
  actionType: text('action_type').notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  notes: text('notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipIntelligenceRecords = pgTable('dip_intelligence_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  intelligenceType: text('intelligence_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  severity: dipAlertSeverityEnum('severity').notNull().default('info'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipWorkflowDrafts = pgTable('dip_workflow_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  approvalRequired: boolean('approval_required').notNull().default(true),
  workflowStatus: dipWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipSearchIndexEntries = pgTable('dip_search_index_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  ocrText: text('ocr_text'),
  aiSummary: text('ai_summary'),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  classificationKey: dipClassificationKeyEnum('classification_key'),
  relatedRecords: jsonb('related_records').$type<Record<string, unknown>>().notNull().default({}),
  indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipDocumentAlerts = pgTable('dip_document_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: dipAlertSeverityEnum('severity').notNull().default('warning'),
  status: dipAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  sourceModule: text('source_module'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipAnalyticsSnapshots = pgTable('dip_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipActionDrafts = pgTable('dip_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  workflowStatus: dipWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dipAuditLogs = pgTable('dip_audit_logs', {
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

export type DipPlatformConfig = typeof dipPlatformConfig.$inferSelect;
export type DipDocumentAlert = typeof dipDocumentAlerts.$inferSelect;
