import { integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const auraMemoryCategoryEnum = pgEnum('aura_memory_category', [
  'business_rule',
  'preference',
  'process',
  'note',
]);

export const auraMemory = pgTable('aura_memory', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  category: auraMemoryCategoryEnum('category').notNull().default('business_rule'),
  information: text('information').notNull(),
  importance: integer('importance').notNull().default(3),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AuraMemory = typeof auraMemory.$inferSelect;
export type NewAuraMemory = typeof auraMemory.$inferInsert;
