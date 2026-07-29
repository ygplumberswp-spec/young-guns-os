import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { agentKeyEnum, agentProfiles } from './agent-profiles';
import { companies } from './companies';
import { users } from './users';

export const agentRunStatusEnum = pgEnum('agent_run_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  agentProfileId: uuid('agent_profile_id').references(() => agentProfiles.id, {
    onDelete: 'set null',
  }),
  agentKey: agentKeyEnum('agent_key').notNull(),
  request: text('request').notNull(),
  response: text('response'),
  toolsUsed: jsonb('tools_used').$type<string[]>().notNull().default([]),
  status: agentRunStatusEnum('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
