import { integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const draftRecordTypeEnum = pgEnum('draft_record_type', [
  'quote',
  'invoice',
  'job',
  'customer',
  'document',
  'marketing',
  'other',
]);

export const draftStatusEnum = pgEnum('draft_status', ['active', 'archived', 'published']);

export const draftWorkspace = pgTable(
  'draft_workspace',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recordType: draftRecordTypeEnum('record_type').notNull(),
    recordId: uuid('record_id'),
    draftKey: text('draft_key').notNull(),
    title: text('title'),
    customerLabel: text('customer_label'),
    completionPct: integer('completion_pct'),
    payload: jsonb('payload').notNull().default({}),
    payloadHistory: jsonb('payload_history').notNull().default([]),
    status: draftStatusEnum('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    lastEditedAt: timestamp('last_edited_at', { withTimezone: true }).notNull().defaultNow(),
    lastEditedByUserId: uuid('last_edited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    draftKeyUnique: uniqueIndex('draft_workspace_company_draft_key_idx').on(
      table.companyId,
      table.draftKey,
    ),
  }),
);

export type DraftWorkspaceRow = typeof draftWorkspace.$inferSelect;
export type NewDraftWorkspaceRow = typeof draftWorkspace.$inferInsert;
