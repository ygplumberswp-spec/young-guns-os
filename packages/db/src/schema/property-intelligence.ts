import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { cxCustomerProperties } from './enterprise-customer-experience';
import { jobs } from './jobs';
import { users } from './users';

/**
 * Property Intelligence Platform — settings, AURA insight handoffs, recommendation drafts.
 * Extends cx_customer_properties; never invents properties; never auto-sends.
 */

export const priInsightKindEnum = pgEnum('pri_insight_kind', [
  'property_history',
  'maintenance_opportunity',
  'follow_up',
  'equipment_attention',
  'coc_attention',
]);

export const priInsightDraftStatusEnum = pgEnum('pri_insight_draft_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'acknowledged',
]);

export const priAuraInsightTargetEnum = pgEnum('pri_aura_insight_target', [
  'command_centre',
  'executive_dashboard',
  'crm',
  'customer_360',
  'jobs',
  'documents',
  'recurring_maintenance',
  'operations',
]);

export const priAuraInsightStatusEnum = pgEnum('pri_aura_insight_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const priSettings = pgTable('pri_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  /** Invariant: always false. */
  autoSendEnabled: boolean('auto_send_enabled').notNull().default(false),
  /** Invariant: always false. */
  inventPropertiesEnabled: boolean('invent_properties_enabled').notNull().default(false),
  insightDraftsEnabled: boolean('insight_drafts_enabled').notNull().default(true),
  mapsSignalsEnabled: boolean('maps_signals_enabled').notNull().default(true),
  maintenanceSignalsEnabled: boolean('maintenance_signals_enabled').notNull().default(true),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const priInsightDrafts = pgTable('pri_insight_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: priInsightKindEnum('kind').notNull(),
  status: priInsightDraftStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  propertyId: uuid('property_id').references(() => cxCustomerProperties.id, {
    onDelete: 'set null',
  }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  /** Invariant: always false. */
  autoSend: boolean('auto_send').notNull().default(false),
  /** Invariant: always false. */
  inventedProperty: boolean('invented_property').notNull().default(false),
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

export const priAuraInsights = pgTable('pri_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  target: priAuraInsightTargetEnum('target').notNull(),
  status: priAuraInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  propertyId: uuid('property_id').references(() => cxCustomerProperties.id, {
    onDelete: 'set null',
  }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  sourceInsightDraftId: uuid('source_insight_draft_id').references(() => priInsightDrafts.id, {
    onDelete: 'set null',
  }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PriSettingsRow = typeof priSettings.$inferSelect;
export type PriInsightDraftRow = typeof priInsightDrafts.$inferSelect;
export type PriAuraInsightRow = typeof priAuraInsights.$inferSelect;
