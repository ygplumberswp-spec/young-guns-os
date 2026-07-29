import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { integrationConnections } from './integration-connections';
import { integrationSyncJobs } from './integration-sync-jobs';
import {
  xeroSyncEntityTypeEnum,
  xeroSyncLogActionEnum,
  xeroSyncLogStatusEnum,
} from './xero-sync-entity-status';

export const xeroSyncLogs = pgTable('xero_sync_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  integrationConnectionId: uuid('integration_connection_id')
    .notNull()
    .references(() => integrationConnections.id, { onDelete: 'cascade' }),
  syncJobId: uuid('sync_job_id').references(() => integrationSyncJobs.id, { onDelete: 'set null' }),
  entityType: xeroSyncEntityTypeEnum('entity_type').notNull(),
  entityId: uuid('entity_id'),
  xeroEntityId: text('xero_entity_id'),
  action: xeroSyncLogActionEnum('action').notNull(),
  status: xeroSyncLogStatusEnum('status').notNull(),
  message: text('message'),
  details: jsonb('details').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type XeroSyncLog = typeof xeroSyncLogs.$inferSelect;
export type NewXeroSyncLog = typeof xeroSyncLogs.$inferInsert;
