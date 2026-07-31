import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { portalUsers } from './portal-users';

export const portalCustomerRequestTypeEnum = pgEnum('portal_customer_request_type', [
  'quote_clarification',
  'quote_approval',
  'appointment_reschedule',
  'appointment_cancellation',
  'appointment_confirmation',
  'support_message',
  'general_request',
]);

export const portalCustomerRequestStatusEnum = pgEnum('portal_customer_request_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const portalCustomerRequests = pgTable('portal_customer_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  portalUserId: uuid('portal_user_id')
    .notNull()
    .references(() => portalUsers.id, { onDelete: 'cascade' }),
  requestType: portalCustomerRequestTypeEnum('request_type').notNull(),
  status: portalCustomerRequestStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  clientActionId: text('client_action_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PortalCustomerRequest = typeof portalCustomerRequests.$inferSelect;
export type NewPortalCustomerRequest = typeof portalCustomerRequests.$inferInsert;
