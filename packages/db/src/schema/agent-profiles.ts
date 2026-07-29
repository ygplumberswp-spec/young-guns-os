import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const agentKeyEnum = pgEnum('agent_key', [
  'executive',
  'operations',
  'finance',
  'recruiting',
  'sales',
  'marketing',
  'lead_generation',
  'voice_receptionist',
  'customer_support',
  'procurement',
  'security',
  'integration',
  'business_intelligence',
  'automation',
]);

export const agentProfileStatusEnum = pgEnum('agent_profile_status', [
  'draft',
  'active',
  'paused',
]);

export const agentProfiles = pgTable('agent_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  agentKey: agentKeyEnum('agent_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  status: agentProfileStatusEnum('status').notNull().default('draft'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AgentProfile = typeof agentProfiles.$inferSelect;
export type NewAgentProfile = typeof agentProfiles.$inferInsert;
