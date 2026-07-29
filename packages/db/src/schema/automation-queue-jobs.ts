import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const automationQueueJobStatusEnum = pgEnum('automation_queue_job_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'retry',
]);

export const automationQueueJobTypeEnum = pgEnum('automation_queue_job_type', [
  'execute_event',
  'scheduled_workflow',
  'retry_step',
  'execute_orchestration_event',
  'execute_orchestration_run',
]);

export const automationQueueJobs = pgTable('automation_queue_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobType: automationQueueJobTypeEnum('job_type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  status: automationQueueJobStatusEnum('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AutomationQueueJob = typeof automationQueueJobs.$inferSelect;
export type NewAutomationQueueJob = typeof automationQueueJobs.$inferInsert;
