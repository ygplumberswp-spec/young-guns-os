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
  'decision_intelligence',
  'knowledge',
  'executive_operations',
  'evolution',
  'developer',
  'saas',
  'production_operations',
  'mobile_field',
  'communications',
  'customer_experience',
  'asset_intelligence',
  'workforce_intelligence',
  'legal_compliance',
  'financial_planning',
  'sales_intelligence',
  'marketing_intelligence',
  'service_delivery',
  'it_operations',
  'business_evolution',
  'app_builder',
  'industry_intelligence',
  'developer_platform',
  'saas_management',
  'voice_reception',
  'document_intelligence',
  'business_continuity',
  'search_intelligence',
  'migration_intelligence',
  'notification_intelligence',
  'platform_health',
  'launch_readiness',
  'release_candidate',
  'production_launch',
  'release_manager',
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
