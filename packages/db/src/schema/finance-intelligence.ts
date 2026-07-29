import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const financeBudgetPeriodTypeEnum = pgEnum('finance_budget_period_type', [
  'monthly',
  'quarterly',
  'yearly',
]);

export const financeBudgetStatusEnum = pgEnum('finance_budget_status', ['draft', 'active', 'closed']);

export const financeRecommendationTypeEnum = pgEnum('finance_recommendation_type', [
  'pricing',
  'margin',
  'expense_reduction',
  'collections',
  'cash_flow',
  'risk',
]);

export const financeRecommendationStatusEnum = pgEnum('finance_recommendation_status', [
  'pending',
  'accepted',
  'dismissed',
  'completed',
]);

export const financeForecastTypeEnum = pgEnum('finance_forecast_type', ['weekly', 'monthly']);

export const financeBudgets = pgTable('finance_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  periodType: financeBudgetPeriodTypeEnum('period_type').notNull().default('monthly'),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  currency: text('currency').notNull().default('USD'),
  status: financeBudgetStatusEnum('status').notNull().default('draft'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const financeBudgetLines = pgTable('finance_budget_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  budgetId: uuid('budget_id')
    .notNull()
    .references(() => financeBudgets.id, { onDelete: 'cascade' }),
  categoryKey: text('category_key').notNull(),
  categoryName: text('category_name').notNull(),
  budgetedAmountCents: integer('budgeted_amount_cents').notNull().default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const financeRecommendations = pgTable('finance_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  recommendationType: financeRecommendationTypeEnum('recommendation_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: financeRecommendationStatusEnum('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const financeForecastSnapshots = pgTable('finance_forecast_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  forecastType: financeForecastTypeEnum('forecast_type').notNull(),
  horizonStart: timestamp('horizon_start', { withTimezone: true }).notNull(),
  horizonEnd: timestamp('horizon_end', { withTimezone: true }).notNull(),
  receivableForecastCents: integer('receivable_forecast_cents').notNull().default(0),
  payableForecastCents: integer('payable_forecast_cents').notNull().default(0),
  netPositionCents: integer('net_position_cents').notNull().default(0),
  summary: text('summary').notNull(),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type FinanceBudget = typeof financeBudgets.$inferSelect;
export type FinanceBudgetLine = typeof financeBudgetLines.$inferSelect;
export type FinanceRecommendation = typeof financeRecommendations.$inferSelect;
export type FinanceForecastSnapshot = typeof financeForecastSnapshots.$inferSelect;
