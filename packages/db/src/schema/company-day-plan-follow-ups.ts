import { date, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { users } from './users';

export const companyDayPlanFollowUpPriorityEnum = pgEnum('company_day_plan_follow_up_priority', [
  'low',
  'medium',
  'high',
]);

export const companyDayPlanFollowUpStatusEnum = pgEnum('company_day_plan_follow_up_status', [
  'draft',
  'pending_review',
  'approved',
  'declined',
  'assigned',
  'completed',
]);

export const companyDayPlanFollowUps = pgTable('company_day_plan_follow_ups', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  planDate: date('plan_date').notNull(),
  reason: text('reason').notNull(),
  responsibleAgent: text('responsible_agent'),
  priority: companyDayPlanFollowUpPriorityEnum('priority').notNull().default('medium'),
  status: companyDayPlanFollowUpStatusEnum('status').notNull().default('draft'),
  nextAction: text('next_action'),
  mergedSourceCount: integer('merged_source_count').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CompanyDayPlanFollowUp = typeof companyDayPlanFollowUps.$inferSelect;
export type NewCompanyDayPlanFollowUp = typeof companyDayPlanFollowUps.$inferInsert;
