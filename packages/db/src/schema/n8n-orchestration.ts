import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';
import { workflows } from './workflows';

export const n8nConnectionStatusEnum = pgEnum('n8n_connection_status', [
  'not_configured',
  'configured_unverified',
  'connected_usable',
  'temporarily_unavailable',
  'failed_degraded',
  'disconnected',
]);

export const n8nExecutionStatusEnum = pgEnum('n8n_execution_status', [
  'queued',
  'dispatched',
  'running',
  'succeeded',
  'failed',
  'timed_out',
  'cancelled',
  'awaiting_approval',
]);

export const n8nWorkflowStatusEnum = pgEnum('n8n_workflow_status', [
  'draft',
  'active',
  'paused',
  'disabled',
]);

export type N8nConnectionConfig = {
  label?: string;
  timeoutMs?: number;
  /** Only localhost / 127.0.0.1 endpoints are permitted for verification/dispatch. */
  allowLocalMockOnly?: boolean;
};

export const n8nConnections = pgTable(
  'n8n_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    status: n8nConnectionStatusEnum('status').notNull().default('not_configured'),
    baseUrl: text('base_url'),
    credentialsEncrypted: text('credentials_encrypted'),
    webhookSecretHash: text('webhook_secret_hash'),
    config: jsonb('config').$type<N8nConnectionConfig>().notNull().default({}),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    lastError: text('last_error'),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('n8n_connections_company_uidx').on(table.companyId)],
);

export const n8nWorkflowRegistrations = pgTable(
  'n8n_workflow_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    nativeWorkflowId: uuid('native_workflow_id').references(() => workflows.id, {
      onDelete: 'set null',
    }),
    externalWorkflowKey: text('external_workflow_key').notNull(),
    name: text('name').notNull(),
    purpose: text('purpose'),
    triggerEvent: text('trigger_event').notNull(),
    status: n8nWorkflowStatusEnum('status').notNull().default('draft'),
    version: integer('version').notNull().default(1),
    requiresApproval: boolean('requires_approval').notNull().default(true),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'no action' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('n8n_workflow_registrations_company_key_uidx').on(
      table.companyId,
      table.externalWorkflowKey,
    ),
  ],
);

export const n8nExecutions = pgTable(
  'n8n_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    workflowRegistrationId: uuid('workflow_registration_id')
      .notNull()
      .references(() => n8nWorkflowRegistrations.id, { onDelete: 'cascade' }),
    correlationId: text('correlation_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    triggerEvent: text('trigger_event').notNull(),
    status: n8nExecutionStatusEnum('status').notNull().default('queued'),
    workflowVersion: integer('workflow_version').notNull().default(1),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    providerAccepted: boolean('provider_accepted').notNull().default(false),
    businessOutcome: text('business_outcome'),
    sanitizedError: text('sanitized_error'),
    payloadSummary: jsonb('payload_summary').$type<Record<string, unknown>>().notNull().default({}),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('n8n_executions_company_idempotency_uidx').on(table.companyId, table.idempotencyKey),
    uniqueIndex('n8n_executions_company_correlation_uidx').on(table.companyId, table.correlationId),
  ],
);

export const n8nCallbackReceipts = pgTable(
  'n8n_callback_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    executionId: uuid('execution_id').references(() => n8nExecutions.id, { onDelete: 'set null' }),
    callbackId: text('callback_id').notNull(),
    correlationId: text('correlation_id').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('n8n_callback_receipts_company_callback_uidx').on(table.companyId, table.callbackId),
  ],
);

export const n8nAuditEvents = pgTable('n8n_audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type N8nConnection = typeof n8nConnections.$inferSelect;
export type N8nWorkflowRegistration = typeof n8nWorkflowRegistrations.$inferSelect;
export type N8nExecution = typeof n8nExecutions.$inferSelect;
export type N8nCallbackReceipt = typeof n8nCallbackReceipts.$inferSelect;
export type N8nAuditEvent = typeof n8nAuditEvents.$inferSelect;
