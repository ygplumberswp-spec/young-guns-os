import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';
import { workflowExecutions } from './workflow-executions';
import { workflows } from './workflows';

export const workflowRunStatusEnum = pgEnum('workflow_run_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
  'awaiting_approval',
]);

export const workflowRuns = pgTable('workflow_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'set null' }),
  workflowExecutionId: uuid('workflow_execution_id').references(() => workflowExecutions.id, {
    onDelete: 'set null',
  }),
  triggerEvent: text('trigger_event').notNull(),
  triggerEntityType: text('trigger_entity_type'),
  triggerEntityId: uuid('trigger_entity_id'),
  status: workflowRunStatusEnum('status').notNull().default('pending'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
  isSimulation: boolean('is_simulation').notNull().default(false),
  initiatedByUserId: uuid('initiated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
