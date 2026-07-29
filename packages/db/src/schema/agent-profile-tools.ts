import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { agentProfiles } from './agent-profiles';
import { companies } from './companies';

export const agentProfileTools = pgTable('agent_profile_tools', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agentProfileId: uuid('agent_profile_id')
    .notNull()
    .references(() => agentProfiles.id, { onDelete: 'cascade' }),
  toolKey: text('tool_key').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AgentProfileTool = typeof agentProfileTools.$inferSelect;
export type NewAgentProfileTool = typeof agentProfileTools.$inferInsert;
