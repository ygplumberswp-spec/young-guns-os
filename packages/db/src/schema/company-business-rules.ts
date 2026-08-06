import { boolean, date, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const businessRuleTypeEnum = pgEnum('business_rule_type', [
  'always_follow',
  'scheduled',
  'approval',
]);

export const businessRuleCategoryEnum = pgEnum('business_rule_category', [
  'company_wide',
  'finance',
  'sales',
  'marketing',
  'operations',
  'customers',
  'workforce_payroll',
  'fleet',
  'stock_suppliers',
  'compliance',
]);

export const businessRuleStatusEnum = pgEnum('business_rule_status', [
  'active',
  'paused',
  'archived',
]);

export const businessRuleTaskStatusEnum = pgEnum('business_rule_task_status', [
  'pending',
  'completed',
  'skipped',
  'cancelled',
]);

export const companyBusinessRules = pgTable('company_business_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  department: text('department'),
  instruction: text('instruction').notNull(),
  ruleType: businessRuleTypeEnum('rule_type').notNull().default('always_follow'),
  category: businessRuleCategoryEnum('category').notNull().default('company_wide'),
  frequencyCron: text('frequency_cron'),
  assignedAgentRole: text('assigned_agent_role'),
  approvalRequired: boolean('approval_required').notNull().default(false),
  approvalType: text('approval_type'),
  status: businessRuleStatusEnum('status').notNull().default('active'),
  nextScheduledAt: timestamp('next_scheduled_at', { withTimezone: true }),
  lastCompletedAt: timestamp('last_completed_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const businessRuleTasks = pgTable('business_rule_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  businessRuleId: uuid('business_rule_id')
    .notNull()
    .references(() => companyBusinessRules.id, { onDelete: 'cascade' }),
  taskDate: date('task_date').notNull(),
  status: businessRuleTaskStatusEnum('status').notNull().default('pending'),
  nextRun: timestamp('next_run', { withTimezone: true }),
  lastRun: timestamp('last_run', { withTimezone: true }),
  dayPlanId: uuid('day_plan_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CompanyBusinessRule = typeof companyBusinessRules.$inferSelect;
export type NewCompanyBusinessRule = typeof companyBusinessRules.$inferInsert;
export type BusinessRuleTask = typeof businessRuleTasks.$inferSelect;
export type NewBusinessRuleTask = typeof businessRuleTasks.$inferInsert;
