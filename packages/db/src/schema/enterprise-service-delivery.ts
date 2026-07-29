import {
  boolean,
  date,
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
import { customers } from './customers';
import { jobs } from './jobs';
import { users } from './users';

export const sdWorkflowStatusEnum = pgEnum('sd_workflow_status', [
  'draft',
  'review',
  'pending_approval',
  'approved',
  'executed',
  'cancelled',
]);

export const sdAlertSeverityEnum = pgEnum('sd_alert_severity', ['info', 'warning', 'critical']);

export const sdAlertStatusEnum = pgEnum('sd_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);

export const sdInspectionStatusEnum = pgEnum('sd_inspection_status', [
  'draft',
  'in_progress',
  'review',
  'approved',
  'completed',
  'cancelled',
]);

export const sdPromiseTypeEnum = pgEnum('sd_promise_type', [
  'arrival_window',
  'eta',
  'response_time',
  'sla',
  'resolution_time',
  'quality',
  'warranty',
  'contract',
  'maintenance',
  'custom',
]);

export const sdSlaTypeEnum = pgEnum('sd_sla_type', [
  'response',
  'arrival',
  'completion',
  'contract',
  'customer',
  'warranty',
  'internal',
]);

export const sdPlatformConfig = pgTable('sd_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  serviceStandards: jsonb('service_standards').$type<Record<string, unknown>>().notNull().default({}),
  promiseTemplates: jsonb('promise_templates').$type<Record<string, unknown>>().notNull().default({}),
  slaTemplates: jsonb('sla_templates').$type<Record<string, unknown>>().notNull().default({}),
  inspectionTemplates: jsonb('inspection_templates').$type<Record<string, unknown>>().notNull().default({}),
  qualityStandards: jsonb('quality_standards').$type<Record<string, unknown>>().notNull().default({}),
  warrantyStandards: jsonb('warranty_standards').$type<Record<string, unknown>>().notNull().default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdServicePromises = pgTable('sd_service_promises', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  promiseType: sdPromiseTypeEnum('promise_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  workflowStatus: sdWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  promisedAt: timestamp('promised_at', { withTimezone: true }),
  dueAt: timestamp('due_at', { withTimezone: true }),
  fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdSlaFrameworks = pgTable('sd_sla_frameworks', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  frameworkKey: text('framework_key').notNull(),
  slaType: sdSlaTypeEnum('sla_type').notNull(),
  targetMinutes: integer('target_minutes'),
  warningThresholdMinutes: integer('warning_threshold_minutes'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdSlaRecords = pgTable('sd_sla_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  frameworkId: uuid('framework_id').references(() => sdSlaFrameworks.id, { onDelete: 'set null' }),
  slaType: sdSlaTypeEnum('sla_type').notNull(),
  targetAt: timestamp('target_at', { withTimezone: true }),
  breachedAt: timestamp('breached_at', { withTimezone: true }),
  metAt: timestamp('met_at', { withTimezone: true }),
  breachMinutes: integer('breach_minutes'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdJobExecutionSnapshots = pgTable('sd_job_execution_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  technicianUserId: uuid('technician_user_id').references(() => users.id, { onDelete: 'set null' }),
  snapshotKey: text('snapshot_key').notNull(),
  executionPhase: text('execution_phase'),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdInspectionTemplates = pgTable('sd_inspection_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  templateKey: text('template_key').notNull(),
  description: text('description'),
  checklist: jsonb('checklist').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdInspections = pgTable('sd_inspections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  templateId: uuid('template_id').references(() => sdInspectionTemplates.id, { onDelete: 'set null' }),
  inspectionStatus: sdInspectionStatusEnum('inspection_status').notNull().default('draft'),
  inspectorUserId: uuid('inspector_user_id').references(() => users.id, { onDelete: 'set null' }),
  findings: jsonb('findings').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdQaInspections = pgTable('sd_qa_inspections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  inspectionId: uuid('inspection_id').references(() => sdInspections.id, { onDelete: 'set null' }),
  qaScore: numeric('qa_score', { precision: 5, scale: 2 }),
  workflowStatus: sdWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  reviewerUserId: uuid('reviewer_user_id').references(() => users.id, { onDelete: 'set null' }),
  notes: text('notes'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdDefects = pgTable('sd_defects', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  inspectionId: uuid('inspection_id').references(() => sdInspections.id, { onDelete: 'set null' }),
  defectType: text('defect_type').notNull(),
  severity: sdAlertSeverityEnum('severity').notNull().default('warning'),
  description: text('description').notNull(),
  workflowStatus: sdWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  reportedByUserId: uuid('reported_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdNonConformances = pgTable('sd_non_conformances', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  defectId: uuid('defect_id').references(() => sdDefects.id, { onDelete: 'set null' }),
  ncNumber: text('nc_number'),
  title: text('title').notNull(),
  description: text('description'),
  workflowStatus: sdWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdCorrectiveActions = pgTable('sd_corrective_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  nonConformanceId: uuid('non_conformance_id').references(() => sdNonConformances.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  actionType: text('action_type').notNull(),
  workflowStatus: sdWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  dueAt: timestamp('due_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdPreventiveActions = pgTable('sd_preventive_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  correctiveActionId: uuid('corrective_action_id').references(() => sdCorrectiveActions.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  workflowStatus: sdWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  dueAt: timestamp('due_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdFirstTimeFixAnalyses = pgTable('sd_first_time_fix_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  technicianUserId: uuid('technician_user_id').references(() => users.id, { onDelete: 'set null' }),
  fixedFirstTime: boolean('fixed_first_time').notNull().default(true),
  rootCause: text('root_cause'),
  analysis: jsonb('analysis').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdCustomerAcceptances = pgTable('sd_customer_acceptances', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'restrict' }),
  workflowStatus: sdWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  signatureRef: text('signature_ref'),
  notes: text('notes'),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdWarrantyRecords = pgTable('sd_warranty_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'restrict' }),
  warrantyType: text('warranty_type').notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  terms: jsonb('terms').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdWarrantyClaimTrackings = pgTable('sd_warranty_claim_trackings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  warrantyRecordId: uuid('warranty_record_id')
    .notNull()
    .references(() => sdWarrantyRecords.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  claimNumber: text('claim_number'),
  workflowStatus: sdWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  description: text('description'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdCallbackRecords = pgTable('sd_callback_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  originalJobId: uuid('original_job_id').references(() => jobs.id, { onDelete: 'set null' }),
  callbackReason: text('callback_reason').notNull(),
  workflowStatus: sdWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdContinuousImprovementInitiatives = pgTable('sd_continuous_improvement_initiatives', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  initiativeKey: text('initiative_key').notNull(),
  workflowStatus: sdWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  targetDate: date('target_date'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdHandoverRecords = pgTable('sd_handover_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  handoverType: text('handover_type').notNull(),
  workflowStatus: sdWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  handedOverByUserId: uuid('handed_over_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  receivedByUserId: uuid('received_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  handoverAt: timestamp('handover_at', { withTimezone: true }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdVariationRecords = pgTable('sd_variation_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  variationType: text('variation_type').notNull(),
  description: text('description').notNull(),
  workflowStatus: sdWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdCompletionCertificates = pgTable('sd_completion_certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  certificateNumber: text('certificate_number'),
  workflowStatus: sdWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  issuedByUserId: uuid('issued_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdServiceAlerts = pgTable('sd_service_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: sdAlertSeverityEnum('severity').notNull().default('warning'),
  status: sdAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  sourceModule: text('source_module'),
  sourceEntityId: uuid('source_entity_id'),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  acknowledgedByUserId: uuid('acknowledged_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdServiceActionDrafts = pgTable('sd_service_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  workflowStatus: sdWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  requiresHumanReview: boolean('requires_human_review').notNull().default(true),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdAnalyticsSnapshots = pgTable('sd_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  activeJobCount: integer('active_job_count').notNull().default(0),
  completedJobCount: integer('completed_job_count').notNull().default(0),
  openPromiseCount: integer('open_promise_count').notNull().default(0),
  slaBreachCount: integer('sla_breach_count').notNull().default(0),
  openDefectCount: integer('open_defect_count').notNull().default(0),
  openCallbackCount: integer('open_callback_count').notNull().default(0),
  firstTimeFixRatePercent: numeric('first_time_fix_rate_percent', { precision: 5, scale: 2 }),
  openAlertCount: integer('open_alert_count').notNull().default(0),
  currency: text('currency').notNull().default('ZAR'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sdAuditLogs = pgTable('sd_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SdPlatformConfig = typeof sdPlatformConfig.$inferSelect;
export type SdServicePromise = typeof sdServicePromises.$inferSelect;
export type SdSlaFramework = typeof sdSlaFrameworks.$inferSelect;
export type SdSlaRecord = typeof sdSlaRecords.$inferSelect;
export type SdInspection = typeof sdInspections.$inferSelect;
export type SdServiceAlert = typeof sdServiceAlerts.$inferSelect;
export type SdAnalyticsSnapshot = typeof sdAnalyticsSnapshots.$inferSelect;
