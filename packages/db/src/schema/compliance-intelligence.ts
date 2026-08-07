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
import { assetEquipment } from './asset-equipment';
import { companies } from './companies';
import { customers } from './customers';
import { documents } from './documents';
import { cxCustomerProperties } from './enterprise-customer-experience';
import { jobs } from './jobs';
import { users } from './users';

/**
 * Compliance Intelligence — SANS, COC workflows, checks, expiry, audit prep, AURA drafts.
 * Extends documents / DI / legal compliance / properties / jobs / equipment.
 * No fake compliance records. No automatic certification.
 */

export const cmiSansStatusEnum = pgEnum('cmi_sans_status', [
  'tracked',
  'retired',
  'reference_only',
]);

export const cmiCocWorkflowStatusEnum = pgEnum('cmi_coc_workflow_status', [
  'intake',
  'documents_gathering',
  'inspection_pending',
  'review',
  'ready_for_issue',
  'issued',
  'expired',
  'cancelled',
]);

export const cmiCheckResultEnum = pgEnum('cmi_check_result', [
  'pass',
  'fail',
  'incomplete',
  'not_applicable',
  'unavailable',
]);

export const cmiCheckKindEnum = pgEnum('cmi_check_kind', [
  'coc_present',
  'coc_unexpired',
  'sans_linked',
  'property_docs',
  'job_docs',
  'equipment_warranty',
  'insurance_present',
  'audit_pack_ready',
]);

export const cmiExpirySourceEnum = pgEnum('cmi_expiry_source', [
  'di_document_profile',
  'lc_compliance_record',
  'lc_insurance_policy',
  'asset_warranty',
  'coc_workflow',
]);

export const cmiExpiryStatusEnum = pgEnum('cmi_expiry_status', [
  'open',
  'acknowledged',
  'dismissed',
  'resolved',
]);

export const cmiAuditPackStatusEnum = pgEnum('cmi_audit_pack_status', [
  'draft',
  'ready_for_review',
  'archived',
]);

export const cmiRecommendationKindEnum = pgEnum('cmi_recommendation_kind', [
  'compliance_risk',
  'missing_doc',
  'expiry_alert',
]);

export const cmiRecommendationStatusEnum = pgEnum('cmi_recommendation_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'acknowledged',
]);

export const cmiAuraInsightTargetEnum = pgEnum('cmi_aura_insight_target', [
  'command_centre',
  'executive_dashboard',
  'documents',
  'document_intelligence',
  'legal_compliance',
  'properties',
  'jobs',
  'equipment',
  'operations',
]);

export const cmiAuraInsightStatusEnum = pgEnum('cmi_aura_insight_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const cmiSettings = pgTable('cmi_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  /** Invariant: always false. */
  autoCertificationEnabled: boolean('auto_certification_enabled').notNull().default(false),
  /** Invariant: always false. */
  inventComplianceRecordsEnabled: boolean('invent_compliance_records_enabled')
    .notNull()
    .default(false),
  /** Invariant: always false. */
  autoExecuteActionsEnabled: boolean('auto_execute_actions_enabled').notNull().default(false),
  sansTrackingEnabled: boolean('sans_tracking_enabled').notNull().default(true),
  cocWorkflowsEnabled: boolean('coc_workflows_enabled').notNull().default(true),
  complianceChecksEnabled: boolean('compliance_checks_enabled').notNull().default(true),
  expiryTrackingEnabled: boolean('expiry_tracking_enabled').notNull().default(true),
  auditPrepEnabled: boolean('audit_prep_enabled').notNull().default(true),
  reminderLeadDays: integer('reminder_lead_days').notNull().default(30),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cmiSansStandards = pgTable('cmi_sans_standards', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  title: text('title').notNull(),
  status: cmiSansStatusEnum('status').notNull().default('tracked'),
  notes: text('notes'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cmiCocWorkflows = pgTable('cmi_coc_workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  status: cmiCocWorkflowStatusEnum('status').notNull().default('intake'),
  /** Invariant: always false — never automatic certification. */
  autoCertified: boolean('auto_certified').notNull().default(false),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  propertyId: uuid('property_id').references(() => cxCustomerProperties.id, {
    onDelete: 'set null',
  }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  sansStandardId: uuid('sans_standard_id').references(() => cmiSansStandards.id, {
    onDelete: 'set null',
  }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  notes: text('notes'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cmiComplianceChecks = pgTable('cmi_compliance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: cmiCheckKindEnum('kind').notNull(),
  result: cmiCheckResultEnum('result').notNull(),
  title: text('title').notNull(),
  detail: text('detail').notNull().default(''),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  propertyId: uuid('property_id').references(() => cxCustomerProperties.id, {
    onDelete: 'set null',
  }),
  equipmentId: uuid('equipment_id').references(() => assetEquipment.id, {
    onDelete: 'set null',
  }),
  cocWorkflowId: uuid('coc_workflow_id').references(() => cmiCocWorkflows.id, {
    onDelete: 'set null',
  }),
  /** Invariant: always false — checks never certify. */
  certificationDecision: boolean('certification_decision').notNull().default(false),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cmiExpiryItems = pgTable('cmi_expiry_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  source: cmiExpirySourceEnum('source').notNull(),
  status: cmiExpiryStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  cocWorkflowId: uuid('coc_workflow_id').references(() => cmiCocWorkflows.id, {
    onDelete: 'set null',
  }),
  equipmentId: uuid('equipment_id').references(() => assetEquipment.id, {
    onDelete: 'set null',
  }),
  sourceRef: text('source_ref'),
  note: text('note').notNull().default(''),
  acknowledgedByUserId: uuid('acknowledged_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cmiAuditPrepPacks = pgTable('cmi_audit_prep_packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  status: cmiAuditPackStatusEnum('status').notNull().default('draft'),
  scopeNote: text('scope_note').notNull().default(''),
  documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
  checkIds: jsonb('check_ids').$type<string[]>().notNull().default([]),
  gapCount: integer('gap_count').notNull().default(0),
  readinessAvailable: boolean('readiness_available').notNull().default(false),
  readinessRationale: text('readiness_rationale').notNull().default(''),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cmiRecommendationDrafts = pgTable('cmi_recommendation_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: cmiRecommendationKindEnum('kind').notNull(),
  status: cmiRecommendationStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  propertyId: uuid('property_id').references(() => cxCustomerProperties.id, {
    onDelete: 'set null',
  }),
  equipmentId: uuid('equipment_id').references(() => assetEquipment.id, {
    onDelete: 'set null',
  }),
  cocWorkflowId: uuid('coc_workflow_id').references(() => cmiCocWorkflows.id, {
    onDelete: 'set null',
  }),
  /** Invariant: always false. */
  autoExecuted: boolean('auto_executed').notNull().default(false),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cmiAuraInsights = pgTable('cmi_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  target: cmiAuraInsightTargetEnum('target').notNull(),
  status: cmiAuraInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  sourceRecommendationId: uuid('source_recommendation_id').references(
    () => cmiRecommendationDrafts.id,
    { onDelete: 'set null' },
  ),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CmiSettingsRow = typeof cmiSettings.$inferSelect;
export type CmiSansStandard = typeof cmiSansStandards.$inferSelect;
export type CmiCocWorkflow = typeof cmiCocWorkflows.$inferSelect;
export type CmiComplianceCheck = typeof cmiComplianceChecks.$inferSelect;
export type CmiExpiryItem = typeof cmiExpiryItems.$inferSelect;
export type CmiAuditPrepPack = typeof cmiAuditPrepPacks.$inferSelect;
export type CmiRecommendationDraft = typeof cmiRecommendationDrafts.$inferSelect;
export type CmiAuraInsight = typeof cmiAuraInsights.$inferSelect;
