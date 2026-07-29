import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { integrationConnections } from './integration-connections';
import { integrationProviderEnum } from './integration-connections';

export const integrationSyncJobStatusEnum = pgEnum('integration_sync_job_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export const integrationSyncJobTypeEnum = pgEnum('integration_sync_job_type', [
  'manual',
  'scheduled',
]);

export const integrationSyncJobs = pgTable('integration_sync_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  integrationConnectionId: uuid('integration_connection_id').references(
    () => integrationConnections.id,
    { onDelete: 'set null' },
  ),
  provider: integrationProviderEnum('provider').notNull(),
  jobType: integrationSyncJobTypeEnum('job_type').notNull().default('manual'),
  status: integrationSyncJobStatusEnum('status').notNull().default('pending'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  resultSummary: jsonb('result_summary').$type<Record<string, unknown>>(),
  syncScope: text('sync_scope'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type IntegrationSyncJob = typeof integrationSyncJobs.$inferSelect;
export type NewIntegrationSyncJob = typeof integrationSyncJobs.$inferInsert;
