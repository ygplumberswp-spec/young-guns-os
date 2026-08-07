import { integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { jobs } from './jobs';
import { users } from './users';

export const jobFinancialLinkageEntityTypeEnum = pgEnum('job_financial_linkage_entity_type', [
  'quote',
  'invoice',
]);

export const jobFinancialLinkageMechanismEnum = pgEnum('job_financial_linkage_mechanism', [
  'native',
  'deterministic_reference',
  'deterministic_quote',
  'manual_owner',
  'manual_finance',
  'corrected',
  'unlinked',
  'rejected',
]);

export const jobFinancialLinkageAudits = pgTable('job_financial_linkage_audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityType: jobFinancialLinkageEntityTypeEnum('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  previousJobId: uuid('previous_job_id').references(() => jobs.id, { onDelete: 'set null' }),
  newJobId: uuid('new_job_id').references(() => jobs.id, { onDelete: 'set null' }),
  mechanism: jobFinancialLinkageMechanismEnum('mechanism').notNull(),
  confidence: text('confidence'),
  score: integer('score'),
  evidence: jsonb('evidence').notNull().default([]),
  reason: text('reason').notNull(),
  entityFingerprint: text('entity_fingerprint'),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobFinancialLinkageRejections = pgTable(
  'job_financial_linkage_rejections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    entityType: jobFinancialLinkageEntityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    rejectedJobId: uuid('rejected_job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    rejectedByUserId: uuid('rejected_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyEntityJobUnique: unique('job_financial_linkage_rejections_unique').on(
      table.companyId,
      table.entityType,
      table.entityId,
      table.rejectedJobId,
    ),
  }),
);

export type JobFinancialLinkageAudit = typeof jobFinancialLinkageAudits.$inferSelect;
export type JobFinancialLinkageRejection = typeof jobFinancialLinkageRejections.$inferSelect;
