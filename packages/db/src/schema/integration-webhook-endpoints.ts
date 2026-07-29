import { boolean, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const integrationWebhookDirectionEnum = pgEnum('integration_webhook_direction', [
  'inbound',
  'outbound',
]);

export const integrationWebhookEndpoints = pgTable('integration_webhook_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  secretHash: text('secret_hash').notNull(),
  direction: integrationWebhookDirectionEnum('direction').notNull().default('inbound'),
  targetUrl: text('target_url'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type IntegrationWebhookEndpoint = typeof integrationWebhookEndpoints.$inferSelect;
export type NewIntegrationWebhookEndpoint = typeof integrationWebhookEndpoints.$inferInsert;
