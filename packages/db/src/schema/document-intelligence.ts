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
import { customers } from './customers';
import { documents } from './documents';
import { cxCustomerProperties } from './enterprise-customer-experience';
import { jobs } from './jobs';
import { users } from './users';

/**
 * Document Intelligence — profiles, versions, expiry reminders, AURA drafts.
 * Extends existing documents foundation; no fake documents.
 */

export const diDocumentTypeEnum = pgEnum('di_document_type', [
  'coc',
  'quote',
  'invoice',
  'report',
  'warranty',
  'certificate',
  'photo',
  'other',
]);

export const diReminderStatusEnum = pgEnum('di_reminder_status', [
  'open',
  'acknowledged',
  'dismissed',
  'resolved',
]);

export const diRecommendationKindEnum = pgEnum('di_recommendation_kind', [
  'expiry_alert',
  'missing_doc_suggestion',
]);

export const diRecommendationStatusEnum = pgEnum('di_recommendation_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'acknowledged',
]);

export const diAuraInsightTargetEnum = pgEnum('di_aura_insight_target', [
  'command_centre',
  'executive_dashboard',
  'documents',
  'customers',
  'jobs',
  'compliance',
  'operations',
]);

export const diAuraInsightStatusEnum = pgEnum('di_aura_insight_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const diSettings = pgTable('di_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  /** Invariant: always false. */
  autoSendRemindersEnabled: boolean('auto_send_reminders_enabled').notNull().default(false),
  /** Invariant: always false. */
  inventDocumentsEnabled: boolean('invent_documents_enabled').notNull().default(false),
  expiryRemindersEnabled: boolean('expiry_reminders_enabled').notNull().default(true),
  missingDocSuggestionsEnabled: boolean('missing_doc_suggestions_enabled').notNull().default(true),
  reminderLeadDays: integer('reminder_lead_days').notNull().default(30),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const diDocumentProfiles = pgTable('di_document_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  documentType: diDocumentTypeEnum('document_type').notNull().default('other'),
  propertyId: uuid('property_id').references(() => cxCustomerProperties.id, {
    onDelete: 'set null',
  }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  currentVersionNumber: integer('current_version_number').notNull().default(1),
  notes: text('notes'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const diDocumentVersions = pgTable('di_document_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  title: text('title').notNull(),
  fileName: text('file_name').notNull(),
  fileType: text('file_type'),
  fileSizeBytes: integer('file_size_bytes'),
  changeNote: text('change_note'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const diExpiryReminders = pgTable('di_expiry_reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  status: diReminderStatusEnum('status').notNull().default('open'),
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

export const diRecommendationDrafts = pgTable('di_recommendation_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: diRecommendationKindEnum('kind').notNull(),
  status: diRecommendationStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  propertyId: uuid('property_id').references(() => cxCustomerProperties.id, {
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

export const diAuraInsights = pgTable('di_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  target: diAuraInsightTargetEnum('target').notNull(),
  status: diAuraInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  sourceRecommendationId: uuid('source_recommendation_id').references(
    () => diRecommendationDrafts.id,
    { onDelete: 'set null' },
  ),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type DiSettingsRow = typeof diSettings.$inferSelect;
export type DiDocumentProfile = typeof diDocumentProfiles.$inferSelect;
export type DiDocumentVersion = typeof diDocumentVersions.$inferSelect;
export type DiExpiryReminder = typeof diExpiryReminders.$inferSelect;
export type DiRecommendationDraft = typeof diRecommendationDrafts.$inferSelect;
export type DiAuraInsight = typeof diAuraInsights.$inferSelect;
