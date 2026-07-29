import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { recruitingCandidates, recruitingStatusEnum } from './recruiting-candidates';

export const recruitingApplications = pgTable('recruiting_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  candidateId: uuid('candidate_id')
    .notNull()
    .references(() => recruitingCandidates.id, { onDelete: 'cascade' }),
  roleTitle: text('role_title').notNull(),
  status: recruitingStatusEnum('status').notNull().default('new'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type RecruitingApplication = typeof recruitingApplications.$inferSelect;
export type NewRecruitingApplication = typeof recruitingApplications.$inferInsert;
