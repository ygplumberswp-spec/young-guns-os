import { integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { documents } from './documents';
import { jobs } from './jobs';
import { users } from './users';

export const jobDocumentPackStatusEnum = pgEnum('job_document_pack_status', [
  'draft',
  'internal_review',
  'approved_for_sending',
  'sent',
  'cancelled',
]);

export const jobDocumentPackDeliveryStateEnum = pgEnum('job_document_pack_delivery_state', [
  'not_sent',
  'portal_shared',
  'send_blocked',
]);

export const jobDocumentPackChannelEnum = pgEnum('job_document_pack_channel', [
  'portal',
  'email',
  'whatsapp',
]);

export const jobDocumentPackItemTypeEnum = pgEnum('job_document_pack_item_type', [
  'job_document',
  'quotation',
  'invoice',
  'certificate',
  'compliance_report',
  'photo_evidence',
]);

export const jobDocumentPacks = pgTable('job_document_packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  packNumber: text('pack_number').notNull(),
  title: text('title').notNull(),
  status: jobDocumentPackStatusEnum('status').notNull().default('draft'),
  deliveryChannel: jobDocumentPackChannelEnum('delivery_channel').notNull().default('portal'),
  deliveryState: jobDocumentPackDeliveryStateEnum('delivery_state').notNull().default('not_sent'),
  notes: text('notes'),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  sentByUserId: uuid('sent_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  clientActionId: text('client_action_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobDocumentPackItems = pgTable('job_document_pack_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  packId: uuid('pack_id')
    .notNull()
    .references(() => jobDocumentPacks.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  itemType: jobDocumentPackItemTypeEnum('item_type').notNull().default('job_document'),
  label: text('label').notNull(),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type JobDocumentPack = typeof jobDocumentPacks.$inferSelect;
export type JobDocumentPackItem = typeof jobDocumentPackItems.$inferSelect;
