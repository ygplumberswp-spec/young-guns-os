import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { users } from './users';
import { workflows } from './workflows';
import { workflowRuns } from './workflow-runs';

/**
 * Operations Workflow Automation — tasks, follow-ups, and draft AURA suggestions
 * created by the workflow engine. Monitoring aggregates existing workflow_runs.
 * Never stores demo/fake runs.
 */

export const opsWorkflowTaskStatusEnum = pgEnum('ops_workflow_task_status', [
  'open',
  'completed',
  'cancelled',
]);

export const opsWorkflowFollowUpStatusEnum = pgEnum('ops_workflow_follow_up_status', [
  'draft',
  'pending_review',
  'approved',
  'declined',
  'completed',
  'cancelled',
]);

export const opsWorkflowAuraSuggestionStatusEnum = pgEnum('ops_workflow_aura_suggestion_status', [
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
]);

export const opsWorkflowTasks = pgTable('ops_workflow_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'set null' }),
  workflowRunId: uuid('workflow_run_id').references(() => workflowRuns.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  description: text('description'),
  status: opsWorkflowTaskStatusEnum('status').notNull().default('open'),
  assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsWorkflowFollowUps = pgTable('ops_workflow_follow_ups', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'set null' }),
  workflowRunId: uuid('workflow_run_id').references(() => workflowRuns.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  notes: text('notes'),
  status: opsWorkflowFollowUpStatusEnum('status').notNull().default('draft'),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsWorkflowAuraSuggestions = pgTable('ops_workflow_aura_suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'set null' }),
  workflowRunId: uuid('workflow_run_id').references(() => workflowRuns.id, {
    onDelete: 'set null',
  }),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  status: opsWorkflowAuraSuggestionStatusEnum('status').notNull().default('pending_approval'),
  supportingSignals: jsonb('supporting_signals').$type<string[]>().notNull().default([]),
  /** Always false — suggestions never auto-execute operational changes. */
  autoExecuted: boolean('auto_executed').notNull().default(false),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type OpsWorkflowTask = typeof opsWorkflowTasks.$inferSelect;
export type NewOpsWorkflowTask = typeof opsWorkflowTasks.$inferInsert;
export type OpsWorkflowFollowUp = typeof opsWorkflowFollowUps.$inferSelect;
export type NewOpsWorkflowFollowUp = typeof opsWorkflowFollowUps.$inferInsert;
export type OpsWorkflowAuraSuggestion = typeof opsWorkflowAuraSuggestions.$inferSelect;
export type NewOpsWorkflowAuraSuggestion = typeof opsWorkflowAuraSuggestions.$inferInsert;
