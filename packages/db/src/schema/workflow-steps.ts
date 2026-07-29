import { integer, jsonb, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { workflowActionTypeEnum } from './workflow-actions';
import { workflowActions } from './workflow-actions';
import { workflowRuns } from './workflow-runs';

export const workflowStepStatusEnum = pgEnum('workflow_step_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
  'awaiting_approval',
]);

export const workflowSteps = pgTable('workflow_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowRunId: uuid('workflow_run_id')
    .notNull()
    .references(() => workflowRuns.id, { onDelete: 'cascade' }),
  workflowActionId: uuid('workflow_action_id').references(() => workflowActions.id, {
    onDelete: 'set null',
  }),
  actionType: workflowActionTypeEnum('action_type').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  status: workflowStepStatusEnum('status').notNull().default('pending'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WorkflowStep = typeof workflowSteps.$inferSelect;
export type NewWorkflowStep = typeof workflowSteps.$inferInsert;
