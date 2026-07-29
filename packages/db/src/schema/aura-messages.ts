import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auraConversations } from './aura-conversations';

export const auraMessageRoleEnum = pgEnum('aura_message_role', ['user', 'assistant', 'system']);

export const auraMessages = pgTable('aura_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => auraConversations.id, { onDelete: 'cascade' }),
  role: auraMessageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AuraMessage = typeof auraMessages.$inferSelect;
export type NewAuraMessage = typeof auraMessages.$inferInsert;
