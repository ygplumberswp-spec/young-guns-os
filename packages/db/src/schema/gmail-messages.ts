import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { users } from './users';

export const gmailMessageDirectionEnum = pgEnum('gmail_message_direction', [
  'incoming',
  'outgoing',
]);

export const gmailMessageStatusEnum = pgEnum('gmail_message_status', [
  'draft',
  'pending',
  'sent',
  'received',
  'failed',
]);

export type GmailMessageHeaders = {
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  date?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
};

export type GmailMessagePayload = {
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  parts?: unknown[];
  body?: {
    size?: number;
    data?: string;
  };
};

export const gmailMessages = pgTable('gmail_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  externalMessageId: text('external_message_id').notNull(),
  externalThreadId: text('external_thread_id'),
  direction: gmailMessageDirectionEnum('direction').notNull(),
  status: gmailMessageStatusEnum('status').notNull().default('received'),
  isDraft: boolean('is_draft').notNull().default(false),
  subject: text('subject'),
  snippet: text('snippet'),
  fromEmail: text('from_email'),
  toEmail: text('to_email'),
  ccEmail: text('cc_email'),
  bccEmail: text('bcc_email'),
  headers: jsonb('headers').$type<GmailMessageHeaders>(),
  payload: jsonb('payload').$type<GmailMessagePayload>(),
  bodyHtml: text('body_html'),
  bodyText: text('body_text'),
  labelIds: jsonb('label_ids').$type<string[]>().default([]),
  historyId: text('history_id'),
  internalDate: timestamp('internal_date', { withTimezone: true }),
  sizeEstimate: text('size_estimate'),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type GmailMessage = typeof gmailMessages.$inferSelect;
export type NewGmailMessage = typeof gmailMessages.$inferInsert;
