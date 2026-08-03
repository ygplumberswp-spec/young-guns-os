import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid, index } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { communications } from './communications';
import { integrationConnections } from './integration-connections';

/**
 * Outbound transactional email deliveries via Resend.
 * Status is honest: API accept → sent; webhook delivered → delivered; bounce/fail → failed.
 */
export const resendEmailDeliveries = pgTable(
  'resend_email_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    integrationConnectionId: uuid('integration_connection_id').references(
      () => integrationConnections.id,
      { onDelete: 'set null' },
    ),
    communicationId: uuid('communication_id').references(() => communications.id, {
      onDelete: 'set null',
    }),
    purpose: text('purpose').notNull(),
    toEmail: text('to_email').notNull(),
    subject: text('subject').notNull(),
    status: text('status').notNull().default('sent'),
    resendEmailId: text('resend_email_id'),
    failureReason: text('failure_reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('resend_email_deliveries_company_resend_uidx').on(
      table.companyId,
      table.resendEmailId,
    ),
    index('resend_email_deliveries_company_created_idx').on(table.companyId, table.createdAt),
  ],
);

export type ResendEmailDelivery = typeof resendEmailDeliveries.$inferSelect;
export type NewResendEmailDelivery = typeof resendEmailDeliveries.$inferInsert;

/** Idempotent receipts for inbound Resend (Svix) webhook events. */
export const resendWebhookEvents = pgTable(
  'resend_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    integrationConnectionId: uuid('integration_connection_id').references(
      () => integrationConnections.id,
      { onDelete: 'set null' },
    ),
    deliveryId: uuid('delivery_id').references(() => resendEmailDeliveries.id, {
      onDelete: 'set null',
    }),
    svixId: text('svix_id').notNull(),
    eventType: text('event_type').notNull(),
    resendEmailId: text('resend_email_id'),
    eventStatus: text('event_status').notNull().default('received'),
    outcome: text('outcome'),
    payloadSummary: jsonb('payload_summary').$type<Record<string, unknown>>().notNull().default({}),
    errorMessage: text('error_message'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('resend_webhook_events_company_svix_uidx').on(table.companyId, table.svixId),
  ],
);

export type ResendWebhookEvent = typeof resendWebhookEvents.$inferSelect;
export type NewResendWebhookEvent = typeof resendWebhookEvents.$inferInsert;
