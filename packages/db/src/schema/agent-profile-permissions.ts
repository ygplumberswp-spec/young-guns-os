import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { agentProfiles } from './agent-profiles';
import { companies } from './companies';

export const agentProfilePermissions = pgTable('agent_profile_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agentProfileId: uuid('agent_profile_id')
    .notNull()
    .references(() => agentProfiles.id, { onDelete: 'cascade' }),
  permission: text('permission').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AgentProfilePermission = typeof agentProfilePermissions.$inferSelect;
export type NewAgentProfilePermission = typeof agentProfilePermissions.$inferInsert;
