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
 * Financial Reporting & Forecasting — report/forecast snapshots,
 * budget plans, executive insight handoffs, Owner-gated actions.
 * Extends Finance AURA Agent + Cashflow & Profit. No invented forecasts.
 */

export const frfReportKindEnum = pgEnum('frf_report_kind', [
  'revenue',
  'expense',
  'profit',
  'invoice',
  'payment',
  'job',
  'job_profitability',
]);

export const frfForecastKindEnum = pgEnum('frf_forecast_kind', [
  'revenue',
  'cashflow',
  'budget_planning',
  'trend',
]);

export const frfAvailabilityEnum = pgEnum('frf_availability', [
  'available',
  'unavailable',
  'insufficient_history',
]);

export const frfInsightTargetEnum = pgEnum('frf_insight_target', [
  'command_centre',
  'executive_dashboard',
  'finance_aura_agent',
  'dashboard',
]);

export const frfInsightStatusEnum = pgEnum('frf_insight_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const frfActionKindEnum = pgEnum('frf_action_kind', [
  'review_forecast',
  'budget_adjustment',
  'collections_focus',
  'expense_review',
  'executive_brief',
  'aura_handoff',
]);

export const frfActionStatusEnum = pgEnum('frf_action_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
]);

export const frfReportSnapshots = pgTable('frf_report_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: frfReportKindEnum('kind').notNull(),
  availability: frfAvailabilityEnum('availability').notNull(),
  title: text('title').notNull(),
  currency: text('currency').notNull().default('ZAR'),
  periodStart: timestamp('period_start', { withTimezone: true }),
  periodEnd: timestamp('period_end', { withTimezone: true }),
  totalCents: integer('total_cents'),
  lineCount: integer('line_count').notNull().default(0),
  summary: text('summary').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const frfForecastSnapshots = pgTable('frf_forecast_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: frfForecastKindEnum('kind').notNull(),
  availability: frfAvailabilityEnum('availability').notNull(),
  title: text('title').notNull(),
  currency: text('currency').notNull().default('ZAR'),
  methodology: text('methodology').notNull(),
  historyMonthsUsed: integer('history_months_used').notNull().default(0),
  projectedTotalCents: integer('projected_total_cents'),
  summary: text('summary').notNull(),
  assumptions: jsonb('assumptions').$type<Record<string, unknown>[]>().notNull().default([]),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const frfBudgetPlans = pgTable('frf_budget_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  currency: text('currency').notNull().default('ZAR'),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  budgetedRevenueCents: integer('budgeted_revenue_cents'),
  budgetedExpenseCents: integer('budgeted_expense_cents'),
  actualRevenueCents: integer('actual_revenue_cents'),
  actualExpenseCents: integer('actual_expense_cents'),
  revenueVarianceCents: integer('revenue_variance_cents'),
  expenseVarianceCents: integer('expense_variance_cents'),
  notes: text('notes'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const frfInsights = pgTable('frf_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  target: frfInsightTargetEnum('target').notNull(),
  status: frfInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  sourceReportId: uuid('source_report_id').references(() => frfReportSnapshots.id, {
    onDelete: 'set null',
  }),
  sourceForecastId: uuid('source_forecast_id').references(() => frfForecastSnapshots.id, {
    onDelete: 'set null',
  }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const frfActionRecommendations = pgTable('frf_action_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: frfActionKindEnum('kind').notNull(),
  status: frfActionStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  recommendation: text('recommendation').notNull(),
  sourceReportId: uuid('source_report_id').references(() => frfReportSnapshots.id, {
    onDelete: 'set null',
  }),
  sourceForecastId: uuid('source_forecast_id').references(() => frfForecastSnapshots.id, {
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
