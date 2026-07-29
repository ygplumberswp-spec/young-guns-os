import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';
import { workflowSteps } from './workflow-steps';

export const workflowStepResultStatusEnum = pgEnum('workflow_step_result_status', [
  'pending',
  'completed',
  'failed',
  'awaiting_approval',
  'approved',
  'rejected',
]);

export const workflowStepResults = pgTable('workflow_step_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowStepId: uuid('workflow_step_id')
    .notNull()
    .references(() => workflowSteps.id, { onDelete: 'cascade' }),
  status: workflowStepResultStatusEnum('status').notNull().default('pending'),
  output: jsonb('output').$type<Record<string, unknown>>(),
  errorMessage: text('error_message'),
  requiresApproval: boolean('requires_approval').notNull().default(false),
  preview: text('preview'),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WorkflowStepResult = typeof workflowStepResults.$inferSelect;
export type NewWorkflowStepResult = typeof workflowStepResults.$inferInsert;
