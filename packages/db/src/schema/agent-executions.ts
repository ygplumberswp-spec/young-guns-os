import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { agentProfiles } from './agent-profiles';
import { companies } from './companies';

export const agentExecutionStatusEnum = pgEnum('agent_execution_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export const agentExecutionModeEnum = pgEnum('agent_execution_mode', ['manual', 'preview']);

export const agentExecutions = pgTable('agent_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agentProfileId: uuid('agent_profile_id').references(() => agentProfiles.id, {
    onDelete: 'set null',
  }),
  status: agentExecutionStatusEnum('status').notNull().default('pending'),
  executionMode: agentExecutionModeEnum('execution_mode').notNull().default('manual'),
  inputSummary: text('input_summary'),
  outputSummary: text('output_summary'),
  errorMessage: text('error_message'),
  resultPayload: jsonb('result_payload').$type<Record<string, unknown>>(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AgentExecution = typeof agentExecutions.$inferSelect;
export type NewAgentExecution = typeof agentExecutions.$inferInsert;
