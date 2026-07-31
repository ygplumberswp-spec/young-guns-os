import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { portalUsers } from './portal-users';
import { users } from './users';

export const customerSupportConversationStatusEnum = pgEnum(
  'customer_support_conversation_status',
  ['open', 'in_progress', 'waiting_customer', 'escalated', 'resolved', 'closed'],
);

export const customerSupportChannelEnum = pgEnum('customer_support_channel', [
  'portal',
  'email',
  'phone',
  'chat',
  'other',
]);

export const customerSupportMessageRoleEnum = pgEnum('customer_support_message_role', [
  'customer',
  'agent',
  'system',
  'ai_draft',
]);

export const customerSupportEscalationStatusEnum = pgEnum('customer_support_escalation_status', [
  'pending',
  'assigned',
  'in_progress',
  'resolved',
  'dismissed',
]);

export const customerSupportEscalationPriorityEnum = pgEnum(
  'customer_support_escalation_priority',
  ['low', 'medium', 'high', 'urgent'],
);

export const customerSupportSentimentEnum = pgEnum('customer_support_sentiment', [
  'positive',
  'neutral',
  'negative',
]);

export const customerSupportConversations = pgTable('customer_support_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  portalUserId: uuid('portal_user_id').references(() => portalUsers.id, { onDelete: 'set null' }),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  channel: customerSupportChannelEnum('channel').notNull().default('portal'),
  status: customerSupportConversationStatusEnum('status').notNull().default('open'),
  subject: text('subject').notNull(),
  outcome: text('outcome'),
  resolutionStatus: text('resolution_status').notNull().default('unresolved'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const customerSupportMessages = pgTable('customer_support_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => customerSupportConversations.id, { onDelete: 'cascade' }),
  role: customerSupportMessageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const customerSupportEscalations = pgTable('customer_support_escalations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => customerSupportConversations.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  priority: customerSupportEscalationPriorityEnum('priority').notNull().default('medium'),
  status: customerSupportEscalationStatusEnum('status').notNull().default('pending'),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  resolution: text('resolution'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const customerSupportFeedback = pgTable('customer_support_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => customerSupportConversations.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  sentiment: customerSupportSentimentEnum('sentiment').notNull().default('neutral'),
  rating: integer('rating'),
  comment: text('comment'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CustomerSupportConversation = typeof customerSupportConversations.$inferSelect;
export type CustomerSupportMessage = typeof customerSupportMessages.$inferSelect;
export type CustomerSupportEscalation = typeof customerSupportEscalations.$inferSelect;
export type CustomerSupportFeedbackRecord = typeof customerSupportFeedback.$inferSelect;
