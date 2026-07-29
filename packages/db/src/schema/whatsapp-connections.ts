import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const whatsappProviderEnum = pgEnum('whatsapp_provider', ['meta_cloud_api']);

export const whatsappConnectionStatusEnum = pgEnum('whatsapp_connection_status', [
  'disconnected',
  'pending',
  'connected',
  'error',
]);

export const whatsappConnections = pgTable('whatsapp_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' })
    .unique(),
  provider: whatsappProviderEnum('provider').notNull().default('meta_cloud_api'),
  phoneNumberId: text('phone_number_id'),
  businessAccountId: text('business_account_id'),
  displayPhoneNumber: text('display_phone_number'),
  credentialsEncrypted: text('credentials_encrypted'),
  webhookVerifyToken: text('webhook_verify_token'),
  status: whatsappConnectionStatusEnum('status').notNull().default('disconnected'),
  lastError: text('last_error'),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WhatsappConnection = typeof whatsappConnections.$inferSelect;
export type NewWhatsappConnection = typeof whatsappConnections.$inferInsert;
