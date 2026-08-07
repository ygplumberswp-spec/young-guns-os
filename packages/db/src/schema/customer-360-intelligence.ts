import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { users } from './users';

/**
 * Customer 360 Intelligence — settings, AURA insight handoffs, and recommendation drafts.
 * Extends existing CRM customers; never invents customers; never auto-sends.
 */

export const c360InsightKindEnum = pgEnum('c360_insight_kind', [
  'maintenance_opportunity',
  'customer_value',
  'follow_up',
  'retention',
]);

export const c360InsightStatusEnum = pgEnum('c360_insight_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'acknowledged',
]);

export const c360AuraTargetEnum = pgEnum('c360_aura_target', [
  'command_centre',
  'executive_dashboard',
  'crm',
  'customer_engagement',
  'homeshield',
  'recurring_maintenance',
  'communications',
  'finance',
]);

export const c360AuraStatusEnum = pgEnum('c360_aura_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const c360Settings = pgTable('c360_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  insightsEnabled: boolean('insights_enabled').notNull().default(true),
  timelineEnabled: boolean('timeline_enabled').notNull().default(true),
  recommendationDraftsEnabled: boolean('recommendation_drafts_enabled').notNull().default(true),
  /** Invariant: always false — never auto-send customer communications. */
  autoSendEnabled: boolean('auto_send_enabled').notNull().default(false),
  /** Invariant: always false — never invent customers. */
  inventCustomersEnabled: boolean('invent_customers_enabled').notNull().default(false),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const c360InsightDrafts = pgTable('c360_insight_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: c360InsightKindEnum('kind').notNull(),
  status: c360InsightStatusEnum('status').notNull().default('draft'),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  /** Invariant: always false. */
  autoSend: boolean('auto_send').notNull().default(false),
  /** Invariant: always false. */
  autoExecuted: boolean('auto_executed').notNull().default(false),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const c360AuraInsights = pgTable('c360_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  target: c360AuraTargetEnum('target').notNull(),
  status: c360AuraStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type C360SettingsRow = typeof c360Settings.$inferSelect;
export type C360InsightDraftRow = typeof c360InsightDrafts.$inferSelect;
export type C360AuraInsightRow = typeof c360AuraInsights.$inferSelect;
