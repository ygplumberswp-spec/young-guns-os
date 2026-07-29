import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';
import { workflows } from './workflows';

export const workflowScheduleTypeEnum = pgEnum('workflow_schedule_type', [
  'cron',
  'daily',
  'weekly',
  'monthly',
  'interval',
  'one_time',
]);

export const workflowSchedules = pgTable('workflow_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  scheduleType: workflowScheduleTypeEnum('schedule_type').notNull(),
  cronExpression: text('cron_expression'),
  intervalMinutes: integer('interval_minutes'),
  runAt: timestamp('run_at', { withTimezone: true }),
  timezone: text('timezone').notNull().default('UTC'),
  enabled: boolean('enabled').notNull().default(false),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WorkflowSchedule = typeof workflowSchedules.$inferSelect;
export type NewWorkflowSchedule = typeof workflowSchedules.$inferInsert;
