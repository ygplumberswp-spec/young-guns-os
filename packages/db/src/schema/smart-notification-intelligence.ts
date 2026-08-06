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
import { users } from './users';

/**
 * Smart Notification Intelligence — Owner controls, per-signal decisions and
 * the audit trail behind them.
 *
 * The notifications themselves are not copied here. Signals are grouped live
 * from the existing `notifications` rows and Notification Centre `nc_alerts`
 * rows, so a signal can never drift from the row it came from. Only Owner
 * settings, category thresholds, per-person decisions, the audit history and
 * approval-gated recommendations persist.
 */

export const snCategoryEnum = pgEnum('sn_category', [
  'priority',
  'risk',
  'approval',
  'opportunity',
  'finance',
  'cash_flow',
  'overdue_invoice',
  'job_delay',
  'technician_performance',
  'fleet_vehicle',
  'stock_procurement',
  'customer_followup',
  'marketing_opportunity',
  'compliance_document',
  'security',
  'operations',
]);

export const snSeverityEnum = pgEnum('sn_severity', [
  'critical',
  'high',
  'medium',
  'low',
  'info',
]);

export const snSignalStatusEnum = pgEnum('sn_signal_status', [
  'open',
  'acknowledged',
  'snoozed',
  'dismissed',
  'escalated',
]);

export const snEventKindEnum = pgEnum('sn_event_kind', [
  'acknowledged',
  'snoozed',
  'dismissed',
  'escalated',
  'reopened',
  'settings_updated',
  'category_updated',
]);

export const snActionStatusEnum = pgEnum('sn_action_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'acknowledged',
]);

export const snSettings = pgTable('sn_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  /** Invariant: always false — this layer never acts for the Owner. */
  autoActionsEnabled: boolean('auto_actions_enabled').notNull().default(false),
  /** Invariant: always false — a signal without a real row is never generated. */
  inventSignalsEnabled: boolean('invent_signals_enabled').notNull().default(false),
  groupDuplicatesEnabled: boolean('group_duplicates_enabled').notNull().default(true),
  dailyBriefEnabled: boolean('daily_brief_enabled').notNull().default(true),
  maxFeedItems: integer('max_feed_items').notNull().default(25),
  maxBriefItems: integer('max_brief_items').notNull().default(10),
  globalMinSeverity: snSeverityEnum('global_min_severity').notNull().default('low'),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const snCategoryControls = pgTable('sn_category_controls', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  category: snCategoryEnum('category').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  minSeverity: snSeverityEnum('min_severity').notNull().default('low'),
  digestOnly: boolean('digest_only').notNull().default(false),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per person per grouped signal. The signal itself is not stored — the
 * group key is derived from the real source rows on every read.
 */
export const snSignalStates = pgTable('sn_signal_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  groupKey: text('group_key').notNull(),
  category: snCategoryEnum('category').notNull(),
  status: snSignalStatusEnum('status').notNull().default('open'),
  snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  escalatedToUserId: uuid('escalated_to_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  notes: text('notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only history. A dismissal hides a signal; it never erases it. */
export const snSignalEvents = pgTable('sn_signal_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  groupKey: text('group_key'),
  kind: snEventKindEnum('kind').notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  notes: text('notes'),
  snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export const snActionDrafts = pgTable('sn_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  groupKey: text('group_key'),
  category: snCategoryEnum('category'),
  status: snActionStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  /** Invariant: always false — an approved recommendation is a decision only. */
  autoExecuted: boolean('auto_executed').notNull().default(false),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SnSettingsRow = typeof snSettings.$inferSelect;
export type SnCategoryControlRow = typeof snCategoryControls.$inferSelect;
export type SnSignalStateRow = typeof snSignalStates.$inferSelect;
export type SnSignalEventRow = typeof snSignalEvents.$inferSelect;
export type SnActionDraftRow = typeof snActionDrafts.$inferSelect;
