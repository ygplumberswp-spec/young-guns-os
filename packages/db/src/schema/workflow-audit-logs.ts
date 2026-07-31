import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';
import { workflowRuns } from './workflow-runs';
import { workflows } from './workflows';

export const workflowAuditLogs = pgTable('workflow_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'set null' }),
  workflowRunId: uuid('workflow_run_id').references(() => workflowRuns.id, {
    onDelete: 'set null',
  }),
  eventType: text('event_type').notNull(),
  nodeKey: text('node_key'),
  message: text('message').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WorkflowAuditLog = typeof workflowAuditLogs.$inferSelect;
export type NewWorkflowAuditLog = typeof workflowAuditLogs.$inferInsert;
