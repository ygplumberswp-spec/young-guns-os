import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const gmailLabels = pgTable('gmail_labels', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  externalLabelId: text('external_label_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  messageListVisibility: text('message_list_visibility'),
  labelListVisibility: text('label_list_visibility'),
  messagesTotal: integer('messages_total'),
  messagesUnread: integer('messages_unread'),
  threadsTotal: integer('threads_total'),
  threadsUnread: integer('threads_unread'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type GmailLabel = typeof gmailLabels.$inferSelect;
export type NewGmailLabel = typeof gmailLabels.$inferInsert;
