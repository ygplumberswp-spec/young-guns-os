import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export type CompanyPreferences = {
  timezone?: string;
  currency?: string;
  locale?: string;
  aiTone?: 'professional' | 'friendly' | 'concise';
  notes?: string;
};

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  industry: text('industry'),
  businessType: text('business_type'),
  preferences: jsonb('preferences').$type<CompanyPreferences>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
