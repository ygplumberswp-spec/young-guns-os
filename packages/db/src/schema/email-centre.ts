import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { documents } from './documents';
import { jobs } from './jobs';
import { users } from './users';

/**
 * TITAN Email Centre / Communication Timeline attachment links.
 * Prefer linking existing Quotes, BOQs, Invoices, Receipts, COCs, Reports,
 * job photos, and Documents — metadata + tenant-scoped entity references only.
 */
export const commAttachmentKindEnum = pgEnum('comm_attachment_kind', [
  'quote',
  'boq',
  'invoice',
  'receipt',
  'coc',
  'report',
  'job_photo',
  'document',
]);

export const commAttachmentAnchorTypeEnum = pgEnum('comm_attachment_anchor_type', [
  'inbox_item',
  'gmail_draft',
  'timeline_entry',
  'timeline_note',
  'whatsapp_message',
  'communication',
]);

export const commAttachmentLinks = pgTable('comm_attachment_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  anchorType: commAttachmentAnchorTypeEnum('anchor_type').notNull(),
  anchorId: uuid('anchor_id').notNull(),
  attachmentKind: commAttachmentKindEnum('attachment_kind').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  label: text('label').notNull(),
  fileName: text('file_name'),
  mimeType: text('mime_type'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commTimelineNotes = pgTable('comm_timeline_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  statusUpdate: text('status_update'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CommAttachmentLink = typeof commAttachmentLinks.$inferSelect;
export type NewCommAttachmentLink = typeof commAttachmentLinks.$inferInsert;
export type CommTimelineNote = typeof commTimelineNotes.$inferSelect;
export type NewCommTimelineNote = typeof commTimelineNotes.$inferInsert;
