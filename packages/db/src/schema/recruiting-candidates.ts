import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const recruitingStatusEnum = pgEnum('recruiting_status', [
  'new',
  'applied',
  'screening',
  'interview',
  'assessment',
  'offered',
  'offer',
  'hired',
  'rejected',
]);

export const recruitingCandidates = pgTable('recruiting_candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  roleTitle: text('role_title'),
  status: recruitingStatusEnum('status').notNull().default('new'),
  source: text('source'),
  skills: jsonb('skills').$type<string[]>().notNull().default([]),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type RecruitingCandidate = typeof recruitingCandidates.$inferSelect;
export type NewRecruitingCandidate = typeof recruitingCandidates.$inferInsert;
