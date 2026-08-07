import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

/** FIN-004 — monthly plan/target persistence (plan only; never stores actuals). */
export const financeMonthlyPlans = pgTable(
  'finance_monthly_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    planMonth: date('plan_month').notNull(),
    currency: text('currency').notNull().default('ZAR'),
    revenueTargetCents: integer('revenue_target_cents'),
    grossMarginTargetPct: numeric('gross_margin_target_pct', { precision: 8, scale: 2 }),
    grossProfitTargetCents: integer('gross_profit_target_cents'),
    overheadBudgetCents: integer('overhead_budget_cents'),
    operatingProfitTargetCents: integer('operating_profit_target_cents'),
    cashCollectionTargetCents: integer('cash_collection_target_cents'),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyMonthUnique: uniqueIndex('finance_monthly_plans_company_month_unique').on(
      table.companyId,
      table.planMonth,
    ),
    companyMonthIdx: index('finance_monthly_plans_company_month_idx').on(
      table.companyId,
      table.planMonth,
    ),
  }),
);

export const financeMonthlyPlanOverheadLines = pgTable(
  'finance_monthly_plan_overhead_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => financeMonthlyPlans.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    budgetCents: integer('budget_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    planCategoryUnique: uniqueIndex(
      'finance_monthly_plan_overhead_lines_plan_category_unique',
    ).on(table.planId, table.category),
    companyIdx: index('finance_monthly_plan_overhead_lines_company_idx').on(
      table.companyId,
      table.planId,
    ),
  }),
);

export type FinanceMonthlyPlan = typeof financeMonthlyPlans.$inferSelect;
export type FinanceMonthlyPlanOverheadLine =
  typeof financeMonthlyPlanOverheadLines.$inferSelect;
