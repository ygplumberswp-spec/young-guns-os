import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { integrationProviderEnum } from './integration-connections';
import { integrationWebhookEndpoints } from './integration-webhook-endpoints';

export const integrationWebhookEventStatusEnum = pgEnum('integration_webhook_event_status', [
  'received',
  'processed',
  'failed',
  'ignored',
]);

export const integrationWebhookEvents = pgTable('integration_webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  webhookEndpointId: uuid('webhook_endpoint_id').references(
    () => integrationWebhookEndpoints.id,
    { onDelete: 'set null' },
  ),
  provider: integrationProviderEnum('provider'),
  eventType: text('event_type').notNull(),
  status: integrationWebhookEventStatusEnum('status').notNull().default('received'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type IntegrationWebhookEvent = typeof integrationWebhookEvents.$inferSelect;
export type NewIntegrationWebhookEvent = typeof integrationWebhookEvents.$inferInsert;
