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
import { workflowRuns } from './workflow-runs';
import { workflows } from './workflows';

export const automationStudioNodeTypeEnum = pgEnum('automation_studio_node_type', [
  'trigger',
  'action',
  'condition',
  'delay',
  'approval',
  'parallel',
  'loop',
  'webhook',
  'ai_agent',
  'custom',
]);

export const automationApprovalTypeEnum = pgEnum('automation_approval_type', [
  'single',
  'multi_level',
  'department',
  'executive',
  'delegated',
]);

export const automationApprovalStatusEnum = pgEnum('automation_approval_status', [
  'pending',
  'approved',
  'rejected',
  'delegated',
  'cancelled',
]);

export const automationStudioActionTypeEnum = pgEnum('automation_studio_action_type', [
  'workflow_improvement',
  'automation_recommendation',
  'bottleneck_fix',
  'performance_optimization',
]);

export const automationStudioActionStatusEnum = pgEnum('automation_studio_action_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const automationRecommendationStatusEnum = pgEnum('automation_recommendation_status', [
  'pending',
  'accepted',
  'dismissed',
  'completed',
]);

export const automationTestRunStatusEnum = pgEnum('automation_test_run_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);

export const automationStudioVersions = pgTable('automation_studio_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull().default({}),
  changeSummary: text('change_summary'),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const automationStudioVariables = pgTable('automation_studio_variables', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  variableKey: text('variable_key').notNull(),
  label: text('label').notNull(),
  variableType: text('variable_type').notNull().default('string'),
  defaultValue: text('default_value'),
  required: boolean('required').notNull().default(false),
  validation: jsonb('validation').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const automationStudioNodes = pgTable('automation_studio_nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  nodeKey: text('node_key').notNull(),
  nodeType: automationStudioNodeTypeEnum('node_type').notNull(),
  title: text('title').notNull(),
  positionX: integer('position_x').notNull().default(0),
  positionY: integer('position_y').notNull().default(0),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const automationStudioConnections = pgTable('automation_studio_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  sourceNodeKey: text('source_node_key').notNull(),
  targetNodeKey: text('target_node_key').notNull(),
  conditionExpression: text('condition_expression'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const automationStudioApprovalChains = pgTable('automation_studio_approval_chains', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  approvalType: automationApprovalTypeEnum('approval_type').notNull().default('single'),
  levels: jsonb('levels').$type<Array<Record<string, unknown>>>().notNull().default([]),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const automationStudioApprovalRecords = pgTable('automation_studio_approval_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  workflowRunId: uuid('workflow_run_id').references(() => workflowRuns.id, {
    onDelete: 'set null',
  }),
  approvalType: automationApprovalTypeEnum('approval_type').notNull(),
  status: automationApprovalStatusEnum('status').notNull().default('pending'),
  approverUserId: uuid('approver_user_id').references(() => users.id, { onDelete: 'set null' }),
  delegatedToUserId: uuid('delegated_to_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  comment: text('comment'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const automationStudioTestRuns = pgTable('automation_studio_test_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  status: automationTestRunStatusEnum('status').notNull().default('pending'),
  inputPayload: jsonb('input_payload').$type<Record<string, unknown>>().notNull().default({}),
  resultSummary: text('result_summary'),
  simulationRunId: uuid('simulation_run_id'),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const automationStudioMetrics = pgTable('automation_studio_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'set null' }),
  successCount: integer('success_count').notNull().default(0),
  failureCount: integer('failure_count').notNull().default(0),
  avgDurationMs: integer('avg_duration_ms'),
  queueDepth: integer('queue_depth').notNull().default(0),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});

export const automationStudioRecommendations = pgTable('automation_studio_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  recommendation: text('recommendation').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: automationRecommendationStatusEnum('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const automationStudioPlatformActions = pgTable('automation_studio_platform_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: automationStudioActionTypeEnum('action_type').notNull(),
  status: automationStudioActionStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'set null' }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AutomationStudioVersion = typeof automationStudioVersions.$inferSelect;
export type AutomationStudioVariable = typeof automationStudioVariables.$inferSelect;
export type AutomationStudioNode = typeof automationStudioNodes.$inferSelect;
export type AutomationStudioConnection = typeof automationStudioConnections.$inferSelect;
export type AutomationStudioApprovalChain = typeof automationStudioApprovalChains.$inferSelect;
export type AutomationStudioApprovalRecord = typeof automationStudioApprovalRecords.$inferSelect;
export type AutomationStudioTestRun = typeof automationStudioTestRuns.$inferSelect;
export type AutomationStudioMetric = typeof automationStudioMetrics.$inferSelect;
export type AutomationStudioRecommendation = typeof automationStudioRecommendations.$inferSelect;
export type AutomationStudioPlatformAction = typeof automationStudioPlatformActions.$inferSelect;
