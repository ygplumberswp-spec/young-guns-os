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
import { users } from './users';

export const dmAlertSeverityEnum = pgEnum('dm_alert_severity', ['info', 'warning', 'critical']);
export const dmAlertStatusEnum = pgEnum('dm_alert_status', ['open', 'acknowledged', 'resolved', 'dismissed']);
export const dmSourceFormatEnum = pgEnum('dm_source_format', ['csv', 'excel', 'json', 'xml']);
export const dmEntityTypeEnum = pgEnum('dm_entity_type', [
  'customer',
  'lead',
  'supplier',
  'contact',
  'property',
  'asset',
  'vehicle',
  'technician',
  'job',
  'quote',
  'invoice',
  'payment',
  'inventory',
  'purchase_order',
  'document',
  'knowledge_article',
  'user',
  'role',
  'settings',
]);
export const dmWizardStepEnum = pgEnum('dm_wizard_step', [
  'select_source',
  'upload_file',
  'detect_structure',
  'auto_map',
  'manual_map',
  'validation',
  'preview',
  'approval',
  'import',
  'summary',
]);
export const dmImportStatusEnum = pgEnum('dm_import_status', [
  'draft',
  'uploaded',
  'structure_detected',
  'mapped',
  'validated',
  'preview_ready',
  'pending_approval',
  'approved',
  'importing',
  'completed',
  'failed',
  'rolled_back',
  'cancelled',
]);
export const dmExportStatusEnum = pgEnum('dm_export_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export const dmDuplicateActionEnum = pgEnum('dm_duplicate_action', [
  'merge',
  'skip',
  'replace',
  'create_new',
  'pending',
]);
export const dmValidationSeverityEnum = pgEnum('dm_validation_severity', ['error', 'warning', 'info']);
export const dmRollbackStatusEnum = pgEnum('dm_rollback_status', [
  'available',
  'pending',
  'in_progress',
  'completed',
  'unavailable',
]);
export const dmRecordOutcomeEnum = pgEnum('dm_record_outcome', [
  'imported',
  'failed',
  'skipped',
  'duplicate_pending',
]);

export const dmPlatformConfig = pgTable('dm_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  importPolicy: jsonb('import_policy').$type<Record<string, unknown>>().notNull().default({}),
  exportPolicy: jsonb('export_policy').$type<Record<string, unknown>>().notNull().default({}),
  validationPolicy: jsonb('validation_policy').$type<Record<string, unknown>>().notNull().default({}),
  duplicatePolicy: jsonb('duplicate_policy').$type<Record<string, unknown>>().notNull().default({}),
  rollbackPolicy: jsonb('rollback_policy').$type<Record<string, unknown>>().notNull().default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dmImportJobs = pgTable('dm_import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  sourceFormat: dmSourceFormatEnum('source_format').notNull(),
  entityType: dmEntityTypeEnum('entity_type').notNull(),
  wizardStep: dmWizardStepEnum('wizard_step').notNull().default('select_source'),
  status: dmImportStatusEnum('status').notNull().default('draft'),
  fileName: text('file_name'),
  fileContent: text('file_content'),
  detectedStructure: jsonb('detected_structure').$type<Record<string, unknown>>().notNull().default({}),
  fieldMappings: jsonb('field_mappings').$type<Record<string, string>>().notNull().default({}),
  validationSummary: jsonb('validation_summary').$type<Record<string, unknown>>().notNull().default({}),
  previewRows: jsonb('preview_rows').$type<Record<string, unknown>[]>().notNull().default([]),
  importedCount: integer('imported_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  skippedCount: integer('skipped_count').notNull().default(0),
  rollbackStatus: dmRollbackStatusEnum('rollback_status').notNull().default('unavailable'),
  requiresApproval: boolean('requires_approval').notNull().default(true),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dmExportJobs = pgTable('dm_export_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  exportScope: text('export_scope').notNull().default('module'),
  entityType: dmEntityTypeEnum('entity_type'),
  sourceFormat: dmSourceFormatEnum('source_format').notNull().default('csv'),
  filters: jsonb('filters').$type<Record<string, unknown>>().notNull().default({}),
  status: dmExportStatusEnum('status').notNull().default('pending'),
  scheduleCron: text('schedule_cron'),
  isScheduled: boolean('is_scheduled').notNull().default(false),
  recordCount: integer('record_count').notNull().default(0),
  fileName: text('file_name'),
  exportContent: text('export_content'),
  errorMessage: text('error_message'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dmFieldMappings = pgTable('dm_field_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  importJobId: uuid('import_job_id')
    .notNull()
    .references(() => dmImportJobs.id, { onDelete: 'cascade' }),
  sourceField: text('source_field').notNull(),
  targetField: text('target_field').notNull(),
  confidence: real('confidence'),
  isManualOverride: boolean('is_manual_override').notNull().default(false),
  aiSuggested: boolean('ai_suggested').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dmValidationResults = pgTable('dm_validation_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  importJobId: uuid('import_job_id')
    .notNull()
    .references(() => dmImportJobs.id, { onDelete: 'cascade' }),
  rowNumber: integer('row_number').notNull(),
  fieldName: text('field_name'),
  severity: dmValidationSeverityEnum('severity').notNull().default('error'),
  errorCode: text('error_code').notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dmDuplicateReviews = pgTable('dm_duplicate_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  importJobId: uuid('import_job_id')
    .notNull()
    .references(() => dmImportJobs.id, { onDelete: 'cascade' }),
  rowNumber: integer('row_number').notNull(),
  duplicateKey: text('duplicate_key').notNull(),
  existingEntityId: uuid('existing_entity_id'),
  proposedAction: dmDuplicateActionEnum('proposed_action').notNull().default('pending'),
  resolvedAction: dmDuplicateActionEnum('resolved_action'),
  resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dmImportRecords = pgTable('dm_import_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  importJobId: uuid('import_job_id')
    .notNull()
    .references(() => dmImportJobs.id, { onDelete: 'cascade' }),
  rowNumber: integer('row_number').notNull(),
  outcome: dmRecordOutcomeEnum('outcome').notNull(),
  sourceEntityId: uuid('source_entity_id'),
  targetEntityId: uuid('target_entity_id'),
  errorMessage: text('error_message'),
  sourceData: jsonb('source_data').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dmMigrationHistory = pgTable('dm_migration_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  importJobId: uuid('import_job_id').references(() => dmImportJobs.id, { onDelete: 'set null' }),
  exportJobId: uuid('export_job_id').references(() => dmExportJobs.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  actionType: text('action_type').notNull(),
  sourceFormat: dmSourceFormatEnum('source_format'),
  entityType: dmEntityTypeEnum('entity_type'),
  summary: text('summary').notNull(),
  importedCount: integer('imported_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  validationErrorCount: integer('validation_error_count').notNull().default(0),
  rollbackAvailable: boolean('rollback_available').notNull().default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dmRollbackRequests = pgTable('dm_rollback_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  importJobId: uuid('import_job_id')
    .notNull()
    .references(() => dmImportJobs.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  status: dmRollbackStatusEnum('status').notNull().default('pending'),
  reason: text('reason'),
  recordsAffected: integer('records_affected').notNull().default(0),
  requiresApproval: boolean('requires_approval').notNull().default(true),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dmMigrationAlerts = pgTable('dm_migration_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: dmAlertSeverityEnum('severity').notNull().default('warning'),
  status: dmAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  importJobId: uuid('import_job_id').references(() => dmImportJobs.id, { onDelete: 'set null' }),
  exportJobId: uuid('export_job_id').references(() => dmExportJobs.id, { onDelete: 'set null' }),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dmAnalyticsSnapshots = pgTable('dm_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dmActionDrafts = pgTable('dm_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dmAuditLogs = pgTable('dm_audit_logs', {
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

export type DmPlatformConfig = typeof dmPlatformConfig.$inferSelect;
export type DmImportJob = typeof dmImportJobs.$inferSelect;
