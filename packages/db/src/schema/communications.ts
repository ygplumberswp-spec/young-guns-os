import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { jobs } from './jobs';
import { communicationChannelEnum, messageTemplates } from './message-templates';
import { users } from './users';

export const communicationDirectionEnum = pgEnum('communication_direction', [
  'inbound',
  'outbound',
]);

export const communicationVisibilityEnum = pgEnum('communication_visibility', [
  'internal_note',
  'customer_visible',
  'outbound_request',
]);

export const communicationDeliveryStateEnum = pgEnum('communication_delivery_state', [
  'logged_only',
  'requested',
  'queued',
  'send_failed',
  'provider_delivered',
]);

export const communications = pgTable('communications', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  authorUserId: uuid('author_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  templateId: uuid('template_id').references(() => messageTemplates.id, { onDelete: 'set null' }),
  channel: communicationChannelEnum('channel').notNull().default('note'),
  direction: communicationDirectionEnum('direction').notNull().default('outbound'),
  visibility: communicationVisibilityEnum('visibility').notNull().default('internal_note'),
  deliveryState: communicationDeliveryStateEnum('delivery_state').notNull().default('logged_only'),
  subject: text('subject'),
  body: text('body').notNull(),
  clientActionId: text('client_action_id'),
  failureReason: text('failure_reason'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Communication = typeof communications.$inferSelect;
export type NewCommunication = typeof communications.$inferInsert;
