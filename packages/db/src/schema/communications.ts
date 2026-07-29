import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { communicationChannelEnum, messageTemplates } from './message-templates';
import { users } from './users';

export const communicationDirectionEnum = pgEnum('communication_direction', [
  'inbound',
  'outbound',
]);

export const communications = pgTable('communications', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  authorUserId: uuid('author_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  templateId: uuid('template_id').references(() => messageTemplates.id, { onDelete: 'set null' }),
  channel: communicationChannelEnum('channel').notNull().default('note'),
  direction: communicationDirectionEnum('direction').notNull().default('outbound'),
  subject: text('subject'),
  body: text('body').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Communication = typeof communications.$inferSelect;
export type NewCommunication = typeof communications.$inferInsert;
