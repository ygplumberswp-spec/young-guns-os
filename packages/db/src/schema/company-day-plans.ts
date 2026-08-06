import { boolean, date, integer, pgEnum, pgTable, text, time, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { companyBusinessRules } from './company-business-rules';
import { users } from './users';

export const companyDayPlanCategoryEnum = pgEnum('company_day_plan_category', [
  'marketing',
  'communications',
  'operations',
  'finance',
  'other',
]);

export const companyDayPlanPriorityEnum = pgEnum('company_day_plan_priority', ['normal', 'high']);

export const companyDayPlanStatusEnum = pgEnum('company_day_plan_status', [
  'active',
  'completed',
  'archived',
]);

export const companyDayPlanSourceEnum = pgEnum('company_day_plan_source', [
  'manual',
  'aura_suggested',
  'business_rule',
]);

export const companyDayPlans = pgTable('company_day_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  planDate: date('plan_date').notNull(),
  content: text('content').notNull(),
  department: text('department'),
  category: companyDayPlanCategoryEnum('category'),
  priority: companyDayPlanPriorityEnum('priority').notNull().default('normal'),
  status: companyDayPlanStatusEnum('status').notNull().default('active'),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  assignedAgentRole: text('assigned_agent_role'),
  dueTime: time('due_time'),
  progressPct: integer('progress_pct').notNull().default(0),
  approvalRequired: boolean('approval_required').notNull().default(false),
  source: companyDayPlanSourceEnum('source').notNull().default('manual'),
  businessRuleId: uuid('business_rule_id').references(() => companyBusinessRules.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CompanyDayPlan = typeof companyDayPlans.$inferSelect;
export type NewCompanyDayPlan = typeof companyDayPlans.$inferInsert;
