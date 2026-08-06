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
import { invoices } from './invoices';
import { jobs } from './jobs';
import { users } from './users';

/**
 * Cashflow & Profit Intelligence — insights and Owner-gated action recommendations.
 * Extends Finance AURA Agent. Grounded in real TITAN finance data only.
 */

export const fcpInsightKindEnum = pgEnum('fcp_insight_kind', [
  'cashflow_risk',
  'cashflow_opportunity',
  'cost_problem',
  'profit_improvement',
  'margin_warning',
  'receivables_pressure',
  'expense_concentration',
  'poor_performing_service',
  'outstanding_money',
  'labour_cost_gap',
  'profit_opportunity',
]);

export const fcpInsightStatusEnum = pgEnum('fcp_insight_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const fcpActionKindEnum = pgEnum('fcp_action_kind', [
  'collections_push',
  'expense_review',
  'margin_review',
  'job_cost_review',
  'cash_position_review',
  'inventory_cost_gap',
  'aura_handoff',
]);

export const fcpActionStatusEnum = pgEnum('fcp_action_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
]);

export const fcpInsights = pgTable('fcp_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: fcpInsightKindEnum('kind').notNull(),
  status: fcpInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  metricLabel: text('metric_label'),
  metricValueCents: integer('metric_value_cents'),
  currency: text('currency'),
  sourceInvoiceCount: integer('source_invoice_count').notNull().default(0),
  sourcePaymentCount: integer('source_payment_count').notNull().default(0),
  sourceJobCount: integer('source_job_count').notNull().default(0),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fcpActionRecommendations = pgTable('fcp_action_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: fcpActionKindEnum('kind').notNull(),
  status: fcpActionStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  recommendation: text('recommendation').notNull(),
  sourceInvoiceId: uuid('source_invoice_id').references(() => invoices.id, {
    onDelete: 'set null',
  }),
  sourceJobId: uuid('source_job_id').references(() => jobs.id, { onDelete: 'set null' }),
  sourceInsightId: uuid('source_insight_id').references(() => fcpInsights.id, {
    onDelete: 'set null',
  }),
  /** Invariant: always false — never auto-execute financial mutations. */
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
