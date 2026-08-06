import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

/**
 * Executive Command Centre — Owner-only settings, approval-gated executive
 * action drafts and acknowledged insights.
 *
 * Business figures are read live from existing finance / operations / HR /
 * fleet / marketing / sales sources, so no metric is stored or cached here.
 * Only Owner decisions and Owner-authored drafts persist.
 */

export const ecPanelEnum = pgEnum('ec_panel', [
  'revenue',
  'profit',
  'cash',
  'outstanding_invoices',
  'jobs',
  'staff',
  'fleet',
  'marketing',
  'sales',
]);

export const ecActionStatusEnum = pgEnum('ec_action_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'acknowledged',
]);

export const ecInsightStatusEnum = pgEnum('ec_insight_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const ecSettings = pgTable('ec_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  /** Invariant: always false. */
  autoExecuteActionsEnabled: boolean('auto_execute_actions_enabled').notNull().default(false),
  /** Invariant: always false. */
  inventFinancialFiguresEnabled: boolean('invent_financial_figures_enabled')
    .notNull()
    .default(false),
  financePanelsEnabled: boolean('finance_panels_enabled').notNull().default(true),
  operationsPanelsEnabled: boolean('operations_panels_enabled').notNull().default(true),
  riskDetectionEnabled: boolean('risk_detection_enabled').notNull().default(true),
  opportunityDetectionEnabled: boolean('opportunity_detection_enabled').notNull().default(true),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ecActionDrafts = pgTable('ec_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  panel: ecPanelEnum('panel'),
  status: ecActionStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  /** Invariant: always false — an approved draft is a decision, not an execution. */
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

export const ecInsights = pgTable('ec_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  panel: ecPanelEnum('panel'),
  status: ecInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  sourceActionId: uuid('source_action_id').references(() => ecActionDrafts.id, {
    onDelete: 'set null',
  }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type EcSettingsRow = typeof ecSettings.$inferSelect;
export type EcActionDraftRow = typeof ecActionDrafts.$inferSelect;
export type EcInsightRow = typeof ecInsights.$inferSelect;
