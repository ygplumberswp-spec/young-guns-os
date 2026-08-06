import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const xeroWebhookEvents = pgTable('xero_webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  xeroTenantId: text('xero_tenant_id').notNull(),
  dedupeKey: text('dedupe_key').notNull().unique(),
  eventCategory: text('event_category').notNull(),
  eventType: text('event_type').notNull(),
  resourceId: text('resource_id').notNull(),
  resourceUrl: text('resource_url'),
  eventDateUtc: timestamp('event_date_utc', { withTimezone: true }),
  firstEventSequence: integer('first_event_sequence'),
  lastEventSequence: integer('last_event_sequence'),
  processingStatus: text('processing_status').notNull().default('received'),
  retryCount: integer('retry_count').notNull().default(0),
  lastError: text('last_error'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  payloadSummary: jsonb('payload_summary').$type<Record<string, unknown>>().notNull().default({}),
});

export const xeroTargetedRefreshJobs = pgTable('xero_targeted_refresh_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),
  xeroEntityId: text('xero_entity_id').notNull(),
  priority: text('priority').notNull().default('background'),
  status: text('status').notNull().default('pending'),
  dedupeKey: text('dedupe_key').notNull().unique(),
  retryCount: integer('retry_count').notNull().default(0),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  lastError: text('last_error'),
  resultEntityId: uuid('result_entity_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const xeroRateBudgetState = pgTable('xero_rate_budget_state', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id, { onDelete: 'cascade' }),
  minLimitRemaining: integer('min_limit_remaining'),
  dayLimitRemaining: integer('day_limit_remaining'),
  appMinLimitRemaining: integer('app_min_limit_remaining'),
  rateLimitProblem: text('rate_limit_problem'),
  retryAfterUntil: timestamp('retry_after_until', { withTimezone: true }),
  lastCorrelationId: text('last_correlation_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type XeroWebhookEvent = typeof xeroWebhookEvents.$inferSelect;
export type XeroTargetedRefreshJob = typeof xeroTargetedRefreshJobs.$inferSelect;
export type XeroRateBudgetStateRow = typeof xeroRateBudgetState.$inferSelect;
