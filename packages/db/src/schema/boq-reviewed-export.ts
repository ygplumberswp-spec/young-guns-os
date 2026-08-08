import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './companies';
import { users } from './users';
import { boqImportRows, boqImports } from './boq-workbook-import';

export const boqImportRowReviewedEdits = pgTable(
  'boq_import_row_reviewed_edits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    boqImportId: uuid('boq_import_id')
      .notNull()
      .references(() => boqImports.id, { onDelete: 'cascade' }),
    boqImportRowId: uuid('boq_import_row_id')
      .notNull()
      .references(() => boqImportRows.id, { onDelete: 'cascade' }),
    fieldKey: text('field_key').notNull(),
    originalValue: text('original_value'),
    reviewedValue: text('reviewed_value'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    reasonNote: text('reason_note'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueFieldUidx: uniqueIndex('boq_import_row_reviewed_edits_unique_field_uidx').on(
      table.companyId,
      table.boqImportRowId,
      table.fieldKey,
    ),
    importIdx: index('boq_import_row_reviewed_edits_import_idx').on(
      table.companyId,
      table.boqImportId,
    ),
  }),
);

export const boqReviewedExports = pgTable(
  'boq_reviewed_exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    boqImportId: uuid('boq_import_id')
      .notNull()
      .references(() => boqImports.id, { onDelete: 'cascade' }),
    format: text('format').notNull(),
    mode: text('mode').notNull(),
    status: text('status').notNull().default('GENERATED'),
    labelledDraftPreview: boolean('labelled_draft_preview').notNull().default(false),
    blockers: jsonb('blockers').notNull().default([]),
    contentFingerprintSha256: text('content_fingerprint_sha256').notNull(),
    idempotencyKey: text('idempotency_key'),
    clientActionId: text('client_action_id'),
    originalFilename: text('original_filename').notNull(),
    fileHashSha256: text('file_hash_sha256').notNull(),
    importVersion: integer('import_version').notNull(),
    revisionLabel: text('revision_label'),
    mimeType: text('mime_type').notNull(),
    byteLength: integer('byte_length').notNull().default(0),
    storageKey: text('storage_key'),
    contentBase64: text('content_base64'),
    auraNarrativeFacts: jsonb('aura_narrative_facts').notNull().default([]),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyUidx: uniqueIndex('boq_reviewed_exports_company_idempotency_uidx')
      .on(table.companyId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    clientActionUidx: uniqueIndex('boq_reviewed_exports_company_client_action_uidx')
      .on(table.companyId, table.clientActionId)
      .where(sql`${table.clientActionId} IS NOT NULL`),
    companyBoqIdx: index('boq_reviewed_exports_company_boq_idx').on(
      table.companyId,
      table.boqImportId,
    ),
  }),
);

export type BoqImportRowReviewedEdit = typeof boqImportRowReviewedEdits.$inferSelect;
export type BoqReviewedExport = typeof boqReviewedExports.$inferSelect;
