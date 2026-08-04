import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { invoices } from './invoices';
import { jobs } from './jobs';
import { quotes } from './quotes';
import { users } from './users';

export const financeAttachmentSourceEnum = pgEnum('finance_attachment_source', [
  'upload',
  'job_evidence',
]);

export const financeDocumentAttachments = pgTable(
  'finance_document_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }),
    /** Binds uploads on unsaved create forms until the first quote/invoice save. */
    draftClientActionId: text('draft_client_action_id'),
    source: financeAttachmentSourceEnum('source').notNull().default('upload'),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    documentationId: uuid('documentation_id'),
    storageKey: text('storage_key'),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    includeInPdf: boolean('include_in_pdf').notNull().default(false),
    checksumSha256: text('checksum_sha256'),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    clientActionId: text('client_action_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    quoteIdx: index('finance_document_attachments_quote_idx').on(table.companyId, table.quoteId),
    invoiceIdx: index('finance_document_attachments_invoice_idx').on(table.companyId, table.invoiceId),
    draftIdx: index('finance_document_attachments_draft_idx').on(
      table.companyId,
      table.draftClientActionId,
    ),
    quoteEvidenceUnique: uniqueIndex('finance_document_attachments_quote_evidence_unique').on(
      table.companyId,
      table.quoteId,
      table.documentationId,
    ),
    invoiceEvidenceUnique: uniqueIndex('finance_document_attachments_invoice_evidence_unique').on(
      table.companyId,
      table.invoiceId,
      table.documentationId,
    ),
  }),
);

export type FinanceDocumentAttachmentRow = typeof financeDocumentAttachments.$inferSelect;
export type NewFinanceDocumentAttachmentRow = typeof financeDocumentAttachments.$inferInsert;
