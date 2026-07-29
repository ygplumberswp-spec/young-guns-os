import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { workflows } from './workflows';

export const workflowExecutionStatusEnum = pgEnum('workflow_execution_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);

export const workflowExecutions = pgTable('workflow_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'set null' }),
  triggerType: text('trigger_type').notNull(),
  status: workflowExecutionStatusEnum('status').notNull().default('pending'),
  triggerEntityType: text('trigger_entity_type'),
  triggerEntityId: uuid('trigger_entity_id'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  resultSummary: jsonb('result_summary').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type NewWorkflowExecution = typeof workflowExecutions.$inferInsert;
