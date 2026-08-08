import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { customerDuplicateCandidates } from './customer-duplicate-merge';
import { customerPeople, customerSourceAssociations } from './customer-360';
import { users } from './users';

export const customerDuplicateConfidenceLabelEnum = pgEnum('customer_duplicate_confidence_label', [
  'HIGH_CONFIDENCE_DUPLICATE',
  'POSSIBLE_DUPLICATE',
  'SAME_COMPANY_DIFFERENT_CONTACT',
  'LIKELY_DIFFERENT',
  'REVIEW_REQUIRED',
]);

export const customerDuplicateResolutionTypeEnum = pgEnum('customer_duplicate_resolution_type', [
  'NOT_DUPLICATE',
  'SAME_COMPANY_DIFFERENT_PERSON',
  'TRUE_DUPLICATE_CANONICALIZE',
  'DEFER',
]);

export const customerDuplicateReconciliationStatusEnum = pgEnum(
  'customer_duplicate_reconciliation_status',
  ['unreviewed', 'draft', 'approved', 'executed', 'reversed', 'dismissed', 'deferred'],
);

export const customerDuplicateReconciliations = pgTable(
  'customer_duplicate_reconciliations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id').references(() => customerDuplicateCandidates.id, {
      onDelete: 'set null',
    }),
    leftCustomerId: uuid('left_customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    rightCustomerId: uuid('right_customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    canonicalCustomerId: uuid('canonical_customer_id').references(() => customers.id, {
      onDelete: 'set null',
    }),
    secondaryCustomerId: uuid('secondary_customer_id').references(() => customers.id, {
      onDelete: 'set null',
    }),
    confidenceLabel: customerDuplicateConfidenceLabelEnum('confidence_label')
      .notNull()
      .default('REVIEW_REQUIRED'),
    suggestedResolution: customerDuplicateResolutionTypeEnum('suggested_resolution'),
    resolutionType: customerDuplicateResolutionTypeEnum('resolution_type'),
    status: customerDuplicateReconciliationStatusEnum('status').notNull().default('unreviewed'),
    matchSignals: jsonb('match_signals').$type<string[]>().notNull().default([]),
    differingSignals: jsonb('differing_signals').$type<string[]>().notNull().default([]),
    rationale: jsonb('rationale').$type<string[]>().notNull().default([]),
    fieldCompares: jsonb('field_compares')
      .$type<Array<{ field: string; left: string | null; right: string | null; status: string }>>()
      .notNull()
      .default([]),
    fieldConflictSelections: jsonb('field_conflict_selections')
      .$type<Record<string, 'left' | 'right' | 'preserve_both'>>()
      .notNull()
      .default({}),
    previewHash: text('preview_hash'),
    previewPayload: jsonb('preview_payload').$type<Record<string, unknown>>().notNull().default({}),
    impactSummary: jsonb('impact_summary').$type<Record<string, unknown>>().notNull().default({}),
    personId: uuid('person_id').references(() => customerPeople.id, { onDelete: 'set null' }),
    associationId: uuid('association_id').references(() => customerSourceAssociations.id, {
      onDelete: 'set null',
    }),
    reversible: boolean('reversible').notNull().default(true),
    irreversibleWarning: text('irreversible_warning'),
    xeroWrites: integer('xero_writes').notNull().default(0),
    movesFinancialOwnership: boolean('moves_financial_ownership').notNull().default(false),
    draftedByUserId: uuid('drafted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    executedByUserId: uuid('executed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reversedByUserId: uuid('reversed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decisionNotes: text('decision_notes'),
    draftedAt: timestamp('drafted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pairUnique: uniqueIndex('customer_duplicate_reconciliations_pair_uidx').on(
      table.companyId,
      table.leftCustomerId,
      table.rightCustomerId,
    ),
    statusIdx: index('customer_duplicate_reconciliations_status_idx').on(
      table.companyId,
      table.status,
    ),
    confidenceIdx: index('customer_duplicate_reconciliations_confidence_idx').on(
      table.companyId,
      table.confidenceLabel,
    ),
  }),
);

export type CustomerDuplicateReconciliation = typeof customerDuplicateReconciliations.$inferSelect;
export type NewCustomerDuplicateReconciliation =
  typeof customerDuplicateReconciliations.$inferInsert;
