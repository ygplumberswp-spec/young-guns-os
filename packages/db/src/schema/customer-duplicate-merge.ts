import { integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { users } from './users';

export const customerDuplicateCandidateStatusEnum = pgEnum('customer_duplicate_candidate_status', [
  'pending',
  'dismissed',
  'merged',
]);

export const customerDuplicateCandidates = pgTable(
  'customer_duplicate_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    leftCustomerId: uuid('left_customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    rightCustomerId: uuid('right_customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    confidence: integer('confidence').notNull(),
    matchReasons: jsonb('match_reasons')
      .$type<Array<{ reason: string; detail: string; weight: number }>>()
      .notNull()
      .default([]),
    status: customerDuplicateCandidateStatusEnum('status').notNull().default('pending'),
    survivorCustomerId: uuid('survivor_customer_id').references(() => customers.id, {
      onDelete: 'set null',
    }),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decisionNotes: text('decision_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pairUnique: uniqueIndex('customer_duplicate_candidates_company_pair_uidx').on(
      table.companyId,
      table.leftCustomerId,
      table.rightCustomerId,
    ),
  }),
);

export type CustomerDuplicateCandidate = typeof customerDuplicateCandidates.$inferSelect;
export type NewCustomerDuplicateCandidate = typeof customerDuplicateCandidates.$inferInsert;
