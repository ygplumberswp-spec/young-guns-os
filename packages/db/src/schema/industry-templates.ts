import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

/**
 * Industry Templates (Department 19).
 *
 * Templates are tenant-scoped configuration for the one shared TITAN core.
 * They hold structure and terminology, never business records, and every
 * change lands as a new append-only version.
 *
 * The `itpl_` prefix is distinct from the existing `ip_` industry pack
 * marketplace tables, which this department reads alongside rather than
 * replaces.
 */

export const itplTradeEnum = pgEnum('itpl_trade', [
  'plumbing',
  'electrical',
  'hvac',
  'construction',
  'other_trade',
]);

export const itplSupportLevelEnum = pgEnum('itpl_support_level', [
  'supported',
  'requires_configuration',
  'requires_compliance_review',
  'unavailable',
]);

export const itplTemplateStatusEnum = pgEnum('itpl_template_status', [
  'draft',
  'active',
  'archived',
]);

export const itplVersionStatusEnum = pgEnum('itpl_version_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
]);

export const itplChangeImpactEnum = pgEnum('itpl_change_impact', [
  'live_workflow',
  'presentation_only',
]);

export const itplEventKindEnum = pgEnum('itpl_event_kind', [
  'template_created',
  'version_saved',
  'version_submitted',
  'version_decided',
  'template_activated',
  'template_archived',
  'settings_updated',
  'access_denied',
]);

/** Company-level controls for the template system. */
export const itplSettings = pgTable('itpl_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' })
    .unique(),
  /** Always true. A live-workflow change always needs Owner approval. */
  requireApprovalForLiveChanges: boolean('require_approval_for_live_changes')
    .notNull()
    .default(true),
  /** Always false. TITAN never asserts a compliance standard on its own. */
  allowUnreviewedComplianceClaims: boolean('allow_unreviewed_compliance_claims')
    .notNull()
    .default(false),
  /** Always false. Activating a template never writes records into a tenant. */
  seedTenantRecords: boolean('seed_tenant_records').notNull().default(false),
  technicianReadEnabled: boolean('technician_read_enabled').notNull().default(true),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A tenant's template for a trade. The definition itself lives on a version. */
export const itplTemplates = pgTable('itpl_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  templateKey: text('template_key').notNull(),
  name: text('name').notNull(),
  trade: itplTradeEnum('trade').notNull(),
  customTradeLabel: text('custom_trade_label'),
  status: itplTemplateStatusEnum('status').notNull().default('draft'),
  support: itplSupportLevelEnum('support').notNull().default('requires_configuration'),
  isActive: boolean('is_active').notNull().default(false),
  activeVersionId: uuid('active_version_id'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only version history. A row is never edited except to decide it. */
export const itplTemplateVersions = pgTable('itpl_template_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id')
    .notNull()
    .references(() => itplTemplates.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  status: itplVersionStatusEnum('status').notNull().default('draft'),
  changeImpact: itplChangeImpactEnum('change_impact').notNull().default('live_workflow'),
  changeSummary: text('change_summary').notNull(),
  /** Structure and terminology only. Checked for record-shaped fields first. */
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull().default({}),
  support: itplSupportLevelEnum('support').notNull().default('requires_configuration'),
  authoredByUserId: uuid('authored_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  decisionNote: text('decision_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only record of which version went live, when and by whom. */
export const itplActivations = pgTable('itpl_activations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id')
    .notNull()
    .references(() => itplTemplates.id, { onDelete: 'cascade' }),
  versionId: uuid('version_id')
    .notNull()
    .references(() => itplTemplateVersions.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  activatedByUserId: uuid('activated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  note: text('note'),
  activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only trail for this department. Rows are inserted, never updated. */
export const itplAuditEvents = pgTable('itpl_audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  eventKind: itplEventKindEnum('event_kind').notNull(),
  templateId: uuid('template_id').references(() => itplTemplates.id, { onDelete: 'set null' }),
  subjectKey: text('subject_key'),
  detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ItplSettingsRow = typeof itplSettings.$inferSelect;
export type NewItplSettingsRow = typeof itplSettings.$inferInsert;
export type ItplTemplateRow = typeof itplTemplates.$inferSelect;
export type NewItplTemplateRow = typeof itplTemplates.$inferInsert;
export type ItplTemplateVersionRow = typeof itplTemplateVersions.$inferSelect;
export type NewItplTemplateVersionRow = typeof itplTemplateVersions.$inferInsert;
export type ItplActivationRow = typeof itplActivations.$inferSelect;
export type NewItplActivationRow = typeof itplActivations.$inferInsert;
export type ItplAuditEventRow = typeof itplAuditEvents.$inferSelect;
export type NewItplAuditEventRow = typeof itplAuditEvents.$inferInsert;
