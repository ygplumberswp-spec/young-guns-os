import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { agentKeyEnum } from './agent-profiles';
import { agentRuns } from './agent-runs';
import { companies } from './companies';
import { users } from './users';

export const orchestrationStatusEnum = pgEnum('orchestration_status', ['draft', 'active', 'paused']);

export const orchestrationRunStatusEnum = pgEnum('orchestration_run_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'awaiting_approval',
  'cancelled',
]);

export const orchestrationStepStatusEnum = pgEnum('orchestration_step_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
  'awaiting_approval',
]);

export const orchestrationStepModeEnum = pgEnum('orchestration_step_mode', ['sequential', 'parallel']);

export const orchestrationApprovalStatusEnum = pgEnum('orchestration_approval_status', [
  'pending',
  'approved',
  'rejected',
]);

export const orchestrationLogLevelEnum = pgEnum('orchestration_log_level', ['info', 'warn', 'error']);

export const agentOrchestrations = pgTable('agent_orchestrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  status: orchestrationStatusEnum('status').notNull().default('draft'),
  requiresApproval: boolean('requires_approval').notNull().default(false),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const agentOrchestrationSteps = pgTable('agent_orchestration_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  orchestrationId: uuid('orchestration_id')
    .notNull()
    .references(() => agentOrchestrations.id, { onDelete: 'cascade' }),
  agentKey: agentKeyEnum('agent_key').notNull(),
  stepKey: text('step_key').notNull(),
  name: text('name').notNull(),
  executionMode: orchestrationStepModeEnum('execution_mode').notNull().default('sequential'),
  parallelGroupKey: text('parallel_group_key'),
  sortOrder: integer('sort_order').notNull().default(0),
  requestTemplate: text('request_template').notNull(),
  capabilityRequest: text('capability_request'),
  requiresApproval: boolean('requires_approval').notNull().default(false),
  handoffKeys: jsonb('handoff_keys').$type<string[]>().notNull().default([]),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const agentOrchestrationTriggers = pgTable('agent_orchestration_triggers', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  orchestrationId: uuid('orchestration_id')
    .notNull()
    .references(() => agentOrchestrations.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  conditionConfig: jsonb('condition_config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const agentOrchestrationRuns = pgTable('agent_orchestration_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  orchestrationId: uuid('orchestration_id').references(() => agentOrchestrations.id, {
    onDelete: 'set null',
  }),
  triggerEvent: text('trigger_event'),
  triggerEntityType: text('trigger_entity_type'),
  triggerEntityId: uuid('trigger_entity_id'),
  status: orchestrationRunStatusEnum('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  initiatedByUserId: uuid('initiated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const agentOrchestrationRunSteps = pgTable('agent_orchestration_run_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  runId: uuid('run_id')
    .notNull()
    .references(() => agentOrchestrationRuns.id, { onDelete: 'cascade' }),
  definitionStepId: uuid('definition_step_id').references(() => agentOrchestrationSteps.id, {
    onDelete: 'set null',
  }),
  agentKey: agentKeyEnum('agent_key').notNull(),
  agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  stepKey: text('step_key').notNull(),
  executionMode: orchestrationStepModeEnum('execution_mode').notNull().default('sequential'),
  parallelGroupKey: text('parallel_group_key'),
  sortOrder: integer('sort_order').notNull().default(0),
  handoffFromStepId: uuid('handoff_from_step_id'),
  status: orchestrationStepStatusEnum('status').notNull().default('pending'),
  contextIn: jsonb('context_in').$type<Record<string, unknown>>().notNull().default({}),
  contextOut: jsonb('context_out').$type<Record<string, unknown>>().notNull().default({}),
  requiresApproval: boolean('requires_approval').notNull().default(false),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const agentOrchestrationApprovals = pgTable('agent_orchestration_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  runId: uuid('run_id')
    .notNull()
    .references(() => agentOrchestrationRuns.id, { onDelete: 'cascade' }),
  runStepId: uuid('run_step_id')
    .notNull()
    .references(() => agentOrchestrationRunSteps.id, { onDelete: 'cascade' }),
  status: orchestrationApprovalStatusEnum('status').notNull().default('pending'),
  preview: text('preview').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});

export const agentOrchestrationLogs = pgTable('agent_orchestration_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  runId: uuid('run_id')
    .notNull()
    .references(() => agentOrchestrationRuns.id, { onDelete: 'cascade' }),
  runStepId: uuid('run_step_id').references(() => agentOrchestrationRunSteps.id, {
    onDelete: 'set null',
  }),
  logLevel: orchestrationLogLevelEnum('log_level').notNull().default('info'),
  message: text('message').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AgentOrchestration = typeof agentOrchestrations.$inferSelect;
export type AgentOrchestrationStep = typeof agentOrchestrationSteps.$inferSelect;
export type AgentOrchestrationTrigger = typeof agentOrchestrationTriggers.$inferSelect;
export type AgentOrchestrationRun = typeof agentOrchestrationRuns.$inferSelect;
export type AgentOrchestrationRunStep = typeof agentOrchestrationRunSteps.$inferSelect;
export type AgentOrchestrationApproval = typeof agentOrchestrationApprovals.$inferSelect;
export type AgentOrchestrationLog = typeof agentOrchestrationLogs.$inferSelect;
