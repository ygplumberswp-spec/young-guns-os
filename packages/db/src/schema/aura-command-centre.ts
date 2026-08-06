import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const auraCommandMemoryKindEnum = pgEnum('aura_command_memory_kind', [
  'approved_decision',
  'preference',
  'operating_pattern',
  'important_context',
  'historical_decision',
]);

export const auraCommandMemoryStatusEnum = pgEnum('aura_command_memory_status', [
  'active',
  'archived',
  'superseded',
]);

export const auraCommandAgentKeyEnum = pgEnum('aura_command_agent_key', [
  'finance',
  'operations',
  'marketing',
  'sales',
  'hr',
  'inventory',
  'customer_support',
  'compliance',
  'fleet',
  'market_intelligence',
]);

export const auraCommandRegistryStatusEnum = pgEnum('aura_command_registry_status', [
  'planned',
  'registered',
  'active',
  'paused',
]);

export const auraCommandHandoffStatusEnum = pgEnum('aura_command_handoff_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'completed',
  'cancelled',
]);

export const auraCommandActionStatusEnum = pgEnum('aura_command_action_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
]);

export const auraCommandFollowUpStatusEnum = pgEnum('aura_command_follow_up_status', [
  'open',
  'done',
  'cancelled',
]);

/** Owner-controlled business memory for Command Centre (extends — does not replace — aura_memory). */
export const auraCommandMemory = pgTable('aura_command_memory', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: auraCommandMemoryKindEnum('kind').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  status: auraCommandMemoryStatusEnum('status').notNull().default('active'),
  sourceModule: text('source_module'),
  importance: integer('importance').notNull().default(3),
  enabled: boolean('enabled').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Tenant-scoped enablement / notes for the specialist agent registry foundation. */
export const auraCommandAgentRegistry = pgTable('aura_command_agent_registry', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  agentKey: auraCommandAgentKeyEnum('agent_key').notNull(),
  status: auraCommandRegistryStatusEnum('status').notNull().default('planned'),
  capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
  notes: text('notes'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Secure agent handoffs — context passing with approval controls and audit trail. */
export const auraCommandHandoffs = pgTable('aura_command_handoffs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  fromAgentKey: text('from_agent_key').notNull().default('executive'),
  toAgentKey: auraCommandAgentKeyEnum('to_agent_key').notNull(),
  contextSummary: text('context_summary').notNull(),
  contextPayload: jsonb('context_payload').$type<Record<string, unknown>>().notNull().default({}),
  status: auraCommandHandoffStatusEnum('status').notNull().default('pending_approval'),
  approvalRequired: boolean('approval_required').notNull().default(true),
  autoExecuted: boolean('auto_executed').notNull().default(false),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Draft actions from Command Centre — never auto-executed. */
export const auraCommandActionDrafts = pgTable('aura_command_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  departmentKey: text('department_key').notNull().default('executive'),
  suggestedAction: jsonb('suggested_action').$type<Record<string, unknown>>().notNull().default({}),
  status: auraCommandActionStatusEnum('status').notNull().default('pending_approval'),
  approvalRequired: boolean('approval_required').notNull().default(true),
  autoExecuted: boolean('auto_executed').notNull().default(false),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Executive assistant follow-ups (draft-level planning support). */
export const auraCommandFollowUps = pgTable('aura_command_follow_ups', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  notes: text('notes'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  status: auraCommandFollowUpStatusEnum('status').notNull().default('open'),
  source: text('source'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AuraCommandMemoryRow = typeof auraCommandMemory.$inferSelect;
export type NewAuraCommandMemoryRow = typeof auraCommandMemory.$inferInsert;
export type AuraCommandAgentRegistryRow = typeof auraCommandAgentRegistry.$inferSelect;
export type AuraCommandHandoffRow = typeof auraCommandHandoffs.$inferSelect;
export type AuraCommandActionDraftRow = typeof auraCommandActionDrafts.$inferSelect;
export type AuraCommandFollowUpRow = typeof auraCommandFollowUps.$inferSelect;
